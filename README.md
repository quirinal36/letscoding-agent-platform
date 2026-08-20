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

| 명령                      | 설명                                               |
| ------------------------- | -------------------------------------------------- |
| `pnpm lint`               | 전체 TypeScript와 JavaScript lint                  |
| `pnpm format`             | Prettier로 지원 파일 포맷                          |
| `pnpm format:check`       | 포맷 변경 없이 검사                                |
| `pnpm typecheck`          | 모든 workspace 타입 검사                           |
| `pnpm test`               | 모든 workspace test 실행                           |
| `pnpm build`              | 의존 순서대로 모든 workspace 빌드                  |
| `pnpm check`              | lint, format, build, typecheck, test 전체 실행     |
| `pnpm audit:dependencies` | production graph의 high 이상 advisory 검사         |
| `pnpm verify:plugin`      | Plugin manifest, MCP, Skill, marketplace 계약 검사 |
| `pnpm verify:secrets`     | Git 추적 파일의 credential 패턴 검사               |

개별 workspace에서도 같은 `lint`, `typecheck`, `test`, `build` 명령을 실행할 수 있다.

`tests/policy-contract`처럼 다른 workspace 패키지를 `workspace:*`로 참조하는
workspace는 그 패키지의 `dist` 타입 선언을 사용한다. 따라서 `build`가
`typecheck`, `test`보다 먼저 실행된다. 깨끗한 checkout에서는 `pnpm check` 또는
`pnpm build` 뒤에 개별 명령을 실행한다.

## 저장소 구조

```text
apps/lounge-deploy-mcp/       원격 MCP 서비스
plugins/lounge-deploy/        Codex Plugin 배포 단위
packages/policy-contract/     정책 계약
packages/artifact-validator/  artifact 검증기
packages/project-analyzer/    정적 배포 호환성 분석기
packages/mcp-auth/            MCP 인증·권한 공통 모듈
packages/audit-log/           감사 로그 공통 모듈
policies/lounge-deploy/       중앙 정책 원본
tests/policy-contract/        발행된 정책 트리의 참조 무결성 테스트
tests/plugin-e2e/             실제 Vite/Next build 포함 clean-room Plugin E2E
tests/operations/             정책 불변성·배포 workflow 운영 계약 테스트
tests/fixtures/               공용 테스트 fixture
```

`policies/`는 Prettier 대상이 아니다. 발행된 스냅샷은 불변이고
`framework-guide.md`는 활성 스냅샷과 byte 단위로 같아야 하므로, 재포맷이 정책
해시와 복사본 일치를 깨뜨린다.

## Workspace 규칙

- 앱은 공용 패키지를 `workspace:*` 의존성으로만 참조한다.
- 공용 패키지는 `apps/`나 `plugins/`에 의존할 수 없다.
- 내부 패키지 의존성은 반드시 해당 `package.json`에 직접 선언한다.
- 각 TypeScript workspace의 공개 API는 `src/index.ts` 한 곳에서만 노출한다.
- 소비자는 패키지 루트만 import한다. `exports`가 선언하지 않은 deep import는 허용하지 않는다.
- 빌드는 ESM JavaScript, source map, TypeScript 선언과 declaration map을 `dist/`에 생성한다.

`packages/policy-contract`는 정책 Schema·타입·버전 규칙·오류 코드 계약을 제공한다. 자세한 규칙은 [패키지 README](packages/policy-contract/README.md)에 있다.

`apps/lounge-deploy-mcp`는 공식 MCP SDK의 stateless Streamable HTTP transport와
네 public 도구의 runtime 입출력 계약, 공통 오류 envelope, health/readiness 및
Vercel `icn1` adapter를 제공한다. `get_policy`, `analyze_project`,
`validate_artifact`, `create_report`는 각각 정책 저장소, 공용 분석기·검증기와 결정적
보고서 생성기에 연결되어 있다.

`packages/artifact-validator`는 manifest 결정적 검증과 Node.js용 ZIP·출력 폴더
검사 API/CLI를 제공한다. ZIP byte와 파일 내용을 결과에 복사하지 않으며 stream
inflate 제한, CRC/SHA-256, symlink 차단을 적용한다. 익명 MCP 접근 경계와 감사
로그는 `packages/mcp-auth`, `packages/audit-log`에, 설치·실행 흐름은
`plugins/lounge-deploy`에 구현되어 있다.

운영 절차는 [운영 인덱스](docs/operations/README.md)에 있다. CI는 세 운영체제의 전체
검사, high dependency audit, 정책 history 불변성, Plugin/비밀 검사와 revision별 source
artifact를 제공한다. production은 수동 workflow가 main의 정확한 SHA를 staging에서
검증하고 traffic 없는 production deployment를 smoke한 뒤 승인된 같은 deployment만
promote한다.

Plugin은 로컬 ZIP을 만들고 검증할 뿐 실제 Lounge 등록·업로드·공개를 하지 않는다.
지원, 보안 신고, 개인정보 및 이용 조건은 각각 [SUPPORT.md](SUPPORT.md),
[SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [TERMS.md](TERMS.md)를 따른다.
