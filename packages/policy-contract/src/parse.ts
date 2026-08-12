/**
 * 정책 문서와 `current.json` 포인터의 파싱 API.
 *
 * 검증에 실패해도 예외를 던지지 않는다. MCP가 오류 코드와 위치를 구조화 응답과
 * 감사 로그로 그대로 넘겨야 하므로 결과 객체로 돌려준다. 타입은 검증을 통과한
 * 값에만 부여한다.
 */
import type { ErrorObject, ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { PolicyContractCode } from "./codes.js";
import type { CurrentPointer } from "./generated/current-pointer.js";
import type { PolicyDocument } from "./generated/policy-document.js";
import {
  allPolicyContractSchemas,
  currentPointerSchema,
  policyDocumentSchema,
} from "./generated/schemas.js";
import { isPolicyVersion } from "./version.js";

export interface PolicyIssue {
  readonly code: PolicyContractCode;
  /** 문제 위치의 JSON Pointer. 문서 전체를 가리키면 빈 문자열이다. */
  readonly path: string;
  readonly detail: string;
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly PolicyIssue[] };

function failure(issues: readonly PolicyIssue[]): ParseResult<never> {
  return { ok: false, issues };
}

function success<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function issue(
  code: PolicyContractCode,
  path: string,
  detail: string,
): PolicyIssue {
  return { code, path, detail };
}

// ajv-formats는 CommonJS다. NodeNext ESM에서 default import는 module.exports
// 네임스페이스가 되므로 plugin 함수를 명시적으로 꺼낸다.
const addFormats = addFormatsModule.default;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  // expectedAssetPrefix는 string | null이다.
  allowUnionTypes: true,
});
addFormats(ajv);
for (const schema of allPolicyContractSchemas) {
  ajv.addSchema(schema);
}

function requireValidator(schema: { $id?: string }): ValidateFunction {
  const id = schema.$id;
  if (id === undefined) {
    throw new Error("Generated schema is missing $id.");
  }
  const validate = ajv.getSchema(id);
  if (validate === undefined) {
    throw new Error(`Policy contract schema failed to compile: ${id}`);
  }
  return validate;
}

const policyDocumentValidator = requireValidator(policyDocumentSchema);
const currentPointerValidator = requireValidator(currentPointerSchema);

function describeAjvError(error: ErrorObject): string {
  const location = error.instancePath === "" ? "(root)" : error.instancePath;
  const params = Object.entries(error.params)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(", ");
  const suffix = params === "" ? "" : ` (${params})`;
  return `${location} ${error.message ?? "is invalid"}${suffix}`;
}

function toSchemaIssues(errors: readonly ErrorObject[]): PolicyIssue[] {
  return errors.map((error) =>
    issue("POLICY_SCHEMA_INVALID", error.instancePath, describeAjvError(error)),
  );
}

/** JSON 텍스트를 파싱한다. 실패는 `POLICY_INVALID_JSON`이다. */
export function parseJsonText(text: string): ParseResult<unknown> {
  try {
    return success(JSON.parse(text) as unknown);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return failure([issue("POLICY_INVALID_JSON", "", detail)]);
  }
}

function collectReferencedCodes(
  document: PolicyDocument,
): { path: string; code: string }[] {
  const referenced: { path: string; code: string }[] = [
    {
      path: "/zip/codes/compressedTooLarge",
      code: document.zip.codes.compressedTooLarge,
    },
    {
      path: "/zip/codes/uncompressedTooLarge",
      code: document.zip.codes.uncompressedTooLarge,
    },
    { path: "/zip/codes/tooManyFiles", code: document.zip.codes.tooManyFiles },
    {
      path: "/zip/codes/missingRootIndexHtml",
      code: document.zip.codes.missingRootIndexHtml,
    },
    {
      path: "/assetPaths/disallowRootAbsolute/code",
      code: document.assetPaths.disallowRootAbsolute.code,
    },
    {
      path: "/files/codes/extensionNotAllowed",
      code: document.files.codes.extensionNotAllowed,
    },
  ];

  document.files.blockedFilenames.forEach((entry, index) => {
    referenced.push({
      path: `/files/blockedFilenames/${index}/code`,
      code: entry.code,
    });
  });
  document.files.blockedPathRules.forEach((entry, index) => {
    referenced.push({
      path: `/files/blockedPathRules/${index}/code`,
      code: entry.code,
    });
  });
  document.frameworks.forEach((framework, frameworkIndex) => {
    framework.checks.forEach((code, checkIndex) => {
      referenced.push({
        path: `/frameworks/${frameworkIndex}/checks/${checkIndex}`,
        code,
      });
    });
  });

  return referenced;
}

