import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { AuditEvent } from "@letscoding/audit-log";
import { afterEach, describe, expect, it } from "vitest";

import {
  createLoungeDeployHttpHandler,
  createNodeHttpServer,
  createReport,
  loadMcpConfig,
  MCP_TOOL_NAMES,
  McpDomainError,
  type LoungeDeployToolHandlers,
  type McpServiceConfig,
} from "./index.js";

const openClients: Client[] = [];
const openServers: ReturnType<typeof createNodeHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(
    openClients.splice(0).map(async (client) => client.close()),
  );
  await Promise.all(
    openServers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) =>
              error === undefined ? resolve() : reject(error),
            ),
          ),
      ),
  );
});

function testConfig(
  overrides: Partial<McpServiceConfig> = {},
): McpServiceConfig {
  const base = loadMcpConfig({
    LETS_ENV: "test",
    LETS_REVISION: "test-revision",
  });
  return { ...base, ...overrides };
}

function successHandlers(): LoungeDeployToolHandlers {
  return {
    async get_policy(input) {
      return {
        policyId: input.policyId,
        version: input.version ?? "2026-08-12.2",
        effectiveAt: "2026-08-12T14:08:37Z",
        resolvedAt: "2026-08-13T00:00:00Z",
        active: input.version === undefined,
        contentHash: "a".repeat(64),
        etag: `"sha256-${"a".repeat(64)}"`,
        policy: { schemaVersion: 1 },
        guide: "# Test guide",
      };
    },
    async analyze_project(input) {
      return {
        policyId: input.policyId,
        policyVersion: input.version ?? "2026-08-12.2",
        result: {
          pass: true,
          policy: {
            id: input.policyId,
            version: input.version ?? "2026-08-12.2",
          },
          framework: {
            key: "single-html",
            version: null,
            confidence: "high",
            evidence: [
              {
                kind: "file-pattern",
                file: "index.html",
                detail: "single HTML",
              },
            ],
          },
          packageManager: "unknown",
          build: { command: null, outputDirectory: "." },
          findings: [],
          checklist: [],
          input: {
            fileCount: input.files.length,
            inspectedContentFiles: 0,
            inspectedContentBytes: 0,
          },
        },
      };
    },
    async validate_artifact(input) {
      return {
        policyId: input.policyId,
        policyVersion: input.policyVersion,
        startingPolicyVersion: input.policyVersion,
        decision: "PASS",
        pass: true,
        revalidationRequired: false,
        result: {
          pass: true,
          policy: { id: input.policyId, version: input.policyVersion },
          errors: [],
          warnings: [],
          warningWaivers: [],
          summary: {
            fileCount: input.manifest.fileCount,
            totalUncompressedBytes: input.manifest.uncompressedBytes,
            compressedBytes: input.manifest.compressedBytes ?? null,
            hashes: {
              validSha256Count: input.manifest.fileCount,
              invalidSha256Count: 0,
              fileSetSha256: input.localValidation.fileSetSha256,
            },
          },
        },
        metadata: {
          kind: input.manifest.kind,
          artifactSha256: input.manifest.artifactSha256,
          fileSetSha256: input.localValidation.fileSetSha256,
          fileCount: input.manifest.fileCount,
          compressedBytes: input.manifest.compressedBytes ?? null,
          uncompressedBytes: input.manifest.uncompressedBytes,
        },
        localValidation: {
          pass: input.localValidation.pass,
          policyVersion: input.localValidation.policyVersion,
          codes: input.localValidation.codes,
        },
        requestedWarningWaivers: input.warningWaivers ?? [],
      };
    },
    async create_report(input) {
      return createReport(input);
    },
  };
}

async function start(
  options: Parameters<typeof createLoungeDeployHttpHandler>[0],
): Promise<{ readonly baseUrl: URL; readonly client: Client }> {
  const server = createNodeHttpServer(createLoungeDeployHttpHandler(options));
  openServers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const baseUrl = new URL(`http://127.0.0.1:${port}`);
  const client = new Client({ name: "contract-test", version: "1.0.0" });
  openClients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/mcp", baseUrl)) as Transport,
  );
  return { baseUrl, client };
}

