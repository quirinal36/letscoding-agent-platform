# Policy contract tests

저장소에 발행된 `policies/` 트리의 계약 테스트를 두는 workspace다.

- 활성 `current.json` → `history/<version>` 참조 무결성
- `framework-guide.md`와 활성 가이드 스냅샷의 동일성
- 발행된 모든 스냅샷의 Schema·가이드 해시 만족
- 정책 오류 코드와 한국어 문구의 양방향 커버리지

Schema 단위 테스트와 파서 동작 테스트는 `packages/policy-contract`에 있다. 이
workspace는 빌드된 `@letscoding/policy-contract`를 사용하므로 `pnpm build` 뒤에
실행한다. 루트 `pnpm check`가 그 순서를 보장한다.
