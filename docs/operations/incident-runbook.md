# 장애·버전 불일치 runbook

## 최초 10분

1. incident ID, 시작 시각, 신고자, 환경, revision, 예상 policy version을 기록한다.
2. `/health`와 `/ready`를 호출한다. response와 배포 revision이 다르면 traffic 승격을 중단한다.
3. 사용자에게 받은 redacted request ID로 JSON audit event를 찾는다. payload나 source/ZIP
   원문을 요청하지 않는다.
4. 영향이 정책 조회 전체인지, 특정 도구인지, rate limit/WAF인지 분류한다.
5. stale policy 성공을 만들지 않는다. 필요한 경우 endpoint를 fail-closed 상태로 유지하고
   상태를 공지한다.

## 증상별 대응

| 증상                         | 확인                                | 조치                                                               |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `POLICY_SERVICE_UNAVAILABLE` | readiness, bundle revision          | 최근 정상 deployment rollback 또는 bundle 수정 PR                  |
| `POLICY_BUNDLE_INVALID`      | current/history/guide hash          | production 승격 중단, 정책 발행 runbook으로 새 version             |
| `REVALIDATION_REQUIRED` 급증 | 활성화 시각·version                 | 정상 정책 전환이면 안내, 반복 loop면 Plugin/MCP revision 일치 확인 |
| 429 급증                     | 일일 network key 집계, 학교 공유망  | WAF Log와 앱 제한 비교, 승인 후 제한 조정                          |
| 503/latency 급증             | concurrent/timeout, provider status | 남용 traffic 차단, 직전 revision rollback                          |
| request ID audit 누락        | sink 오류 `AUDIT_WRITE_FAILED`      | sink 권한/용량 복구, 개인정보 없는 최소 event만 재개               |

## 종료와 사후 검토

canonical health/ready/MCP smoke, 오류율·latency 정상화, audit sink 수신을 확인한다. 종료
시각, 영향 사용자 범위, 원인 revision/policy, 완화·복구, 누락 데이터, 후속 owner/date를
기록한다. 로그 보존을 임의 연장하지 말고 법적/보안 필요 시 별도 승인한다.
