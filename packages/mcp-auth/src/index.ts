import { createHmac } from "node:crypto";

export const PUBLIC_MCP_TOOLS = [
  "get_policy",
  "analyze_project",
  "validate_artifact",
  "create_report",
] as const;

export type PublicMcpTool = (typeof PUBLIC_MCP_TOOLS)[number];

const IDENTITY_HEADERS = [
  "x-user-id",
  "x-org-id",
  "x-organization-id",
  "x-role",
  "x-scope",
] as const;

export class AnonymousAccessError extends Error {
  readonly code:
    | "AUTHENTICATION_NOT_SUPPORTED"
    | "UNTRUSTED_IDENTITY_HEADER"
    | "TOOL_NOT_PUBLIC";

  constructor(code: AnonymousAccessError["code"], message: string) {
    super(message);
    this.name = "AnonymousAccessError";
    this.code = code;
  }
}

export function authorizeAnonymousRequest(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): { readonly kind: "anonymous" } {
  if (headerValue(headers, "authorization") !== undefined) {
    throw new AnonymousAccessError(
      "AUTHENTICATION_NOT_SUPPORTED",
      "이 공개 MCP는 bearer token을 받지 않습니다.",
    );
  }
  const suppliedIdentity = IDENTITY_HEADERS.find(
    (name) => headerValue(headers, name) !== undefined,
  );
  if (suppliedIdentity !== undefined) {
    throw new AnonymousAccessError(
      "UNTRUSTED_IDENTITY_HEADER",
      "클라이언트 identity header는 권한 근거로 사용할 수 없습니다.",
    );
  }
  return { kind: "anonymous" };
}

export function assertPublicToolAuthorized(
  tool: string,
): asserts tool is PublicMcpTool {
  if (!(PUBLIC_MCP_TOOLS as readonly string[]).includes(tool)) {
    throw new AnonymousAccessError(
      "TOOL_NOT_PUBLIC",
      "일반 MCP 경계에서 허용되지 않은 도구입니다.",
    );
  }
}

export function createRotatingNetworkKey(options: {
  readonly networkSignal: string;
  readonly secret: string;
  readonly now?: Date;
}): string {
  if (options.secret.length < 32) {
    throw new Error("NETWORK_KEY_SECRET_TOO_SHORT");
  }
  const period = (options.now ?? new Date()).toISOString().slice(0, 10);
  return createHmac("sha256", options.secret)
    .update("letscoding-network-key-v1\0")
    .update(period)
    .update("\0")
    .update(options.networkSignal)
    .digest("hex")
    .slice(0, 24);
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  readonly #entries = new Map<
    string,
    { count: number; readonly resetAt: number }
  >();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;

  constructor(options: {
    readonly limit: number;
    readonly windowMs: number;
    readonly maxKeys?: number;
  }) {
    if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
      throw new Error("RATE_LIMIT_INVALID");
    }
    if (!Number.isSafeInteger(options.windowMs) || options.windowMs <= 0) {
      throw new Error("RATE_WINDOW_INVALID");
    }
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#maxKeys = options.maxKeys ?? 10_000;
  }

  consume(key: string, now = Date.now()): RateLimitDecision {
    this.#prune(now);
    const current = this.#entries.get(key);
    const entry =
      current === undefined || current.resetAt <= now
        ? { count: 0, resetAt: now + this.#windowMs }
        : current;
    entry.count += 1;
    this.#entries.set(key, entry);
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1_000),
    );
    return {
      allowed: entry.count <= this.#limit,
      remaining: Math.max(0, this.#limit - entry.count),
      retryAfterSeconds,
    };
  }

  #prune(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.resetAt <= now) this.#entries.delete(key);
    }
    while (this.#entries.size >= this.#maxKeys) {
      const oldest = this.#entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }
}

export class ConcurrencyGate {
  #active = 0;
  readonly #limit: number;

  constructor(limit: number) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error("CONCURRENCY_LIMIT_INVALID");
    }
    this.#limit = limit;
  }

  tryAcquire(): (() => void) | null {
    if (this.#active >= this.#limit) return null;
    this.#active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active -= 1;
    };
  }
}

function headerValue(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string,
): string | readonly string[] | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
}
