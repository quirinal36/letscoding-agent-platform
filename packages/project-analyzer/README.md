# `@letscoding/project-analyzer`

제한된 프로젝트 metadata로 단일 HTML, 순수 정적 프로젝트, Vite, Next.js와
generic static 프로젝트를 판별하고 라운지 정적 배포 위험을 구조화한다. build를
실행하거나 사용자 소스를 수정하지 않는다.

## 입력 경계

- 파일 목록: 최대 2,000개
- 전체 내용: 최대 512 KiB
- `package.json`: 최대 256 KiB
- Vite/Next/TypeScript 설정: 파일당 최대 128 KiB
- `src/`, `app/`, `pages/`, `public/`, `styles/`의 선택된 HTML/CSS/JS/TS 발췌:
  파일당 최대 32 KiB
- `.env*`, lockfile 내용, binary/build 출력 내용은 거부

파일 목록만으로 route/API 구조를 판정하고, 필요한 설정 또는 최소 발췌만
`content`로 보낸다. 결과는 원문이나 환경변수 값을 반사하지 않고 파일 경로와
안정적인 code만 근거로 제공한다.

```ts
import { analyzeProject } from "@letscoding/project-analyzer";

const result = analyzeProject({
  policy,
  files: [
    { path: "package.json", sizeBytes: 300, content: packageJsonText },
    { path: "vite.config.ts", sizeBytes: 200, content: viteConfigText },
    { path: "src/main.ts", sizeBytes: 1000 },
  ],
});
```

결과에는 정책 ID/version, 프레임워크/version/confidence/evidence, package
manager, 예상 build 명령과 출력 폴더, blocker/error/warning/recommendation,
최종 checklist가 포함된다. blocker 또는 error가 하나라도 있으면 `pass=false`다.
