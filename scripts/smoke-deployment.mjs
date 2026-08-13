import { URL } from "node:url";

const [baseUrl, expectedRevision] = process.argv.slice(2);
if (baseUrl === undefined || expectedRevision === undefined) {
  throw new Error(
    "Usage: node scripts/smoke-deployment.mjs <base-url> <revision>",
  );
}
const base = new URL(baseUrl);
for (const endpoint of ["/health", "/ready"]) {
  const response = await globalThis.fetch(new URL(endpoint, base));
  if (!response.ok)
    throw new Error(`SMOKE_HTTP_FAILED:${endpoint}:${response.status}`);
  const body = await response.json();
  if (body.revision !== expectedRevision) {
    throw new Error(`SMOKE_REVISION_MISMATCH:${endpoint}`);
  }
  if (endpoint === "/ready" && body.status !== "ready") {
    throw new Error("SMOKE_NOT_READY");
  }
}
const response = await globalThis.fetch(new URL("/mcp", base), {
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "release-smoke", version: "1.0.0" },
    },
  }),
});
if (!response.ok) throw new Error(`SMOKE_MCP_FAILED:${response.status}`);
const body = await response.json();
if (body.result?.serverInfo?.name !== "letscoding-lounge-deploy") {
  throw new Error("SMOKE_MCP_IDENTITY_MISMATCH");
}
process.stdout.write(`Deployment smoke passed for ${expectedRevision}.\n`);
