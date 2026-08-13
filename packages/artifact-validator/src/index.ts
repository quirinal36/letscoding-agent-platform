import { createHash } from "node:crypto";

export { artifactValidationPolicyFromDocument } from "./policy.js";

export const ARTIFACT_VALIDATION_RULE_IDS = [
  "artifact-type-invalid",
  "compressed-size-required",
  "compressed-size-invalid",
  "compressed-size-exceeded",
  "file-count-exceeded",
  "file-size-invalid",
  "total-size-overflow",
  "uncompressed-size-exceeded",
  "sha256-invalid",
  "path-invalid",
  "path-backslash",
  "path-absolute",
  "path-dot-segment",
  "path-empty-segment",
  "path-too-long",
  "path-url-character",
  "path-control-character",
  "path-duplicate",
  "path-case-collision",
  "extension-not-allowed",
  "blocked-file",
  "root-file-missing",
  "wrapper-directory",
  "warning-waiver-invalid",
] as const;

export type ArtifactValidationRuleId =
  (typeof ARTIFACT_VALIDATION_RULE_IDS)[number];
export type ArtifactValidationSeverity = "error" | "warning";
export type ArtifactKind = "directory" | "zip";

export interface ArtifactValidationRule {
  readonly code: string;
  readonly severity: ArtifactValidationSeverity;
  /**
   * A static, user-facing message. Manifest data is deliberately never
   * interpolated into this value by the validator.
   */
  readonly message: string;
}

export interface ArtifactValidationPolicy {
  readonly id: string;
  readonly version: string;
  readonly limits: {
    readonly maxCompressedBytes: number;
    readonly maxUncompressedBytes: number;
    readonly maxFiles: number;
    /** Central-directory entries, including directory entries. */
    readonly maxEntries?: number;
    readonly maxPathLength: number;
  };
  readonly files: {
    /** Extensions may be supplied with or without the leading dot. */
    readonly allowedExtensions: readonly string[];
    /** Basenames blocked at any depth, compared case-insensitively. */
    readonly blockedFileNames: readonly string[];
    /** Path segment prefixes blocked at any depth, compared case-insensitively. */
    readonly blockedSegmentPrefixes: readonly string[];
    /** Full relative paths blocked case-insensitively. */
    readonly blockedPaths?: readonly string[];
    /**
     * Policy-native blocked filename rules. These preserve the individual
     * policy code for entries such as `.env*` and `runtime-config.js`.
     */
    readonly blockedFilenameRules?: readonly ArtifactBlockedFilenameRule[];
  };
  readonly paths: {
    readonly forbidBackslashes: boolean;
    readonly forbidAbsolutePaths: boolean;
    readonly forbidDotSegments: boolean;
    readonly forbidEmptySegments: boolean;
    readonly forbidControlCharacters: boolean;
    /** Characters such as `%?#;` that can change URL interpretation. */
    readonly forbiddenUrlCharacters: string;
    /** Optional policy-native rules for path kinds that share a legacy rule ID. */
    readonly rules?: ArtifactPathRules;
  };
  readonly structure: {
    readonly rootFile: string;
    readonly forbidWrapperDirectory: boolean;
  };
  readonly inspection?: ArtifactInspectionPolicy;
  /** Missing rule definitions disable the corresponding check. */
  readonly rules: Partial<
    Readonly<Record<ArtifactValidationRuleId, ArtifactValidationRule>>
  >;
}

export interface ArtifactBlockedFilenameRule {
  readonly match: "exact" | "prefix" | "suffix";
  readonly scope?: "basename" | "path-segment";
  readonly caseSensitive?: boolean;
  readonly value: string;
  readonly rule: ArtifactValidationRule;
}

export interface ArtifactInspectionPolicy {
  readonly allowZip64: boolean;
  readonly allowMultiDisk: boolean;
  readonly invalidFormat?: ArtifactValidationRule;
  readonly tooManyEntries?: ArtifactValidationRule;
  readonly invalidEntrySize?: ArtifactValidationRule;
}

