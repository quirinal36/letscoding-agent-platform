# Lounge Deploy Plugin clean-room E2E 증빙

상태: 자동 E2E 구현됨, 별도 실제 계정의 UI 인수 확인 대기

관련 이슈: #15

## 권장 검증 모델

권장안은 PR마다 실행하는 결정적 clean-room E2E와 출시 직전 사람이 수행하는 새 계정
인수 확인을 분리하는 것이다. 자동 E2E는 fixture를 매번 임시 프로젝트로 복사하고 로컬
가이드나 사전 대화 없이 다음 순서를 실행한다.

1. 활성 `get_policy`와 content hash 기록
2. allowlist된 metadata/config만 `analyze_project`에 제공
3. 실제 Vite 또는 Next.js build 실행
4. 선택된 출력 폴더를 로컬 validator로 검사
5. ZIP 직전 활성 정책 재조회
6. 출력 폴더의 내용만 ZIP 루트에 패키징하고 다시 검사
7. `validate_artifact`와 `create_report`로 최종 version·metadata·한국어 보고 확인

Vite 8.1.5와 Next.js 16.2.12를 테스트 전용으로 정확히 고정했다. 두 버전은 구현 시점
공식 npm `latest` stable이다. install script 권한은 이 E2E에 필요한 lockfile 고정
`esbuild`와 `sharp`만 `pnpm-workspace.yaml`에서 허용한다.

## 자동 증빙

2026-08-13 macOS, Node.js 24, pnpm 11.21.0에서 다음을 확인했다.

| 시나리오            | 증빙                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| 단일 `index.html`   | build 없음, ZIP 루트 index, 최종 PASS·완료 보고                         |
| 순수 HTML/CSS/JS    | 상대 자산 보존, 출력 내용만 ZIP, 최종 PASS                              |
| Vite                | 실제 `vite build`, `dist`, 상대 `./assets/`, 최종 PASS                  |
| Next.js             | 실제 `next build`, `out`, 상대 `./_next/`, 최종 PASS                    |
| Vite/Next 설정 오류 | `PROJECT_VITE_BASE_MISSING`, `PROJECT_NEXT_OUTPUT_EXPORT_MISSING`       |
| server route        | `LD_NEXT_SERVER_RUNTIME_REQUIRED` blocker                               |
| 비정상 ZIP          | 백슬래시와 `.env`를 stable code로 실패 처리                             |
| 정책 변경           | 구 version 결과를 `REVALIDATION_REQUIRED`로 거부 후 활성 version 재검증 |
| 정책 장애           | `POLICY_SERVICE_UNAVAILABLE`, stale 성공 없음                           |
| runtime env/API/CSP | 값은 반환하지 않고 migration·origin·root asset warning code만 반환      |

실행 명령:

```sh
corepack pnpm --filter @letscoding/plugin-e2e test
corepack pnpm check
```

테스트는 ZIP 절대 경로, 압축·해제 크기, 파일 수, artifact/file-set SHA-256,
policy version, root `index.html`, 남은 제한이 구조화 보고와 Markdown에 함께 있는지
확인한다. fixture와 임시 프로젝트에는 `framework_guide.md`가 없다.

## 범위 조정: 로그인과 인증 만료

ADR-0002와 #13에 따라 1차 MCP는 익명이다. 따라서 이슈 원문의 “MCP 로그인”과
“인증 만료”를 존재하지 않는 token 흐름으로 흉내 내지 않는다. Plugin manifest에
credential이 없고 네 공개 도구만 노출되는지를 검사하며, 연결·정책 source 장애는
fail-closed로 검증한다. 향후 OAuth/JWT를 도입하면 새 인증 ADR과 별도 만료 E2E가
필수다.

## 사람이 수행할 출시 인수 확인

자동화가 별도 Codex 계정·컴퓨터의 UI를 생성하거나 사용자의 계정 설정을 변경하지는
않는다. Product Owner는 #16 production revision이 준비된 뒤 다음을 한 번 수행하고
issue/PR에 화면 또는 transcript를 첨부한다.

1. 저장소를 clone하지 않은 새 Codex 계정/컴퓨터에서 repository marketplace를 등록한다.
2. `lounge-deploy` Plugin을 설치하고 새 thread를 연다.
3. 별도 MCP login 요구가 없고 네 도구가 연결되는지 확인한다.
4. 제공된 Vite fixture에 “라운지 작품 업로드용 ZIP으로 만들어줘”만 요청한다.
5. ZIP metadata와 report policy version이 production MCP 최종 응답과 같은지 확인한다.
6. 실제 Lounge 업로드·등록·공개가 일어나지 않았는지 확인한다.

승인이 보류되어도 자동 계약 증빙을 완료로 가장하지 않고 이 문서의 상태를 유지한다.
production endpoint가 없을 때에는 #14 원본 manifest를 수정하지 말고 임시 Plugin copy의
endpoint만 staging으로 바꾼다.

## 대안과 되돌리기

대안은 실제 Codex UI E2E만 수동 수행하는 것이다. LLM·네트워크 변화는 확인할 수 있지만
회귀 재현성과 Windows/macOS/Linux 증빙이 약해 권장하지 않는다.

#15 변경을 revert하면 test workspace, fixture와 `esbuild`/`sharp` build allowlist가 함께
제거된다. 특정 framework 의존성 사고가 발생하면 해당 버전을 lockfile에서 교체하고
E2E를 재실행한다. 긴급 시 해당 정상 fixture test만 임시 격리할 수 있지만 #16 release
gate는 초록색 전체 E2E 없이는 production 배포를 허용하지 않는다.

## 근거

- [Next.js npm package](https://www.npmjs.com/package/next)는 구현 시점 stable version과
  패키지 provenance를 제공한다.
- [Vite npm package](https://www.npmjs.com/package/vite)는 구현 시점 stable version과
  Node.js 호환 범위를 제공한다.
- [OpenAI Plugin packaging](https://developers.openai.com/plugins/build/plugins)은
  repository marketplace, Plugin manifest, bundled Skill/MCP 설치 단위를 정의한다.
