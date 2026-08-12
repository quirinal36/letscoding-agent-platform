/**
 * `current.json` → `history/<version>` 참조 무결성 로딩.
 *
 * 하나라도 실패하면 정책을 제공하지 않는다. 정책 조회 실패를 오래된 정책으로
 * 대체해 성공 처리하지 않는다는 운영 원칙을 계약 계층에서 강제한다.
 */
import { createHash } from "node:crypto";
import type { PolicyContractCode } from "./codes.js";
import type { CurrentPointer } from "./generated/current-pointer.js";
import type { PolicyDocument } from "./generated/policy-document.js";
import type { ParseResult, PolicyIssue } from "./parse.js";
import { parseCurrentPointerText, parsePolicyDocumentText } from "./parse.js";

/**
 * 정책 디렉터리 하나(`policies/<id>/`)의 읽기 창구.
 *
 * `node:fs`에 직접 의존하지 않으므로 배포 번들, 로컬 CLI, 테스트 fixture가 같은
 * 로더를 공유한다. 경로는 항상 `/` 구분자의 상대 경로다.
 */
export interface PolicySource {
  /** 파일이 없으면 `null`을 돌려준다. 읽기 오류는 예외로 던진다. */
  readText(relativePath: string): Promise<string | null>;
}

export interface LoadedPolicySnapshot {
  readonly document: PolicyDocument;
  readonly guideMarkdown: string;
}

export interface LoadedPolicy extends LoadedPolicySnapshot {
  readonly pointer: CurrentPointer;
}

export interface LoadPolicyOptions {
  /** 기대하는 정책 ID. 포인터와 스냅샷이 모두 이 값이어야 한다. */
  readonly policyId: string;
}

export interface LoadPolicyVersionOptions extends LoadPolicyOptions {
  readonly version: string;
}

export const CURRENT_POINTER_PATH = "current.json";

export function snapshotPath(version: string): string {
  return `history/${version}.json`;
}

export function guidePath(version: string): string {
  return `history/${version}.md`;
}

function failure(
  code: PolicyContractCode,
  path: string,
  detail: string,
): ParseResult<never> {
  const issue: PolicyIssue = { code, path, detail };
  return { ok: false, issues: [issue] };
}

/**
 * 가이드 Markdown을 해시 이전에 정규화한다.
 *
 * Windows checkout의 CRLF와 BOM 때문에 같은 내용이 다른 해시를 갖는 일을 막는다.
 */
export function normalizeGuideText(text: string): string {
  return text.replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
}

export function guideSha256(text: string): string {
  return createHash("sha256")
    .update(normalizeGuideText(text), "utf8")
    .digest("hex");
}

async function loadSnapshot(
  source: PolicySource,
  policyId: string,
  version: string,
): Promise<ParseResult<LoadedPolicySnapshot>> {
  const snapshotText = await source.readText(snapshotPath(version));
  if (snapshotText === null) {
    return failure(
      "POLICY_SNAPSHOT_MISSING",
      snapshotPath(version),
      `Snapshot for version ${version} does not exist.`,
    );
  }

  const document = parsePolicyDocumentText(snapshotText);
  if (!document.ok) {
    return document;
  }

  if (document.value.id !== policyId) {
    return failure(
      "POLICY_SNAPSHOT_ID_MISMATCH",
      "/id",
      `Expected ${policyId} but the snapshot declares ${document.value.id}.`,
    );
  }

  if (document.value.version !== version) {
    return failure(
      "POLICY_SNAPSHOT_VERSION_MISMATCH",
      "/version",
      `File name declares ${version} but the snapshot declares ${document.value.version}.`,
    );
  }

  const guideMarkdown = await source.readText(guidePath(version));
  if (guideMarkdown === null) {
    return failure(
      "POLICY_GUIDE_MISSING",
      guidePath(version),
      `Guide snapshot for version ${version} does not exist.`,
    );
  }

  const actualHash = guideSha256(guideMarkdown);
  if (actualHash !== document.value.guide.sha256) {
    return failure(
      "POLICY_GUIDE_HASH_MISMATCH",
      "/guide/sha256",
      `Expected ${document.value.guide.sha256} but the guide hashes to ${actualHash}.`,
    );
  }

  return {
    ok: true,
    value: { document: document.value, guideMarkdown },
  };
}

/** 지정한 불변 버전의 스냅샷을 읽는다. */
export async function loadPolicyVersion(
  source: PolicySource,
  options: LoadPolicyVersionOptions,
): Promise<ParseResult<LoadedPolicySnapshot>> {
  return loadSnapshot(source, options.policyId, options.version);
}

/** `current.json`이 가리키는 활성 정책을 읽는다. */
export async function loadActivePolicy(
  source: PolicySource,
  options: LoadPolicyOptions,
): Promise<ParseResult<LoadedPolicy>> {
  const pointerText = await source.readText(CURRENT_POINTER_PATH);
  if (pointerText === null) {
    return failure(
      "POLICY_POINTER_MISSING",
      CURRENT_POINTER_PATH,
      "current.json does not exist.",
    );
  }

  const pointer = parseCurrentPointerText(pointerText);
  if (!pointer.ok) {
    return pointer;
  }

  if (pointer.value.policyId !== options.policyId) {
    return failure(
      "POLICY_POINTER_ID_MISMATCH",
      "/policyId",
      `Expected ${options.policyId} but current.json points at ${pointer.value.policyId}.`,
    );
  }

  const snapshot = await loadSnapshot(
    source,
    options.policyId,
    pointer.value.version,
  );
  if (!snapshot.ok) {
    return snapshot;
  }

  return {
    ok: true,
    value: { ...snapshot.value, pointer: pointer.value },
  };
}
