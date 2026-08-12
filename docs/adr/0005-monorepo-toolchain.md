# ADR-0005: 모노레포는 pnpm 11과 Node.js 24 LTS를 사용한다

- 상태: 승인됨
- 결정일: 2026-08-12
- 결정 책임자: `@quirinal36` (초기 Technical Maintainer)
- 승인자: `@quirinal36` (2026-08-12 작업 세션에서 승인)
- 관련 이슈: [#1](https://github.com/quirinal36/letscoding-agent-platform/issues/1), [#2](https://github.com/quirinal36/letscoding-agent-platform/issues/2)

## 맥락

MCP app, Plugin, policy contract, artifact validator, auth와 audit package가 하나의 TypeScript 모노레포에서 개발된다. package manager와 Node.js 지원 범위를 먼저 고정해야 lockfile, CI, Vercel runtime과 로컬 validator가 같은 조건으로 재현된다.

2026-08-12 기준 Node.js 24는 LTS이고 2028-04 말까지 지원 예정이다. pnpm 11.21.0은 Node.js `>=22.13`을 요구하며 Node.js 24와 호환된다.

## 결정 기준

- workspace package 간 명시적 의존성과 빠른 설치
- 단일 lockfile과 package manager version 재현
- Vercel Node.js runtime 및 MCP TypeScript SDK 호환
- 지원 기간이 충분한 LTS major
- macOS/Linux/Windows 개발과 CI 일관성

## 검토한 선택지

### package manager

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| pnpm workspace | 엄격한 의존성 해석, 저장 공간 효율, 성숙한 workspace filter | 팀이 pnpm 명령을 익혀야 함, hoisting 가정이 있는 도구 조정 필요 |
| npm workspace | Node.js 기본 도구, 별도 bootstrap이 적음 | 대형 모노레포 filter/캐시 UX와 엄격성이 pnpm보다 낮음 |
| Yarn Berry | 강력한 workspace/constraints | PnP 호환성 또는 node_modules 설정 선택 부담 |
| Bun | 빠른 install/runtime | MCP/Vercel/Node production과 런타임 차이, 장기 호환성 검증 부담 |

### Node.js

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| Node.js 24 LTS | 현재 LTS, 2028-04까지 지원, 기존 Node 생태계와 일치 | 최신 Current 기능은 사용하지 못함 |
| Node.js 22 LTS | 더 오래 검증됨 | 더 이른 수명 종료와 조기 upgrade 필요 |
| Node.js 26 Current | 최신 기능 | 2026-08-12 현재 LTS가 아니므로 production 기준에 부적합 |

## 결정

1. 유일한 package manager는 `pnpm@11.21.0`이다.
2. root `package.json`의 `packageManager` 필드에 exact version과 integrity 정보를 기록하고 Corepack으로 활성화한다. CI에서 다른 package manager lockfile을 거부한다.
3. 지원 Node.js 범위는 `>=24 <25`다. 개발·CI·Vercel production major를 모두 24로 맞춘다.
4. repository에는 `.nvmrc`/`.node-version` 중 팀 도구가 쓰는 파일에 `24`를 기록하고 `package.json#engines.node`에도 같은 범위를 둔다.
5. `pnpm-lock.yaml`은 반드시 commit하고 CI 설치는 frozen lockfile로 수행한다.
6. workspace package는 필요한 의존성을 직접 선언하고 내부 package는 `workspace:` protocol을 사용한다. phantom dependency에 기대지 않는다.
7. Node.js minor/patch는 CI가 같은 24 LTS major 안에서 정기 갱신한다. 보안 release는 우선 적용하되 major 변경은 새 ADR가 필요하다.
8. pnpm exact version 변경은 lockfile과 clean-checkout install을 검증하는 전용 dependency PR로 한다.

Issue #2가 이 결정을 실제 root workspace, runtime pin, scripts와 CI matrix로 구현한다. 이 ADR에서는 아직 빈 package/app 디렉터리를 만들지 않는다.

## 결과와 트레이드오프

- 공용 TypeScript package와 Vercel MCP app이 같은 Node API/모듈 조건을 사용한다.
- exact pnpm pin과 frozen lockfile로 clean checkout 재현성이 높아진다.
- `>=24 <25`는 Node 22 환경 사용자를 제외한다. 대상은 배포 service와 Plugin이 호출하는 bundled CLI이므로 지원 표면 축소를 우선한다.
- Corepack 배포 정책이 바뀌면 CI bootstrap 명령은 조정할 수 있지만 pnpm/version 결정은 유지한다.

## 후속 검증

- Issue #2에서 macOS/Linux/Windows 또는 동등한 CI matrix로 install, lint, typecheck, test, build를 검증한다.
- Vercel 프로젝트가 Node.js 24를 지원하고 실제 배포 runtime이 24인지 smoke test에 기록한다.
- `pnpm@11.21.0`의 registry integrity와 engine 요구사항을 root manifest 작성 시 다시 확인한다.

## 참고 자료

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases) — Node.js 24 LTS 상태 (2026-08-12 확인)
- [Node.js 24 LTS announcement](https://nodejs.org/en/blog/release/v24.11.0) — 2028-04까지 지원 예정 (2026-08-12 확인)
- [pnpm](https://pnpm.io/) — workspace 중심 package manager 문서 (2026-08-12 확인)
