# ADR-0004: Lounge Deploy Plugin은 공개 배포하되 1차는 ZIP 제작·검증으로 제한한다

- 상태: 승인됨
- 결정일: 2026-08-12
- 결정 책임자: `@quirinal36` (초기 Product Owner)
- 승인자: `@quirinal36` (2026-08-12 작업 세션에서 승인)
- 관련 이슈: [#1](https://github.com/quirinal36/letscoding-agent-platform/issues/1), [#14](https://github.com/quirinal36/letscoding-agent-platform/issues/14), [#15](https://github.com/quirinal36/letscoding-agent-platform/issues/15)

## 맥락

제품 목표는 다른 컴퓨터와 다른 Codex 계정의 사용자가 별도 가이드 파일 없이 최신 렛츠코딩 정책으로 작품 ZIP을 만드는 것이다. 대상 학생·교사 계정이 하나의 OpenAI 조직에 속한다고 가정할 수 없으므로 조직 전용 배포는 설치 장벽이 된다.

반면 실제 Lounge 업로드는 작품 소유권, 대상 확인, 공개 여부와 사용자의 최종 승인이라는 별도 고위험 write 흐름이다. 1차 read/validate Plugin에 이 권한을 섞으면 인증·감사·실수 반경이 커진다.

## 결정 기준

- 서로 다른 Codex 계정에서 한 번의 설치로 사용 가능
- 세부 정책은 원격 MCP에서 갱신하고 Plugin 업데이트에 의존하지 않음
- Plugin package에 credential·운영 비밀값·mutable 정책을 포함하지 않음
- 외부 write와 작품 공개를 사용자의 명시적 승인 없이 수행하지 않음
- 공개 전 충분한 staging/E2E와 지원 준비

## 검토한 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| 공개 universal plugin directory | 계정/컴퓨터 간 설치가 쉽고 제품 목표에 맞음 | 공개 심사·지원·보안 설명 부담, 누구나 설치 시도 가능 |
| 렛츠코딩 조직 전용 marketplace | 노출과 지원 범위가 작음 | 대상 Codex 계정이 조직 밖이면 설치할 수 없음 |
| repository/local marketplace만 배포 | 개발·테스트 제어가 쉬움 | 일반 사용자 설치 UX와 업데이트 경로가 제품 목표에 미달 |
| Skill 파일만 수동 배포 | 구현이 단순함 | 오래된 정책/가이드, MCP 연결·identity가 일관되지 않음 |

## 결정

### 배포 방식

1. 최종 배포 목표는 ChatGPT와 Codex가 공유하는 공개 universal plugin directory다.
2. 개발 중에는 personal/repository marketplace로만 배포한다. `staging` 인증과 새 계정 E2E gate를 통과하기 전 공개 제출하지 않는다.
3. Plugin은 `.codex-plugin/plugin.json`, 최소 Lounge Deploy Skill, 등록된 MCP server connection을 포함한다. credential, access/refresh token, Supabase key, 세부 용량/확장자 정책은 포함하지 않는다.
4. 1차 remote call은 ADR-0002에 따라 익명으로 제공하되 public policy와 제한된 입력만 다루며 payload/rate-limit 통제를 통과해야 한다.
5. 공개 Plugin의 설명에는 데이터 전송 범위, 중앙 비저장 원칙, 자동 업로드 비범위, 지원/보안 연락처를 명시한다.

### 1차 범위

1차가 제공하는 사용자 결과는 **정적 작품 ZIP과 검증 보고서**까지다.

- 작업 시작과 ZIP 직전의 최신 immutable policy 조회
- 제한된 프로젝트 메타데이터를 사용한 framework/정적 배포 분석
- 사용자의 로컬 환경에서 build와 결정적 validator 실행
- ZIP 최상위 구조, 경로, 크기, 파일 수, 확장자, hash 검사
- manifest 기반 서버 최종 재검증과 policy version 일치 확인
- ZIP 절대 경로, 크기, 파일 수, hash, policy version, warning/제약 보고

MCP tool surface는 `get_policy`, `analyze_project`, `validate_artifact`, `create_report` 네 개다.

### 명시적 비범위

- `upload_to_lounge` tool 또는 실제 Lounge 작품 등록/공개 API
- 사용자 확인 없는 자동 등록, 자동 공개, 외부 write
- 사용자 로컬 소스 또는 원본 ZIP의 중앙 기본 저장
- 원본 ZIP/file content를 MCP에 전송해 중앙에서 기본 해제·보관
- `.env` 값, secret, 학생·교사 개인정보의 정책 응답/감사 로그 저장
- 정책 관리자 UI/API
- 사용자의 GitHub 또는 로컬 shell 권한을 중앙 서버가 대행하는 기능

Plugin과 MCP는 1차에서 업로드가 완료된 것처럼 표현하지 않는다. 최종 문구는 “라운지 업로드용 ZIP 제작·검증 완료”로 제한한다.

2차에서 `upload_to_lounge`를 검토하려면 별도 ADR/threat model, 작품 소유권 확인, 대상/공개 상태 표시, 사용자 직전 승인, idempotency, 취소/보상, 별도 write scope와 감사 event를 먼저 정의해야 한다.

## 공개 전 gate

- ADR-0002 V-01 익명 호출 남용 통제와 부하 테스트 통과
- 단일 HTML, 순수 HTML/CSS/JS, Vite, Next.js의 새 Codex 계정 E2E 통과
- 정책 서비스 장애와 버전 변경 중 stale 성공이 없음을 검증
- Plugin manifest/Skill 검사와 OpenAI 공개 심사 요구사항 충족
- 개인정보/데이터 전송 설명, 지원 연락처, 연결 해제 절차 게시
- Product Owner의 공개 배포 승인 기록

## 결과와 트레이드오프

- 조직에 속하지 않은 대상 Codex 계정도 같은 설치 경로를 사용할 수 있다.
- 누구나 Plugin을 발견할 수 있지만 인증되지 않은 사용자는 MCP 데이터/도구를 사용할 수 없다.
- 공개 심사와 지원 준비 때문에 초기 출시 일정이 길어질 수 있다. 그동안 repository/personal marketplace로 검증한다.
- 실제 업로드를 제외해 사용자는 ZIP을 Lounge에 직접 올려야 하지만 1차의 권한·데이터·실수 반경을 작게 유지한다.

## 후속 검증

- V-03의 공개 directory 요구사항과 계정별 설치 가능성을 확인한다.
- Issue #14에서 Skill에 세부 정책값이 하드코딩되지 않았는지 검사한다.
- Issue #15에서 “한 문장 요청 → 검증된 ZIP 보고” 전체 흐름과 비범위 표현을 확인한다.

## 참고 자료

- [OpenAI: Package your plugin](https://developers.openai.com/plugins/build/plugins) — manifest, MCP 연결, 공개 directory와 local/repository source의 차이 (2026-08-12 확인)
- [OpenAI: Plugin authentication](https://developers.openai.com/plugins/build/auth) — read-only anonymous MCP와 인증 도입 기준 (2026-08-12 확인)
