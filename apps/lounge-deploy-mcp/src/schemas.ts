import { z } from "zod/v4";

import { ARTIFACT_VALIDATION_RULE_IDS } from "@letscoding/artifact-validator";
import {
  PROJECT_ANALYZER_LIMITS,
  projectContentByteLimit,
} from "@letscoding/project-analyzer";

import { looksSensitive } from "./sensitive-data.js";

const policyIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);
const policyVersionSchema = z
  .string()
  .max(32)
  .regex(/^\d{4}-\d{2}-\d{2}\.[1-9]\d*$/);
const sha256Schema = z.string().regex(/^[a-f\d]{64}$/i);
const findingCodeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Z][A-Z0-9_]*$/);
const safePathSchema = z.string().min(1).max(4096);
const reportTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine(
    (value) => !hasControlCharacter(value),
    "제어 문자는 허용하지 않습니다.",
  )
  .refine(
    (value) => !looksSensitive(value),
    "비밀값 또는 인증 정보로 보이는 문자열은 보고서 입력에 넣을 수 없습니다.",
  );
const reportPathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(
    (value) => value === value.trim(),
    "경로 앞뒤에 공백을 사용할 수 없습니다.",
  )
  .refine(
    (value) => !hasControlCharacter(value),
    "경로에 제어 문자를 사용할 수 없습니다.",
  )
  .refine(
    (value) => !looksSensitive(value),
    "비밀값으로 보이는 경로는 보고서 입력에 넣을 수 없습니다.",
  );

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 0x1f || point === 0x7f);
  });
}

export const getPolicyInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    version: policyVersionSchema.optional(),
  })
  .strict();

const projectFileInputSchema = z
  .object({
    path: safePathSchema,
    sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    content: z
      .string()
      .max(256 * 1024)
      .optional(),
  })
  .strict()
  .superRefine((file, context) => {
    if (file.content === undefined) return;
    const byteLimit = projectContentByteLimit(file.path);
    if (byteLimit === null) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message:
          "이 경로는 metadata만 허용되며 파일 내용은 전송할 수 없습니다.",
      });
      return;
    }
    if (Buffer.byteLength(file.content, "utf8") > byteLimit) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: `파일 내용이 ${byteLimit} byte 제한을 넘었습니다.`,
      });
    }
  });

export const analyzeProjectInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    version: policyVersionSchema.optional(),
    files: z
      .array(projectFileInputSchema)
      .max(PROJECT_ANALYZER_LIMITS.maxFiles),
  })
  .strict()
  .superRefine((input, context) => {
    const paths = new Set<string>();
    let contentBytes = 0;
    for (const [index, file] of input.files.entries()) {
      if (paths.has(file.path)) {
        context.addIssue({
          code: "custom",
          path: ["files", index, "path"],
          message: "중복 파일 경로는 허용하지 않습니다.",
        });
      }
      paths.add(file.path);
      contentBytes += Buffer.byteLength(file.content ?? "", "utf8");
    }
    if (contentBytes > PROJECT_ANALYZER_LIMITS.maxTotalContentBytes) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: `전체 파일 내용이 ${PROJECT_ANALYZER_LIMITS.maxTotalContentBytes} byte 제한을 넘었습니다.`,
      });
    }
  });

export const artifactManifestSchema = z
  .object({
    kind: z.enum(["directory", "zip"]),
    compressedBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
    uncompressedBytes: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER),
    fileCount: z.number().int().nonnegative().max(2_000),
    files: z
      .array(
        z
          .object({
            path: safePathSchema,
            sizeBytes: z
              .number()
              .int()
              .nonnegative()
              .max(Number.MAX_SAFE_INTEGER),
            sha256: sha256Schema,
          })
          .strict(),
      )
      .max(2_000),
    artifactSha256: sha256Schema,
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.kind === "zip" && manifest.compressedBytes === undefined) {
      context.addIssue({
        code: "custom",
        path: ["compressedBytes"],
        message: "ZIP manifest에는 압축 크기가 필요합니다.",
      });
    }
    if (
      manifest.kind === "directory" &&
      manifest.compressedBytes !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["compressedBytes"],
        message: "디렉터리 manifest에는 압축 크기를 넣지 않습니다.",
      });
    }
    if (manifest.fileCount !== manifest.files.length) {
      context.addIssue({
        code: "custom",
        path: ["fileCount"],
        message: "선언 파일 수와 files 길이가 일치하지 않습니다.",
      });
    }
    const total = manifest.files.reduce(
      (sum, file) => sum + BigInt(file.sizeBytes),
      0n,
    );
    if (total !== BigInt(manifest.uncompressedBytes)) {
      context.addIssue({
        code: "custom",
        path: ["uncompressedBytes"],
        message: "선언 해제 크기와 파일 크기 합계가 일치하지 않습니다.",
      });
    }
  });

