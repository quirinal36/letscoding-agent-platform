# 정책 발행·긴급 변경 runbook

## 일반 발행

1. 기존 `history/`를 수정하지 않고 새 `YYYY-MM-DD.N.json`과 `.md`를 만든다.
2. JSON에 새 version, UTC `effectiveAt`, 구체적 `changeReason`, Markdown hash를 기록한다.
3. `current.json`과 `framework-guide.md`를 같은 PR에서 새 snapshot으로 전환한다.
4. 정책/검증기 의미가 바뀌면 Schema, error code 문구와 정상·실패 ZIP fixture도 같은 PR에서
   갱신한다.
5. PR template의 정책 체크를 작성하고 CODEOWNER 승인을 받는다. 1인 운영에서는 공개 PR,
   immutable guard, 전체 CI를 보완 통제로 사용한다.
6. `pnpm verify:policy-change -- --base <base-sha>`, `pnpm check`와 전체 Plugin E2E를 확인한다.
7. main 병합 후 배포 runbook으로 staging→production을 승격한다. workflow revision과
   production audit의 policy version을 발행 기록에 링크한다.

CI는 과거 history의 수정·삭제·rename, 새 snapshot의 포인터 없는 추가, JSON/Markdown
짝 누락, 활성 guide 누락, version/effective time/change reason 불일치를 차단한다.

## 정책 rollback/replay

과거 snapshot 파일이나 기존 `current.json` commit을 직접 되돌리지 않는다. 되돌릴 규칙을
복사한 새 version을 만들고 `changeReason`에 대상 과거 version과 사고 이유를 기록한다.
이 방식으로 과거 실행은 원래 version으로 계속 재현되고 새 활성화 시점도 남는다.

과거 결과를 replay할 때에는 `get_policy(version=<recorded>)`로 snapshot/hash를 확인하고
당시 artifact manifest를 동일 validator version에서 검사한다. ZIP 원문을 중앙 감사
로그에서 복구하려 하지 않는다.

## 긴급 보안 정책

1. Incident Commander가 악성 artifact, 비밀 노출, 인증 우회 등 즉시 위험과 영향을 기록한다.
2. 범위를 확대하지 않는 최소 차단만 새 emergency version으로 작성한다.
3. actor, UTC 승인·활성화 시각, 사유, 영향, rollback version을 private incident record와
   PR에 남긴다.
4. 가능한 모든 CI와 staging smoke를 수행한다. 생략한 검사는 production 승인 전에
   명시하고 자동 성공으로 취급하지 않는다.
5. 다음 영업일 안에 정상 PR, 회귀 fixture, Policy Owner 사후 승인과 incident review를
   완료한다.

정책 source 장애 중에는 local/stale snapshot을 current처럼 제공하지 않는다. 복구 전까지
Plugin은 완료 문구를 사용하지 않는다.
