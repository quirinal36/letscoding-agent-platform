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
 * 활성 정책 스냅샷을 가리키는 포인터. 정책 규칙 값을 복제하지 않고, 스냅샷 경로는 history/<version>.json 규약으로 파생한다.
 */
export interface CurrentPointer {
  schemaVersion: 1;
  policyId: PolicyId;
  version: PolicyVersion;
  /**
   * 이 버전을 활성화한 시각(UTC).
   */
  activatedAt: string;
}
