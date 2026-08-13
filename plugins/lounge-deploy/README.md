# Lounge Deploy Plugin

Codex에서 단일 HTML, 정적 HTML/CSS/JavaScript, Vite, Next.js 정적 export를
라운지 수동 업로드용 ZIP으로 만들고 최신 중앙 정책으로 검증하는 공개 Plugin이다.
실제 Lounge 업로드·등록·공개는 수행하지 않는다.

## 개발 설치

repository marketplace를 등록하고 Plugin을 설치한다.

```sh
codex plugin marketplace add quirinal36/letscoding-agent-platform \
  --sparse .agents/plugins \
  --sparse plugins/lounge-deploy
codex plugin add lounge-deploy@letscoding-agent-platform
```

새 thread를 시작한 뒤 MCP 목록에서 `lounge-deploy`와 `get_policy`,
`analyze_project`, `validate_artifact`, `create_report`를 확인한다. 1차 MCP는
ADR-0002에 따라 익명이므로 별도 로그인이나 token을 넣지 않는다. 연결 또는 정책
조회가 실패하면 Plugin은 오래된 정책으로 진행하지 않는다.

예시 요청:

> 이 프로젝트를 라운지 작품 업로드용 ZIP으로 만들고 검증해줘.

## 데이터와 권한 경계

- 로컬: 프로젝트 읽기·최소 수정, build, 번들된 validator 실행, ZIP 생성
- MCP 전송: 제한된 metadata/config, manifest·크기·hash, 구조화 분석·검증 결과
- 미전송: 전체 source, 파일 내용, ZIP 원문, `.env` 값, token, 학생 개인정보
- 외부 write: 없음. 사용자가 결과 ZIP을 직접 Lounge에 업로드

경고 waiver만 현재 정책이 허용할 때 사용자 확인과 명시적 사유를 요구한다. 소스
삭제, 전체 재작성, lint/typecheck 비활성화는 기본 동작이 아니다.

## 검증

```sh
corepack pnpm --filter @letscoding/lounge-deploy-plugin build
corepack pnpm --filter @letscoding/lounge-deploy-plugin test
python3 ~/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/lounge-deploy/skills/lounge-deploy
python3 ~/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/lounge-deploy
```

build는 공용 validator와 policy contract의 실행 JS 및 transitive runtime을
`runtime/`에 결정적으로 다시 생성한다. 설치된 Plugin은 별도 npm package 설치 없이
Node.js 24로 `skills/lounge-deploy/scripts/validate-artifact.mjs`를 실행한다.
