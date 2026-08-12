export type ToolErrorKind = "domain" | "timeout" | "cancelled" | "internal";

export interface ToolErrorEnvelope {
  readonly [key: string]: unknown;
  readonly ok: false;
  readonly requestId: string;
  readonly error: {
    readonly kind: ToolErrorKind;
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export interface ToolSuccessEnvelope<T> {
  readonly [key: string]: unknown;
  readonly ok: true;
  readonly requestId: string;
  readonly data: T;
}

export class McpDomainError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    options: {
      readonly retryable?: boolean;
      readonly details?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    super(message);
    this.name = "McpDomainError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    if (options.details !== undefined) this.details = options.details;
  }
}

export function toToolErrorEnvelope(
  error: unknown,
  requestId: string,
  signal: AbortSignal,
): ToolErrorEnvelope {
  if (error instanceof McpDomainError) {
    const details = sanitizeDomainDetails(error.details);
    return {
      ok: false,
      requestId,
      error: {
        kind: "domain",
        code: safeDomainCode(error.code),
        message: safeDomainMessage(error.message),
        retryable: error.retryable,
        ...(details === undefined ? {} : { details }),
      },
    };
  }
  if (signal.aborted) {
    const timeout =
      signal.reason instanceof DOMException &&
      signal.reason.name === "TimeoutError";
    return {
      ok: false,
      requestId,
      error: {
        kind: timeout ? "timeout" : "cancelled",
        code: timeout ? "TOOL_TIMEOUT" : "REQUEST_CANCELLED",
        message: timeout
          ? "도구 실행 시간이 제한을 넘었습니다."
          : "클라이언트가 요청을 취소했습니다.",
        retryable: timeout,
      },
    };
  }
  return {
    ok: false,
    requestId,
    error: {
      kind: "internal",
      code: "INTERNAL_ERROR",
      message: "도구 실행 중 내부 오류가 발생했습니다.",
      retryable: false,
    },
  };
}

function safeDomainCode(value: string): string {
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(value) ? value : "DOMAIN_ERROR";
}

function safeDomainMessage(value: string): string {
  const hasControl = [...value].some((character) => {
    const point = character.codePointAt(0);
    return point !== undefined && (point <= 0x1f || point === 0x7f);
  });
  return value.length > 0 &&
    value.length <= 2_000 &&
    !hasControl &&
    !looksSensitive(value)
    ? value
    : "요청을 안전하게 완료하지 못했습니다.";
}

function sanitizeDomainDetails(
  details: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, unknown>> | undefined {
  const policyCodes = details?.policyCodes;
  if (!Array.isArray(policyCodes)) return undefined;
  const codes = policyCodes.filter(
    (value): value is string =>
      typeof value === "string" && /^[A-Z][A-Z0-9_]{0,127}$/.test(value),
  );
  return codes.length === 0
    ? undefined
    : { policyCodes: [...new Set(codes)].sort() };
}
import { looksSensitive } from "./sensitive-data.js";
