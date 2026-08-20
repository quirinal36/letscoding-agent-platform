# Lounge Deploy 공개 Plugin 제출·게시 runbook

상태: 저장소 제출 자료 준비 중, production DNS·외부 운영 설정·게시자 승인 대기

이 문서는 OpenAI Platform의 public Plugin Submission Portal에 Lounge Deploy를
`With MCP`로 제출하는 절차와 증빙 원본이다. repository marketplace는 로컬·팀 배포용일
뿐이며 public directory 게시를 대신하지 않는다.

## 제출 전 차단 조건

다음 중 하나라도 충족하지 않으면 review 제출을 누르지 않는다.

- production Universal MCP `https://lounge-deploy-mcp.letscoding.kr/mcp`가 public HTTPS로
  initialize와 tool discovery를 완료한다.
- `/health`, `/ready`가 같은 승인 revision을 반환하고 policy probe가 성공한다.
- staging과 production candidate가 같은 full SHA로 smoke 및 rollback drill을 통과한다.
- production WAF, 별도 `LETS_NETWORK_KEY_SECRET`, 14일 audit 보존·RBAC·경보가 적용됐다.
- GitHub Private Vulnerability Reporting이 활성화되고 private 제출을 시험했다.
- 게시 조직에서 검증된 개인 또는 사업자 identity와 제출자의
  `Apps Management: Write` 권한을 확인했다.
- 지원 책임자, 게시 국가, logo와 listing 문구를 Product Owner가 승인했다.
- 별도 계정·컴퓨터의 실제 Plugin UI 인수 결과를 issue/PR에 첨부했다.

2026-08-13 외부 확인에서는 production hostname이 DNS에서 해석되지 않았다. DNS와
deployment 증빙이 생기기 전에는 MCP Scan과 domain verification을 완료로 표시하지
않는다.

## 제출 자료

| Portal 항목        | 값 또는 원본                                                                   | 상태            |
| ------------------ | ------------------------------------------------------------------------------ | --------------- |
| 제출 유형          | `With MCP` — Skill과 MCP 결합                                                  | 준비됨          |
| Plugin 이름        | `Lounge Deploy`                                                                | 준비됨          |
| Category           | `Developer Tools`                                                              | 준비됨          |
| Website            | `https://github.com/quirinal36/letscoding-agent-platform`                      | 공개 확인됨     |
| Support            | `https://github.com/quirinal36/letscoding-agent-platform/blob/main/SUPPORT.md` | 준비됨          |
| Privacy            | `https://github.com/quirinal36/letscoding-agent-platform/blob/main/PRIVACY.md` | 준비됨          |
| Terms              | `https://github.com/quirinal36/letscoding-agent-platform/blob/main/TERMS.md`   | 준비됨          |
| MCP URL type       | `Universal`                                                                    | 준비됨          |
| MCP URL            | `https://lounge-deploy-mcp.letscoding.kr/mcp`                                  | DNS/deploy 대기 |
| Authentication     | 없음 — 익명 public read/analyze/validate/report                                | 준비됨          |
| Logo               | Product Owner가 승인한 production asset                                        | 미준비          |
| Developer Identity | OpenAI Platform에서 검증된 개인/사업자                                         | 확인 필요       |
| Availability       | Product Owner가 승인한 국가 목록                                               | 미결정          |

짧은 설명:

> Build and validate static Lounge upload ZIPs against the latest Let's Coding policy.

긴 설명은
[`plugins/lounge-deploy/.codex-plugin/plugin.json`](../../plugins/lounge-deploy/.codex-plugin/plugin.json)의
`interface.longDescription`을 제출 원본으로 사용한다. 실제 Lounge 업로드·등록·공개를
하지 않고 source, ZIP bytes, 환경값과 credential을 MCP로 보내지 않는다는 경계를
삭제하거나 완화하지 않는다.

## MCP와 domain verification

1. Portal에서 `Create plugin` → `With MCP` → Universal URL을 선택한다.
2. production MCP URL을 입력하고 authentication은 anonymous/no sign-in으로 설정한다.
3. Portal이 domain challenge를 요구하면 발급된 token을 production의
   `LETS_OPENAI_APPS_CHALLENGE` secret으로 설정해 같은 revision을 재배포한다.
