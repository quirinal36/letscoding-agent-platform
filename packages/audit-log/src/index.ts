export type AuditToolName =
  "get_policy" | "analyze_project" | "validate_artifact" | "create_report";

export interface AuditEvent {
  readonly occurredAt: string;
  readonly environment: "dev" | "test" | "staging" | "prod";
  readonly revision: string;
  readonly requestId: string;
  readonly networkKey: string;
  readonly tool: AuditToolName | null;
  readonly policy?: {
    readonly id: string;
    readonly version: string | null;
  };
  readonly artifact?: {
    readonly compressedBytes: number | null;
    readonly uncompressedBytes: number;
    readonly fileCount: number;
    readonly artifactSha256: string;
  };
  readonly result: {
    readonly status:
      "success" | "failure" | "rejected" | "rate-limited" | "overloaded";
    readonly code: string;
    readonly findingCodes?: readonly string[];
  };
  readonly latencyMs: number;
}

export interface AuditSink {
  write(event: AuditEvent): void | Promise<void>;
}

export function createJsonLineAuditSink(
  writeLine: (line: string) => void = (line) => console.log(line),
): AuditSink {
  return {
    write(event) {
      writeLine(serializeAuditEvent(event));
    },
  };
}

export function serializeAuditEvent(event: AuditEvent): string {
  const normalized = {
    schemaVersion: 1,
    occurredAt: normalizeTimestamp(event.occurredAt),
    environment: event.environment,
    revision: normalizeText(event.revision, 128),
    requestId: normalizeIdentifier(event.requestId),
    actor: { kind: "anonymous" },
    networkKey: normalizeHex(event.networkKey, 24),
    tool: event.tool,
    ...(event.policy === undefined
      ? {}
      : {
          policy: {
            id: normalizeIdentifier(event.policy.id),
            version:
              event.policy.version === null
                ? null
                : normalizeIdentifier(event.policy.version),
          },
        }),
    ...(event.artifact === undefined
      ? {}
      : {
          artifact: {
            compressedBytes: event.artifact.compressedBytes,
            uncompressedBytes: event.artifact.uncompressedBytes,
            fileCount: event.artifact.fileCount,
            artifactSha256: normalizeHex(event.artifact.artifactSha256, 64),
          },
        }),
    result: {
      status: event.result.status,
      code: normalizeCode(event.result.code),
      findingCodes: [...new Set(event.result.findingCodes ?? [])]
        .map(normalizeCode)
        .sort(),
    },
    latencyMs: normalizeLatency(event.latencyMs),
  };
  return JSON.stringify(normalized);
}

export async function writeAuditSafely(
  sink: AuditSink,
  event: AuditEvent,
): Promise<void> {
  try {
    await sink.write(event);
  } catch {
    // Audit transport failures must not reflect payloads, tokens, or stacks.
    console.error("AUDIT_WRITE_FAILED");
  }
}

function normalizeTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== value) {
    throw new Error("AUDIT_TIMESTAMP_INVALID");
  }
  return value;
}

function normalizeIdentifier(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error("AUDIT_IDENTIFIER_INVALID");
  }
  return value;
}

function normalizeText(value: string, maxLength: number): string {
  if (
    value.length === 0 ||
    value.length > maxLength ||
    [...value].some((character) => {
      const point = character.codePointAt(0);
      return point !== undefined && (point <= 0x1f || point === 0x7f);
    })
  ) {
    throw new Error("AUDIT_TEXT_INVALID");
  }
  return value;
}

function normalizeCode(value: string): string {
  if (!/^[A-Z][A-Z0-9_-]{0,127}$/.test(value)) {
    return "UNCLASSIFIED";
  }
  return value;
}

function normalizeHex(value: string, length: number): string {
  if (!new RegExp(`^[a-f\\d]{${length}}$`, "i").test(value)) {
    throw new Error("AUDIT_HASH_INVALID");
  }
  return value.toLowerCase();
}

function normalizeLatency(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value);
}
