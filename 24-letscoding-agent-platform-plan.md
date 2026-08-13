# 렛츠코딩 에이전트 플랫폼 시작 계획

## 목적

다른 컴퓨터와 다른 Codex 계정의 사용자가 별도 가이드 파일을 받지 않아도, 렛츠코딩의 최신 정책으로 개발하고 작품 등록용 정적 ZIP을 만들 수 있게 한다.

첫 제품은 **Lounge Deploy MCP**다. 이후 수업, 과제, 콘텐츠, 운영 도구를 같은 원칙으로 추가한다.

> 사용자가 한 번 설치하는 것은 Plugin이고, 항상 최신이어야 하는 정책과 검증은 원격 MCP가 제공한다.

Skill과 Plugin만 배포하면 사용자의 설치본이 오래될 수 있다. 반대로 작업 시작과 최종 ZIP 검증 때 원격 MCP에서 정책을 조회하면, 운영자가 중앙 정책을 수정한 다음 작업부터 새 규칙이 적용된다.

## 구현 상태 — 2026-08-13

- GitHub 이슈 #1~#16과 구현 PR #18~#33이 모두 `main`에 병합되었다.
- 정책 계약·검증기, 네 MCP 도구, 익명 접근 경계·남용 통제·감사 로그, Plugin/Skill,
  clean-room E2E, CI/CD와 운영 runbook의 저장소 구현이 완료되었다.
- 자동 clean-room E2E는 단일 HTML, 순수 HTML/CSS/JS, Vite, Next.js와 실패·정책 전환
  시나리오를 검증한다.
- 첫 출시는 1인 운영으로 승인되었다. 두 번째 operator가 생기기 전에는 PR 승인 수와
  production required reviewer를 0으로 두고 필수 CI·수동 SHA dispatch·staging 및
  traffic 없는 production candidate smoke를 보완 통제로 사용한다.
