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

#8에서는 도구 계약과 주입 가능한 handler 경계만 제공한다. 실제 handler는
#9~#12에서 공용 policy/validator/analyzer 패키지에 연결한다. 기본 handler는
`TOOL_NOT_IMPLEMENTED` domain 오류로 fail-closed한다.

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

Vercel project root는 `apps/lounge-deploy-mcp`로 설정한다. `vercel.json`이 `icn1`,
함수 duration/memory를 고정하고 `api/mcp.ts`, `api/health.ts`, `api/ready.ts`가 각
endpoint를 제공한다.
