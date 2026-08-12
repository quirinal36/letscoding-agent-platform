# Test fixtures

여러 workspace가 공유하는 정상·실패 fixture를 두는 디렉터리다.

```text
policies/valid/     계약을 만족하는 정책 문서
policies/invalid/   거부되어야 하는 정책 문서. 파일명이 실패 사유다.
```

`policies/invalid/`의 각 파일은 **하나의 실패 사유**만 담는다. 기대하는
`POLICY_*` 오류 코드는 `packages/policy-contract/src/parse.test.ts`의
`INVALID_FIXTURES` 표에 있다. 새 검증 규칙을 추가하면 fixture와 그 표를 함께
갱신한다.

`artifacts/`는 ZIP과 출력 폴더 검사기의 보안 fixture 생성 방법을 설명한다.
일반 도구가 만들지 못하는 손상 ZIP이 포함되므로 바이너리 대신 결정적 생성기와
기대 code를 테스트한다.
