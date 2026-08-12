# 렛츠코딩 에이전트 플랫폼

Lounge Deploy MCP와 공용 계약·검증 모듈을 함께 개발하는 TypeScript 모노레포다. 이 저장소의 런타임과 패키지 관리 기준은 [ADR-0005](docs/adr/0005-monorepo-toolchain.md)를 따른다.

## 개발 환경

- Node.js `>=24 <25`
- Corepack
- `pnpm@11.21.0`

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`package.json#packageManager`, `.nvmrc`, `.node-version`, `engines`, lockfile을 함께 유지한다. pnpm 외의 패키지 관리자로 설치하거나 다른 종류의 lockfile을 루트에 추가하면 검사가 실패한다.

## 명령

| 명령                | 설명                                           |
| ------------------- | ---------------------------------------------- |
| `pnpm lint`         | 전체 TypeScript와 JavaScript lint              |
| `pnpm format`       | Prettier로 지원 파일 포맷                      |
| `pnpm format:check` | 포맷 변경 없이 검사                            |
| `pnpm typecheck`    | 모든 workspace 타입 검사                       |
| `pnpm test`         | 모든 workspace smoke test 실행                 |
| `pnpm build`        | 의존 순서대로 모든 workspace 빌드              |
| `pnpm check`        | lint, format, typecheck, test, build 전체 실행 |

개별 workspace에서도 같은 `lint`, `typecheck`, `test`, `build` 명령을 실행할 수 있다.

## 저장소 구조

```text
apps/lounge-deploy-mcp/       원격 MCP 서비스
plugins/lounge-deploy/        Codex Plugin 배포 단위
packages/policy-contract/     정책 계약
packages/artifact-validator/  artifact 검증기
packages/mcp-auth/            MCP 인증·권한 공통 모듈
packages/audit-log/           감사 로그 공통 모듈
policies/lounge-deploy/       중앙 정책 원본
tests/policy-contract/        정책 계약 통합·fixture 테스트
tests/fixtures/               공용 테스트 fixture
```

## Workspace 규칙

- 앱은 공용 패키지를 `workspace:*` 의존성으로만 참조한다.
- 공용 패키지는 `apps/`나 `plugins/`에 의존할 수 없다.
- 내부 패키지 의존성은 반드시 해당 `package.json`에 직접 선언한다.
- 각 TypeScript workspace의 공개 API는 `src/index.ts` 한 곳에서만 노출한다.
- 소비자는 패키지 루트만 import한다. `exports`가 선언하지 않은 deep import는 허용하지 않는다.
- 빌드는 ESM JavaScript, source map, TypeScript 선언과 declaration map을 `dist/`에 생성한다.

현재 workspace의 소스는 후속 기능 이슈를 위한 빈 공개 entry point와 smoke test만 포함한다. 정책 규칙, artifact 검증, MCP 인증과 Plugin 동작은 이 단계의 범위가 아니다.