describe("MCP protocol scaffold", () => {
  it("initializes and discovers exactly four public tools", async () => {
    const { client } = await start({
      config: testConfig(),
      handlers: successHandlers(),
    });
    const tools = await client.listTools();

    expect(tools.tools.map(({ name }) => name).sort()).toEqual(
      [...MCP_TOOL_NAMES].sort(),
    );
    expect(tools.tools.map(({ name }) => name)).not.toContain(
      "upload_to_lounge",
    );
    for (const tool of tools.tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema?.type).toBe("object");
      expect(tool.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      });
    }
  });

  it("returns runtime-validated structured output", async () => {
    const { client } = await start({
      config: testConfig(),
      handlers: successHandlers(),
    });
    const result = await client.callTool({
      name: "get_policy",
      arguments: { policyId: "lounge-deploy" },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { policyId: "lounge-deploy", version: "2026-08-12.2" },
    });
  });

  it("rejects unknown input fields before calling a handler", async () => {
    let called = false;
    const handlers = successHandlers();
    const { client } = await start({
      config: testConfig(),
      handlers: {
        ...handlers,
        async get_policy(input, context) {
          called = true;
          return handlers.get_policy(input, context);
        },
      },
    });
    const result = await client.callTool({
      name: "get_policy",
      arguments: { policyId: "lounge-deploy", userId: "untrusted" },
    });

    expect(called).toBe(false);
    expect(result.isError).toBe(true);
  });

  it("distinguishes domain errors from transport errors", async () => {
    const { baseUrl, client } = await start({
      config: testConfig(),
      handlers: {
        ...successHandlers(),
        async get_policy() {
          throw new McpDomainError(
            "POLICY_NOT_FOUND",
            "정책을 찾을 수 없습니다.",
          );
        },
      },
    });
    const domain = await client.callTool({
      name: "get_policy",
      arguments: { policyId: "missing" },
    });
    const malformed = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(domain).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: { kind: "domain", code: "POLICY_NOT_FOUND" },
      },
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({
      error: { code: -32700 },
    });
  });

  it("redacts secret-shaped domain errors and drops unapproved details", async () => {
    const { client } = await start({
      config: testConfig(),
      handlers: {
        ...successHandlers(),
        async get_policy() {
          throw new McpDomainError("bad-secret-code", "token=must-not-leak", {
            details: {
              token: "must-not-leak",
              stack: "must-not-leak",
            },
          });
        },
      },
    });
    const result = await client.callTool({
      name: "get_policy",
      arguments: { policyId: "lounge-deploy" },
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        error: {
          code: "DOMAIN_ERROR",
          message: "요청을 안전하게 완료하지 못했습니다.",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("applies tool timeout and closes request resources", async () => {
    const timeoutConfig = testConfig({
      toolTimeoutMs: {
        get_policy: 20,
        analyze_project: 20,
        validate_artifact: 20,
        create_report: 20,
      },
    });
    const { client } = await start({
      config: timeoutConfig,
      handlers: {
        ...successHandlers(),
        async get_policy(_input, context) {
          await new Promise<void>((resolve) => {
            context.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
          throw context.signal.reason;
        },
      },
    });
    const result = await client.callTool({
      name: "get_policy",
      arguments: { policyId: "lounge-deploy" },
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        ok: false,
        error: { kind: "timeout", code: "TOOL_TIMEOUT", retryable: true },
      },
    });
  });
});

describe("HTTP operations", () => {
  it("serves the exact OpenAI domain challenge only when configured", async () => {
    const token = "openai-domain-challenge-test-token";
    const configured = await start({
      config: testConfig({ openAiAppsChallenge: token }),
      handlers: successHandlers(),
    });
    const challenge = await fetch(
      new URL("/.well-known/openai-apps-challenge", configured.baseUrl),
    );

    expect(challenge.status).toBe(200);
    expect(challenge.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(await challenge.text()).toBe(token);

    const unconfigured = await start({
      config: testConfig(),
      handlers: successHandlers(),
    });
    const missing = await fetch(
      new URL("/.well-known/openai-apps-challenge", unconfigured.baseUrl),
    );
    expect(missing.status).toBe(404);
  });

  it("reports health and policy readiness without secrets", async () => {
    const { baseUrl } = await start({
      config: testConfig(),
      handlers: successHandlers(),
      readinessProbes: [
        {
          name: "policy-bundle",
          async check() {
            return true;
          },
        },
      ],
    });
    const health = await fetch(new URL("/health", baseUrl));
    const ready = await fetch(new URL("/ready", baseUrl));

    expect(await health.json()).toEqual({
      status: "ok",
      environment: "test",
      revision: "test-revision",
    });
    expect(await ready.json()).toEqual({
      status: "ready",
      environment: "test",
      revision: "test-revision",
      probes: { "policy-bundle": "ok" },
    });
  });

  it("returns 503 when policy readiness fails", async () => {
    const { baseUrl } = await start({
      config: testConfig(),
      handlers: successHandlers(),
      readinessProbes: [
        {
          name: "policy-bundle",
          async check() {
            return false;
          },
        },
      ],
    });
    const response = await fetch(new URL("/ready", baseUrl));
    expect(response.status).toBe(503);
  });

  it("rejects payloads over the route limit before MCP parsing", async () => {
    const { baseUrl } = await start({
      config: testConfig({ maxBodyBytes: 4_096 }),
      handlers: successHandlers(),
    });
    const response = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ oversized: "x".repeat(5_000) }),
    });
    expect(response.status).toBe(413);
  });

  it("rejects bearer tokens and client-supplied organization identities", async () => {
    const events: AuditEvent[] = [];
    const { baseUrl } = await start({
      config: testConfig(),
      handlers: successHandlers(),
      auditSink: {
        write(event) {
          events.push(event);
        },
      },
    });
    const token = `secret-${"x".repeat(32)}`;
    const bearer = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: "{}",
    });
    const organizationA = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { "x-org-id": "organization-a" },
      body: "{}",
    });
    const organizationB = await fetch(new URL("/mcp", baseUrl), {
      method: "POST",
      headers: { "x-org-id": "organization-b" },
      body: "{}",
    });

    expect(bearer.status).toBe(401);
    expect(organizationA.status).toBe(400);
    expect(organizationB.status).toBe(400);
    expect(JSON.stringify(await bearer.json())).not.toContain(token);
    expect(JSON.stringify(events)).not.toContain(token);
    expect(events.map(({ result }) => result.code)).toEqual([
      "AUTHENTICATION_NOT_SUPPORTED",
      "UNTRUSTED_IDENTITY_HEADER",
      "UNTRUSTED_IDENTITY_HEADER",
    ]);
    expect(events.every((event) => !("userId" in event))).toBe(true);
  });

  it("returns a stable 429 after the anonymous network budget", async () => {
    const events: AuditEvent[] = [];
    const { baseUrl } = await start({
      config: testConfig({
        rateLimit: {
          maxRequests: 3,
          windowMs: 60_000,
          maxConcurrentRequests: 8,
        },
      }),
      handlers: successHandlers(),
      auditSink: {
        write(event) {
          events.push(event);
        },
      },
    });
    const request = () =>
      fetch(new URL("/mcp", baseUrl), { method: "POST", body: "{}" });
    await request();
    await request();
    const limited = await request();

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toMatchObject({
      error: { code: -32029, message: "Request rate limit exceeded." },
    });
    expect(events.at(-1)).toMatchObject({
      tool: null,
      result: { status: "rate-limited", code: "RATE_LIMITED" },
    });
  });

  it("writes an allowlisted tool audit event and omits exception details", async () => {
    const events: AuditEvent[] = [];
    const handlers = successHandlers();
    const { client } = await start({
      config: testConfig(),
      handlers: {
        ...handlers,
        async get_policy() {
          throw new Error("token=must-never-appear in stack");
        },
      },
      auditSink: {
        write(event) {
          events.push(event);
        },
      },
    });
    const result = await client.callTool({
      name: "get_policy",
      arguments: { policyId: "lounge-deploy" },
    });

    expect(result).toMatchObject({
      isError: true,
      structuredContent: {
        error: { code: "INTERNAL_ERROR", message: expect.any(String) },
      },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      environment: "test",
      revision: "test-revision",
      tool: "get_policy",
      policy: { id: "lounge-deploy", version: null },
      result: { status: "failure", code: "INTERNAL_ERROR" },
    });
    expect(events[0]?.requestId).toMatch(/^[A-Za-z0-9._:-]+$/);
    expect(events[0]?.networkKey).toMatch(/^[a-f\d]{24}$/);
    expect(events[0]?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify({ result, events })).not.toContain(
      "must-never-appear",
    );
  });

  it("audits validation policy, result codes, sizes, count, and hashes", async () => {
    const events: AuditEvent[] = [];
    const { client } = await start({
      config: testConfig(),
      handlers: successHandlers(),
      auditSink: {
        write(event) {
          events.push(event);
        },
      },
    });
    const fileHash = "a".repeat(64);
    const artifactHash = "b".repeat(64);
    const fileSetHash = "c".repeat(64);
    const result = await client.callTool({
      name: "validate_artifact",
      arguments: {
        policyId: "lounge-deploy",
        policyVersion: "2026-08-12.2",
        manifest: {
          kind: "zip",
          compressedBytes: 7,
          uncompressedBytes: 10,
          fileCount: 1,
          files: [{ path: "index.html", sizeBytes: 10, sha256: fileHash }],
          artifactSha256: artifactHash,
        },
        localValidation: {
          pass: true,
          policyVersion: "2026-08-12.2",
          artifactSha256: artifactHash,
          fileSetSha256: fileSetHash,
          fileCount: 1,
          totalUncompressedBytes: 10,
          codes: [],
        },
      },
    });

    expect(result.isError).not.toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tool: "validate_artifact",
      policy: { id: "lounge-deploy", version: "2026-08-12.2" },
      artifact: {
        compressedBytes: 7,
        uncompressedBytes: 10,
        fileCount: 1,
        artifactSha256: artifactHash,
      },
      result: { status: "success", code: "PASS", findingCodes: [] },
    });
    expect(result.structuredContent).toMatchObject({
      requestId: events[0]?.requestId,
    });
  });
});

describe("configuration", () => {
  it("separates environments and requires an operations revision", () => {
    expect(
      loadMcpConfig({
        LETS_ENV: "staging",
        LETS_REVISION: "abc123",
        LETS_NETWORK_KEY_SECRET: "s".repeat(32),
      }),
    ).toMatchObject({ environment: "staging", revision: "abc123" });
    expect(() =>
      loadMcpConfig({ LETS_ENV: "staging", LETS_REVISION: "abc123" }),
    ).toThrow();
    expect(() => loadMcpConfig({ LETS_ENV: "prod" })).toThrow();
    expect(() => loadMcpConfig({ LETS_ENV: "preview" })).toThrow();
  });

  it("accepts a single-line OpenAI domain challenge token", () => {
    expect(
      loadMcpConfig({
        LETS_ENV: "test",
        LETS_OPENAI_APPS_CHALLENGE: "challenge-token",
      }),
    ).toMatchObject({ openAiAppsChallenge: "challenge-token" });
    expect(() =>
      loadMcpConfig({
        LETS_ENV: "test",
        LETS_OPENAI_APPS_CHALLENGE: "challenge-token\n",
      }),
    ).toThrow();
  });
});
