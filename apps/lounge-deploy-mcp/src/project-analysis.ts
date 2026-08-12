import { analyzeProject } from "@letscoding/project-analyzer";
import { parsePolicyDocument } from "@letscoding/policy-contract";

import { McpDomainError } from "./errors.js";
import {
  projectAnalysisResultSchema,
  type AnalyzeProjectData,
  type AnalyzeProjectInput,
} from "./schemas.js";
import type {
  LoungeDeployToolHandlers,
  ToolExecutionContext,
} from "./server.js";

export interface ProjectAnalysisHandlerOptions {
  readonly getPolicy: LoungeDeployToolHandlers["get_policy"];
}

export function createAnalyzeProjectHandler(
  options: ProjectAnalysisHandlerOptions,
): LoungeDeployToolHandlers["analyze_project"] {
  return async (
    input: AnalyzeProjectInput,
    context: ToolExecutionContext,
  ): Promise<AnalyzeProjectData> => {
    const selected = await options.getPolicy(
      { policyId: input.policyId, version: input.version },
      context,
    );
    if (context.signal.aborted) throw context.signal.reason;

    const parsed = parsePolicyDocument(selected.policy);
    if (!parsed.ok) {
      throw new McpDomainError(
        "POLICY_BUNDLE_INVALID",
        "분석에 적용할 정책 bundle의 구조가 올바르지 않습니다.",
      );
    }

    try {
      const result = projectAnalysisResultSchema.parse(
        analyzeProject({
          policy: parsed.value,
          files: input.files.map((file) => ({
            path: file.path,
            sizeBytes: file.sizeBytes,
            ...(file.content === undefined ? {} : { content: file.content }),
          })),
        }),
      );
      if (context.signal.aborted) throw context.signal.reason;
      return {
        policyId: selected.policyId,
        policyVersion: selected.version,
        result,
      };
    } catch (error) {
      if (context.signal.aborted) throw context.signal.reason;
      if (error instanceof McpDomainError) throw error;
      throw new McpDomainError(
        "PROJECT_ANALYSIS_FAILED",
        "프로젝트 metadata를 안전하게 분석하지 못했습니다.",
      );
    }
  };
}