/**
 * JSON Schema로 표현할 수 없거나 표현이 부자연스러운 제약을 검사한다.
 *
 * - 달력에 존재하는 날짜인지
 * - 압축/압축 해제 한도의 대소 관계
 * - `checks[]` 코드 중복과 참조 무결성
 * - `frameworks[]` key 중복
 * - `guide.path`의 `history/<version>.md` 규약
 */
function collectSemanticIssues(document: PolicyDocument): PolicyIssue[] {
  const issues: PolicyIssue[] = [];

  if (!isPolicyVersion(document.version)) {
    issues.push(
      issue(
        "POLICY_VERSION_NOT_A_CALENDAR_DATE",
        "/version",
        `${document.version} is not a real calendar date.`,
      ),
    );
  }

  if (document.zip.maxUncompressedBytes < document.zip.maxCompressedBytes) {
    issues.push(
      issue(
        "POLICY_ZIP_SIZE_INVERTED",
        "/zip/maxUncompressedBytes",
        `maxUncompressedBytes (${document.zip.maxUncompressedBytes}) must be at least maxCompressedBytes (${document.zip.maxCompressedBytes}).`,
      ),
    );
  }

  const declaredCodes = new Set<string>();
  document.checks.forEach((check, index) => {
    if (declaredCodes.has(check.code)) {
      issues.push(
        issue(
          "POLICY_DUPLICATE_CHECK_CODE",
          `/checks/${index}/code`,
          `${check.code} is declared more than once.`,
        ),
      );
      return;
    }
    declaredCodes.add(check.code);
  });

  for (const reference of collectReferencedCodes(document)) {
    if (!declaredCodes.has(reference.code)) {
      issues.push(
        issue(
          "POLICY_UNKNOWN_CHECK_CODE",
          reference.path,
          `${reference.code} is not declared in checks[].`,
        ),
      );
    }
  }

  const seenFrameworks = new Set<string>();
  document.frameworks.forEach((framework, index) => {
    if (seenFrameworks.has(framework.key)) {
      issues.push(
        issue(
          "POLICY_DUPLICATE_FRAMEWORK",
          `/frameworks/${index}/key`,
          `${framework.key} appears more than once.`,
        ),
      );
      return;
    }
    seenFrameworks.add(framework.key);
  });

  const expectedGuidePath = `history/${document.version}.md`;
  if (document.guide.path !== expectedGuidePath) {
    issues.push(
      issue(
        "POLICY_GUIDE_PATH_MISMATCH",
        "/guide/path",
        `Expected ${expectedGuidePath} but found ${document.guide.path}.`,
      ),
    );
  }

  return issues;
}

/** 정책 문서를 검증하고 검증된 타입으로 돌려준다. */
export function parsePolicyDocument(
  input: unknown,
): ParseResult<PolicyDocument> {
  if (!policyDocumentValidator(input)) {
    return failure(toSchemaIssues(policyDocumentValidator.errors ?? []));
  }

  const document = input as PolicyDocument;
  const semanticIssues = collectSemanticIssues(document);
  if (semanticIssues.length > 0) {
    return failure(semanticIssues);
  }

  return success(document);
}

/** JSON 텍스트에서 정책 문서를 파싱한다. */
export function parsePolicyDocumentText(
  text: string,
): ParseResult<PolicyDocument> {
  const parsed = parseJsonText(text);
  return parsed.ok ? parsePolicyDocument(parsed.value) : parsed;
}

/** `current.json` 포인터를 검증하고 검증된 타입으로 돌려준다. */
export function parseCurrentPointer(
  input: unknown,
): ParseResult<CurrentPointer> {
  if (!currentPointerValidator(input)) {
    return failure(toSchemaIssues(currentPointerValidator.errors ?? []));
  }

  const pointer = input as CurrentPointer;
  if (!isPolicyVersion(pointer.version)) {
    return failure([
      issue(
        "POLICY_VERSION_NOT_A_CALENDAR_DATE",
        "/version",
        `${pointer.version} is not a real calendar date.`,
      ),
    ]);
  }

  return success(pointer);
}

/** JSON 텍스트에서 포인터를 파싱한다. */
export function parseCurrentPointerText(
  text: string,
): ParseResult<CurrentPointer> {
  const parsed = parseJsonText(text);
  return parsed.ok ? parseCurrentPointer(parsed.value) : parsed;
}