export const validateArtifactInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    policyVersion: policyVersionSchema,
    manifest: artifactManifestSchema,
    localValidation: z
      .object({
        pass: z.boolean(),
        policyVersion: policyVersionSchema,
        artifactSha256: sha256Schema,
        fileSetSha256: sha256Schema,
        fileCount: z.number().int().nonnegative().max(2_000),
        totalUncompressedBytes: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER),
        codes: z.array(findingCodeSchema).max(2_000),
      })
      .strict(),
    warningWaivers: z
      .array(
        z
          .object({
            code: findingCodeSchema,
            reason: z
              .string()
              .trim()
              .min(1)
              .max(1_000)
              .refine(
                (value) =>
                  ![...value].some((character) => {
                    const point = character.codePointAt(0);
                    return (
                      point !== undefined && (point <= 0x1f || point === 0x7f)
                    );
                  }),
                "경고 해제 사유에는 제어 문자를 사용할 수 없습니다.",
              ),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    const local = input.localValidation;
    if (local.policyVersion !== input.policyVersion) {
      context.addIssue({
        code: "custom",
        path: ["localValidation", "policyVersion"],
        message: "시작 정책과 로컬 검증 정책 버전이 일치하지 않습니다.",
      });
    }
    if (local.artifactSha256 !== input.manifest.artifactSha256) {
      context.addIssue({
        code: "custom",
        path: ["localValidation", "artifactSha256"],
        message: "로컬 검증과 manifest의 artifact hash가 일치하지 않습니다.",
      });
    }
    if (local.fileCount !== input.manifest.fileCount) {
      context.addIssue({
        code: "custom",
        path: ["localValidation", "fileCount"],
        message: "로컬 검증과 manifest의 파일 수가 일치하지 않습니다.",
      });
    }
    if (local.totalUncompressedBytes !== input.manifest.uncompressedBytes) {
      context.addIssue({
        code: "custom",
        path: ["localValidation", "totalUncompressedBytes"],
        message: "로컬 검증과 manifest의 해제 크기가 일치하지 않습니다.",
      });
    }
  });

const errorSchema = z
  .object({
    kind: z.enum(["domain", "timeout", "cancelled", "internal"]),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export function toolOutputSchema<T extends z.ZodType>(dataSchema: T) {
  return z
    .object({
      ok: z.boolean(),
      requestId: z.string(),
      data: dataSchema.optional(),
      error: errorSchema.optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.ok && (value.data === undefined || value.error !== undefined)) {
        context.addIssue({
          code: "custom",
          message: "Successful output requires data and forbids error.",
        });
      }
      if (
        !value.ok &&
        (value.error === undefined || value.data !== undefined)
      ) {
        context.addIssue({
          code: "custom",
          message: "Failed output requires error and forbids data.",
        });
      }
    });
}

export const getPolicyDataSchema = z
  .object({
    policyId: policyIdSchema,
    version: policyVersionSchema,
    effectiveAt: z.string(),
    resolvedAt: z.string(),
    active: z.boolean(),
    activatedAt: z.string().optional(),
    contentHash: sha256Schema,
    etag: z.string(),
    policy: z.record(z.string(), z.unknown()),
    guide: z.string(),
  })
  .strict();

export const projectAnalysisResultSchema = z
  .object({
    pass: z.boolean(),
    policy: z
      .object({ id: policyIdSchema, version: policyVersionSchema })
      .strict(),
    framework: z
      .object({
        key: z.enum([
          "single-html",
          "plain-static",
          "vite",
          "nextjs",
          "generic-static",
        ]),
        version: z.string().nullable(),
        confidence: z.enum(["high", "medium", "low"]),
        evidence: z.array(
          z
            .object({
              kind: z.enum([
                "config-file",
                "dependency",
                "file-pattern",
                "lockfile",
                "script",
              ]),
              file: safePathSchema,
              detail: z.string().max(1_000),
            })
            .strict(),
        ),
      })
      .strict(),
    packageManager: z.enum(["pnpm", "npm", "yarn", "bun", "unknown"]),
    build: z
      .object({
        command: z.string().max(2_000).nullable(),
        outputDirectory: safePathSchema.nullable(),
      })
      .strict(),
    findings: z.array(
      z
        .object({
          code: z.string().min(1).max(128),
          policyCode: z.string().min(1).max(128).optional(),
          severity: z.enum(["blocker", "error", "warning", "recommendation"]),
          message: z.string().max(2_000),
          files: z.array(safePathSchema).max(PROJECT_ANALYZER_LIMITS.maxFiles),
          recommendation: z.string().max(2_000),
        })
        .strict(),
    ),
    checklist: z.array(
      z
        .object({
          id: z.string().min(1).max(128),
          required: z.boolean(),
          text: z.string().max(2_000),
        })
        .strict(),
    ),
    input: z
      .object({
        fileCount: z.number().int().nonnegative(),
        inspectedContentFiles: z.number().int().nonnegative(),
        inspectedContentBytes: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const analyzeProjectDataSchema = z
  .object({
    policyId: policyIdSchema,
    policyVersion: policyVersionSchema,
    result: projectAnalysisResultSchema,
  })
  .strict();

const artifactFindingSchema = z
  .object({
    ruleId: z.enum(ARTIFACT_VALIDATION_RULE_IDS),
    code: findingCodeSchema,
    severity: z.enum(["error", "warning"]),
    message: z.string().max(2_000),
    fileIndexes: z.array(z.number().int().nonnegative()).max(2_000),
  })
  .strict();

export const artifactValidationResultSchema = z
  .object({
    pass: z.boolean(),
    policy: z
      .object({ id: policyIdSchema, version: policyVersionSchema })
      .strict(),
    errors: z.array(artifactFindingSchema),
    warnings: z.array(
      artifactFindingSchema.extend({
        severity: z.literal("warning"),
        waived: z.boolean(),
        waiverReason: z.string().max(1_000).optional(),
      }),
    ),
    warningWaivers: z.array(
      z
        .object({
          code: findingCodeSchema,
          reason: z.string().min(1).max(1_000),
          waivedWarningCount: z.number().int().positive(),
        })
        .strict(),
    ),
    summary: z
      .object({
        fileCount: z.number().int().nonnegative(),
        totalUncompressedBytes: z.number().int().nonnegative().nullable(),
        compressedBytes: z.number().int().nonnegative().nullable(),
        hashes: z
          .object({
            validSha256Count: z.number().int().nonnegative(),
            invalidSha256Count: z.number().int().nonnegative(),
            fileSetSha256: sha256Schema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const validateArtifactDataSchema = z
  .object({
    policyId: policyIdSchema,
    policyVersion: policyVersionSchema,
    startingPolicyVersion: policyVersionSchema,
    decision: z.enum([
      "PASS",
      "VALIDATION_FAILED",
      "LOCAL_VALIDATION_FAILED",
      "REVALIDATION_REQUIRED",
    ]),
    pass: z.boolean(),
    revalidationRequired: z.boolean(),
    result: artifactValidationResultSchema,
    metadata: z
      .object({
        kind: z.enum(["directory", "zip"]),
        artifactSha256: sha256Schema,
        fileSetSha256: sha256Schema,
        fileCount: z.number().int().nonnegative(),
        compressedBytes: z.number().int().nonnegative().nullable(),
        uncompressedBytes: z.number().int().nonnegative(),
      })
      .strict(),
    localValidation: z
      .object({
        pass: z.boolean(),
        policyVersion: policyVersionSchema,
        codes: z.array(findingCodeSchema).max(2_000),
      })
      .strict(),
    requestedWarningWaivers: z.array(
      z
        .object({
          code: findingCodeSchema,
          reason: z.string().min(1).max(1_000),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.pass !== (output.decision === "PASS")) {
      context.addIssue({
        code: "custom",
        path: ["pass"],
        message: "PASS decision과 pass 값이 일치해야 합니다.",
      });
    }
    if (
      output.revalidationRequired !==
      (output.decision === "REVALIDATION_REQUIRED")
    ) {
      context.addIssue({
        code: "custom",
        path: ["revalidationRequired"],
        message: "재검증 decision과 플래그가 일치해야 합니다.",
      });
    }
    if (
      output.result.policy.id !== output.policyId ||
      output.result.policy.version !== output.policyVersion
    ) {
      context.addIssue({
        code: "custom",
        path: ["result", "policy"],
        message: "응답과 서버 검증 결과의 정책이 일치해야 합니다.",
      });
    }
    if (output.localValidation.policyVersion !== output.startingPolicyVersion) {
      context.addIssue({
        code: "custom",
        path: ["localValidation", "policyVersion"],
        message: "시작 정책과 로컬 검증 정책이 일치해야 합니다.",
      });
    }
    if (
      output.metadata.fileSetSha256 !==
        output.result.summary.hashes.fileSetSha256 ||
      output.metadata.fileCount !== output.result.summary.fileCount ||
      output.metadata.uncompressedBytes !==
        output.result.summary.totalUncompressedBytes ||
      output.metadata.compressedBytes !== output.result.summary.compressedBytes
    ) {
      context.addIssue({
        code: "custom",
        path: ["metadata"],
        message: "응답 metadata와 서버 검증 요약이 일치해야 합니다.",
      });
    }
  });

const externalOriginSchema = z
  .string()
  .max(2_048)
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.pathname !== "" && url.pathname !== "/")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "외부 의존성은 credential/query/path 없는 origin만 허용합니다.",
      });
    }
  });

export const createReportInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    policyVersion: policyVersionSchema,
    analysis: analyzeProjectDataSchema.optional(),
    validation: validateArtifactDataSchema,
    clientContext: z
      .object({
        changedFiles: z
          .array(
            z
              .object({
                path: reportPathSchema,
                reason: reportTextSchema,
              })
              .strict(),
          )
          .max(2_000)
          .optional(),
        commands: z
          .array(
            z
              .object({
                sequence: z.number().int().positive().max(100),
                command: reportTextSchema,
                purpose: reportTextSchema.optional(),
              })
              .strict(),
          )
          .max(100)
          .optional(),
        outputDirectory: reportPathSchema.optional(),
        zipPath: reportPathSchema.optional(),
        verifiedFeatures: z.array(reportTextSchema).max(100).optional(),
        externalOrigins: z
          .array(
            z
              .object({
                kind: z.enum(["api", "cdn", "csp"]),
                origin: externalOriginSchema,
                purpose: reportTextSchema,
              })
              .strict(),
          )
          .max(100)
          .optional(),
        runtimeEnvNames: z
          .array(z.string().regex(/^[A-Z][A-Z0-9_]*$/))
          .max(100)
          .optional(),
        remainingLimitations: z.array(reportTextSchema).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.validation.policyId !== input.policyId ||
      input.validation.policyVersion !== input.policyVersion
    ) {
      context.addIssue({
        code: "custom",
        path: ["validation"],
        message: "보고서와 최종 검증의 정책 ID/version이 일치해야 합니다.",
      });
    }
    if (input.validation.pass) {
      if (input.clientContext?.outputDirectory === undefined) {
        context.addIssue({
          code: "custom",
          path: ["clientContext", "outputDirectory"],
          message: "성공 보고에는 정적 출력 폴더가 필요합니다.",
        });
      }
      if (input.clientContext?.zipPath === undefined) {
        context.addIssue({
          code: "custom",
          path: ["clientContext", "zipPath"],
          message: "성공 보고에는 ZIP 절대 경로가 필요합니다.",
        });
      } else if (!isAbsoluteLocalPath(input.clientContext.zipPath)) {
        context.addIssue({
          code: "custom",
          path: ["clientContext", "zipPath"],
          message: "성공 보고의 ZIP 경로는 절대 경로여야 합니다.",
        });
      }
      if ((input.clientContext?.commands?.length ?? 0) === 0) {
        context.addIssue({
          code: "custom",
          path: ["clientContext", "commands"],
          message: "성공 보고에는 실행한 검사/build 명령이 필요합니다.",
        });
      }
    }
    const sequences = input.clientContext?.commands?.map(
      ({ sequence }) => sequence,
    );
    if (
      sequences !== undefined &&
      new Set(sequences).size !== sequences.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientContext", "commands"],
        message: "실행 명령 sequence는 중복될 수 없습니다.",
      });
    }
  });

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith("/") || /^[A-Z]:[\\/]/i.test(value);
}

export const reportJsonSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["completed", "failed", "revalidation-required"]),
    pass: z.boolean(),
    policy: z
      .object({
        id: policyIdSchema,
        version: policyVersionSchema,
        analysisVersion: policyVersionSchema.nullable(),
      })
      .strict(),
    framework: z
      .object({
        key: z.string(),
        version: z.string().nullable(),
        confidence: z.enum(["high", "medium", "low"]),
      })
      .strict()
      .nullable(),
    changes: z.array(
      z.object({ path: z.string(), reason: z.string() }).strict(),
    ),
    commands: z.array(
      z
        .object({
          sequence: z.number().int().positive(),
          command: z.string(),
          purpose: z.string().nullable(),
        })
        .strict(),
    ),
    artifact: z
      .object({
        kind: z.enum(["directory", "zip"]),
        outputDirectory: z.string().nullable(),
        zipPath: z.string().nullable(),
        compressedBytes: z.number().int().nonnegative().nullable(),
        uncompressedBytes: z.number().int().nonnegative(),
        fileCount: z.number().int().nonnegative(),
        artifactSha256: sha256Schema,
        fileSetSha256: sha256Schema,
        rootIndexHtml: z.boolean(),
      })
      .strict(),
    validation: z
      .object({
        decision: z.enum([
          "PASS",
          "VALIDATION_FAILED",
          "LOCAL_VALIDATION_FAILED",
          "REVALIDATION_REQUIRED",
        ]),
        errorCodes: z.array(findingCodeSchema),
        warnings: z.array(
          z
            .object({
              code: findingCodeSchema,
              waived: z.boolean(),
              reason: z.string().nullable(),
            })
            .strict(),
        ),
      })
      .strict(),
    verifiedFeatures: z.array(z.string()),
    externalOrigins: z.array(
      z
        .object({
          kind: z.enum(["api", "cdn", "csp"]),
          origin: z.string(),
          purpose: z.string(),
        })
        .strict(),
    ),
    runtimeEnvNames: z.array(z.string()),
    remainingLimitations: z.array(z.string()),
  })
  .strict();

export const createReportDataSchema = z
  .object({
    policyId: policyIdSchema,
    policyVersion: policyVersionSchema,
    status: z.enum(["completed", "failed", "revalidation-required"]),
    pass: z.boolean(),
    reportHash: sha256Schema,
    markdown: z.string(),
    json: reportJsonSchema,
  })
  .strict()
  .superRefine((report, context) => {
    if (
      report.status !== report.json.status ||
      report.pass !== report.json.pass ||
      report.policyId !== report.json.policy.id ||
      report.policyVersion !== report.json.policy.version
    ) {
      context.addIssue({
        code: "custom",
        message: "보고서 envelope와 JSON 핵심 값이 일치해야 합니다.",
      });
    }
  });

export type GetPolicyInput = z.infer<typeof getPolicyInputSchema>;
export type AnalyzeProjectInput = z.infer<typeof analyzeProjectInputSchema>;
export type ValidateArtifactInput = z.infer<typeof validateArtifactInputSchema>;
export type CreateReportInput = z.infer<typeof createReportInputSchema>;
export type GetPolicyData = z.infer<typeof getPolicyDataSchema>;
export type AnalyzeProjectData = z.infer<typeof analyzeProjectDataSchema>;
export type ValidateArtifactData = z.infer<typeof validateArtifactDataSchema>;
export type CreateReportData = z.infer<typeof createReportDataSchema>;
