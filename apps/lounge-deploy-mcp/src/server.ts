import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";

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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "get_policy",
        handlers.get_policy,
        input,
        extra,
        options.config,
      ),
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "analyze_project",
        handlers.analyze_project,
        input,
        extra,
        options.config,
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "validate_artifact",
        handlers.validate_artifact,
        input,
        extra,
        options.config,
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
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) =>
      executeTool(
        "create_report",
        handlers.create_report,
        input,
        extra,
        options.config,
      ),
  );

  return server;
}

async function executeTool<Input, Output>(
  name: McpToolName,
  handler: (input: Input, context: ToolExecutionContext) => Promise<Output>,
  input: Input,
  extra: Extra,
  config: McpServiceConfig,
) {
  const requestId = String(extra.requestId);
  const timeoutSignal = AbortSignal.timeout(config.toolTimeoutMs[name]);
  const signal = AbortSignal.any([extra.signal, timeoutSignal]);
  let envelope: ToolSuccessEnvelope<Output> | ToolErrorEnvelope;
  try {
    const data = await raceAbort(handler(input, { requestId, signal }), signal);
    envelope = { ok: true, requestId, data };
  } catch (error) {
    envelope = toToolErrorEnvelope(error, requestId, signal);
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
    structuredContent: envelope,
    ...(envelope.ok ? {} : { isError: true }),
  };
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