export interface ArtifactPathRules {
  readonly absolute?: ArtifactValidationRule;
  readonly parentTraversal?: ArtifactValidationRule;
  readonly backslash?: ArtifactValidationRule;
  readonly controlCharacter?: ArtifactValidationRule;
  readonly urlReinterpret?: ArtifactValidationRule;
  readonly nonNormalized?: ArtifactValidationRule;
}

export interface ArtifactManifestFile {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface ArtifactManifest {
  readonly kind: ArtifactKind;
  /** Required for ZIP manifests and ignored for directory manifests. */
  readonly compressedBytes?: number;
  readonly files: readonly ArtifactManifestFile[];
}

export interface WarningWaiver {
  readonly code: string;
  readonly reason: string;
}

export interface ArtifactValidationInput {
  readonly policy: ArtifactValidationPolicy;
  readonly manifest: ArtifactManifest;
  readonly warningWaivers?: readonly WarningWaiver[];
}

export interface ArtifactValidationFinding {
  readonly ruleId: ArtifactValidationRuleId;
  readonly code: string;
  readonly severity: ArtifactValidationSeverity;
  readonly message: string;
  /**
   * Zero-based indexes into the input manifest. Paths are not copied into
   * results because a filename can itself contain sensitive information.
   */
  readonly fileIndexes: readonly number[];
}

export interface ArtifactValidationWarning extends ArtifactValidationFinding {
  readonly severity: "warning";
  readonly waived: boolean;
  readonly waiverReason?: string;
}

export interface AppliedWarningWaiver {
  readonly code: string;
  readonly reason: string;
  readonly waivedWarningCount: number;
}

export interface ArtifactValidationSummary {
  readonly fileCount: number;
  /** Null when one or more sizes cannot be represented safely. */
  readonly totalUncompressedBytes: number | null;
  /** Null for directories and for an invalid or absent ZIP size. */
  readonly compressedBytes: number | null;
  readonly hashes: {
    readonly validSha256Count: number;
    readonly invalidSha256Count: number;
    /** Digest of a canonical, order-independent representation of all entries. */
    readonly fileSetSha256: string;
  };
}

export interface ArtifactValidationResult {
  readonly pass: boolean;
  readonly policy: {
    readonly id: string;
    readonly version: string;
  };
  readonly errors: readonly ArtifactValidationFinding[];
  readonly warnings: readonly ArtifactValidationWarning[];
  readonly warningWaivers: readonly AppliedWarningWaiver[];
  readonly summary: ArtifactValidationSummary;
}

interface PendingFinding extends ArtifactValidationFinding {
  readonly sequence: number;
}

interface IndexedFile {
  readonly file: ArtifactManifestFile;
  readonly index: number;
}

const SHA256_PATTERN = /^[a-f\d]{64}$/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:[\\/]/i;
const RULE_ORDER = new Map(
  ARTIFACT_VALIDATION_RULE_IDS.map((ruleId, index) => [ruleId, index]),
);

/**
 * Validate already-extracted artifact metadata. This function never reads ZIP
 * bytes or file contents and has no mutable global state.
 */
export function validateArtifact(
  input: ArtifactValidationInput,
): ArtifactValidationResult {
  const { manifest, policy } = input;
  const pendingFindings: PendingFinding[] = [];
  let sequence = 0;

  const addFinding = (
    ruleId: ArtifactValidationRuleId,
    fileIndexes: readonly number[] = [],
    ruleOverride?: ArtifactValidationRule,
  ): void => {
    const rule = ruleOverride ?? policy.rules[ruleId];
    if (rule === undefined) return;
    pendingFindings.push({
      ruleId,
      code: rule.code,
      severity: rule.severity,
      message: rule.message,
      fileIndexes: [...fileIndexes].sort(compareNumbers),
      sequence,
    });
    sequence += 1;
  };

  const runtimeManifest = manifest as ArtifactManifest & {
    readonly kind: unknown;
  };
  if (runtimeManifest.kind !== "directory" && runtimeManifest.kind !== "zip") {
    addFinding("artifact-type-invalid");
  }

  const compressedBytes = validateCompressedSize(manifest, policy, addFinding);
  const indexedFiles = manifest.files.map((file, index) => ({ file, index }));

  if (manifest.files.length > policy.limits.maxFiles) {
    addFinding("file-count-exceeded");
  }

  const sizeSummary = validateFileSizes(indexedFiles, policy, addFinding);
  const hashSummary = validateHashes(indexedFiles, addFinding);
  validatePathsAndFiles(indexedFiles, policy, addFinding);
  validatePathCollisions(indexedFiles, addFinding);
  validateStructure(indexedFiles, policy, addFinding);

  const sortedFindings = pendingFindings.sort(compareFindings);
  const waiverResult = applyWarningWaivers(
    sortedFindings,
    input.warningWaivers ?? [],
    addFinding,
  );

  // Invalid waivers are added after the first sort, so sort once more before
  // splitting errors and warnings.
  const finalFindings = pendingFindings.sort(compareFindings);
  const errors = finalFindings
    .filter((finding) => finding.severity === "error")
    .map(stripInternalFinding);
  const warnings = finalFindings
    .filter(
      (finding): finding is PendingFinding & { readonly severity: "warning" } =>
        finding.severity === "warning",
    )
    .map((finding): ArtifactValidationWarning => {
      const waiver = waiverResult.waiversByCode.get(finding.code);
      const base = stripInternalFinding(finding);
      if (waiver === undefined)
        return { ...base, severity: "warning", waived: false };
      return {
        ...base,
        severity: "warning",
        waived: true,
        waiverReason: waiver.reason,
      };
    });

  return {
    pass: errors.length === 0,
    policy: { id: policy.id, version: policy.version },
    errors,
    warnings,
    warningWaivers: waiverResult.applied,
    summary: {
      fileCount: manifest.files.length,
      totalUncompressedBytes: sizeSummary.totalBytes,
      compressedBytes,
      hashes: {
        validSha256Count: hashSummary.validCount,
        invalidSha256Count: hashSummary.invalidCount,
        fileSetSha256: createFileSetDigest(indexedFiles),
      },
    },
  };
}

function validateCompressedSize(
  manifest: ArtifactManifest,
  policy: ArtifactValidationPolicy,
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
  ) => void,
): number | null {
  if (manifest.kind !== "zip") return null;
  if (manifest.compressedBytes === undefined) {
    addFinding("compressed-size-required");
    return null;
  }
  if (!isNonNegativeSafeInteger(manifest.compressedBytes)) {
    addFinding("compressed-size-invalid");
    return null;
  }
  if (manifest.compressedBytes > policy.limits.maxCompressedBytes) {
    addFinding("compressed-size-exceeded");
  }
  return manifest.compressedBytes;
}

