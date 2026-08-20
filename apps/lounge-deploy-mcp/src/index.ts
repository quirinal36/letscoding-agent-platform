import type { IncomingMessage, ServerResponse } from "node:http";

import { loungeDeployHttpHandler } from "./runtime.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  await loungeDeployHttpHandler(request, response);
}

export {
  createLoungeDeployMcpServer,
  MCP_TOOL_NAMES,
  type LoungeDeployToolHandlers,
  type ToolExecutionContext,
} from "./server.js";
export {
  createLoungeDeployHttpHandler,
  createNodeHttpServer,
  type LoungeDeployHttpHandler,
  type ReadinessProbe,
} from "./http.js";
export {
  loadMcpConfig,
  type LoungeDeployEnvironment,
  type McpServiceConfig,
} from "./config.js";
export {
  McpDomainError,
  type ToolErrorEnvelope,
  type ToolSuccessEnvelope,
} from "./errors.js";
export {
  createGetPolicyHandler,
  verifyActivePolicy,
  type PolicyRepositoryOptions,
} from "./policy-repository.js";
export { createBundledPolicySource } from "./bundled-policy-source.js";
export {
  createValidateArtifactHandler,
  type ArtifactValidationHandlerOptions,
} from "./artifact-validation.js";
export {
  createAnalyzeProjectHandler,
  type ProjectAnalysisHandlerOptions,
} from "./project-analysis.js";
export { createReport, createReportHandler } from "./report.js";
export * from "./schemas.js";
