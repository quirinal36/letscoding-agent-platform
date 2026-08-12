# ADR-0001: 원격 Lounge Deploy MCP는 Vercel Node.js Function으로 서울에 배포한다

- 상태: 승인됨
- 결정일: 2026-08-12
- 결정 책임자: `@quirinal36` (초기 Product/Platform Owner)
- 승인자: `@quirinal36` (2026-08-12 작업 세션에서 승인)
- 관련 이슈: [#1](https://github.com/quirinal36/letscoding-agent-platform/issues/1), [#8](https://github.com/quirinal36/letscoding-agent-platform/issues/8)

## 맥락

Lounge Deploy MCP는 Codex Plugin이 작업 시작과 최종 ZIP 생성 직전에 호출하는 원격 정책·검증 서비스다. 1차 도구는 짧은 읽기/검증 요청이며 ZIP 원문을 전송하거나 서버에서 프로젝트를 빌드하지 않는다. 기존 렛츠코딩 서비스의 Vercel 운영 경험을 재사용할 가치가 있다.

MCP는 한국 사용자의 지연 시간을 낮추고, 배포 환경과 비밀값을 분리하며, 향후 관리자 정책 편집 서비스와 실행 권한을 공유하지 않아야 한다.

## 결정 기준

- TypeScript 공용 패키지와 같은 런타임 사용
- MCP Streamable HTTP를 표준 HTTPS endpoint로 제공
- 주 사용자인 한국 사용자에게 가까운 리전
- `staging`과 `prod`의 배포·비밀값 격리
- 초기 운영 인력과 비용을 낮추되 다른 호스팅으로 옮길 수 있는 stateless 구조

## 검토한 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| Vercel Node.js Function | 기존 운영 경험 재사용, Git 기반 배포, 서울 리전, TypeScript와 일치 | serverless 시간/메모리 제한, cold start, 공급자 결합 |
| Google Cloud Run | 장시간 요청·컨테이너 제어·서울 리전 | 별도 클라우드 운영/IAM/관측성 체계 필요 |
| Supabase Edge Function | 인증·DB와 가까움, 간단한 배포 | Deno 런타임과 Node 공용 패키지 차이, ZIP 검증 확장 시 제약 |
| 상시 실행 VM/컨테이너 | 프로세스와 연결을 완전히 제어 | 패치·확장·장애 대응 부담이 1차 범위에 비해 큼 |

## 결정

1. `apps/lounge-deploy-mcp`는 TypeScript와 공식 `@modelcontextprotocol/sdk`를 사용한다.
2. 외부 transport는 HTTPS의 MCP Streamable HTTP다. 1차 서버는 요청 간 메모리 세션에 의존하지 않는 stateless resource server로 만든다.
3. `staging`과 `prod`는 서로 다른 Vercel 프로젝트의 Node.js Function으로 배포한다. 런타임 major는 ADR-0005와 동일한 Node.js 24다.
4. 두 원격 환경의 함수 리전은 서울 `icn1`로 명시한다. Vercel의 기본 `iad1`에 맡기지 않는다.
5. 표준 endpoint는 다음 이름을 사용한다.
   - `staging`: `https://staging.lounge-deploy-mcp.letscoding.kr/mcp`
   - `prod`: `https://lounge-deploy-mcp.letscoding.kr/mcp`
   - `dev`: 로컬 loopback endpoint이며 운영 DNS 이름을 재사용하지 않는다.
6. readiness endpoint는 배포 revision, 환경명, 정책 bundle의 무결성만 확인한다. 비밀값이나 사용자 정보를 반환하지 않는다.
7. 정책 JSON/가이드는 승인된 배포 artifact에 포함한다. 함수의 임시 파일시스템이나 프로세스 메모리를 정책 원본으로 사용하지 않는다.
8. 1차 요청은 manifest·제한된 설정 메타데이터만 처리한다. ZIP 바이트, 전체 소스, `.env` 값은 MCP request로 받지 않는다.

## 결과와 트레이드오프

- 기존 Vercel 운영 경로와 TypeScript workspace를 재사용하며 서울 사용자의 왕복 지연을 줄인다.
- 별도 Vercel 프로젝트가 `staging`/`prod` 환경 변수와 배포 권한의 실수 섞임을 막는다.
- serverless 제한을 넘는 ZIP 해제나 장시간 build는 지원하지 않는다. 해당 작업은 Plugin의 로컬 검증기 책임이다.
- Vercel 장애나 비용 문제가 기준을 넘으면 동일한 stateless handler를 Cloud Run으로 옮길 수 있게 transport/domain 계약과 호스팅 adapter를 분리한다.
- 한국 사용자의 실제 지연이나 비용이 기준을 벗어나면 측정 결과와 새 ADR로 `icn1`을 재검토한다.

## 후속 검증

- V-02에 따라 한국 네트워크에서 `staging` p95 지연을 확인한다.
- Phase 2 smoke test에서 initialize, tool discovery, 취소, timeout, 잘못된 payload를 Streamable HTTP로 검증한다.
- Vercel의 request body, duration, memory 한도를 manifest 최대 크기보다 명시적으로 크게 설정하고 경계 테스트를 둔다.

## 참고 자료

- [OpenAI: Build an MCP server](https://developers.openai.com/plugins/build/mcp-server) — 공식 TypeScript SDK와 Streamable HTTP 안내 (2026-08-12 확인)
- [Vercel: Configuring regions for Functions](https://vercel.com/docs/functions/configuring-functions/region) — 기본 리전과 명시적 region 설정 (2026-08-12 확인)
- [Vercel: Global network and regions](https://vercel.com/docs/regions) — 서울 `icn1` 및 데이터 소스 인접성 권고 (2026-08-12 확인)
