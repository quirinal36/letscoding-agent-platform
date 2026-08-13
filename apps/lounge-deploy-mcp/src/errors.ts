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
    return {
      ok: false,
      requestId,
      error: {
        kind: "domain",
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.details === undefined ? {} : { details: error.details }),
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
