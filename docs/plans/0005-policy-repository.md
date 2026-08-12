# MCP 정책 저장소와 `get_policy`

상태: 구현됨

관련 이슈: #9

## 조회와 일관성

`get_policy`는 `policyId`와 선택적인 `version`을 받는다. 버전이 없으면
`current.json`을 한 번 읽고 그 포인터가 선택한 immutable JSON/Markdown snapshot을
끝까지 사용한다. 조회 도중 current가 바뀌어도 한 응답 안에서 정책과 가이드 버전이
섞이지 않는다. 버전을 명시하면 current에 의존하지 않고 해당 snapshot을 재생한다.

응답은 정책 ID·버전·시행 시각, 조회 시각, active 여부, JSON 정책, Markdown 가이드,
SHA-256 `contentHash`, 같은 값을 나타내는 `etag`를 포함한다. 해시는 JSON 문서의
정규 직렬화와 줄바꿈을 정규화한 가이드 전체를 domain separator와 함께 계산한다.

## 배포 bundle과 장애 원칙

Vercel Function이 저장소 경로에 의존하지 않도록 build 전에
`scripts/generate-policy-bundle.ts`가 발행 트리를 검증하고
`src/generated/policy-bundle.ts`를 만든다. 생성 중 active pointer가 바뀌면 build를
실패시키며, 모든 history JSON/Markdown 쌍도 공용 정책 계약으로 검증한다. readiness는
동일한 bundle의 active snapshot을 다시 검사한다.

1차 구현은 프로세스 캐시나 이전 성공 결과를 제공하지 않는다. 누락·손상된 bundle은
`POLICY_BUNDLE_INVALID`, 존재하지 않는 명시 버전은
`POLICY_VERSION_NOT_FOUND`, 알 수 없는 ID는 `POLICY_NOT_FOUND`, source 예외는
retryable `POLICY_SERVICE_UNAVAILABLE`로 실패한다. 원본 예외 메시지와 경로는 응답에
노출하지 않는다.

## 사람의 승인과 되돌리기

코드 배포는 새 정책을 발행하거나 current를 변경하지 않는다. 정책 내용과 활성
버전의 승인 절차는 ADR-0003과 발행 runbook을 그대로 따른다. 운영자가 별도로 승인할
결정은 현재 없다.

구현을 되돌리려면 #9 PR을 revert하면 `get_policy`가 이전의 fail-closed 미구현
handler로 돌아간다. 정책 버전 자체를 되돌릴 때는 생성 파일을 편집하지 말고 승인된
과거 immutable 버전을 `current.json`이 가리키도록 정책 발행 절차를 다시 수행한 뒤
서비스를 재배포한다.
