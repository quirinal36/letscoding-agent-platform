# MCP `create_report` 계약

상태: 구현됨

관련 이슈: #12

## 완료 판정

`create_report`는 #10의 명시적 분석 결과와 #11의 명시적 최종 검증 결과만 받는다.
임의 `record`를 보고서 데이터로 받지 않는다. 다음 조건이 모두 맞아야 JSON
`status=completed`, `pass=true`와 Markdown `상태: 완료`를 만든다.

- 최종 검증 decision과 pass가 `PASS`/`true`다.
- 재검증이 필요하지 않다.
- 분석이 성공했다.
- 분석과 최종 검증의 policy ID/version이 같다.

그 외에는 `failed` 또는 `revalidation-required`다. 실패 보고서도 생성할 수 있지만
완료나 통과로 표현하지 않는다. 성공 입력은 ZIP 절대 경로, 정적 출력 폴더, 한 개
이상의 실행 명령을 요구한다.

## 보고 데이터와 결정성

JSON은 정책, framework/version/confidence, 변경 파일과 이유, 실행 명령, 산출물
크기·파일 수·hash·루트 `index.html`, 검증 decision과 code/waiver, 확인 기능, 외부
origin, 공개 runtime env 이름, 남은 제한을 고정된 key 순서로 제공한다. Markdown은
이 JSON 객체만으로 렌더링하므로 핵심 값과 상태가 다를 수 없다.

입력 배열은 의미에 맞는 안정적인 key로 정렬하고 중복 문자열은 제거한다. 생성
시각이나 process 상태를 넣지 않으므로 같은 구조화 입력은 byte 단위로 같은 JSON,
Markdown, `reportHash`를 만든다. JSON 핵심 부분과 한국어 Markdown 머리말은 inline
snapshot으로 고정한다.

## 문자열·정보 경계

클라이언트 문자열은 단일 행으로 제한하고 Markdown code span의 backtick fence와
일반 Markdown 특수문자를 안전하게 처리한다. 외부 주소는 credential, query, path가
없는 origin만 받는다. 공개 runtime env는 이름만 받고 값 map은 계약에 없다.

다음 secret 형태는 Schema에서 거부하고 renderer에서도 defense-in-depth로
`[REDACTED]` 처리한다.

- private key header
- 대표적인 API/GitHub token과 JWT 형태
- password/secret/token/API key의 `name=value` 또는 `name: value`
- credential이 포함된 URL

분석·검증 Schema에는 소스 내용, ZIP 원문, 개별 파일 내용, 인증 token 필드가 없다.
보고서는 중앙에 저장하지 않고 MCP 응답으로만 반환한다.

## 사람의 승인과 되돌리기

현재 별도 승인 항목은 없다. 경로와 명령을 보고서에 표시하는 것은 이슈가 요구한
클라이언트 로컬 표시이며 감사 로그 저장과는 구분한다. #13은 도구 payload나 보고서
본문을 기본 감사 로그에 남기지 않아야 한다.

구현을 되돌리려면 #12 PR의 보고서 연결 커밋을 revert한다. 그러면
`create_report`만 `TOOL_NOT_IMPLEMENTED` 상태로 돌아가고 #10 분석과 #11 검증은
그대로 남는다. 보고서 영구 저장이나 공유 링크는 보존 기간·접근 제어 결정을 별도로
승인하기 전에는 추가하지 않는다.