function validateFileSizes(
  indexedFiles: readonly IndexedFile[],
  policy: ArtifactValidationPolicy,
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
  ) => void,
): { readonly totalBytes: number | null } {
  let total = 0n;
  let allSizesValid = true;

  for (const { file, index } of indexedFiles) {
    if (!isNonNegativeSafeInteger(file.sizeBytes)) {
      addFinding("file-size-invalid", [index]);
      allSizesValid = false;
      continue;
    }
    total += BigInt(file.sizeBytes);
  }

  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    addFinding("total-size-overflow");
  }
  if (total > BigInt(policy.limits.maxUncompressedBytes)) {
    addFinding("uncompressed-size-exceeded");
  }

  return {
    totalBytes:
      allSizesValid && total <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(total)
        : null,
  };
}

function validateHashes(
  indexedFiles: readonly IndexedFile[],
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
  ) => void,
): { readonly validCount: number; readonly invalidCount: number } {
  let validCount = 0;
  let invalidCount = 0;
  for (const { file, index } of indexedFiles) {
    if (typeof file.sha256 === "string" && SHA256_PATTERN.test(file.sha256)) {
      validCount += 1;
    } else {
      invalidCount += 1;
      addFinding("sha256-invalid", [index]);
    }
  }
  return { validCount, invalidCount };
}

