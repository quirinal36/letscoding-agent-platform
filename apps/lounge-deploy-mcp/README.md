# Lounge Deploy MCP

공식 `@modelcontextprotocol/sdk`의 stateless Streamable HTTP transport를 사용하는
원격 MCP 서비스다. Vercel Node.js Function을 서울 `icn1`에 배포한다.

## Endpoint

- `POST /mcp`: MCP Streamable HTTP(JSON response mode)
- `GET /health`: process/environment/revision 확인
- `GET /ready`: 배포 revision과 정책 bundle probe 확인

MCP transport는 요청마다 새 server/transport를 만들고 응답 뒤 닫는다. 프로세스
메모리 session에 의존하지 않으며 `GET`/`DELETE /mcp`는 405다.

## 1차 도구 계약

- `get_policy`: policy ID와 optional version으로 정책/가이드 조회
- `analyze_project`: 제한된 파일 목록과 allowlisted 설정 내용 분석
- `validate_artifact`: ZIP 원문이 아닌 manifest 재검증
- `create_report`: 분석/검증 결과의 Markdown/JSON 보고서 생성

네 도구 모두 strict Zod input/output Schema와 공통 `{ ok, requestId, data|error }`
envelope를 사용한다. unknown 입력 필드는 handler 실행 전에 거부된다. domain 오류는
구조화된 tool error이며 JSON 파싱/transport 오류와 구분된다. `upload_to_lounge`는
등록하지 않는다.

#9에서 `get_policy`를 발행된 정책 bundle에 연결했다. `current.json`을 한 번 읽어
선택한 immutable JSON/Markdown snapshot을 함께 반환하며, 명시한 과거 버전도 조회할
수 있다. 응답의 `contentHash`와 `etag`는 정규화한 snapshot 전체를 식별한다. 소스가
없거나 손상되면 캐시된 정책으로 우회하지 않고 구조화된 domain 오류로 닫힌다.
`analyze_project`도 #10에서 공용 project analyzer에 연결했다. 요청마다 먼저 현재
또는 명시 버전 정책 snapshot을 선택하고, 제한된 파일 metadata와 allowlisted 설정
내용만 분석한다. `.env*`와 lockfile 내용은 Schema 단계에서 거부하며 원문은 응답에
반사하지 않는다.

`validate_artifact`도 #11에서 공용 artifact validator에 연결했다. 로컬 검사 결과와
manifest의 digest·파일 수·크기 합계를 교차 확인하고, 요청 시작/종료의 활성 정책을
다시 읽어 같은 버전일 때만 최종 성공한다. 정책이 바뀌면 새 정책으로 manifest를
판정하되 `REVALIDATION_REQUIRED`를 반환한다.

`create_report`는 #12에서 분석과 최종 검증의 명시적 결과를 안정적인 JSON과 한국어
Markdown으로 변환한다. 최종 검증·분석·정책이 모두 성공하고 일치할 때만 완료로
표현한다. client 문자열은 단일 행·비밀값 차단 계약을 거치고 Markdown 구조에 맞게
escape한다. 보고서는 서버에 저장하지 않는다.

정책은 빌드 전에 다음 명령으로 검증해 TypeScript bundle로 생성한다. 생성 파일은
직접 편집하지 않는다.

```sh
corepack pnpm --filter @letscoding/lounge-deploy-mcp generate:policy-bundle
```

## 설정

| 환경 변수              | 기본값         | 설명                             |
| ---------------------- | -------------- | -------------------------------- |
| `LETS_ENV`             | `dev`          | `dev`, `test`, `staging`, `prod` |
| `LETS_REVISION`        | 로컬만 `local` | 배포 revision; staging/prod 필수 |
| `LETS_MAX_BODY_BYTES`  | `1048576`      | MCP route 전체 body 제한         |
| `LETS_TOOL_TIMEOUT_MS` | `5000`         | 도구별 실행 제한(최대 30초)      |
| `PORT`                 | `3000`         | 로컬 Node HTTP port              |

`staging`과 `prod`는 서로 다른 Vercel 프로젝트/환경 변수로 운영한다. readiness는
비밀값이나 사용자 정보를 반환하지 않는다. 1차 public 도구는 ADR-0002에 따라
익명이며 user/org/role을 입력 계약이나 권한 근거로 받지 않는다.

## 개발 및 배포 검증

```sh
corepack pnpm --filter @letscoding/lounge-deploy-mcp test
corepack pnpm --filter @letscoding/lounge-deploy-mcp build
```

테스트는 임시 loopback HTTP server와 실제 SDK client로 initialize, tool discovery,
호출, timeout, payload limit, health/readiness를 확인하고 client/server를 종료한다.
정책 repository 테스트는 현재·명시 버전, current 전환 중 snapshot 일관성, 해시
안정성, 손상·누락·source 장애 시 fail-closed 동작을 확인한다.

Vercel project root는 `apps/lounge-deploy-mcp`로 설정한다. `vercel.json`이 `icn1`,
함수 duration/memory를 고정하고 `api/mcp.ts`, `api/health.ts`, `api/ready.ts`가 각
endpoint를 제공한다.
