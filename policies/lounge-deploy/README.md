# Lounge Deploy 정책 원본

이 디렉터리가 Lounge Deploy 정책의 운영 원본이다. 규칙은
[ADR-0003](../../docs/adr/0003-policy-governance-and-environments.md)을 따른다.

```text
current.json                활성 버전을 가리키는 포인터
framework-guide.md          활성 가이드의 사람이 읽기 쉬운 복사본
history/<version>.json      발행된 불변 정책 스냅샷
history/<version>.md        같은 버전의 불변 가이드 스냅샷
```

## 규칙

- `history/`의 파일은 발행 후 수정하지 않는다. 잘못된 정책은 새 버전으로 고친다.
- `current.json`은 포인터일 뿐이며 정책 규칙 값을 복제하지 않는다. 스냅샷 경로는
  `history/<version>.json` 규약으로 파생한다.
- JSON 정책, Markdown 가이드, Schema/fixture, 버전·시행 시각·변경 사유를 같은
  PR에서 바꾼다.
- `framework-guide.md`는 활성 `history/<version>.md`와 내용이 같아야 한다.
- 이 디렉터리는 Prettier 대상이 아니다. 재포맷이 정책 해시와 복사본 일치를
  깨뜨린다.

## 발행 순서

1. 새 `history/<version>.md`를 작성한다.
2. 가이드의 sha256을 계산한다.
   ```sh
   node -e "const{createHash}=require('node:crypto');const{readFileSync}=require('node:fs');console.log(createHash('sha256').update(readFileSync(process.argv[1],'utf8').replace(/^﻿/,'').replace(/\r\n/g,'\n'),'utf8').digest('hex'))" policies/lounge-deploy/history/<version>.md
   ```
3. 같은 버전의 `history/<version>.json`을 작성하고 `guide.sha256`에 값을 넣는다.
4. `current.json`의 `version`과 `activatedAt`을 갱신한다.
5. `framework-guide.md`를 활성 가이드로 교체한다.
6. `pnpm check`로 계약과 참조 무결성을 확인한다.
7. `pnpm verify:policy-change -- --base <base-sha>`로 과거 history 불변성과 원자적 활성화를
   확인하고 CODEOWNER 승인을 받는다.
8. main 병합 후 staging에서 같은 revision을 검증하고 production Environment 승인으로
   traffic 없는 production deployment를 promote한다.

긴급 정책과 rollback도 과거 history를 수정하지 않고 새 version으로 발행한다. actor,
UTC 시각, 사유, 영향, rollback 대상을 기록하고 다음 영업일 안에 회귀 fixture와 사후
승인을 완료한다. 상세 절차는
[`policy-release-runbook.md`](../../docs/operations/policy-release-runbook.md)를 따른다.

정책 값의 의미와 계약 규칙은
[@letscoding/policy-contract](../../packages/policy-contract/README.md)에 있다.
