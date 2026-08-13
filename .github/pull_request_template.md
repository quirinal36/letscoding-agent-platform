## 변경 요약

- 무엇을 왜 바꾸는가:

## 검증

- [ ] `pnpm check`
- [ ] dependency/secret/Plugin gate
- [ ] 사용자 데이터·ZIP 원문·환경값을 새로 저장하거나 전송하지 않음

## 정책 변경인 경우

- [ ] 새 `history/<version>.json`과 `.md`, `current.json`, `framework-guide.md`를 같은 PR에서 변경
- [ ] version, effective time, change reason을 검토
- [ ] 전체 ZIP fixture 회귀 통과
- [ ] Policy Owner/Approver 승인
- [ ] emergency이면 actor·시각·사유·영향·다음 영업일 사후 검토를 기록

## 운영 변경인 경우

- [ ] staging에서 같은 revision을 검증
- [ ] production Environment 승인과 rollback 대상을 기록
- [ ] 관측성·WAF·감사 보존 영향 확인
