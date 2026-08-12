import { describe, expect, it, vi } from "vitest";

import {
  createJsonLineAuditSink,
  serializeAuditEvent,
  writeAuditSafely,
  type AuditEvent,
} from "./index.js";

const event: AuditEvent = {
  occurredAt: "2026-08-13T00:00:00.000Z",
  environment: "prod",
  revision: "abc123",
  requestId: "request-1",
  networkKey: "a".repeat(24),
  tool: "validate_artifact",
  policy: { id: "lounge-deploy", version: "2026-08-12.2" },
  artifact: {
    compressedBytes: 100,
    uncompressedBytes: 200,
    fileCount: 1,
    artifactSha256: "b".repeat(64),
  },
  result: {
    status: "failure",
    code: "VALIDATION_FAILED",
    findingCodes: ["LD_ENV_FILE_FORBIDDEN"],
  },
  latencyMs: 12.4,
};

describe("structured minimum audit log", () => {
  it("serializes only the explicit allowlisted topology", () => {
    const hostile = {
      ...event,
      token: "secret-token",
      source: "private source",
      stack: "private stack",
      result: { ...event.result, message: "token=secret" },
    } as AuditEvent;
    const line = serializeAuditEvent(hostile);

    expect(JSON.parse(line)).toMatchInlineSnapshot(`
      {
        "actor": {
          "kind": "anonymous",
        },
        "artifact": {
          "artifactSha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "compressedBytes": 100,
          "fileCount": 1,
          "uncompressedBytes": 200,
        },
        "environment": "prod",
        "latencyMs": 12,
        "networkKey": "aaaaaaaaaaaaaaaaaaaaaaaa",
        "occurredAt": "2026-08-13T00:00:00.000Z",
        "policy": {
          "id": "lounge-deploy",
          "version": "2026-08-12.2",
        },
        "requestId": "request-1",
        "result": {
          "code": "VALIDATION_FAILED",
          "findingCodes": [
            "LD_ENV_FILE_FORBIDDEN",
          ],
          "status": "failure",
        },
        "revision": "abc123",
        "schemaVersion": 1,
        "tool": "validate_artifact",
      }
    `);
    expect(line).not.toContain("secret");
    expect(line).not.toContain("source");
    expect(line).not.toContain("stack");
  });

  it("does not leak a sink exception or fail the caller", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      writeAuditSafely(
        {
          write() {
            throw new Error("token=must-not-leak");
          },
        },
        event,
      ),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("AUDIT_WRITE_FAILED");
    expect(JSON.stringify(error.mock.calls)).not.toContain("must-not-leak");
    error.mockRestore();
  });

  it("supports a JSON line sink", () => {
    const lines: string[] = [];
    createJsonLineAuditSink((line) => lines.push(line)).write(event);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(serializeAuditEvent(event));
  });
});