function validatePathsAndFiles(
  indexedFiles: readonly IndexedFile[],
  policy: ArtifactValidationPolicy,
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
    ruleOverride?: ArtifactValidationRule,
  ) => void,
): void {
  const allowedExtensions = new Set(
    policy.files.allowedExtensions.map((extension) =>
      extension.replace(/^\./, "").toLowerCase(),
    ),
  );
  const blockedFileNames = new Set(
    policy.files.blockedFileNames.map((fileName) => fileName.toLowerCase()),
  );
  const blockedSegmentPrefixes = policy.files.blockedSegmentPrefixes.map(
    (prefix) => prefix.toLowerCase(),
  );
  const blockedPaths = new Set(
    (policy.files.blockedPaths ?? []).map((path) => path.toLowerCase()),
  );
  const blockedFilenameRules = policy.files.blockedFilenameRules ?? [];
  const forbiddenUrlCharacters = new Set(policy.paths.forbiddenUrlCharacters);

  for (const { file, index } of indexedFiles) {
    const runtimePath: unknown = file.path;
    if (typeof runtimePath !== "string" || runtimePath.length === 0) {
      addFinding("path-invalid", [index]);
      continue;
    }

    const path = runtimePath;
    const slashSegments = path.split("/");
    const allSegments = path.split(/[\\/]/);
    const lowerSegments = allSegments.map((segment) => segment.toLowerCase());
    const basename = lowerSegments.at(-1) ?? "";

    if (policy.paths.forbidBackslashes && path.includes("\\")) {
      addFinding("path-backslash", [index], policy.paths.rules?.backslash);
    }
    if (
      policy.paths.forbidAbsolutePaths &&
      (path.startsWith("/") ||
        path.startsWith("\\") ||
        WINDOWS_ABSOLUTE_PATH_PATTERN.test(path))
    ) {
      addFinding("path-absolute", [index], policy.paths.rules?.absolute);
    }
    if (policy.paths.forbidDotSegments) {
      if (allSegments.includes("..")) {
        addFinding(
          "path-dot-segment",
          [index],
          policy.paths.rules?.parentTraversal,
        );
      }
      if (allSegments.includes(".")) {
        addFinding(
          "path-dot-segment",
          [index],
          policy.paths.rules?.nonNormalized,
        );
      }
    }
    if (
      policy.paths.forbidEmptySegments &&
      slashSegments.some((segment) => segment.length === 0)
    ) {
      addFinding(
        "path-empty-segment",
        [index],
        policy.paths.rules?.nonNormalized,
      );
    }
    if (path.length > policy.limits.maxPathLength) {
      addFinding("path-too-long", [index]);
    }
    if ([...path].some((character) => forbiddenUrlCharacters.has(character))) {
      addFinding(
        "path-url-character",
        [index],
        policy.paths.rules?.urlReinterpret,
      );
    }
    if (policy.paths.forbidControlCharacters && hasControlCharacter(path)) {
      addFinding(
        "path-control-character",
        [index],
        policy.paths.rules?.controlCharacter,
      );
    }

    const extension = getExtension(basename);
    if (!allowedExtensions.has(extension)) {
      addFinding("extension-not-allowed", [index]);
    }

    if (
      blockedFileNames.has(basename) ||
      blockedPaths.has(path.toLowerCase()) ||
      lowerSegments.some((segment) =>
        blockedSegmentPrefixes.some((prefix) => segment.startsWith(prefix)),
      )
    ) {
      addFinding("blocked-file", [index]);
    }

    for (const blockedRule of blockedFilenameRules) {
      if (matchesBlockedFilename(basename, allSegments, blockedRule)) {
        addFinding("blocked-file", [index], blockedRule.rule);
      }
    }
  }
}

