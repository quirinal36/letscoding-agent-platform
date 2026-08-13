import { z } from "zod/v4";

export type LoungeDeployEnvironment = "dev" | "test" | "staging" | "prod";

export interface McpServiceConfig {
  readonly environment: LoungeDeployEnvironment;
  readonly revision: string;
  readonly port: number;
  readonly maxBodyBytes: number;
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
  return {
    environment: selected,
    revision,
    port: positiveIntegerText.max(65_535).parse(environment.PORT ?? "3000"),
    maxBodyBytes: positiveIntegerText
      .max(4 * 1024 * 1024)
      .parse(environment.LETS_MAX_BODY_BYTES ?? String(1024 * 1024)),
    toolTimeoutMs: {
      get_policy: timeout,
      analyze_project: timeout,
      validate_artifact: timeout,
      create_report: timeout,
    },
  };
}
