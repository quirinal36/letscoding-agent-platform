import {
  checkMessageKo,
  type PolicyCheck,
  type PolicyDocument,
} from "@letscoding/policy-contract";

import type {
  ArtifactBlockedFilenameRule,
  ArtifactPathRules,
  ArtifactValidationPolicy,
  ArtifactValidationRule,
  ArtifactValidationRuleId,
} from "./index.js";

const INTERNAL_RULES: Partial<
  Readonly<Record<ArtifactValidationRuleId, ArtifactValidationRule>>
> = {
  "artifact-type-invalid": internalRule(
    "ARTIFACT_TYPE_INVALID",
    "Artifact 종류가 올바르지 않습니다.",
  ),
  "compressed-size-required": internalRule(
    "ARTIFACT_COMPRESSED_SIZE_REQUIRED",
    "ZIP 압축 크기가 필요합니다.",
  ),
  "compressed-size-invalid": internalRule(
    "ARTIFACT_COMPRESSED_SIZE_INVALID",
    "ZIP 압축 크기가 올바르지 않습니다.",
  ),
  "file-size-invalid": internalRule(
    "ARTIFACT_FILE_SIZE_INVALID",
    "파일 크기 metadata가 올바르지 않습니다.",
  ),
  "total-size-overflow": internalRule(
    "ARTIFACT_TOTAL_SIZE_OVERFLOW",
    "전체 파일 크기를 안전하게 표현할 수 없습니다.",
  ),
  "sha256-invalid": internalRule(
    "ARTIFACT_SHA256_INVALID",
    "파일 SHA-256 metadata가 올바르지 않습니다.",
  ),
  "path-invalid": internalRule(
    "ARTIFACT_PATH_INVALID",
    "파일 경로 metadata가 올바르지 않습니다.",
  ),
  "path-duplicate": internalRule(
    "ARTIFACT_PATH_DUPLICATE",
    "같은 파일 경로가 중복되었습니다.",
  ),
  "path-case-collision": internalRule(
    "ARTIFACT_PATH_CASE_COLLISION",
    "대소문자만 다른 파일 경로가 충돌합니다.",
  ),
  "warning-waiver-invalid": internalRule(
    "ARTIFACT_WARNING_WAIVER_INVALID",
    "경고 해제 code 또는 사유가 올바르지 않습니다.",
  ),
};

