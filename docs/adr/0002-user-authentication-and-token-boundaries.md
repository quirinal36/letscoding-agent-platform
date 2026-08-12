# ADR-0002: 1차 일반 MCP는 로그인 없이 제공하고 인증은 범위 확장 전까지 연기한다

- 상태: 승인됨
- 결정일: 2026-08-12
- 결정 책임자: `@quirinal36` (초기 Product/Platform Owner)
- 승인자: `@quirinal36` (2026-08-12 작업 세션에서 승인)
- 관련 이슈: [#1](https://github.com/quirinal36/letscoding-agent-platform/issues/1), [#13](https://github.com/quirinal36/letscoding-agent-platform/issues/13)

## 맥락

1차 Lounge Deploy MCP는 공개 정책 조회, 제한된 프로젝트 메타데이터 분석, artifact manifest 검증과 보고서 생성을 제공한다. 실제 Lounge 작품 등록은 사용자가 수동으로 수행한다.

MCP는 사용자별 데이터, 조직 전용 정책, 원본 소스/ZIP 저장, 작품 소유권 확인 또는 외부 write를 다루지 않는다. 따라서 일반 호출자를 식별해도 도구 결과나 권한이 달라지지 않는다.

OpenAI의 Plugin 인증 문서는 읽기 전용 MCP가 익명으로 동작할 수 있으며 customer-specific data 또는 write action을 제공할 때 사용자 인증이 필요하다고 설명한다. 현재 범위에 OAuth를 넣으면 로그인 UX, token 처리와 개인정보/운영 부담만 먼저 생긴다.

## 결정 기준

- 다른 Codex 계정에서 별도 렛츠코딩 로그인 없이 설치 후 사용
- 공개 정책과 비민감 manifest만 처리
- 원본 소스·ZIP·`.env`·학생 개인정보 비수집
- 로그인 없이 발생할 수 있는 남용과 비용을 기술적으로 제한
- 사용자별/쓰기 기능이 생길 때 인증을 빠뜨리지 않는 명시적 도입 조건
- 미래 관리자 정책 서비스는 처음부터 별도 인증·배포 경계를 사용

## 검토한 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| 1차 일반 MCP 익명 제공 | 가장 간단한 설치 UX, token/개인정보 없음, 현재 권한 모델과 일치 | 사용자별 quota·추적 불가, IP 기반 제한의 오탐 가능성 |
| Supabase Auth OAuth 2.1 필수 | 기존 Lounge 사용자 확인, 사용자/조직별 권한·quota 가능 | 현재 결과가 사용자별로 달라지지 않아 복잡성과 로그인 마찰만 증가 |
| 익명 정책 조회 + 검증만 로그인 | 계산량이 큰 도구를 계정별 제한 가능 | 한 작업 중 로그인 경계가 생기고 현재 검증 데이터가 사용자 전용이 아님 |
| 공유 API key | 간단한 server gate | 공개 Plugin에서 key 유출·회수·rotation 문제, 사용자 identity가 아님 |

## 결정

### 1차 일반 MCP

1. `get_policy`, `analyze_project`, `validate_artifact`, `create_report`는 로그인과 bearer token 없이 호출할 수 있다.
2. 1차 정책은 모든 사용자에게 같은 public policy다. 조직별 비공개 policy를 제공하지 않는다.
3. user ID, organization ID, role 또는 scope를 입력 계약과 권한 판단에 사용하지 않는다. client가 이런 값을 보내도 신뢰하거나 감사 identity로 기록하지 않는다.
4. MCP request는 allowlist에 포함된 설정 메타데이터와 artifact manifest만 받는다. 소스 전체, 원본 ZIP, `.env` 값, 학생 개인정보는 받지 않는다.
5. 성공/실패는 오직 활성 policy와 결정적 입력으로 판정한다. 호출자 identity 유무에 따라 검증 결과를 바꾸지 않는다.

### 익명 서비스 남용 통제

인증 대신 다음 통제를 Phase 2의 production gate로 둔다.

- route/tool별 body 크기, 파일 수, 문자열 길이, timeout과 concurrency 제한
- IP/network 신호와 전체 service budget에 기반한 rate limit
- CDN/WAF의 기본 bot·비정상 트래픽 차단
- `get_policy`의 cache/ETag와 동일 요청 비용 절감
- request ID, tool, policy version, 결과 code, latency, 크기/파일 수만 담는 최소 감사 event
- token, email, user ID, source content, ZIP bytes와 `.env` 값을 수집하지 않음
- 정상 Plugin의 작업 시작/최종 재검증 흐름을 차단하지 않는 부하·경계 테스트

IP는 권한 identity가 아니며 장기 사용자 프로필을 만드는 데 사용하지 않는다. 저장이 필요하면 축약 또는 회전 salt 기반 pseudonymization과 짧은 보존 기간을 Issue #13에서 결정한다.

### 인증을 새로 도입해야 하는 조건

아래 기능 중 하나를 시작하기 전에 새 ADR로 일반 사용자 인증을 결정한다.

- 조직별 비공개 policy 또는 조직 membership에 따라 달라지는 결과
- 사용자별 사용량, 저장된 보고서, 실행 이력 또는 개인 설정
- 원본 ZIP/file 업로드나 중앙 저장
- `upload_to_lounge` 또는 다른 외부 write
- 작품 소유자·교사 권한 확인
- 계정 단위 quota/revocation이 IP 기반 제한보다 반드시 필요한 운영 상태

그 시점에는 기존 Lounge 계정을 재사용할 수 있는 Supabase Auth OAuth 2.1을 우선 후보로 검토하되 자동 채택하지 않는다. OAuth 2.1/PKCE, consent, token claim, audience, 만료/revoke와 개인정보 영향을 당시 기능에 맞춰 승인한다.

### 미래 관리자 경계

정책 편집·승인·활성화 API는 일반 익명 MCP에 route나 tool로 추가하지 않는다.

| 경계 | 1차 일반 Lounge Deploy MCP | 미래 Policy Admin API |
| --- | --- | --- |
| 호출자 | 익명 | 인증된 렛츠코딩 운영자 |
| 배포 | 일반 MCP 전용 Vercel 프로젝트/도메인 | 별도 Vercel 프로젝트/도메인 |
| 권한 | public read/analyze/validate/report만 | `policy.draft`, `policy.approve`, `policy.activate` 등 명시적 권한 |
| runtime secret | 정책 read bundle과 남용 통제용 최소 설정 | 정책 write credential 등 별도 보관 |
| 로그 | 비식별 요청·검증 감사 | actor가 있는 관리자 변경 감사 |

관리자 서비스는 일반 MCP와 OAuth client/audience, secret set, deploy role, audit sink를 공유하지 않는다. 일반 MCP runtime에는 Supabase service-role key, GitHub write token, Vercel deploy token을 두지 않는다.

## 결과와 트레이드오프

- 사용자는 Plugin 설치 후 별도 Lounge 로그인 없이 1차 도구를 사용할 수 있다.
- OAuth beta 기능과 token/claim/consent 구현을 현재 필요하지 않은 범위에서 제거한다.
- 익명 사용자는 계정별 차단·quota가 불가능하므로 payload, concurrency, IP/network rate limit과 service budget이 중요해진다.
- 학교·공유 네트워크의 여러 사용자가 같은 IP를 쓸 수 있어 제한 오탐 가능성이 있다. 제한값은 실제 `staging` 부하와 사용자 흐름으로 조정한다.
- 향후 쓰기 또는 사용자별 데이터가 생기면 인증을 뒤늦게 덧붙이지 않고 기능보다 먼저 새 ADR를 승인해야 한다.

## 후속 검증

- V-01의 익명 호출 부하, rate limit, payload/timeout/concurrency 경계를 `staging`에서 검증한다.
- Issue #13의 인증 구현 범위를 익명 남용 통제·비식별 감사 로그 구현으로 조정한다.
- `Authorization`, user/org/role 입력이 없어도 네 도구의 E2E가 완료되는지 확인한다.
- 인증 도입 조건을 roadmap과 실제 업로드 이슈의 선행 조건으로 연결한다.

## 참고 자료

- [OpenAI: Plugin authentication](https://developers.openai.com/plugins/build/auth) — read-only anonymous MCP와 customer-specific/write 기능의 인증 기준 (2026-08-12 확인)
