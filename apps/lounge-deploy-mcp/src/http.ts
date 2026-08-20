import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  createJsonLineAuditSink,
  writeAuditSafely,
  type AuditSink,
} from "@letscoding/audit-log";
import {
  AnonymousAccessError,
  authorizeAnonymousRequest,
  ConcurrencyGate,
  createRotatingNetworkKey,
  FixedWindowRateLimiter,
} from "@letscoding/mcp-auth";

import type { McpServiceConfig } from "./config.js";
import {
  createLoungeDeployMcpServer,
  type LoungeDeployToolHandlers,
} from "./server.js";

export interface ReadinessProbe {
  readonly name: string;
  check(signal: AbortSignal): Promise<boolean>;
}

export interface CreateHttpHandlerOptions {
  readonly config: McpServiceConfig;
  readonly handlers?: Partial<LoungeDeployToolHandlers>;
  readonly readinessProbes?: readonly ReadinessProbe[];
  readonly auditSink?: AuditSink;
}

export type LoungeDeployHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

export function createLoungeDeployHttpHandler(
  options: CreateHttpHandlerOptions,
): LoungeDeployHttpHandler {
  const rateLimiter = new FixedWindowRateLimiter({
    limit: options.config.rateLimit.maxRequests,
    windowMs: options.config.rateLimit.windowMs,
  });
  const concurrency = new ConcurrencyGate(
    options.config.rateLimit.maxConcurrentRequests,
  );
  const auditSink =
    options.auditSink ??
    (options.config.environment === "test"
      ? { write() {} }
      : createJsonLineAuditSink());
  return async (request, response): Promise<void> => {
    const requestId = selectRequestId(request.headers["x-request-id"]);
    response.setHeader("x-request-id", requestId);
    response.setHeader("cache-control", "no-store");
    const path = new URL(request.url ?? "/", "http://localhost").pathname;

    if (
      path === "/.well-known/openai-apps-challenge" ||
      path === "/api/openai-apps-challenge"
    ) {
      if (
        request.method !== "GET" ||
        options.config.openAiAppsChallenge === undefined
      ) {
        writeJson(response, request.method === "GET" ? 404 : 405, {
          error: {
            code:
              request.method === "GET"
                ? "HTTP_NOT_FOUND"
                : "HTTP_METHOD_NOT_ALLOWED",
            message:
              request.method === "GET"
                ? "Endpoint를 찾을 수 없습니다."
                : "Method not allowed.",
          },
        });
        return;
      }
      writeText(response, 200, options.config.openAiAppsChallenge);
      return;
    }

    if (path === "/health" || path === "/api/health") {
      writeJson(response, 200, {
        status: "ok",
        environment: options.config.environment,
        revision: options.config.revision,
      });
      return;
    }
    if (path === "/ready" || path === "/api/ready") {
      const readiness = await checkReadiness(options);
      writeJson(response, readiness.ready ? 200 : 503, {
        status: readiness.ready ? "ready" : "not-ready",
        environment: options.config.environment,
        revision: options.config.revision,
        probes: readiness.probes,
      });
      return;
    }
    if (path !== "/mcp" && path !== "/api/mcp") {
      writeJson(response, 404, {
        error: {
          code: "HTTP_NOT_FOUND",
          message: "Endpoint를 찾을 수 없습니다.",
        },
      });
      return;
    }
    if (request.method !== "POST") {
      writeJson(response, 405, {
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed." },
        id: null,
      });
      return;
    }

    const networkKey = createRotatingNetworkKey({
      networkSignal: selectNetworkSignal(request, options.config.environment),
      secret: options.config.networkFingerprintSecret,
    });
    try {
      authorizeAnonymousRequest(request.headers);
    } catch (error) {
      const code =
        error instanceof AnonymousAccessError
          ? error.code
          : "ACCESS_BOUNDARY_FAILED";
      await auditRequestRejection(
        auditSink,
        options,
        requestId,
        networkKey,
        "rejected",
        code,
      );
      writeJson(response, code === "AUTHENTICATION_NOT_SUPPORTED" ? 401 : 400, {
        jsonrpc: "2.0",
        error: { code: -32002, message: "Anonymous MCP access required." },
        id: null,
      });
      return;
    }
    const rate = rateLimiter.consume(networkKey);
    response.setHeader("x-ratelimit-remaining", String(rate.remaining));
    if (!rate.allowed) {
      response.setHeader("retry-after", String(rate.retryAfterSeconds));
      await auditRequestRejection(
        auditSink,
        options,
        requestId,
        networkKey,
        "rate-limited",
        "RATE_LIMITED",
      );
      writeJson(response, 429, {
        jsonrpc: "2.0",
        error: { code: -32029, message: "Request rate limit exceeded." },
        id: null,
      });
      return;
    }
    const release = concurrency.tryAcquire();
    if (release === null) {
      response.setHeader("retry-after", "1");
      await auditRequestRejection(
        auditSink,
        options,
        requestId,
        networkKey,
        "overloaded",
        "CONCURRENCY_LIMITED",
      );
      writeJson(response, 503, {
        jsonrpc: "2.0",
        error: { code: -32030, message: "Service is temporarily busy." },
        id: null,
      });
      return;
    }

    try {
      let body: unknown;
      try {
        body = await readJsonBody(request, options.config.maxBodyBytes);
      } catch (error) {
        const tooLarge =
          error instanceof BodyReadError &&
          error.code === "HTTP_BODY_TOO_LARGE";
        writeJson(response, tooLarge ? 413 : 400, {
          jsonrpc: "2.0",
          error: {
            code: tooLarge ? -32001 : -32700,
            message: tooLarge
              ? "Request body too large."
              : "Invalid JSON body.",
          },
          id: null,
        });
        return;
      }

      const server = createLoungeDeployMcpServer({
        ...options,
        requestContext: { requestId, networkKey },
        auditSink,
      });
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      try {
        // SDK 1.30's Node wrapper and Transport interface differ only in how
        // exactOptionalPropertyTypes represents optional callbacks.
        await server.connect(transport as Transport);
        await transport.handleRequest(request, response, body);
      } catch {
        if (!response.headersSent) {
          writeJson(response, 500, {
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error." },
            id: null,
          });
        }
      } finally {
        await transport.close();
        await server.close();
      }
    } finally {
      release();
    }
  };
}