- [로드맵 이슈 #17](https://github.com/quirinal36/letscoding-agent-platform/issues/17)은
  외부 인프라 설정, production drill, 공개 Plugin 등록과 별도 실제 Codex 계정 UI 인수
  확인이 끝날 때까지 출시 추적용으로 열어 둔다.

## 1차 범위

- Codex용 **Lounge Deploy Plugin** 배포
- 원격 MCP의 최신 작품 등록 정책 제공
- 프로젝트 프레임워크 감지와 정적 배포 호환성 진단
- Next.js·Vite·순수 HTML 작품의 빌드·ZIP 검증
- ZIP 구조·경로·확장자·용량·정적 자산 경로의 결정적 검사
- 별도 **.env** 첨부와 **window.__LETS_RUNTIME_ENV__** 규칙 안내
- 결과에 정책 버전, 검사 결과, ZIP 메타데이터 기록

### 1차 비범위

- 사용자의 로컬 소스 또는 ZIP 원문을 중앙 서버에 기본 저장
- 사용자 확인 없이 실제 작품을 자동 등록
- 사용자의 GitHub·로컬 쉘 권한을 중앙에서 대행
- 정책 응답에 학생·교사 개인정보 포함

실제 작품 등록은 2차에서 별도 도구로 추가한다. 사용자별 라운지 인증, 업로드 대상 확인, 공개 여부 확인이 필요하다.

## 저장소 전략

새 GitHub 저장소 하나를 만들고, 처음에는 모노레포로 운영한다.

~~~
letscoding-agent-platform/
├─ apps/
│  └─ lounge-deploy-mcp/           # 원격 MCP 서비스
├─ plugins/
│  └─ lounge-deploy/               # 설치용 Codex Plugin과 Skill
├─ packages/
│  ├─ policy-contract/             # JSON Schema, 타입, 버전 규칙
│  ├─ artifact-validator/          # ZIP·출력 폴더 결정적 검증기
│  ├─ project-analyzer/            # 프레임워크·정적 배포 호환성 분석기
│  ├─ mcp-auth/                    # 인증·권한 확인 공통 모듈
│  └─ audit-log/                   # 감사 로그 공통 모듈
├─ policies/
│  └─ lounge-deploy/
│     ├─ current.json              # 현재 활성 정책
│     ├─ framework-guide.md        # 사람이 읽는 상세 가이드
│     └─ history/                  # 정책 버전별 스냅샷
├─ tests/
│  ├─ policy-contract/
│  ├─ plugin-e2e/
│  ├─ operations/
│  └─ fixtures/
├─ docs/
│  └─ operations/                  # 배포·정책 발행·장애·관측성 runbook
└─ README.md
~~~

현재 라운지 저장소의 **framework_guide.md**는 정책 초안·검토 문서로 유지하고, 에이전트 플랫폼 저장소의 **policies/lounge-deploy/**를 중앙 운영 원본으로 둔다. MCP가 원본을 반환하므로 사용자에게 문서를 직접 전달할 필요가 없다.

민감한 관리자 기능이 생기면 해당 MCP를 별도 앱·배포·권한으로 분리한다. 작품 ZIP 검사 MCP와 사용자 관리 MCP가 같은 토큰 또는 데이터 접근 범위를 공유해서는 안 된다.

## 전체 구조

~~~
Codex 사용자
  │  Plugin 설치 (최초 1회)
  ▼
Lounge Deploy Plugin
  └─ Lounge Deploy Skill
       │  1. 최신 정책 조회
       │  2. 로컬 프로젝트 분석·수정·빌드
       │  3. ZIP 검사
       ▼
원격 Lounge Deploy MCP ────── 정책 원본 / 정책 관리 화면
       │                         │
       ├─ 정책 JSON·상세 가이드   └─ 운영자 승인·버전 발행
       ├─ 검증 결과
       └─ 감사 로그
~~~

- **Plugin**: 사용자가 설치하는 배포 단위
- **Skill**: Codex가 따라야 하는 최소 작업 순서
- **MCP**: 최신 정책과 검증 결과를 제공하는 중앙 서비스
- **결정적 검증기**: LLM 판단과 무관하게 ZIP 통과 여부를 판정하는 코드

## 정책 운영 원칙

### 세부 규칙을 Skill에 하드코딩하지 않는다

다음 값은 MCP 정책에서만 제공한다.

- ZIP 최대 크기·압축 해제 후 최대 크기·파일 수
- 허용 확장자와 차단 파일명
- Windows 백슬래시 경로 금지
- 프레임워크별 정적 export 설정
- 루트 절대 경로 금지와 상대 경로 규칙
- .env 별도 첨부와 공개 런타임 객체 규칙
- 오류 코드와 검증 항목

Skill에는 “MCP에서 정책을 조회하고, 최종 ZIP을 다시 검사하라”는 절차만 둔다.

### 정책은 불변 버전으로 발행한다

**current.json**은 최신 정책을 가리키고, 실제 요청은 예를 들어 **2026-08-12.3** 같은 불변 버전을 받는다. 실행 결과와 감사 로그에는 반드시 이 버전을 기록한다.

~~~json
{
  "id": "lounge-deploy",
  "version": "2026-08-12.3",
  "zip": {
    "maxCompressedBytes": 31457280,
    "maxUncompressedBytes": 104857600,
    "maxFiles": 500,
    "requireForwardSlashes": true
  },
  "runtimeEnv": {
    "attachSeparately": true,
    "browserObject": "window.__LETS_RUNTIME_ENV__"
  }
}
~~~

정책 변경 절차:

1. JSON 정책과 Markdown 가이드를 같은 PR에서 수정한다.
2. JSON Schema와 ZIP fixture 회귀 테스트를 통과시킨다.
3. 운영자가 정책 버전·시행 시각·변경 사유를 승인한다.
4. MCP가 새 버전을 활성화한다.
5. 이전 버전은 삭제하지 않고 보관한다.

긴급 보안 차단은 즉시 적용할 수 있지만, 실행 결과에 긴급 정책 버전과 적용 시각을 남긴다.

## MCP 도구 계약

1차 MCP는 읽기·검증 중심으로 만든다.

| 도구 | 목적 | 입력 | 출력 |
| --- | --- | --- | --- |
| **get_policy** | 현재 또는 지정 버전 정책 조회 | policy ID, 선택 버전 | 정책 JSON, 상세 가이드, 버전 |
| **analyze_project** | 프레임워크·정적 배포 위험 진단 | 파일 목록, 설정 파일 내용 | 감지 결과, 변경 권고, 검사 목록 |
| **validate_artifact** | ZIP/출력 폴더 결정적 검사 | ZIP 목록·크기·해시 또는 안전한 파일 참조 | 통과 여부, 오류·경고, 정책 버전 |
| **create_report** | 완료 보고 생성 | 분석·검증 결과 | Markdown/JSON 보고서 |

초기 **validate_artifact**는 ZIP 바이트 전체를 받을 필요가 없다. Plugin이 로컬 공용 검증기를 실행하고 파일 목록·크기·해시를 MCP에 전송한다. 중앙 재검증이 필요해지면 제한된 크기의 ZIP 업로드 또는 서명 URL 기반 검사를 추가한다.

**upload_to_lounge**는 2차 이후에만 추가한다. 이 도구는 사용자 로그인, 대상 작품 확인, 공개 상태 확인, 최종 승인 단계를 요구한다.

## Plugin과 Skill

사용자는 **Lounge Deploy** Plugin을 한 번 설치한다. Plugin 안의 Skill은 작고 엄격하게 유지한다.

~~~md
라운지 작품 빌드·배포 요청이면:
1. 반드시 get_policy를 호출한다.
2. 정책 버전을 작업 메모에 기록한다.
3. 프로젝트를 분석하고 필요한 최소 수정만 한다.
4. 로컬 빌드와 정적 결과물을 검사한다.
5. ZIP 생성 직전에 get_policy를 다시 호출한다.
6. validate_artifact가 통과한 경우에만 완료로 보고한다.
7. ZIP 경로, 용량, 파일 수, 정책 버전, 남은 제한사항을 보고한다.
~~~

설치 문서에는 다음만 제공한다.

1. Plugin 설치 링크 또는 조직용 배포 방법
2. MCP 연결 확인 절차(1차 public MCP는 익명이며 로그인을 요구하지 않음)
3. 예시 요청: “이 프로젝트를 라운지 작품 업로드용 ZIP으로 만들어줘”
4. 자동 업로드는 사용자의 명시 승인 없이 실행되지 않는다는 설명

## 인증·권한·개인정보

### 최소 권한

- 1차 public 정책 조회·분석·정적 ZIP 검사·보고: 익명 caller
- 조직 전용 정책: 향후 인증 ADR을 승인한 뒤 해당 조직 구성원
- 정책 편집·활성화: 렛츠코딩 플랫폼 운영자
- 실제 라운지 업로드: 작품 소유자 또는 권한 있는 담당 교사

### 서버 측 권한 확인

1차 MCP는 bearer token과 클라이언트가 보낸 조직 ID, 사용자 ID, 역할·scope를 권한 근거로
받지 않고 거부한다. 네 public 읽기·분석·검증·보고 도구만 allowlist하며 정책 편집과 외부
write는 배포 경계 밖에 둔다.

향후 조직 전용 정책, 저장 보고서, ZIP 업로드 또는 실제 작품 write를 추가할 때에는 새 인증
ADR을 먼저 승인하고, 정책 편집 API와 일반 MCP를 분리한 뒤 인증된 주체와 서버 측 권한
조회로 접근 범위를 판정한다.

### 감사 로그

기본 로그에는 다음만 기록한다.

- 요청 시각, 사용자/조직 식별자, MCP 도구명
- 정책 ID·버전
- 검사 결과 코드, ZIP 크기·파일 수·해시
- 실제 업로드가 있다면 대상 작품 ID와 사용자 확인 여부

소스 코드, .env 값, ZIP 원문, 학생 개인정보, 비밀값은 기본 로그에 저장하지 않는다. 오류 메시지도 비밀값을 다시 출력하지 않게 한다.

## Lounge Deploy의 결정적 검증

검증기는 다음을 코드로 검사한다.

- ZIP 최상위에 **index.html** 존재
- 출력 폴더가 아닌 내부 내용이 ZIP 최상위인지
- 30MB 압축 크기, 100MB 압축 해제 크기, 500개 파일
- 허용 확장자만 포함
- Windows **백슬래시** 경로 차단
- 절대 경로, 점 두 개 경로, URL 재해석 문자가 포함된 경로 차단
- **.env***와 **runtime-config.js** 차단
- Next.js 정적 export의 **./_next/** 자산 경로 확인
- Vite build의 **./assets/** 자산 경로 확인
- HTML·CSS·JS에 남은 로컬 정적 자산의 루트 절대 경로 점검
- 공개 런타임 값이 필요할 때 별도 .env 첨부 절차 안내

정적 자산의 루트 절대 경로는 예외가 있을 수 있으므로 오류와 경고를 구분한다. 라운지 내부 API 호출처럼 의도한 경로는 사용자가 이유를 확인한 뒤 경고를 해제할 수 있어야 한다.

## 개발 순서

### 단계 0 — 운영 결정

- MCP 호스팅 위치와 사용자 인증 제공자 결정
- 정책 소유자·승인자·긴급 변경 권한자 지정
- 공개 Plugin인지 렛츠코딩 조직 전용 Plugin인지 결정
- 1차에서는 ZIP 제작·검증까지만 제공한다고 확정

### 단계 1 — 공용 계약과 검증기

- **policy-contract**에 JSON Schema·타입·버전 규칙 작성
- 현재 라운지의 ZIP 검증, 중앙 디렉터리 검사, 런타임 환경변수 규칙을 공용 패키지로 이식
- 정상·비정상 ZIP fixture 작성
- 정책 JSON과 검증기가 같은 오류 코드를 사용하게 테스트

완료 기준: CLI가 백슬래시 ZIP을 거부하고 정상 ZIP을 통과시키며, 정책 버전이 결과에 남는다.

### 단계 2 — Lounge Deploy MCP

- 4개 MCP 도구 구현
- 요청·응답 JSON Schema 검증
- 인증, 요청 제한, 구조화 감사 로그 구현
- 최종 검증은 항상 서버의 활성 정책 버전으로 수행

완료 기준: 서로 다른 익명 client가 같은 최신 정책을 받고, 정책 업데이트 후 새 요청이 변경된 버전을 반환한다.

### 단계 3 — Codex Plugin

- Plugin 매니페스트와 Lounge Deploy Skill 작성
- Plugin 설치 후 MCP 연결 확인
- Next.js·Vite·순수 HTML 샘플로 end-to-end 실행
- 정책 버전이 최종 보고와 검사 결과에 일치하는지 확인

완료 기준: 새 Codex 계정이 가이드 파일 없이 Plugin 설치 후 한 문장 요청으로 ZIP 제작·검증 보고까지 마친다.

### 단계 4 — 운영화

- GitHub Actions로 테스트, 정책 Schema 검사, Plugin 검사, MCP 배포 자동화
- 정책 변경 승인·변경 로그·롤백 절차
- MCP 오류와 정책 불일치 관측성
- 설치 문서와 사용자 지원 절차

## 테스트 전략

| 계층 | 확인할 내용 |
| --- | --- |
| 단위 | 정책 파싱, 경로 정규화, .env·예약 파일 차단, 용량 계산 |
| 계약 | MCP 입력·출력 Schema와 오류 코드 |
| Fixture | Next.js·Vite·순수 HTML 정상/실패 ZIP |
| 통합 | 정책 활성화 → MCP 조회 → 결과에 같은 버전 기록 |
| Plugin E2E | 새 계정 설치 → 분석 → 빌드 → ZIP 통과/실패 보고 |
| 보안 | public 도구 allowlist, client identity 거부, 민감값 로그 노출 차단 |

정책 변경이 “다음 작업부터 적용”되는지 반드시 테스트한다. 시작 정책과 최종 검증 정책이 달라졌다면, 새 정책으로 한 번 더 검사해야 한다.

## 운영 체크리스트

- [x] 정책마다 소유자·승인자·변경 사유가 있다.
- [x] 정책 JSON과 Markdown 가이드를 같은 PR에서 갱신한다.
- [x] 정책 버전은 롤백 가능하고 과거 실행을 재현할 수 있다.
- [x] Plugin은 세부 정책을 하드코딩하지 않는다.
- [x] 최종 ZIP 통과 여부는 결정적 검증기가 판단한다.
- [x] 1차 public MCP는 익명 최소 권한이며 client identity를 거부한다. 사용자·조직 권한은
  외부 write 또는 조직 전용 기능을 설계할 때 새 인증 ADR과 함께 구현한다.
- [x] 민감값·소스·ZIP 원문이 기본 감사 로그에 남지 않는다.
- [x] 자동 업로드는 1차 비범위이며 public 도구 allowlist에 존재하지 않는다.
- [x] 정책 서비스 장애 시 오래된 정책으로 성공 처리하지 않는다.

### 출시 전 사람·외부 운영 게이트

- [ ] 승인된 1인 운영안대로 GitHub `main` ruleset과 staging/production Environment 보호
  규칙 적용
- [ ] Vercel staging/prod, DNS/TLS, 환경별 secret, WAF, audit sink/RBAC·경보 설정
- [ ] staging→production 승격, canonical smoke, rollback, WAF·audit sink 실제 drill
- [ ] prod MCP의 ChatGPT 기술 ID 발급과 공개 Plugin metadata·지원 책임자 승인
- [ ] 저장소를 clone하지 않은 별도 Codex 계정·컴퓨터의 Plugin UI 인수 확인

## 첫 이슈 목록

1. 모노레포와 패키지 관리 구조 생성
2. Lounge Deploy 정책 JSON Schema와 버전 규칙 작성
3. ZIP 검증기와 정상/실패 fixture 이식
4. Lounge Deploy MCP의 정책·분석·검증·보고 도구 구현
5. MCP 인증·감사 로그 계약 구현
6. Lounge Deploy Codex Plugin과 Skill 작성
7. 새 Codex 계정 대상 Plugin 설치 end-to-end 테스트
8. 설치·지원·정책 변경 운영 문서 작성

## 1차 성공 기준

1. 다른 컴퓨터의 새 Codex 계정이 Lounge Deploy Plugin을 설치한다.
2. 사용자가 “라운지 작품 업로드용 ZIP을 만들어줘”라고 요청한다.
3. Codex가 원격 MCP에서 최신 정책 버전을 조회한다.
4. Codex가 프로젝트를 빌드하고 라운지 하위 경로에서 동작하도록 정적 자산을 수정·검사한다.
5. 검증기가 백슬래시 ZIP, .env 포함 ZIP, 루트 절대 자산 경로 문제를 감지한다.
6. 통과한 경우에만 ZIP 절대 경로·크기·파일 수·정책 버전·제한사항을 보고한다.
7. 운영자가 정책을 수정한 뒤 새 요청을 시작하면, Plugin 업데이트 없이 새 정책이 적용된다.

자동 clean-room E2E는 2~7을 검증했다. 1과 실제 Codex UI에서의 2는 Product Owner가
production revision으로 수행할 출시 인수 확인에 남아 있다.