function matchesBlockedFilename(
  basename: string,
  pathSegments: readonly string[],
  blockedRule: ArtifactBlockedFilenameRule,
): boolean {
  const fold = (value: string): string =>
    blockedRule.caseSensitive === true ? value : value.toLowerCase();
  const expected = fold(blockedRule.value);
  const candidates =
    blockedRule.scope === "path-segment" ? pathSegments : [basename];
  return candidates.some((candidate) => {
    const value = fold(candidate);
    if (blockedRule.match === "exact") return value === expected;
    if (blockedRule.match === "prefix") return value.startsWith(expected);
    return value.endsWith(expected);
  });
}

function validatePathCollisions(
  indexedFiles: readonly IndexedFile[],
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
  ) => void,
): void {
  const exactPaths = new Map<string, number[]>();
  const foldedPaths = new Map<string, Map<string, number[]>>();

  for (const { file, index } of indexedFiles) {
    if (typeof file.path !== "string") continue;
    appendMapValue(exactPaths, file.path, index);
    let variants = foldedPaths.get(file.path.toLowerCase());
    if (variants === undefined) {
      variants = new Map<string, number[]>();
      foldedPaths.set(file.path.toLowerCase(), variants);
    }
    appendMapValue(variants, file.path, index);
  }

  for (const indexes of exactPaths.values()) {
    if (indexes.length > 1) addFinding("path-duplicate", indexes);
  }
  for (const variants of foldedPaths.values()) {
    if (variants.size <= 1) continue;
    const indexes = [...variants.values()].flat();
    addFinding("path-case-collision", indexes);
  }
}

function validateStructure(
  indexedFiles: readonly IndexedFile[],
  policy: ArtifactValidationPolicy,
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
  ) => void,
): void {
  const paths = indexedFiles
    .filter(({ file }) => typeof file.path === "string")
    .map(({ file, index }) => ({ path: file.path, index }));
  const rootFileIndexes = paths
    .filter(({ path }) => path === policy.structure.rootFile)
    .map(({ index }) => index);

  if (rootFileIndexes.length === 0) addFinding("root-file-missing");
  if (!policy.structure.forbidWrapperDirectory || paths.length === 0) return;

  const firstPath = paths[0];
  if (firstPath === undefined) return;
  const firstSeparator = firstPath.path.indexOf("/");
  if (firstSeparator <= 0) return;
  const wrapper = firstPath.path.slice(0, firstSeparator);
  const wrapperPrefix = `${wrapper}/`;
  const allInsideWrapper = paths.every(({ path }) =>
    path.startsWith(wrapperPrefix),
  );
  const wrapperRootFile = `${wrapperPrefix}${policy.structure.rootFile}`;
  if (allInsideWrapper && paths.some(({ path }) => path === wrapperRootFile)) {
    addFinding("wrapper-directory");
  }
}

