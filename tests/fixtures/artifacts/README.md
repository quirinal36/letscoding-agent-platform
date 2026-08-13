# Artifact 보안 fixture

ZIP fixture는 손상된 central directory, ZIP64 marker, multi-disk marker처럼 일반
압축 도구로 만들 수 없는 사례를 포함하므로 소스 저장소에 바이너리를 직접
보관하지 않는다. 다음 명령으로 결정적으로 생성한다.

```sh
corepack pnpm build
corepack pnpm --filter @letscoding/artifact-validator fixtures:generate
```

기본 출력은 이 디렉터리의 `generated/`이며 Git에는 추가하지 않는다. 검증기
테스트도 같은 생성 API를 임시 디렉터리에서 호출한다.

생성 목록은 단일 HTML, 순수 HTML/CSS/JS, Vite, Next.js 정상 ZIP과 wrapper,
백슬래시, traversal, `.env*`, mixed-case `runtime-config.js`, 손상 central
directory, local/central 이름 불일치, multi-disk, ZIP64, 잘린 ZIP을 포함한다.
