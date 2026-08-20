# Lounge Deploy Plugin 패키징·승인 경계

상태: repository marketplace 구현됨, 공개 등록 승인 대기

관련 이슈: #14, #15, #16

## 구현 선택

권장안으로 repository marketplace와 Codex bundled Streamable HTTP MCP를 사용한다.
Plugin은 `lounge-deploy` server를 필수로 선언하고 네 public 도구만 allowlist한다.
prod MCP가 초기화되지 않거나 `get_policy`가 실패하면 Skill은 즉시 중단하므로 설치본
정책을 fallback으로 사용하지 않는다.

공용 validator npm package는 아직 발행되지 않았다. 새 계정이 registry 설정 없이
검사할 수 있도록 build가 validator/policy-contract 실행 JS와 필요한 오픈소스 runtime
dependency를 Plugin `runtime/`에 생성한다. Skill wrapper는 이 번들만 실행하며 mutable
정책을 포함하지 않는다. 정책 JSON은 매 작업 MCP 응답으로 임시 파일에 저장하고 종료
시 제거한다.

대안은 validator를 public npm package로 발행해 `npx`로 실행하는 것이다. Plugin 크기는
작아지지만 package 공급망·버전 pin·registry 장애가 새 실행 의존성이 된다. #16에서
서명·provenance가 준비되면 대안을 재검토할 수 있다.

## 사람이 승인해야 하는 항목

### ChatGPT/Codex public directory 제출

공개 등록은 OpenAI Platform의 Plugin Submission Portal에서 `With MCP` 유형으로 새
제출을 만들고 production MCP URL을 직접 Scan Tools 한다. 이미 등록된 integration
기술 ID를 공개 제출 입력으로 재사용하지 않는다. ChatGPT developer mode에서 발급되는
`plugin_asdk_app...` 기술 ID는 `.app.json` 기반 로컬 개발 연결이 필요할 때만 사용하며
임의 ID를 만들지 않는다. 현재 `.mcp.json`은 Codex repository marketplace 설치·E2E를
담당한다.

제출자는 게시 조직에서 `Apps Management: Write` 권한과 검증된 개인 또는 사업자
identity를 가져야 한다. 공개 제출의 전체 절차와 증빙은
[`docs/operations/plugin-publication-runbook.md`](../operations/plugin-publication-runbook.md)를
따른다.

### 공개 제출 metadata와 지원 경계

공개 directory 제출 전 다음을 승인·게시해야 한다.

- privacy policy와 terms URL
- 일반 지원 연락처와 비공개 보안 제보 경로
- 미성년 사용자를 포함한 데이터 전송 설명
- prod MCP/WAF/감사 보존 운영 상태

권장 지원 경로는 공개 기능 문제에 GitHub Issues, 취약점에는 GitHub private
vulnerability reporting이다. #16에서 `SECURITY.md`와 운영 문서를 추가하고 Owner가
실제 연락 책임자를 승인하기 전에는 manifest에 가짜 email/URL을 넣지 않는다.

### prod endpoint

manifest는 승인된 ADR의 canonical prod URL을 선언한다. 실제 DNS·Vercel 배포는 #16의
운영 변경이다. #15 E2E는 임시 Plugin copy에서 MCP endpoint를 local/staging으로
치환해 계약을 검증하되 원본 manifest를 바꾸지 않는다.

## 데이터·권한과 되돌리기

Plugin은 source/ZIP 원문/환경값을 MCP로 보내지 않고 실제 Lounge write를 제공하지
않는다. warning waiver는 사용자 확인이 필요하다. 기타 로컬 build·검사·ZIP 생성은
요청 범위 안에서 수행한다.

#14 PR을 revert하면 marketplace, manifest, Skill, MCP wiring과 번들 validator가 함께
제거되고 기존 workspace 골격만 남는다. MCP 연결만 긴급 차단하려면 marketplace에서
Plugin을 `NOT_AVAILABLE`로 바꾸거나 manifest의 server를 disable한 새 version을
배포한다. 공개 directory에는 아직 제출하지 않으므로 별도 공개 rollback은 없다.

## 근거

- [OpenAI Plugin packaging](https://developers.openai.com/plugins/build/plugins)은
  `.codex-plugin/plugin.json`, bundled skills, `.mcp.json`, registered `.app.json`과
  repository marketplace 구조를 정의한다.
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp)은 Streamable HTTP URL,
  required/enabled tool policy와 credential이 없을 때의 익명 연결을 정의한다.
