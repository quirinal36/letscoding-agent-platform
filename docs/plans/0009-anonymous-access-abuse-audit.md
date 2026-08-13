# 익명 MCP 접근·남용 통제·감사 계약

상태: 구현됨, 운영 설정 승인 대기

관련 이슈: #1, #13

## 인증 결정과 이슈 해석

승인된 ADR-0002가 #13의 원래 token/organization 요구보다 우선한다. 1차 네 도구는
모두 같은 공개 정책과 비민감 manifest만 처리하므로 익명이다. JWT 서명·issuer·
audience·expiry·scope 검증과 조직별 권한은 구현하지 않는다. 이를 구현했다고 완료
처리하지도 않는다.

대신 다음 경계를 fail-closed로 구현한다.

- `Authorization` header가 있으면 `AUTHENTICATION_NOT_SUPPORTED`로 거부한다.
- client의 `x-user-id`, `x-org-id`, `x-organization-id`, `x-role`, `x-scope`는
  `UNTRUSTED_IDENTITY_HEADER`로 거부한다.
- public 도구 allowlist는 `get_policy`, `analyze_project`, `validate_artifact`,
  `create_report`뿐이다. 정책 편집·활성화와 작품 write는 허용하지 않는다.
- 조직별 정책, 저장 보고서, ZIP 업로드, `upload_to_lounge`, 작품 권한 중 하나라도
  추가하기 전에 새 인증 ADR과 OAuth 2.1 경계를 사람에게 승인받아야 한다.

따라서 서로 다른 테스트 조직은 둘 다 동일하게 거부되고 어느 조직 claim도 권한이나
감사 identity가 되지 않는 것으로 통합 테스트한다. 미래의 조직 간 positive/negative
authorization test는 인증 ADR 승인 전까지 적용 불가다.

## 남용 통제

Schema body·파일 수·문자열 제한과 도구 timeout에 더해 다음 인스턴스 안전장치를 둔다.

- 원격 Vercel 환경은 플랫폼이 제공하는 `x-vercel-forwarded-for`, 로컬은 socket
  주소를 네트워크 신호로 선택한다.
- 신호는 `LETS_NETWORK_KEY_SECRET` HMAC으로 가명화하고 UTC 날짜마다 회전한다.
  원문 IP는 저장하지 않는다.
- 기본 fixed window는 네트워크 가명키당 60초/120요청이다. 정상 Plugin의 초기화,
  정책 조회, 분석, 검증, 재조회, 재검증, 보고 흐름에 충분한 여유를 둔다.
- 인스턴스당 동시 MCP 요청은 기본 8개다. 초과는 `503`, 반복 초과는 `429`와
  `Retry-After`로 안정적으로 반환한다.
- in-memory window는 serverless 인스턴스 전체의 전역 quota가 아니다. Vercel WAF를
  authoritative edge 제한으로 사용하고 애플리케이션 제한은 우회·설정 누락의 보조
  방어로 유지한다.

## 감사 allowlist와 정보 경계

각 도구 event는 UTC 시각, 환경/revision, request ID, 일일 네트워크 가명키, 익명
actor, 도구명, policy ID/version, 결과 status/code/finding code, latency를 기록한다.
검증·보고 도구는 압축/해제 크기, 파일 수, artifact SHA-256도 기록한다. HTTP 단계의
인증/제한 거부는 tool 없이 원인 code만 기록한다. 응답 envelope와 event가 같은
request ID를 사용하므로 운영자가 한 요청을 추적할 수 있다.

serializer는 고정된 필드만 새 객체로 만들며 입력 객체를 spread하지 않는다. 다음은
필드 자체가 없고 sink 예외에도 message/stack을 출력하지 않는다.

- token, email, user/org ID, 학생 개인정보
- source/file 내용, `.env` 값, ZIP 원문, 보고서 본문
- 입력 payload, 오류 message/details/stack, 로컬 경로와 실행 명령

도구 응답에서도 예상하지 못한 예외는 기존처럼 고정 `INTERNAL_ERROR`만 반환한다.
도메인 오류 code/message는 안전한 형태를 검사하고 secret 형태 message는 일반 문구로
대체한다. details는 현재 필요한 `policyCodes`만 허용해 임의 객체 반사를 막는다.

## 사람 승인이 필요한 운영 설정

권장안은 다음과 같다.

1. `staging`과 `prod`에 서로 다른 32자 이상의 무작위
   `LETS_NETWORK_KEY_SECRET`을 secret으로 등록한다. 값은 로그·PR·문서에 넣지 않는다.
2. Vercel WAF의 `/api/mcp`·`/mcp` fixed-window 규칙을 IP 기준 60초/120요청으로
   `staging`에서 7일간 Log 동작시킨다. 학교 공유망의 정상 최대치를 확인한 뒤
   Product/Platform Owner가 production `Rate Limit` 전환을 승인한다.
3. JSON 감사 sink 보존 기간은 14일, 조회 권한은 Platform Owner와 지정 Security
   operator로 제한한다. 장기 분석은 원시 event가 아닌 집계치만 남긴다.

WAF 게시와 secret/로그 sink 설정은 저장소 밖의 운영 변경이므로 이 PR에서 자동으로
수행하지 않는다. Vercel WAF는 이전 설정 version 복원으로 되돌리고, 애플리케이션
오탐은 환경 변수 제한을 올린 뒤 재배포할 수 있다. 가명키 회전 문제는 이전 secret을
복원하면 해당 날짜의 key가 다시 같아지지만 원문 IP 복구는 불가능하다.

## 코드 되돌리기

#13 PR의 연결 커밋을 revert하면 익명 인증 header 거부, 인스턴스 rate/concurrency,
감사 sink 연결이 제거되고 #8의 body/timeout 제한만 남는다. 운영 WAF는 별도 version을
복원해야 한다. token 인증을 새로 도입할 때는 이 경계를 조용히 완화하지 말고
ADR-0002를 대체하는 승인된 ADR과 함께 `@letscoding/mcp-auth`를 교체한다.

## 운영 근거

- [Vercel request headers](https://vercel.com/docs/headers/request-headers.rsc)는
  Vercel이 `x-forwarded-for`를 덮어써 IP spoofing을 막고
  `x-vercel-forwarded-for`를 동등한 신호로 제공한다고 설명한다.
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)은
  source IP 기반 fixed window와 먼저 Log한 뒤 Rate Limit 적용하는 운영 흐름을
  제공한다.
