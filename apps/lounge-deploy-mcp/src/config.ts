import { z } from "zod/v4";

export type LoungeDeployEnvironment = "dev" | "test" | "staging" | "prod";

export interface McpServiceConfig {
  readonly environment: LoungeDeployEnvironment;
  readonly revision: string;
  readonly openAiAppsChallenge?: string;
  readonly port: number;
  readonly maxBodyBytes: number;
  readonly networkFingerprintSecret: string;
  readonly rateLimit: {
    readonly maxRequests: number;
    readonly windowMs: number;
    readonly maxConcurrentRequests: number;
  };
  readonly toolTimeoutMs: Readonly<
    Record<
      "get_policy" | "analyze_project" | "validate_artifact" | "create_report",
      number
    >
  >;
}

const environmentSchema = z.enum(["dev", "test", "staging", "prod"]);
const positiveIntegerText = z.coerce.number().int().positive();

export function loadMcpConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): McpServiceConfig {
  const selected = environmentSchema.parse(environment.LETS_ENV ?? "dev");
  const defaultRevision =
    selected === "dev" || selected === "test" ? "local" : undefined;
  const revision = z
    .string()
    .min(1)
    .max(128)
    .parse(
      environment.LETS_REVISION ??
        environment.VERCEL_GIT_COMMIT_SHA ??
        defaultRevision,
    );
  const timeout = positiveIntegerText
    .max(30_000)
    .parse(environment.LETS_TOOL_TIMEOUT_MS ?? "5000");
  const localNetworkSecret =
    selected === "dev" || selected === "test"
      ? "local-network-key-secret-not-for-production"
      : undefined;
  const openAiAppsChallenge = z
    .string()
    .min(1)
    .max(1_024)
    .refine((value) => value === value.trim())
    .refine(
      (value) =>
        ![...value].some((character) => {
          const point = character.codePointAt(0);
          return point !== undefined && (point <= 0x1f || point === 0x7f);
        }),
    )
    .optional()
    .parse(environment.LETS_OPENAI_APPS_CHALLENGE);
  return {
    environment: selected,
    revision,
    ...(openAiAppsChallenge === undefined ? {} : { openAiAppsChallenge }),
    port: positiveIntegerText.max(65_535).parse(environment.PORT ?? "3000"),
    maxBodyBytes: positiveIntegerText
      .max(4 * 1024 * 1024)
      .parse(environment.LETS_MAX_BODY_BYTES ?? String(1024 * 1024)),
    networkFingerprintSecret: z
      .string()
      .min(32)
      .max(256)
      .parse(environment.LETS_NETWORK_KEY_SECRET ?? localNetworkSecret),
    rateLimit: {
      maxRequests: positiveIntegerText
        .max(10_000)
        .parse(environment.LETS_RATE_LIMIT_MAX_REQUESTS ?? "120"),
      windowMs: positiveIntegerText
        .max(60 * 60 * 1_000)
        .parse(environment.LETS_RATE_LIMIT_WINDOW_MS ?? "60000"),
      maxConcurrentRequests: positiveIntegerText
        .max(64)
        .parse(environment.LETS_MAX_CONCURRENT_REQUESTS ?? "8"),
    },
    toolTimeoutMs: {
      get_policy: timeout,
      analyze_project: timeout,
      validate_artifact: timeout,
      create_report: timeout,
    },
  };
}
