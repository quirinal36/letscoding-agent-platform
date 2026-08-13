import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  createLoungeDeployHttpHandler,
  createNodeHttpServer,
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
        contentHash: "a".repeat(64),
        policy: { schemaVersion: 1 },
        guide: "# Test guide",
      };
    },
    async analyze_project(input) {
      return {
        policyId: input.policyId,
        policyVersion: input.version ?? "2026-08-12.2",
        result: { pass: true },
      };
    },
    async validate_artifact(input) {
      return {
        policyId: input.policyId,
        policyVersion: input.policyVersion ?? "2026-08-12.2",
        pass: true,
        revalidationRequired: false,
        result: { fileCount: input.manifest.files.length },
      };
    },
    async create_report(input) {
      return {
        policyId: input.policyId,
        policyVersion: input.policyVersion,
        markdown: "# 완료 보고",
        json: { pass: true },
      };
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
});

describe("configuration", () => {
  it("separates environments and requires an operations revision", () => {
    expect(
      loadMcpConfig({ LETS_ENV: "staging", LETS_REVISION: "abc123" }),
    ).toMatchObject({ environment: "staging", revision: "abc123" });
    expect(() => loadMcpConfig({ LETS_ENV: "prod" })).toThrow();
    expect(() => loadMcpConfig({ LETS_ENV: "preview" })).toThrow();
  });
});