4. `https://lounge-deploy-mcp.letscoding.kr/.well-known/openai-apps-challenge`가 JSON이나
   줄바꿈 없이 정확한 token만 반환하는지 확인한다. token 값은 Git, 로그, issue에
   기록하지 않는다.
5. Scan Tools를 실행하고 네 도구만 발견되는지 확인한다.
6. 네 도구가 감사 event를 기록하므로 `readOnlyHint=false`, `idempotentHint=false`,
   `destructiveHint=false`, `openWorldHint=false`이며 strict input/output schema가
   표시되는지 확인한다.

## Portal 테스트 케이스

### Positive 5개

1. 단일 `index.html` 프로젝트 요청 — 분석, 로컬 ZIP 검사, 활성 정책 서버 재검증과
   완료 보고까지 `PASS`.
2. 상대 자산을 쓰는 순수 HTML/CSS/JavaScript 프로젝트 — 출력 내용만 ZIP root에 담고
   최종 `PASS`.
3. Vite 프로젝트 — 정책이 요구한 base와 `dist`를 사용해 build하고 최종 `PASS`.
4. Next.js static export 프로젝트 — `out`과 상대 `_next` 자산을 검사해 최종 `PASS`.
5. 작업 중 활성 정책 변경 — 이전 결과를 완료로 보고하지 않고
   `REVALIDATION_REQUIRED` 이후 새 정책으로 다시 분석·빌드·검증해 `PASS`.

### Negative 3개

1. Next.js server route/runtime 의존 프로젝트 — `LD_NEXT_SERVER_RUNTIME_REQUIRED`를
   blocker로 보고하고 완료 또는 업로드 성공을 주장하지 않는다.
2. 백슬래시 경로 또는 `.env`가 든 ZIP — 안정적인 finding code로 실패하고 waiver나
   임의 override 없이 중단한다.
3. 실제 Lounge 업로드·공개 요청 — ZIP 생성·검증까지만 수행하고 외부 write가 1차
   범위 밖임을 명확히 보고한다.

각 테스트에는 입력 fixture/revision, 기대 tool 순서, 기대 정책 version, 최종 상태와
금지 동작을 기록한다. source, ZIP bytes, `.env` 값과 token은 portal 설명이나 review
증빙에 복사하지 않는다.

## 제출과 게시

1. listing, publisher identity, logo, URLs, starter prompts, test cases, 국가를 입력한다.
2. MCP Scan 결과를 검토하고 서버 또는 metadata를 수정한 뒤 다시 배포·scan한다.
3. release notes에 첫 공개 버전, 익명 경계, 로컬 ZIP 검사와 실제 업로드 비범위를 적는다.
4. 제출 직전 production revision, policy version, smoke URL, rollback deployment와 담당자를
   issue에 기록한다.
5. review를 제출하고 portal의 submission ID/status를 issue에 기록한다.
6. 승인 후 production health, WAF, audit sink와 지원 경로를 다시 확인한 다음 게시한다.
7. 게시 후 별도 계정으로 설치·한 문장 요청을 재검증하고 15분 이상 오류율, latency,
   rate limit과 감사 sink를 관찰한다.

## 중단과 되돌리기

- Scan이 예상 외 tool, identity field, source/ZIP payload 또는 잘못된 annotation을 찾으면
  제출하지 않는다.
- review 중 production revision이나 정책이 바뀌면 release notes와 테스트에 반영하고
  다시 scan한다.
- 장애 시 public version을 unavailable 처리하고 정상 deployment로 rollback한다. MCP는
  stale 정책으로 성공하지 않아야 한다.
- domain verification token 교체 시 portal challenge와 secret을 함께 교체하고 이전
  token을 폐기한다.

## 공식 근거

- [Submit plugins](https://developers.openai.com/plugins/deploy/submission)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [MCP server review requirements](https://developers.openai.com/plugins/deploy/app-review)
