/**
 * Lounge Deploy 정책의 단일 기계 판독 계약.
 *
 * 정책 JSON, 검증기, MCP가 이 패키지의 타입과 오류 코드를 공유한다.
 * 파일 시스템 접근이 필요하면 `@letscoding/policy-contract/node`를 사용한다.
 */
export {
  CURRENT_POINTER_PATH,
  guidePath,
  guideSha256,
  loadActivePolicy,
  loadPolicyVersion,
  normalizeGuideText,
  snapshotPath,
} from "./bundle.js";
export type {
  LoadedPolicy,
  LoadedPolicySnapshot,
  LoadPolicyOptions,
  LoadPolicyVersionOptions,
  PolicySource,
} from "./bundle.js";

export { isPolicyContractCode, POLICY_CONTRACT_CODES } from "./codes.js";
export type { PolicyContractCode } from "./codes.js";

export {
  parseCurrentPointer,
  parseCurrentPointerText,
  parseJsonText,
  parsePolicyDocument,
  parsePolicyDocumentText,
} from "./parse.js";
export type { ParseResult, PolicyIssue } from "./parse.js";

export {
  comparePolicyVersion,
  isPolicyVersion,
  latestPolicyVersion,
  parsePolicyVersion,
  sortPolicyVersions,
} from "./version.js";
export type { PolicyVersionParts } from "./version.js";

export {
  checkMessageKo,
  checkMessagesKo,
  contractMessageKo,
  contractMessagesKo,
} from "./messages/ko.js";

export {
  allPolicyContractSchemas,
  currentPointerSchema,
  policyCheckCodeSchema,
  policyDocumentSchema,
  policyIdSchema,
  policyVersionSchema,
} from "./generated/schemas.js";

export type { CurrentPointer } from "./generated/current-pointer.js";
export type {
  PolicyAssetPathRules,
  PolicyBlockedFilename,
  PolicyBlockedPathRule,
  PolicyCheck,
  PolicyCheckCode,
  PolicyDocument,
  PolicyFileCodes,
  PolicyFileRules,
  PolicyFramework,
  PolicyFrameworkDetection,
  PolicyGuideReference,
  PolicyGovernance,
  PolicyId,
  PolicyRootAbsoluteAssetRule,
  PolicyRuntimeEnvRule,
  PolicySourceFile,
  PolicySourceProvenance,
  PolicyVersion,
  PolicyZipCodes,
  PolicyZipLimits,
} from "./generated/policy-document.js";
