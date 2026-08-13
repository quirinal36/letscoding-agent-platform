import { z } from "zod/v4";

import {
  PROJECT_ANALYZER_LIMITS,
  projectContentByteLimit,
} from "@letscoding/project-analyzer";

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
const safePathSchema = z.string().min(1).max(4096);

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
    compressedBytes: z.number().int().nonnegative().optional(),
    files: z
      .array(
        z
          .object({
            path: safePathSchema,
            sizeBytes: z.number().int().nonnegative(),
            sha256: sha256Schema,
          })
          .strict(),
      )
      .max(2_000),
    artifactSha256: sha256Schema.optional(),
  })
  .strict();

export const validateArtifactInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    policyVersion: policyVersionSchema.optional(),
    manifest: artifactManifestSchema,
    localValidation: z
      .object({
        pass: z.boolean(),
        policyVersion: policyVersionSchema,
        codes: z.array(z.string().min(1).max(128)).max(2_000),
      })
      .strict()
      .optional(),
    warningWaivers: z
      .array(
        z
          .object({
            code: z.string().min(1).max(128),
            reason: z.string().min(1).max(1_000),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();

export const createReportInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    policyVersion: policyVersionSchema,
    analysis: z.record(z.string(), z.unknown()).optional(),
    validation: z.record(z.string(), z.unknown()),
    clientContext: z
      .object({
        changedFiles: z.array(safePathSchema).max(2_000).optional(),
        commands: z.array(z.string().max(2_000)).max(100).optional(),
        outputDirectory: safePathSchema.optional(),
        zipPath: z.string().min(1).max(4096).optional(),
        remainingLimitations: z
          .array(z.string().max(2_000))
          .max(100)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

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
export const validateArtifactDataSchema = z
  .object({
    policyId: policyIdSchema,
    policyVersion: policyVersionSchema,
    pass: z.boolean(),
    revalidationRequired: z.boolean(),
    result: z.record(z.string(), z.unknown()),
  })
  .strict();
export const createReportDataSchema = z
  .object({
    policyId: policyIdSchema,
    policyVersion: policyVersionSchema,
    markdown: z.string(),
    json: z.record(z.string(), z.unknown()),
  })
  .strict();

export type GetPolicyInput = z.infer<typeof getPolicyInputSchema>;
export type AnalyzeProjectInput = z.infer<typeof analyzeProjectInputSchema>;
export type ValidateArtifactInput = z.infer<typeof validateArtifactInputSchema>;
export type CreateReportInput = z.infer<typeof createReportInputSchema>;
export type GetPolicyData = z.infer<typeof getPolicyDataSchema>;
export type AnalyzeProjectData = z.infer<typeof analyzeProjectDataSchema>;
export type ValidateArtifactData = z.infer<typeof validateArtifactDataSchema>;
export type CreateReportData = z.infer<typeof createReportDataSchema>;
