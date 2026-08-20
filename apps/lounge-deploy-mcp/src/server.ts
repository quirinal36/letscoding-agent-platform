import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import {
  writeAuditSafely,
  type AuditEvent,
  type AuditSink,
} from "@letscoding/audit-log";
import { assertPublicToolAuthorized } from "@letscoding/mcp-auth";

import type { McpServiceConfig } from "./config.js";
import {
  McpDomainError,
  toToolErrorEnvelope,
  type ToolErrorEnvelope,
  type ToolSuccessEnvelope,
} from "./errors.js";
import {
  analyzeProjectDataSchema,
  analyzeProjectInputSchema,
  createReportDataSchema,
  createReportInputSchema,
  getPolicyDataSchema,
  getPolicyInputSchema,
  toolOutputSchema,
  validateArtifactDataSchema,
  validateArtifactInputSchema,
  type AnalyzeProjectData,
  type AnalyzeProjectInput,
  type CreateReportData,
  type CreateReportInput,
  type GetPolicyData,
  type GetPolicyInput,
  type ValidateArtifactData,
  type ValidateArtifactInput,
} from "./schemas.js";

export const MCP_TOOL_NAMES = [
  "get_policy",
  "analyze_project",
  "validate_artifact",
  "create_report",
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export interface ToolExecutionContext {
  readonly requestId: string;
  readonly signal: AbortSignal;
}

export interface LoungeDeployToolHandlers {
  readonly get_policy: (
    input: GetPolicyInput,
    context: ToolExecutionContext,
  ) => Promise<GetPolicyData>;
  readonly analyze_project: (
    input: AnalyzeProjectInput,
    context: ToolExecutionContext,
  ) => Promise<AnalyzeProjectData>;
  readonly validate_artifact: (
    input: ValidateArtifactInput,
    context: ToolExecutionContext,
  ) => Promise<ValidateArtifactData>;
  readonly create_report: (
    input: CreateReportInput,
    context: ToolExecutionContext,
  ) => Promise<CreateReportData>;
}

export interface CreateMcpServerOptions {
  readonly config: McpServiceConfig;
  readonly handlers?: Partial<LoungeDeployToolHandlers>;
  readonly requestContext?: {
    readonly requestId: string;
    readonly networkKey: string;
  };
  readonly auditSink?: AuditSink;
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function createLoungeDeployMcpServer(
  options: CreateMcpServerOptions,
): McpServer {
  const handlers = { ...notImplementedHandlers(), ...options.handlers };
  const server = new McpServer(
    { name: "letscoding-lounge-deploy", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "get_policy",
    {
      title: "Get Lounge Deploy policy",
      description:
        "활성 또는 지정 Lounge Deploy 정책과 상세 가이드를 조회합니다.",
      inputSchema: getPolicyInputSchema,
      outputSchema: toolOutputSchema(getPolicyDataSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool("get_policy", handlers.get_policy, input, extra, options),
  );
  server.registerTool(
    "analyze_project",
    {
      title: "Analyze static project",
      description:
        "제한된 프로젝트 metadata를 정적 Lounge 배포 정책으로 분석합니다.",
      inputSchema: analyzeProjectInputSchema,
      outputSchema: toolOutputSchema(analyzeProjectDataSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "analyze_project",
        handlers.analyze_project,
        input,
        extra,
        options,
      ),
  );
  server.registerTool(
    "validate_artifact",
    {
      title: "Validate Lounge artifact manifest",
      description:
        "ZIP 원문 없이 artifact manifest를 활성 정책으로 다시 검증합니다.",
      inputSchema: validateArtifactInputSchema,
      outputSchema: toolOutputSchema(validateArtifactDataSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "validate_artifact",
        handlers.validate_artifact,
        input,
        extra,
        options,
      ),
  );
  server.registerTool(
    "create_report",
    {
      title: "Create validation report",
      description:
        "분석과 최종 검증 결과를 Markdown 및 JSON 완료 보고서로 변환합니다.",
      inputSchema: createReportInputSchema,
      outputSchema: toolOutputSchema(createReportDataSchema),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "create_report",
        handlers.create_report,
        input,
        extra,
        options,
      ),
  );

  return server;
}

async function executeTool<Input, Output>(
  name: McpToolName,
  handler: (input: Input, context: ToolExecutionContext) => Promise<Output>,
  input: Input,
  extra: Extra,
  options: CreateMcpServerOptions,
) {
  assertPublicToolAuthorized(name);
  const startedAt = performance.now();
  const requestId =
    options.requestContext?.requestId ?? String(extra.requestId);
  const timeoutSignal = AbortSignal.timeout(options.config.toolTimeoutMs[name]);
  const signal = AbortSignal.any([extra.signal, timeoutSignal]);
  let envelope: ToolSuccessEnvelope<Output> | ToolErrorEnvelope;
  try {
    const data = await raceAbort(handler(input, { requestId, signal }), signal);
    envelope = { ok: true, requestId, data };
  } catch (error) {
    envelope = toToolErrorEnvelope(error, requestId, signal);
  }
  if (options.auditSink !== undefined) {
    await writeAuditSafely(
      options.auditSink,
      createToolAuditEvent(name, input, envelope, startedAt, options),
    );
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    structuredContent: envelope,
    ...(envelope.ok ? {} : { isError: true }),
  };
}

function createToolAuditEvent(
  name: McpToolName,
  input: unknown,
  envelope: ToolSuccessEnvelope<unknown> | ToolErrorEnvelope,
  startedAt: number,
  options: CreateMcpServerOptions,
): AuditEvent {
  const inputRecord = asRecord(input);
  const data = envelope.ok ? asRecord(envelope.data) : null;
  const policyId =
    readString(data, "policyId") ?? readString(inputRecord, "policyId");
  const policyVersion =
    readString(data, "policyVersion") ??
    readString(data, "version") ??
    readString(inputRecord, "policyVersion") ??
    readString(inputRecord, "version") ??
    null;
  const facts = envelope.ok
    ? successAuditFacts(name, data ?? {})
    : {
        status: "failure" as const,
        code: envelope.error.code,
        findingCodes: [] as string[],
        artifact: undefined,
      };
  return {
    occurredAt: new Date().toISOString(),
    environment: options.config.environment,
    revision: options.config.revision,
    requestId: options.requestContext?.requestId ?? envelope.requestId,
    networkKey: options.requestContext?.networkKey ?? "0".repeat(24),
    tool: name,
    ...(policyId === undefined
      ? {}
      : { policy: { id: policyId, version: policyVersion } }),
    ...(facts.artifact === undefined ? {} : { artifact: facts.artifact }),
    result: {
      status: facts.status,
      code: facts.code,
      findingCodes: facts.findingCodes,
    },
    latencyMs: performance.now() - startedAt,
  };
}

function successAuditFacts(name: McpToolName, data: Record<string, unknown>) {
  if (name === "get_policy") {
    return {
      status: "success" as const,
      code: "PASS",
      findingCodes: [] as string[],
      artifact: undefined,
    };
  }
  if (name === "analyze_project") {
    const result = asRecord(data.result);
    const pass = result.pass === true;
    return {
      status: pass ? ("success" as const) : ("failure" as const),
      code: pass ? "PASS" : "ANALYSIS_FAILED",
      findingCodes: readCodes(result.findings),
      artifact: undefined,
    };
  }
  const reportJson = asRecord(data.json);
  const validation =
    name === "create_report"
      ? asRecord(reportJson.validation)
      : asRecord(data.result);
  const metadata =
    name === "create_report"
      ? asRecord(reportJson.artifact)
      : asRecord(data.metadata);
  const pass = data.pass === true;
  const code =
    name === "create_report"
      ? reportStatusCode(readString(data, "status"))
      : (readString(data, "decision") ?? "UNCLASSIFIED");
  return {
    status: pass ? ("success" as const) : ("failure" as const),
    code,
    findingCodes:
      name === "create_report"
        ? readStringArray(validation.errorCodes)
        : [...readCodes(validation.errors), ...readCodes(validation.warnings)],
    artifact: readArtifact(metadata),
  };
}

function reportStatusCode(status: string | undefined): string {
  return (
    {
      completed: "PASS",
      failed: "REPORT_FAILED",
      "revalidation-required": "REVALIDATION_REQUIRED",
    }[status ?? ""] ?? "UNCLASSIFIED"
  );
}

function readArtifact(
  value: Record<string, unknown>,
): AuditEvent["artifact"] | undefined {
  const artifactSha256 = readString(value, "artifactSha256");
  const uncompressedBytes = readNumber(value, "uncompressedBytes");
  const fileCount = readNumber(value, "fileCount");
  if (
    artifactSha256 === undefined ||
    uncompressedBytes === undefined ||
    fileCount === undefined
  ) {
    return undefined;
  }
  return {
    compressedBytes: readNumber(value, "compressedBytes") ?? null,
    uncompressedBytes,
    fileCount,
    artifactSha256,
  };
}

function readCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const code = readString(asRecord(entry), "code");
    return code === undefined ? [] : [code];
  });
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  value: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const selected = value?.[key];
  return typeof selected === "string" ? selected : undefined;
}

function readNumber(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const selected = value[key];
  return typeof selected === "number" && Number.isSafeInteger(selected)
    ? selected
    : undefined;
}

async function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signal.reason;
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const onAbort = (): void => rejectAbort?.(signal.reason);
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function notImplementedHandlers(): LoungeDeployToolHandlers {
  const unavailable = async (): Promise<never> => {
    throw new McpDomainError(
      "TOOL_NOT_IMPLEMENTED",
      "도구 계약만 등록되었으며 도메인 구현은 후속 이슈에서 연결됩니다.",
    );
  };
  return {
    get_policy: unavailable,
    analyze_project: unavailable,
    validate_artifact: unavailable,
    create_report: unavailable,
  };
}
