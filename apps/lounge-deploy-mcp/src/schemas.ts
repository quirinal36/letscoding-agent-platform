import { z } from "zod/v4";

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

export const analyzeProjectInputSchema = z
  .object({
    policyId: policyIdSchema.default("lounge-deploy"),
    version: policyVersionSchema.optional(),
    files: z
      .array(
        z
          .object({
            path: safePathSchema,
            sizeBytes: z.number().int().nonnegative(),
            content: z
              .string()
              .max(256 * 1024)
              .optional(),
          })
          .strict(),
      )
      .max(2_000),
  })
  .strict();

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
export const analyzeProjectDataSchema = z
  .object({
    policyId: policyIdSchema,
    policyVersion: policyVersionSchema,
    result: z.record(z.string(), z.unknown()),
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
