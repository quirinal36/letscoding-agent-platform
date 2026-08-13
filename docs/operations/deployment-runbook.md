# MCP 배포·승격·rollback runbook

## 정상 배포

1. 대상 full commit SHA가 `main`에 있고 CI의 세 OS, dependency audit, source artifact가
   모두 성공했는지 확인한다.
2. `Deploy Lounge Deploy MCP` workflow를 SHA와 함께 수동 실행한다.
3. `staging` Environment가 같은 SHA를 custom target에 배포하고 `/health`, `/ready`,
   MCP initialize smoke를 통과하는지 확인한다.
4. production 승인자는 SHA, policy version, 시행 시각·변경 사유, staging URL과 smoke,
   현재 rollback deployment를 기록한다.
5. `production` Environment를 승인한다. workflow는 `--prod --skip-domain`으로 traffic이
   없는 production artifact를 만든 뒤 같은 URL을 smoke하고 `vercel promote`한다.
6. canonical `/health`, `/ready`, `/mcp`가 같은 revision인지 확인한다. 15분 동안 error,
   latency, rate limit, audit sink를 관찰한다.

production job이 대상으로 삼는 revision은 verify job output 하나뿐이다. staging 이후
branch가 움직여도 checkout SHA가 바뀌지 않는다. promotion은 smoke한 production
deployment URL을 재빌드하지 않고 current로 바꾼다.

## 코드 rollback

1. 현재와 직전 정상 production deployment URL/revision을 기록한다.
2. Vercel Instant Rollback으로 직전 deployment를 current에 할당한다.
3. canonical health/ready revision과 MCP smoke를 확인한다.
4. request ID, 시작/복구 시각, 영향, rollback revision을 incident record에 남긴다.
5. main에는 원인 수정 또는 revert PR을 만들고 모든 gate를 다시 통과시킨다.

환경 변수나 secret 변경은 기존 deployment를 재빌드하지 않으므로 rollback 후에도 현재
설정과 호환되는지 확인한다. 호환되지 않으면 이전 secret/settings version을 먼저
복원한다.

## 배포 중단 조건

- staging/production candidate revision 불일치
- readiness의 정책 bundle 불일치 또는 `ready: false`
- MCP initialize 실패
- high 이상 dependency audit 또는 secret scan 실패
- production 승인자·rollback 대상·관측 창 미기록

중단 시 staging artifact는 traffic을 받지 않는다. production candidate는 promote하지
않고 Vercel에서 제거하거나 만료시킨다.
