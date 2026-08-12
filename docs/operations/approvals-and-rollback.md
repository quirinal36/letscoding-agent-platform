# 외부 운영 설정 승인·되돌리기

상태: 코드 권장안 구현됨, 외부 설정은 Product/Infrastructure Owner 승인 대기

## 권장 GitHub 설정

- `main` ruleset: PR 필수, Code Owner review, conversation resolution, 최신 commit 승인,
  `Node 24 / macos-latest`, `ubuntu-latest`, `windows-latest`, `Dependency audit / high+` 필수,
  force push/delete/bypass 금지
- merge queue를 쓰면 `merge_group` CI 유지
- `staging` Environment: main만 배포, staging 전용 Vercel secret/variables
- `production` Environment: required reviewer, main만, bypass 금지. 1인 운영에서는 self-review
  방지가 release를 영구 차단하므로 두 번째 operator를 추가한 시점에 활성화
- Private Vulnerability Reporting과 Dependabot alerts 활성화

ruleset 적용 전 기존 main 접근권한과 CI check 이름을 캡처한다. 문제가 생기면 ruleset을
삭제하지 말고 이전 version을 복원한다.

## 권장 Vercel 설정

- staging/prod 별도 project 또는 target, 서울 `icn1`
- 환경마다 별도 `VERCEL_PROJECT_ID`, deploy token, `LETS_NETWORK_KEY_SECRET`
- `LETS_ENV`, `LETS_REVISION`, rate/concurrency 값 명시
- production domain auto-assignment를 끄고 tested staged production만 promote
- `/mcp` WAF 60초/120 요청을 staging 7일 Log 후 승인해 Rate Limit
- JSON audit sink 14일 TTL, 최소 RBAC, sink 실패 경보

WAF 오탐은 이전 firewall version을 복원하고 application limit은 승인된 환경 변수 변경과
재배포로 되돌린다. secret은 값 공개 없이 provider version을 복원/회전한다. production
deployment는 Vercel Instant Rollback을 사용한다.

## 공개 Plugin 설정

- `PRIVACY.md`, `TERMS.md`, `SUPPORT.md`, `SECURITY.md`의 main URL 확인
- GitHub private vulnerability reporting 실제 제출 테스트
- ChatGPT developer mode에서 prod MCP를 등록해 받은 `plugin_asdk_app...` ID 승인
- 별도 새 Codex 계정/컴퓨터의 #15 UI 인수 확인

기술 ID가 없으면 `.app.json`을 만들지 않는다. 공개 directory 제출을 되돌릴 때에는 새
Plugin version을 unavailable 처리하고 MCP endpoint를 fail-closed로 유지하며, 기존 설치가
stale 정책으로 성공하지 않는지 확인한다.

## 코드 되돌리기

#16 PR을 revert하면 workflow, policy diff guard, secret/plugin scan, source artifact,
CODEOWNERS, runbook과 공개 문서가 제거된다. 이미 적용한 GitHub/Vercel/WAF/sink 설정은
Git commit revert로 돌아가지 않으므로 각각 저장한 provider 설정 version을 복원해야 한다.

## Dependency override 기록

Next/Vite clean-room E2E가 가져오는 transitive `sharp`와 `postcss`는 2026-07
GitHub-reviewed advisory의 패치 버전 이상으로 root override한다. 이는 production MCP
runtime 경로는 아니지만 CI가 신뢰하지 않은 fixture를 build할 수 있어 동일하게 보호한다.
주간 Dependabot과 `pnpm audit:dependencies`가 새 패치를 알리며, upstream Next가 안전한
버전을 직접 고정하면 override를 제거하고 전체 E2E/audit를 다시 실행한다.