async function auditRequestRejection(
  sink: AuditSink,
  options: CreateHttpHandlerOptions,
  requestId: string,
  networkKey: string,
  status: "rejected" | "rate-limited" | "overloaded",
  code: string,
): Promise<void> {
  await writeAuditSafely(sink, {
    occurredAt: new Date().toISOString(),
    environment: options.config.environment,
    revision: options.config.revision,
    requestId,
    networkKey,
    tool: null,
    result: { status, code },
    latencyMs: 0,
  });
}

function selectRequestId(
  value: string | readonly string[] | undefined,
): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === "string" &&
    /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)
    ? candidate
    : randomUUID();
}

function selectNetworkSignal(
  request: IncomingMessage,
  environment: McpServiceConfig["environment"],
): string {
  if (environment === "staging" || environment === "prod") {
    const forwarded = request.headers["x-vercel-forwarded-for"];
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (value !== undefined && value.length > 0) return value;
  }
  return request.socket.remoteAddress ?? "unknown-network";
}

export function createNodeHttpServer(handler: LoungeDeployHttpHandler): Server {
  return createServer((request, response) => {
    void handler(request, response);
  });
}

async function checkReadiness(options: CreateHttpHandlerOptions): Promise<{
  readonly ready: boolean;
  readonly probes: Readonly<Record<string, "ok" | "failed">>;
}> {
  const probes: Record<string, "ok" | "failed"> = {};
  let ready = true;
  for (const probe of options.readinessProbes ?? []) {
    try {
      const passed = await probe.check(AbortSignal.timeout(2_000));
      probes[probe.name] = passed ? "ok" : "failed";
      ready &&= passed;
    } catch {
      probes[probe.name] = "failed";
      ready = false;
    }
  }
  return { ready, probes };
}

class BodyReadError extends Error {
  readonly code: "HTTP_BODY_TOO_LARGE" | "HTTP_INVALID_JSON";

  constructor(code: BodyReadError["code"]) {
    super(code);
    this.name = "BodyReadError";
    this.code = code;
  }
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const declared = Number(request.headers["content-length"] ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BodyReadError("HTTP_BODY_TOO_LARGE");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk)
      ? rawChunk
      : Buffer.from(rawChunk as Uint8Array);
    total += chunk.length;
    if (total > maxBytes) {
      throw new BodyReadError("HTTP_BODY_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new BodyReadError("HTTP_INVALID_JSON");
  }
}

function writeJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(body));
  response.end(body);
}

function writeText(
  response: ServerResponse,
  status: number,
  value: string,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(value));
  response.end(value);
}
