# 관측성·감사 보존 기준

## 대시보드

JSON audit `schemaVersion=1`을 기준으로 5분/1시간 창에서 다음을 집계한다.

- 전체 및 tool별 `result.status`, 오류율, `result.code`, finding code
- p50/p95/p99 `latencyMs`
- `rate-limited`, `overloaded`, `REVALIDATION_REQUIRED`
- policy ID/version과 service `revision` 조합
- artifact file count·크기 분포(원문 path/내용 없음)
- `AUDIT_WRITE_FAILED`, readiness 실패

초기 경보 권장값은 5분 오류율 2% 초과, 10분 p95 2초 초과, 5분 503 1% 초과,
readiness 2회 연속 실패, audit sink 1회 실패다. 429는 학교 공유망 오탐을 고려해 절대
건수와 전체 비율을 함께 보고 7일 staging Log 결과로 조정한다. 정책 활성화 뒤
`REVALIDATION_REQUIRED`는 예상되지만 30분 이상 지속되면 version loop로 조사한다.

## 추적 절차

request ID → environment/revision → tool/result code → policy version → artifact metadata 순서로
좁힌다. 일일 network key는 같은 날의 반복 남용 묶음에만 사용하고 개인 identity로
해석하지 않는다. IP, user/org header, source, ZIP, `.env`, report body, stack을 대시보드에
추가하지 않는다.

## 보존과 접근

- raw audit: 14일 후 자동 삭제
- 장기 추세: 개인/네트워크 가명키와 artifact hash를 제거한 집계만 유지
- 접근: Platform Owner와 지정 Security operator 최소 인원
- export/download: incident 승인과 만료 시각 필요
- production과 staging sink/secret 분리

Vercel dashboard의 실제 alert, WAF, sink retention/RBAC는 repository 밖 설정이다. 값과
담당자를 `approvals-and-rollback.md` 체크리스트로 승인한 뒤 production gate를 연다.
