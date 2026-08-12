# Lounge Deploy Phase 0 의사결정 기록

이 디렉터리는 [GitHub Issue #1](https://github.com/quirinal36/letscoding-agent-platform/issues/1)의 Phase 0 운영 결정을 기록한다. 구현 이슈는 여기서 정의한 환경명, 인증 용어, 권한 경계를 안정적인 계약으로 참조한다.

## ADR 목록

| ADR | 결정 | 상태 |
| --- | --- | --- |
| [ADR-0001](0001-remote-mcp-runtime-and-region.md) | 원격 MCP 런타임·호스팅·리전 | 승인됨 |
| [ADR-0002](0002-user-authentication-and-token-boundaries.md) | 1차 익명 사용·향후 인증 도입 조건·관리자 경계 | 승인됨 |
| [ADR-0003](0003-policy-governance-and-environments.md) | 정책 원본·승인·활성화·환경/비밀값 경계 | 승인됨 |
| [ADR-0004](0004-plugin-distribution-and-v1-scope.md) | Plugin 배포 방식·1차 제품 범위 | 승인됨 |
| [ADR-0005](0005-monorepo-toolchain.md) | 모노레포 package manager·Node.js 버전 | 승인됨 |

`승인됨`은 결정 책임자가 내용을 확인했고 후속 구현이 따라야 할 기준이라는 뜻이다. 다섯 ADR은 모두 `@quirinal36`의 승인을 받았으며 Phase 0 후속 구현의 기준으로 사용한다.

## 승인 기록

- 2026-08-12: 저장소·이슈 소유자인 `@quirinal36`이 이 작업 세션에서 ADR-0001, ADR-0003, ADR-0004, ADR-0005와 자신이 초기 담당자라는 내용을 승인했다.
- 2026-08-12: `@quirinal36`이 기존 Supabase OAuth 필수안을 철회한 ADR-0002의 익명 1차 서비스 안을 승인했다.

## 안정적인 용어

| 용어 | 정의 |
| --- | --- |
| `dev` | 개발자 로컬 실행과 자동화 테스트 환경. 운영 사용자·운영 비밀값·운영 데이터에 접근하지 않는다. |
| `staging` | 운영 전 통합/E2E 검증 환경. 별도 Vercel 프로젝트, 테스트 policy와 synthetic 입력을 사용한다. |
| `prod` | 실제 사용자가 연결하는 운영 환경. 승인된 `main` 리비전만 배포한다. |
| anonymous caller | 1차 일반 MCP를 로그인 없이 호출하는 Plugin client. 사용자·조직 identity로 간주하지 않는다. |
| principal | 향후 인증 도입 시 검증된 token이 가리키는 사용자 또는 서비스. 1차 일반 MCP에는 principal이 없다. |
| organization | 향후 조직 전용 정책이 필요할 때 도입할 권한 경계. 1차 정책은 조직별로 나뉘지 않는다. |
| MCP scope | 향후 사용자별/쓰기 권한을 구분할 때 도입할 권한 값. 1차 일반 MCP에는 scope가 없다. |
| policy owner | 정책 내용과 제품 영향에 책임지는 역할. 초기 담당자는 `@quirinal36`이다. |
| policy approver | 일반 정책 발행을 승인하는 역할. 초기에는 policy owner가 맡고 필수 CI를 추가 통제로 사용한다. |
| emergency authority | 심각한 보안 위험을 즉시 차단할 수 있는 incident commander. 초기 담당자는 `@quirinal36`이다. |

환경명은 코드·설정·감사 로그에서 위 소문자 값만 사용한다. `development`, `preview`, `production` 같은 공급자별 명칭은 표시용 매핑이며 계약 값으로 저장하지 않는다.

## 미결정·후속 검증 표

아래 항목은 선택을 뒤집지 않고도 검증할 수 있는 가정 또는 운영 준비 작업이다. 실패 조건과 대안은 각 ADR에 기록했다.

| ID | 항목 | 현재 가정 | 완료 시점 | 책임자 | 필요한 증빙 |
| --- | --- | --- | --- | --- | --- |
| V-01 | 익명 서비스 남용 통제 | 로그인 없이도 public policy/validation을 제공할 수 있다. | Phase 2의 `prod` 배포 전 | Agent Platform Maintainer | payload/timeout/concurrency/rate-limit 부하 테스트와 정상 Plugin 재검증 흐름 확인 |
| V-02 | 사용자와 리전 근접성 | MCP의 주 사용자는 한국에 있고 정책은 배포 artifact에 포함되므로 Vercel `icn1`이 적합하다. | 호스팅 생성 전 | Infrastructure Operator | 한국 네트워크에서 `staging` p95 지연 측정 |
| V-03 | 공개 Plugin 배포 가능성 | 대상 사용자의 Codex 계정이 하나의 OpenAI 조직에 속하지 않아 공개 디렉터리가 가장 낮은 설치 장벽을 제공한다. | Phase 3 공개 제출 전 | Plugin Publisher | 공개 심사 요구사항, 미성년 사용자 안내, 지원 연락처, 계정별 설치 E2E |
| V-05 | 감사 로그·rate limit 저장소 | Phase 1 ADR에서는 공급자를 고정하지 않아도 API/토큰 경계를 정의할 수 있다. | Issue #13 구현 전 | Security/Platform Maintainer | 보존 기간, 한국 리전, 삭제/접근 통제, 비용 비교 |
| V-06 | 서비스 도메인 | `lounge-deploy-mcp.letscoding.kr`과 staging 하위 도메인을 사용할 수 있다. | DNS/호스팅 생성 전 | Infrastructure Operator | DNS 소유권과 TLS 발급 확인 |
| V-07 | 일반 사용자 인증 도입 조건 | 조직 전용 정책, 사용자별 데이터 또는 외부 write가 1차에 없다. | 해당 기능을 설계하기 전 | Product Owner | 새 ADR에서 identity provider, claim, consent, token/deployment 경계 승인 |

## 완료 조건 추적

| Issue #1 완료 조건 | 기록 위치 |
| --- | --- |
| 선택지·선택 결과·이유·대안/트레이드오프 | ADR-0001~0005의 선택지, 결정, 결과 절 |
| 일반 MCP와 향후 관리자 API의 배포·토큰 경계 분리 | ADR-0002, ADR-0003 |
| `upload_to_lounge`, 원본 ZIP/소스 중앙 저장, 무승인 자동 등록 비범위 | ADR-0004 |
| 정책 소유자·승인자 확인 | 이 문서의 승인 기록 |
| 안정적인 환경명·인증 용어 | 이 문서의 안정적인 용어 절 |
