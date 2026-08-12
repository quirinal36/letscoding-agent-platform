# ADR-0003: Git을 정책 원본으로 삼고 승인된 동일 artifact를 환경별로 승격한다

- 상태: 승인됨
- 결정일: 2026-08-12
- 결정 책임자: `@quirinal36` (초기 Policy Owner/Approver)
- 승인자: `@quirinal36` (2026-08-12 작업 세션에서 승인)
- 관련 이슈: [#1](https://github.com/quirinal36/letscoding-agent-platform/issues/1), [#4](https://github.com/quirinal36/letscoding-agent-platform/issues/4), [#16](https://github.com/quirinal36/letscoding-agent-platform/issues/16)

## 맥락

Lounge Deploy 정책은 Plugin 업데이트 없이 다음 작업부터 바뀔 수 있어야 하지만 과거 실행도 재현 가능해야 한다. 정책 변경에는 내용 owner, 승인자, 활성화 주체와 긴급 차단 절차가 필요하다. 개발·스테이징·운영의 identity, secret, 배포 권한이 섞이면 일반 MCP가 관리자 권한을 얻거나 테스트 변경이 운영에 노출될 수 있다.

1차에는 정책 관리자 UI/API가 없으므로 Git PR이 검토·승인·감사의 중심이다.

## 결정 기준

- immutable version과 과거 실행 재현
- JSON 정책과 사람용 가이드의 원자적 검토/배포
- 승인되지 않은 `current` 변경 차단
- `dev`/`staging`/`prod` 사용자·비밀값·배포 권한 분리
- 긴급 보안 차단은 빠르게, 사후 감사는 강제
- 미래 관리자 API가 일반 MCP 권한을 상속하지 않음

## 검토한 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| 이 모노레포의 Git PR + immutable bundle | 코드/Schema/fixture와 함께 검토, commit 단위 재현, 초기 운영 단순 | 비개발 운영자 편집 UX가 낮음, 활성화가 배포와 결합 |
| DB의 mutable policy row | 즉시 활성화·관리 UI 연결이 쉬움 | 승인 우회·과거 재현·JSON/가이드 원자성 보장이 어려움 |
| 별도 policy repository | 권한과 변경 이력을 독립 관리 | 1차에 cross-repo CI/deploy 동기화 복잡성 추가 |
| object storage의 수동 JSON | 배포 없이 빠른 교체 | 검토·Schema·승인·감사 우회 위험이 큼 |

## 결정

### 원본과 활성화

1. 정책 원본은 `quirinal36/letscoding-agent-platform`의 `policies/lounge-deploy/`다.
2. `history/<version>.json`과 `history/<version>.md`는 발행 후 수정하지 않는다. `current.json`은 활성 immutable version을 가리키는 포인터고, `framework-guide.md`는 현재 활성 Markdown의 사람이 읽기 쉬운 복사본이다.
3. JSON 정책, Markdown 가이드, Schema/fixture, version/effective time/change reason을 같은 PR에서 변경한다.
4. CI가 Schema, current→history 참조, 과거 history 불변성, 오류 코드 동기화, 전체 artifact fixture를 검증해야 merge할 수 있다.
5. `main`의 한 commit에서 만든 content-addressed policy bundle을 `staging`에 배포한다. E2E가 통과한 바로 그 bundle digest만 `prod`로 승격한다. 환경별 재빌드는 금지한다.
6. `prod` 활성화 주체는 GitHub `prod` Environment 승인을 가진 Infrastructure Operator다. 승인자는 digest, policy version, effective time과 change reason을 확인한다.
7. MCP의 응답과 감사 event는 policy ID/version, bundle digest, service revision을 함께 기록한다.
8. rollback은 과거 파일을 수정하지 않고 이전 version을 가리키는 새 정책 발행 PR과 새 version으로 수행한다. 긴급 복구도 어떤 version이 언제 활성화됐는지 남긴다.

### 책임과 승인

| 역할 | 초기 담당 | 책임 |
| --- | --- | --- |
| Policy Owner | `@quirinal36` | 제품 규칙·시행 시각·변경 사유 최종 책임 |
| Technical Maintainer | `@quirinal36` | Schema/검증기/가이드 일치, CI와 배포 artifact |
| Policy Approver | `@quirinal36` | 일반 변경 승인. 자기 작성 변경은 필수 CI와 공개 PR 기록을 추가 통제로 사용 |
| Infrastructure Operator | `@quirinal36` | staging 검증 후 같은 digest의 prod 승격, rollback |
| Emergency Authority | 당번 Incident Commander, 초기 `@quirinal36` | 심각한 보안 위험의 즉시 차단과 사후 검토 개시 |

팀이 두 명 이상이 되면 Policy Owner와 change author를 분리하고 CODEOWNERS 승인 1명을 강제한다. 보안·개인정보·인증 범위 변경은 가능한 경우 Security Reviewer의 추가 승인을 요구한다.

일반 발행 순서는 `author → CI → Policy Approver → merge → staging deploy/E2E → Infrastructure Operator prod approval`이다.

긴급 변경은 다음 조건을 모두 만족해야 한다.

- 악성 artifact, 비밀값 노출, 인증 우회처럼 현재 사용자에게 중대한 위험이 있음
- Emergency Authority가 최소 차단 변경만 수행
- 별도 emergency version, 시행 시각, actor, 사유, 영향 범위를 감사 로그에 기록
- 다음 영업일 안에 정상 PR, 회귀 fixture, Policy Owner의 사후 승인을 완료
- 보안 회복에 꼭 필요하지 않으면 사용자 범위를 확대하거나 검사를 완화하지 않음

### 환경과 비밀값 경계

| 계약 환경 | 실행 위치 | identity/data | 운영 책임자 | 비밀값 위치와 경계 |
| --- | --- | --- | --- | --- |
| `dev` | 로컬 Node.js + 테스트 runner | public test policy와 synthetic manifest | Developer | `.env.local`만 사용하고 Git 제외. staging/prod secret 사용 금지 |
| `staging` | 전용 Vercel project, `icn1` | 별도 staging policy bundle과 synthetic manifest, production data 없음 | Technical Maintainer | Vercel staging env. prod와 다른 rate-limit/audit 설정 |
| `prod` | 전용 Vercel project, `icn1` | 승인된 public production policy bundle | Infrastructure Operator | Vercel prod env와 GitHub prod Environment 승인. 접근 최소화/감사 |

공통 원칙:

- 1차 general MCP는 사용자 JWT를 요구하지 않으며 signing secret/service-role key를 runtime에 두지 않는다.
- GitHub/Vercel 배포 권한과 정책 write credential은 general MCP 환경 변수가 아니다.
- 비밀값을 repository, policy JSON/가이드, Plugin, build artifact, log, 오류 메시지에 넣지 않는다.
- 환경 간 token은 issuer/audience/signing key 중 적어도 두 경계로 서로 거부한다.
- production source/ZIP 원문, `.env` 값, 학생 개인정보는 어느 환경의 기본 감사 로그에도 저장하지 않는다.
- GitHub-Vercel integration처럼 공급자 간 단기/관리형 자격 증명을 우선하고 장기 deploy token의 복사를 피한다.

### 미래 관리자 서비스

관리자 UI/API가 필요해지면 `apps/lounge-policy-admin` 같은 별도 app, Vercel project, domain, OAuth audience/client, secret set, audit sink로 배포한다. 정책 draft/approve/activate write는 general MCP handler나 tool registry에 들어가지 않는다. 두 서비스가 공용 타입을 재사용할 수는 있지만 runtime credential과 deploy role은 공유하지 않는다.

## 결과와 트레이드오프

- commit, policy version, bundle digest로 과거 실행을 재현하고 승인자를 추적할 수 있다.
- 운영 정책 활성화가 코드 배포 파이프라인에 묶여 DB toggle보다 느리다. 1차의 낮은 변경 빈도와 강한 감사성을 우선한 결과다.
- 초기 1인 운영에서는 완전한 separation of duties가 불가능하다. 공개 PR, 필수 CI, immutable history, 사후 기록을 보완 통제로 사용하고 인원이 늘면 승인을 분리한다.
- 별도 staging/prod 프로젝트는 비용과 설정 복제를 늘리지만 secret·사용자·token 혼선을 크게 줄인다.

## 후속 검증

- Issue #16에서 branch protection, CODEOWNERS, GitHub Environment, immutable artifact promotion과 rollback rehearsal을 구현한다.
- README의 승인 기록과 owner/approver/emergency role을 유지한다.
- Issue #13 전에 V-05의 감사/rate-limit 저장소와 보존 기간을 결정한다.
- 관리자 API를 시작하기 전에 threat model과 별도 ADR 승인을 요구한다.
