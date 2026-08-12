# MCP `analyze_project` 도구

상태: 구현됨

관련 이슈: #10

## 정책과 분석 순서

도구는 요청마다 `get_policy`와 같은 repository에서 현재 또는 명시한 immutable 정책
snapshot을 먼저 읽는다. 선택한 정책 문서를 공용 `@letscoding/project-analyzer`에
전달하므로 응답의 `policyId`, `policyVersion`, `result.policy`가 같은 버전을 가리킨다.
정책 조회가 실패하면 분석하지 않으며 stale 정책으로 성공 처리하지 않는다.

분석기는 코드를 실행하거나 build하지 않는다. 단일 HTML, 순수 정적 프로젝트, Vite,
Next.js를 감지하고 지원을 확정할 수 없는 경우 generic static 진단과 checklist를
반환한다. 결과에는 프레임워크/version/confidence와 파일 경로 기반 evidence, package
manager, build 명령, 출력 폴더, blocker/error/warning/recommendation, 최종 artifact
checklist가 있다.

## 서버 입력 경계

MCP runtime Schema가 analyzer와 같은 allowlist·byte limit를 공유한다.

| 입력                         | 제한                         |
| ---------------------------- | ---------------------------- |
| 파일 metadata                | 최대 2,000개                 |
| 모든 `content`의 UTF-8 합계  | 최대 512 KiB                 |
| `package.json`               | 최대 256 KiB                 |
| Vite/Next/TypeScript 설정    | 파일당 최대 128 KiB          |
| 선택된 HTML/CSS/JS/TS 발췌   | 파일당 최대 32 KiB           |
| `.env*`, lockfile, 기타 파일 | metadata만 허용, 내용은 거부 |

중복 경로와 전체 한도 초과도 handler 실행 전에 거부한다. analyzer는 source excerpt,
package.json 원문, URL, 환경변수 이름·값을 결과에 복사하지 않고 안정적인 진단 코드와
관련 파일 경로만 반환한다. 서버는 사용자 소스를 수정하거나 로컬 shell/GitHub 권한을
대행하지 않는다.

## 사람의 승인과 되돌리기

현재 별도의 운영 승인 항목은 없다. 정책상 warning은 후속 artifact 검증/보고에서
사용자가 사유를 확인할 수 있지만, 이 도구가 임의로 waiver를 승인하지 않는다.

구현을 되돌리려면 #10 PR의 연결 커밋을 revert한다. 그러면 MCP
`analyze_project`는 이전 `TOOL_NOT_IMPLEMENTED` fail-closed 상태로 돌아가고 공용
analyzer 패키지는 #7 변경으로 남는다. 입력 한도를 넓히거나 source 종류를 추가하려면
개인정보·비밀값 전송 위험을 먼저 검토하고 이 문서와 계약 테스트를 함께 변경한다.
