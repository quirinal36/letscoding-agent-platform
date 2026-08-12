/**
 * 이 파일은 scripts/generate.ts가 schema/*.json에서 생성했다.
 * 직접 수정하지 말고 schema를 고친 뒤 다시 생성한다.
 */

/**
 * 정책 식별자. policies/<id>/ 디렉터리 이름과 반드시 일치한다.
 */
export type PolicyId = string;
/**
 * 발행일과 그날의 발행 순번으로 이루어진 불변 버전. 예: 2026-08-12.3. 이 pattern은 달력에 존재하지 않는 날짜를 거르지 못하므로 파서가 추가로 검사한다.
 */
export type PolicyVersion = string;
/**
 * 사용자 작품 판정에 사용하는 안정적 오류 코드. 한번 발행한 코드는 재사용·개명·의미 변경을 하지 않는다.
 */
export type PolicyCheckCode = string;

/**
 * 발행된 Lounge Deploy 정책 스냅샷 하나의 계약. 발행 후에는 수정하지 않는다.
 */
export interface PolicyDocument {
  /**
   * 정책 계약의 major 버전. 비호환 변경에서만 올린다.
   */
  schemaVersion: 1;
  id: PolicyId;
  version: PolicyVersion;
  /**
   * 정책 시행 시각(UTC). 버전 문자열의 날짜는 발행일 표기이며 시행 시각이 아니다.
   */
  effectiveAt: string;
  /**
   * 감사 기록에 남는 변경 사유.
   */
  changeReason: string;
  zip: PolicyZipLimits;
  files: PolicyFileRules;
  assetPaths: PolicyAssetPathRules;
  runtimeEnv: PolicyRuntimeEnvRule;
  /**
   * 지원 프레임워크별 감지 힌트와 추가 검사.
   *
   * @minItems 1
   */
  frameworks: [PolicyFramework, ...PolicyFramework[]];
  /**
   * 오류 코드 카탈로그. 다른 절의 code 값은 모두 여기에 존재해야 한다.
   *
   * @minItems 1
   */
  checks: [PolicyCheck, ...PolicyCheck[]];
  guide: PolicyGuideReference;
}
/**
 * 제출 ZIP의 크기와 구조 제한.
 */
export interface PolicyZipLimits {
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  maxFiles: number;
  /**
   * ZIP 최상위에 index.html이 있어야 하는지 여부.
   */
  requireRootIndexHtml: boolean;
  codes: PolicyZipCodes;
}
export interface PolicyZipCodes {
  compressedTooLarge: PolicyCheckCode;
  uncompressedTooLarge: PolicyCheckCode;
  tooManyFiles: PolicyCheckCode;
  missingRootIndexHtml: PolicyCheckCode;
}
/**
 * 확장자, 파일명, 경로 형태 규칙.
 */
export interface PolicyFileRules {
  codes: PolicyFileCodes;
  /**
   * 허용 확장자 allowlist. 소문자 비교를 전제한다.
   *
   * @minItems 1
   */
  allowedExtensions: [string, ...string[]];
  /**
   * 차단 파일명. 정규식 대신 고정된 비교 방식만 사용한다.
   *
   * @minItems 1
   */
  blockedFilenames: [PolicyBlockedFilename, ...PolicyBlockedFilename[]];
  /**
   * 차단 경로 규칙. 정책은 규칙 종류만 선언하고 해석은 검증기 코드가 담당한다.
   *
   * @minItems 1
   */
  blockedPathRules: [PolicyBlockedPathRule, ...PolicyBlockedPathRule[]];
}
export interface PolicyFileCodes {
  extensionNotAllowed: PolicyCheckCode;
}
export interface PolicyBlockedFilename {
  /**
   * value를 파일명과 비교하는 방식.
   */
  match: "exact" | "prefix" | "suffix";
  value: string;
  code: PolicyCheckCode;
}
export interface PolicyBlockedPathRule {
  kind:
    | "absolute-path"
    | "parent-traversal"
    | "backslash-separator"
    | "control-character"
    | "url-reinterpret"
    | "non-normalized";
  code: PolicyCheckCode;
}
/**
 * 빌드 산출물의 정적 자산 경로 규칙.
 */
export interface PolicyAssetPathRules {
  disallowRootAbsolute: PolicyRootAbsoluteAssetRule;
}
/**
 * HTML/CSS/JS에 남은 루트 절대 자산 경로 처리 규칙.
 */
export interface PolicyRootAbsoluteAssetRule {
  enabled: boolean;
  code: PolicyCheckCode;
}
/**
 * 공개 런타임 값 전달 규칙. 차단 자체는 files.blockedFilenames가 담당한다.
 */
export interface PolicyRuntimeEnvRule {
  /**
   * .env를 ZIP에 넣지 않고 별도로 첨부하는지 여부.
   */
  attachSeparately: boolean;
  browserObject: string;
  forbidBundledSecrets: boolean;
  guideAnchor: string;
}
export interface PolicyFramework {
  key: "nextjs" | "vite" | "plain-html";
  detect: PolicyFrameworkDetection;
  /**
   * 정적 자산의 기대 상대 경로 접두사. 해당 없으면 null.
   */
  expectedAssetPrefix: string | null;
  guideAnchor: string;
  /**
   * 이 프레임워크에서 추가로 적용하는 checks[].code 참조.
   */
  checks: PolicyCheckCode[];
}
/**
 * 감지 입력 데이터. 감지 알고리즘 자체는 이 계약의 범위가 아니다.
 */
export interface PolicyFrameworkDetection {
  configFiles: string[];
  dependencies: string[];
}
export interface PolicyCheck {
  code: PolicyCheckCode;
  severity: "error" | "warning";
  /**
   * 사용자가 사유를 확인한 뒤 해제할 수 있는지 여부. severity가 error면 false여야 한다.
   */
  waivable: boolean;
  appliesTo: "zip" | "output-dir" | "project";
  /**
   * 표시 문구 자원의 키. 사람이 읽는 문장은 정책에 넣지 않는다.
   */
  titleKey: string;
  guideAnchor: string;
}
/**
 * 같은 버전으로 발행한 사람용 Markdown 가이드 참조.
 */
export interface PolicyGuideReference {
  path: string;
  sha256: string;
}