/** Convert the versioned central policy into the deterministic validator API. */
export function artifactValidationPolicyFromDocument(
  document: PolicyDocument,
): ArtifactValidationPolicy {
  const checks = new Map(document.checks.map((check) => [check.code, check]));
  const ruleFor = (code: string): ArtifactValidationRule =>
    policyRule(requireCheck(checks, code));

  const mutablePathRules: {
    -readonly [Key in keyof ArtifactPathRules]?: ArtifactValidationRule;
  } = {};
  for (const entry of document.files.blockedPathRules) {
    const rule = ruleFor(entry.code);
    switch (entry.kind) {
      case "absolute-path":
        mutablePathRules.absolute = rule;
        break;
      case "parent-traversal":
        mutablePathRules.parentTraversal = rule;
        break;
      case "backslash-separator":
        mutablePathRules.backslash = rule;
        break;
      case "control-character":
        mutablePathRules.controlCharacter = rule;
        break;
      case "url-reinterpret":
        mutablePathRules.urlReinterpret = rule;
        break;
      case "non-normalized":
        mutablePathRules.nonNormalized = rule;
        break;
    }
  }
  const pathRules: ArtifactPathRules = mutablePathRules;

  const blockedFilenameRules: ArtifactBlockedFilenameRule[] =
    document.files.blockedFilenames.map((entry) => ({
      match: entry.match,
      ...(entry.scope === undefined ? {} : { scope: entry.scope }),
      ...(entry.caseSensitive === undefined
        ? {}
        : { caseSensitive: entry.caseSensitive }),
      value: entry.value,
      rule: ruleFor(entry.code),
    }));

  const rules: Partial<
    Record<ArtifactValidationRuleId, ArtifactValidationRule>
  > = {
    ...INTERNAL_RULES,
    "compressed-size-exceeded": ruleFor(document.zip.codes.compressedTooLarge),
    "file-count-exceeded": ruleFor(document.zip.codes.tooManyFiles),
    "uncompressed-size-exceeded": ruleFor(
      document.zip.codes.uncompressedTooLarge,
    ),
    "extension-not-allowed": ruleFor(document.files.codes.extensionNotAllowed),
  };
  if (document.zip.codes.invalidEntrySize !== undefined) {
    rules["file-size-invalid"] = ruleFor(document.zip.codes.invalidEntrySize);
  }
  assignRule(rules, "path-backslash", pathRules.backslash);
  assignRule(rules, "path-absolute", pathRules.absolute);
  assignRule(rules, "path-dot-segment", pathRules.nonNormalized);
  assignRule(rules, "path-empty-segment", pathRules.nonNormalized);
  assignRule(rules, "path-url-character", pathRules.urlReinterpret);
  assignRule(rules, "path-control-character", pathRules.controlCharacter);
  if (document.zip.codes.pathTooLong !== undefined) {
    rules["path-too-long"] = ruleFor(document.zip.codes.pathTooLong);
  }
  if (document.zip.requireRootIndexHtml) {
    rules["root-file-missing"] = ruleFor(
      document.zip.codes.missingRootIndexHtml,
    );
  }

  return {
    id: document.id,
    version: document.version,
    limits: {
      maxCompressedBytes: document.zip.maxCompressedBytes,
      maxUncompressedBytes: document.zip.maxUncompressedBytes,
      maxFiles: document.zip.maxFiles,
      ...(document.zip.maxEntries === undefined
        ? {}
        : { maxEntries: document.zip.maxEntries }),
      maxPathLength: document.zip.maxPathLength ?? Number.MAX_SAFE_INTEGER,
    },
    files: {
      allowedExtensions: document.files.allowedExtensions,
      blockedFileNames: [],
      blockedSegmentPrefixes: [],
      blockedFilenameRules,
    },
    paths: {
      forbidBackslashes: pathRules.backslash !== undefined,
      forbidAbsolutePaths: pathRules.absolute !== undefined,
      forbidDotSegments:
        pathRules.parentTraversal !== undefined ||
        pathRules.nonNormalized !== undefined,
      forbidEmptySegments: pathRules.nonNormalized !== undefined,
      forbidControlCharacters: pathRules.controlCharacter !== undefined,
      forbiddenUrlCharacters:
        pathRules.urlReinterpret === undefined ? "" : "%?#;",
      rules: pathRules,
    },
    structure: {
      rootFile: "index.html",
      // requireRootIndexHtml already rejects a wrapper-only artifact. There is
      // no separate wrapper code in the current central policy.
      forbidWrapperDirectory: false,
    },
    inspection: {
      allowZip64: document.zip.allowZip64 ?? false,
      allowMultiDisk: document.zip.allowMultiDisk ?? false,
      ...(document.zip.codes.invalidFormat === undefined
        ? {}
        : { invalidFormat: ruleFor(document.zip.codes.invalidFormat) }),
      ...(document.zip.codes.tooManyEntries === undefined
        ? {}
        : { tooManyEntries: ruleFor(document.zip.codes.tooManyEntries) }),
      ...(document.zip.codes.invalidEntrySize === undefined
        ? {}
        : {
            invalidEntrySize: ruleFor(document.zip.codes.invalidEntrySize),
          }),
    },
    rules,
  };
}

function assignRule(
  rules: Partial<Record<ArtifactValidationRuleId, ArtifactValidationRule>>,
  ruleId: ArtifactValidationRuleId,
  rule: ArtifactValidationRule | undefined,
): void {
  if (rule !== undefined) rules[ruleId] = rule;
}

function requireCheck(
  checks: ReadonlyMap<string, PolicyCheck>,
  code: string,
): PolicyCheck {
  const check = checks.get(code);
  if (check === undefined) {
    throw new Error(`Policy code is not declared in checks: ${code}`);
  }
  return check;
}

function policyRule(check: PolicyCheck): ArtifactValidationRule {
  return {
    code: check.code,
    severity: check.severity,
    message:
      checkMessageKo(check.titleKey) ??
      "정책 검사에 대응하는 표시 문구가 없습니다.",
  };
}

function internalRule(code: string, message: string): ArtifactValidationRule {
  return { code, severity: "error", message };
}
