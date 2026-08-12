import {
  artifactValidationPolicyFromDocument,
  validateArtifact,
} from "@letscoding/artifact-validator";
import { parsePolicyDocument } from "@letscoding/policy-contract";

import { McpDomainError } from "./errors.js";
import {
  artifactValidationResultSchema,
  type GetPolicyData,
  type ValidateArtifactData,
  type ValidateArtifactInput,
} from "./schemas.js";
import type {
  LoungeDeployToolHandlers,
  ToolExecutionContext,
} from "./server.js";

export interface ArtifactValidationHandlerOptions {
  readonly getPolicy: LoungeDeployToolHandlers["get_policy"];
}

export function createValidateArtifactHandler(
  options: ArtifactValidationHandlerOptions,
): LoungeDeployToolHandlers["validate_artifact"] {
  return async (
    input: ValidateArtifactInput,
    context: ToolExecutionContext,
  ): Promise<ValidateArtifactData> => {
    const initialPolicy = await activePolicy(options, input, context);
    const initialResult = validateWithPolicy(initialPolicy, input);
    assertManifestDigest(input, initialResult);
    if (context.signal.aborted) throw context.signal.reason;

    const finalPolicy = await activePolicy(options, input, context);
    if (
      finalPolicy.version === initialPolicy.version &&
      finalPolicy.contentHash !== initialPolicy.contentHash
    ) {
      throw new McpDomainError(
        "POLICY_BUNDLE_INVALID",
        "같은 정책 버전의 내용이 요청 도중 변경되었습니다.",
      );
    }
    const result =
      finalPolicy.version === initialPolicy.version
        ? initialResult
        : validateWithPolicy(finalPolicy, input);
    assertManifestDigest(input, result);

    const revalidationRequired =
      input.policyVersion !== finalPolicy.version ||
      initialPolicy.version !== finalPolicy.version;
    const decision = revalidationRequired
      ? "REVALIDATION_REQUIRED"
      : !input.localValidation.pass
        ? "LOCAL_VALIDATION_FAILED"
        : !result.pass
          ? "VALIDATION_FAILED"
          : "PASS";

    return {
      policyId: finalPolicy.policyId,
      policyVersion: finalPolicy.version,
      startingPolicyVersion: input.policyVersion,
      decision,
      pass: decision === "PASS",
      revalidationRequired,
      result,
      metadata: {
        kind: input.manifest.kind,
        artifactSha256: input.manifest.artifactSha256,
        fileSetSha256: result.summary.hashes.fileSetSha256,
        fileCount: input.manifest.fileCount,
        compressedBytes: input.manifest.compressedBytes ?? null,
        uncompressedBytes: input.manifest.uncompressedBytes,
      },
      localValidation: {
        pass: input.localValidation.pass,
        policyVersion: input.localValidation.policyVersion,
        codes: [...new Set(input.localValidation.codes)].sort(),
      },
      requestedWarningWaivers: [...(input.warningWaivers ?? [])].sort(
        (left, right) =>
          left.code.localeCompare(right.code, "en") ||
          left.reason.localeCompare(right.reason, "en"),
      ),
    };
  };
}

async function activePolicy(
  options: ArtifactValidationHandlerOptions,
  input: ValidateArtifactInput,
  context: ToolExecutionContext,
): Promise<GetPolicyData> {
  const selected = await options.getPolicy(
    { policyId: input.policyId },
    context,
  );
  if (context.signal.aborted) throw context.signal.reason;
  return selected;
}

function validateWithPolicy(
  selected: GetPolicyData,
  input: ValidateArtifactInput,
) {
  const parsed = parsePolicyDocument(selected.policy);
  if (!parsed.ok) {
    throw new McpDomainError(
      "POLICY_BUNDLE_INVALID",
      "산출물 검증에 적용할 정책 bundle의 구조가 올바르지 않습니다.",
    );
  }
  try {
    return artifactValidationResultSchema.parse(
      validateArtifact({
        policy: artifactValidationPolicyFromDocument(parsed.value),
        manifest: {
          kind: input.manifest.kind,
          ...(input.manifest.compressedBytes === undefined
            ? {}
            : { compressedBytes: input.manifest.compressedBytes }),
          files: input.manifest.files,
        },
        ...(input.warningWaivers === undefined
          ? {}
          : { warningWaivers: input.warningWaivers }),
      }),
    );
  } catch (error) {
    if (error instanceof McpDomainError) throw error;
    throw new McpDomainError(
      "ARTIFACT_VALIDATION_FAILED",
      "산출물 manifest를 안전하게 검증하지 못했습니다.",
    );
  }
}

function assertManifestDigest(
  input: ValidateArtifactInput,
  result: ReturnType<typeof validateWithPolicy>,
): void {
  if (
    input.localValidation.fileSetSha256 !== result.summary.hashes.fileSetSha256
  ) {
    throw new McpDomainError(
      "ARTIFACT_MANIFEST_INCONSISTENT",
      "로컬 검증과 서버 manifest의 file-set digest가 일치하지 않습니다.",
    );
  }
}