function applyWarningWaivers(
  findings: readonly PendingFinding[],
  requestedWaivers: readonly WarningWaiver[],
  addFinding: (
    ruleId: ArtifactValidationRuleId,
    fileIndexes?: readonly number[],
  ) => void,
): {
  readonly waiversByCode: ReadonlyMap<string, WarningWaiver>;
  readonly applied: readonly AppliedWarningWaiver[];
} {
  const warningCountByCode = new Map<string, number>();
  const errorCodes = new Set<string>();
  for (const finding of findings) {
    if (finding.severity === "warning") {
      warningCountByCode.set(
        finding.code,
        (warningCountByCode.get(finding.code) ?? 0) + 1,
      );
    } else {
      errorCodes.add(finding.code);
    }
  }

  const candidates = new Map<string, WarningWaiver[]>();
  for (const waiver of requestedWaivers) {
    const runtimeCode: unknown = waiver.code;
    const runtimeReason: unknown = waiver.reason;
    if (
      typeof runtimeCode !== "string" ||
      runtimeCode.length === 0 ||
      runtimeCode !== runtimeCode.trim() ||
      typeof runtimeReason !== "string" ||
      runtimeReason.trim().length === 0 ||
      hasControlCharacter(runtimeReason)
    ) {
      addFinding("warning-waiver-invalid");
      continue;
    }
    const normalizedWaiver = {
      code: runtimeCode,
      reason: runtimeReason.trim(),
    };
    const current = candidates.get(runtimeCode);
    if (current === undefined) candidates.set(runtimeCode, [normalizedWaiver]);
    else current.push(normalizedWaiver);
  }

  const waiversByCode = new Map<string, WarningWaiver>();
  const applied: AppliedWarningWaiver[] = [];
  const sortedCandidates = [...candidates.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  );
  for (const [code, waivers] of sortedCandidates) {
    const warningCount = warningCountByCode.get(code) ?? 0;
    if (waivers.length !== 1 || warningCount === 0 || errorCodes.has(code)) {
      addFinding("warning-waiver-invalid");
      continue;
    }
    const waiver = waivers[0];
    if (waiver === undefined) continue;
    waiversByCode.set(code, waiver);
    applied.push({
      code,
      reason: waiver.reason,
      waivedWarningCount: warningCount,
    });
  }

  return { waiversByCode, applied };
}

function createFileSetDigest(indexedFiles: readonly IndexedFile[]): string {
  const canonicalEntries = indexedFiles
    .map(({ file }) => [
      canonicalScalar(file.path),
      canonicalScalar(file.sizeBytes),
      canonicalHash(file.sha256),
    ])
    .sort((left, right) =>
      compareStrings(JSON.stringify(left), JSON.stringify(right)),
    );
  return createHash("sha256")
    .update("letscoding-artifact-file-set-v1\0")
    .update(JSON.stringify(canonicalEntries))
    .digest("hex");
}

function canonicalScalar(value: unknown): string {
  if (typeof value === "string") return `string:${value}`;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:NaN";
    if (value === Number.POSITIVE_INFINITY) return "number:+Infinity";
    if (value === Number.NEGATIVE_INFINITY) return "number:-Infinity";
    if (Object.is(value, -0)) return "number:-0";
    return `number:${String(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

function canonicalHash(value: unknown): string {
  return typeof value === "string" && SHA256_PATTERN.test(value)
    ? `sha256:${value.toLowerCase()}`
    : canonicalScalar(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function getExtension(basename: string): string {
  const lastDot = basename.lastIndexOf(".");
  return lastDot < 0 || lastDot === basename.length - 1
    ? ""
    : basename.slice(lastDot + 1).toLowerCase();
}

function appendMapValue(
  map: Map<string, number[]>,
  key: string,
  value: number,
): void {
  const current = map.get(key);
  if (current === undefined) map.set(key, [value]);
  else current.push(value);
}

function stripInternalFinding(
  finding: PendingFinding,
): ArtifactValidationFinding {
  return {
    ruleId: finding.ruleId,
    code: finding.code,
    severity: finding.severity,
    message: finding.message,
    fileIndexes: finding.fileIndexes,
  };
}

function compareFindings(left: PendingFinding, right: PendingFinding): number {
  const ruleDifference =
    (RULE_ORDER.get(left.ruleId) ?? Number.MAX_SAFE_INTEGER) -
    (RULE_ORDER.get(right.ruleId) ?? Number.MAX_SAFE_INTEGER);
  if (ruleDifference !== 0) return ruleDifference;
  const indexesDifference = compareNumberArrays(
    left.fileIndexes,
    right.fileIndexes,
  );
  if (indexesDifference !== 0) return indexesDifference;
  const codeDifference = compareStrings(left.code, right.code);
  return codeDifference === 0 ? left.sequence - right.sequence : codeDifference;
}

function compareNumberArrays(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) continue;
    if (leftValue !== rightValue) return leftValue - rightValue;
  }
  return left.length - right.length;
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
