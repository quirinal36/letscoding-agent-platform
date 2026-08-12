# MCP 도구 계약 스캐폴딩

상태: 구현됨

관련 이슈: #8

## 경계

MCP transport와 도구 계약은 domain 구현에서 분리한다. 각 HTTP 요청은 새 stateless
SDK server/transport를 만들고, 주입된 handler만 호출한 뒤 모두 닫는다. 따라서
후속 도구 구현은 Vercel adapter나 MCP JSON-RPC를 직접 다루지 않는다.

입력과 출력은 Zod runtime Schema로 tool discovery에 노출되며 unknown 필드를
거부한다. MCP route는 Schema 이전에 전체 body byte 제한을 적용한다. 도구 실행은
SDK cancellation signal과 서버 timeout signal을 결합한다.

## 오류 경계

- JSON 파싱, method, body 제한, SDK protocol 문제: HTTP/JSON-RPC transport 오류
- 정책 없음, 검증 실패 같은 예상 상태: `kind=domain` tool error
- 제한 시간: `kind=timeout`, `TOOL_TIMEOUT`
- client 취소: `kind=cancelled`, `REQUEST_CANCELLED`
- 예상하지 못한 예외: 원문/stack을 반사하지 않는 `INTERNAL_ERROR`

모든 tool envelope는 MCP request ID를 문자열 `requestId`로 기록한다. HTTP 응답도
`x-request-id`를 제공한다. #13에서 외부 correlation ID, rate limit, 감사 event를
이 경계에 연결한다.

## 의도적으로 연기한 항목

도구별 domain 결과의 세부 로직은 #9~#12, 익명 서비스 남용 통제와 감사 로그는
#13에서 구현한다. 인증은 ADR-0002의 도입 조건이 생기기 전에는 추가하지 않는다.
이 구조를 되돌리려면 #8 PR을 revert한다. stateful session 또는 다른 hosting으로
바꾸려면 ADR-0001을 대체하는 새 결정을 먼저 승인한다.
