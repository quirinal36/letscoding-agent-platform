import { createHash } from "node:crypto";

import {
  loadActivePolicy,
  loadPolicyVersion,
  normalizeGuideText,
  type LoadedPolicySnapshot,
  type PolicyIssue,
  type PolicySource,
} from "@letscoding/policy-contract";

import { McpDomainError } from "./errors.js";
import type { GetPolicyData, GetPolicyInput } from "./schemas.js";
import type { ToolExecutionContext } from "./server.js";

export interface PolicyRepositoryOptions {
  readonly sourceForPolicy: (policyId: string) => PolicySource | null;
  readonly clock?: () => Date;
}

export function createGetPolicyHandler(options: PolicyRepositoryOptions) {
  return async (
    input: GetPolicyInput,
    context: ToolExecutionContext,
  ): Promise<GetPolicyData> => {
    const resolvedAt = (options.clock ?? (() => new Date()))().toISOString();
    const source = options.sourceForPolicy(input.policyId);
    if (source === null) {
      throw new McpDomainError(
        "POLICY_NOT_FOUND",
        "요청한 정책 ID를 찾을 수 없습니다.",
      );
    }
    if (context.signal.aborted) throw context.signal.reason;

    try {
      if (input.version !== undefined) {
        const loaded = await loadPolicyVersion(source, {
          policyId: input.policyId,
          version: input.version,
        });
        if (!loaded.ok) {
          throw policyLoadError(loaded.issues, true);
        }
        return policyData(loaded.value, {
          resolvedAt,
          active: false,
        });
      }

      const loaded = await loadActivePolicy(source, {
        policyId: input.policyId,
      });
      if (!loaded.ok) {
        throw policyLoadError(loaded.issues, false);
      }
      return policyData(loaded.value, {
        resolvedAt,
        active: true,
        activatedAt: loaded.value.pointer.activatedAt,
      });
    } catch (error) {
      if (error instanceof McpDomainError) throw error;
      if (context.signal.aborted) throw context.signal.reason;
      throw new McpDomainError(
        "POLICY_SERVICE_UNAVAILABLE",
        "정책 source를 읽을 수 없어 요청을 안전하게 완료하지 못했습니다.",
        { retryable: true },
      );
    }
  };
}

export async function verifyActivePolicy(
  source: PolicySource,
  policyId: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  try {
    const result = await loadActivePolicy(source, { policyId });
    return result.ok && !signal.aborted;
  } catch {
    return false;
  }
}

function policyData(
  snapshot: LoadedPolicySnapshot,
  resolution: {
    readonly resolvedAt: string;
    readonly active: boolean;
    readonly activatedAt?: string;
  },
): GetPolicyData {
  const guide = normalizeGuideText(snapshot.guideMarkdown);
  const contentHash = createHash("sha256")
    .update("letscoding-policy-bundle-v1\0")
    .update(JSON.stringify(snapshot.document))
    .update("\0")
    .update(guide)
    .digest("hex");
  return {
    policyId: snapshot.document.id,
    version: snapshot.document.version,
    effectiveAt: snapshot.document.effectiveAt,
    resolvedAt: resolution.resolvedAt,
    active: resolution.active,
    ...(resolution.activatedAt === undefined
      ? {}
      : { activatedAt: resolution.activatedAt }),
    contentHash,
    etag: `"sha256-${contentHash}"`,
    policy: snapshot.document as unknown as Record<string, unknown>,
    guide,
  };
}

function policyLoadError(
  issues: readonly PolicyIssue[],
  explicitVersion: boolean,
): McpDomainError {
  const codes = [...new Set(issues.map(({ code }) => code))].sort();
  if (explicitVersion && codes.includes("POLICY_SNAPSHOT_MISSING")) {
    return new McpDomainError(
      "POLICY_VERSION_NOT_FOUND",
      "요청한 불변 정책 버전을 찾을 수 없습니다.",
      { details: { policyCodes: codes } },
    );
  }
  return new McpDomainError(
    "POLICY_BUNDLE_INVALID",
    "정책 bundle 무결성 검사에 실패했습니다.",
    { details: { policyCodes: codes } },
  );
}
