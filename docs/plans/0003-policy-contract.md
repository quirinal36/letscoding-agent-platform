# Issue #3 구현 기록: Lounge Deploy 정책 계약(`packages/policy-contract`)

- 대상 이슈: [#3](https://github.com/quirinal36/letscoding-agent-platform/issues/3)
- 선행 이슈: [#2](https://github.com/quirinal36/letscoding-agent-platform/issues/2) 모노레포 골격 — 완료 (PR #19)
- 후속 소비자: [#4](https://github.com/quirinal36/letscoding-agent-platform/issues/4) 정책 값 이관, [#5](https://github.com/quirinal36/letscoding-agent-platform/issues/5) artifact 검증기, [#9](https://github.com/quirinal36/letscoding-agent-platform/issues/9) `get_policy`
- 기준 결정: [ADR-0003](../adr/0003-policy-governance-and-environments.md), [ADR-0005](../adr/0005-monorepo-toolchain.md)
- 상태: 구현 완료

## 1. 목표

정책의 **단일 기계 판독 계약**을 `packages/policy-contract`에 두고, 정책 JSON·검증기·MCP가 같은 타입과 같은 오류 코드를 사용하게 한다. 이 패키지는 "정책이 무엇을 말하는가"를 정의하며, "정책을 어떻게 집행하는가"(#5)와 "정책 내용 자체"(#4)는 다루지 않는다.

원칙 세 가지를 계약 수준에서 강제한다.

1. **불변 버전**: 발행된 정책 스냅샷은 수정되지 않는다. `current.json`은 포인터일 뿐이다.
2. **기계 판독과 사람 문구의 분리**: 오류 코드는 안정적인 식별자이고, 한국어 문구는 교체 가능한 표시 자원이다.
3. **fail-closed**: 계약을 만족하지 못하는 정책은 로드되지 않는다. 부분 파싱이나 기본값 보충을 하지 않는다.

## 2. 확정한 설계 결정

| 항목               | 결정                                                        | 이유                                                            |
| ------------------ | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `frameworks[].key` | `nextjs` / `vite` / `plain-html` 고정 열거형                | 오타를 즉시 거부하고, 검증기가 모든 값을 처리함을 타입으로 보장 |
| 가이드 짝 무결성   | `guide.sha256`으로 로드 시점에 검증                         | `history/*.md`가 이미 불변이라 추가 제약이 생기지 않음          |
| 차단 경로 규칙     | `kind` 열거형만 선언, 해석은 검증기 코드                    | 정책 리뷰어가 차단 범위를 예측할 수 있고 ReDoS 위험이 없음      |
| 테스트 배치        | 단위·Schema는 패키지, 참조 무결성은 `tests/policy-contract` | #2가 만든 디렉터리 의도를 살리고 실제 공개 export를 검증        |

## 3. 실제 산출물

```text
packages/policy-contract/
├─ schema/
│  ├─ policy-document.schema.json      정책 스냅샷 계약
│  ├─ current-pointer.schema.json      current.json 계약
│  └─ shared/{policy-id,policy-version,error-code}.schema.json
├─ scripts/generate.ts                 schema → TypeScript 생성기
├─ src/
│  ├─ index.ts                         공개 export
│  ├─ node.ts                          파일 시스템 PolicySource
│  ├─ version.ts                       버전 파싱·비교·정렬
│  ├─ parse.ts                         Ajv 기반 파싱 API
│  ├─ bundle.ts                        current → history 로딩
│  ├─ codes.ts                         POLICY_* 계약 오류 코드
│  ├─ messages/ko.ts                   한국어 표시 문구
│  └─ generated/                       schemas.ts, policy-document.ts, current-pointer.ts
└─ README.md                           버전 규칙·코드 규칙·호환성 원칙

policies/lounge-deploy/
├─ README.md                           발행 절차
├─ current.json                        → 2026-08-12.1
├─ framework-guide.md                  활성 가이드 복사본
└─ history/2026-08-12.1.{json,md}      최초 불변 스냅샷

tests/
├─ policy-contract/                    참조 무결성 workspace
└─ fixtures/policies/{valid,invalid}   정상 1개, 실패 11개
```

## 4. policy ID와 버전 형식

### 4.1 policy ID

형식은 `^[a-z][a-z0-9-]{2,31}$`다. 1차 값은 `lounge-deploy` 하나이고 디렉터리 이름과 일치한다.

### 4.2 버전 형식

- 형식 `YYYY-MM-DD.N`, 정규식 `^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\.([1-9]\d*)$`
- 정규식만으로는 `2026-02-30`을 거를 수 없어 파서가 달력 날짜를 추가 검사한다.
- `N`은 `1`부터 시작하고 선행 0을 거부한다.
- 정렬은 `comparePolicyVersion()`만 사용한다. 문자열 정렬은 `.10 < .9` 문제를 만든다.
- 날짜는 발행일 표기이며 시행 시각은 `effectiveAt`에 둔다.

### 4.3 불변성

- 스냅샷의 `version`, 파일명, `guide.path`가 모두 일치해야 로드된다.
- `history/` 안 버전 중복은 참조 무결성 테스트가 검사한다.
- 과거 스냅샷 파일의 Git 수준 변경 금지는 #16의 CI가 강제한다. 이 패키지는 위반 판정 기준과 로드 시점 검사를 제공한다.
- rollback은 파일 수정이 아니라 이전 값을 담은 새 버전 발행이다.

## 5. 정책 문서 Schema

JSON Schema Draft 2020-12를 사용하고 모든 객체에 `additionalProperties: false`를 적용했다. 오타 필드가 조용히 무시되면 정책이 의도와 다르게 집행된다.

### 5.1 최상위

| 필드            | 필수 | 설명                                |
| --------------- | ---- | ----------------------------------- |
| `schemaVersion` | ✔    | 계약 major 버전. 현재 `1` 고정      |
| `id`            | ✔    | policy ID                           |
| `version`       | ✔    | 불변 버전                           |
| `effectiveAt`   | ✔    | 시행 시각(UTC)                      |
| `changeReason`  | ✔    | 변경 사유 (감사 기록)               |
| `zip`           | ✔    | 크기·파일 수·최상위 index.html      |
| `files`         | ✔    | 확장자·파일명·경로 규칙             |
| `assetPaths`    | ✔    | 루트 절대 자산 경로 규칙            |
| `runtimeEnv`    | ✔    | `.env` 별도 첨부와 공개 런타임 객체 |
| `frameworks`    | ✔    | 프레임워크별 감지 힌트와 추가 검사  |
| `checks`        | ✔    | 오류 코드 카탈로그                  |
| `guide`         | ✔    | 같은 버전 Markdown 참조와 해시      |

### 5.2 `checks[]`가 유일한 카탈로그

`severity`, `waivable`, `titleKey`, `guideAnchor`는 오직 `checks[]`에만 있다. 다른 절은 코드를 **참조만** 한다.

- `zip.codes.{compressedTooLarge, uncompressedTooLarge, tooManyFiles, missingRootIndexHtml}`
- `files.codes.extensionNotAllowed`
- `files.blockedFilenames[].code`, `files.blockedPathRules[].code`
- `assetPaths.disallowRootAbsolute.code`
- `frameworks[].checks[]`

없는 코드를 참조하면 `POLICY_UNKNOWN_CHECK_CODE`로 거부된다. 같은 규칙을 두 곳에서 정의할 수 없으므로 severity가 어긋날 여지가 없다.

`severity: error`이면 `waivable`은 `false`여야 한다. Schema의 `if/then`이 강제한다.

### 5.3 정규식을 정책에 넣지 않는다

- `blockedFilenames[].match`는 `exact` / `prefix` / `suffix` 세 가지다.
- `blockedPathRules[].kind`는 `absolute-path`, `parent-traversal`, `backslash-separator`, `control-character`, `url-reinterpret`, `non-normalized` 여섯 가지다.

정책은 무엇을 막을지 선언하고, 어떻게 판정할지는 검증기 코드가 소유한다.

### 5.4 오류 코드 규칙

- `LD_*`는 사용자 작품 판정이며 정책 `checks[]`가 소유한다. 형식은 `^LD_[A-Z0-9]+(_[A-Z0-9]+)*$`, 최대 48자다.
- `POLICY_*`는 정책 자체의 결함이며 이 패키지의 `codes.ts`가 소유한다.
- 두 네임스페이스를 섞지 않는다. 전자는 사용자에게, 후자는 운영자와 CI에 의미가 있다.
- 발행된 코드는 재사용·개명·의미 변경을 하지 않는다. 은퇴 코드 목록은 패키지 README가 유지한다.

### 5.5 한국어 문구 분리

정책 JSON에는 문장을 넣지 않고 `titleKey`만 둔다. 문구는 `src/messages/ko.ts`에 있고, 문구 수정은 정책 버전을 올리지 않는다. 참조 무결성 테스트가 활성 정책의 `titleKey` ↔ 문구를 양방향으로 검사하고, 정책 JSON에 한글 문장이 섞이지 않았는지(`changeReason` 제외) 확인한다.

## 6. `current.json`과 스냅샷

```json
{
  "schemaVersion": 1,
  "policyId": "lounge-deploy",
  "version": "2026-08-12.1",
  "activatedAt": "2026-08-12T00:00:00Z"
}
```

포인터는 규칙 값을 복제하지 않는다. 스냅샷 경로는 `history/<version>.json` 규약으로 파생한다. 경로를 필드로 두면 포인터가 임의 파일을 가리킬 수 있다.

`loadActivePolicy()`는 다음 순서로 검사하고, 하나라도 실패하면 정책을 제공하지 않는다.

| 단계               | 실패 코드                                                         |
| ------------------ | ----------------------------------------------------------------- |
| 포인터 존재        | `POLICY_POINTER_MISSING`                                          |
| 포인터 Schema·버전 | `POLICY_SCHEMA_INVALID`, `POLICY_VERSION_NOT_A_CALENDAR_DATE`     |
| 정책 ID 일치       | `POLICY_POINTER_ID_MISMATCH`                                      |
| 스냅샷 존재        | `POLICY_SNAPSHOT_MISSING`                                         |
| 스냅샷 Schema·의미 | `POLICY_SCHEMA_INVALID` 외 semantic 코드                          |
| id·version 일치    | `POLICY_SNAPSHOT_ID_MISMATCH`, `POLICY_SNAPSHOT_VERSION_MISMATCH` |
| 가이드 존재·해시   | `POLICY_GUIDE_MISSING`, `POLICY_GUIDE_HASH_MISMATCH`              |

해시는 BOM 제거와 CRLF→LF 정규화 뒤에 계산한다. Windows checkout에서 같은 내용이 다른 해시를 갖지 않게 하기 위해서다. 같은 이유로 `policies/`는 Prettier 대상에서 제외한다.

## 7. TypeScript 타입 전략

`schema/*.json`이 유일한 원본이다. ADR-0003이 "CI가 Schema를 검증해야 merge할 수 있다"로 정했으므로, Zod-first를 택하면 리뷰 대상인 Schema가 파생물이 된다.

`scripts/generate.ts`가 두 종류를 생성한다.

1. `src/generated/{policy-document,current-pointer}.ts` — `json-schema-to-typescript`로 만든 타입
2. `src/generated/schemas.ts` — Schema JSON을 TypeScript 상수로 임베드

2번이 필요한 이유는 `tsc`가 JSON을 `dist/`로 복사하지 않기 때문이다. 상수로 임베드하면 런타임 파일 읽기 없이 배포 번들에서 검증할 수 있다.

drift는 CI 단계가 아니라 **테스트**로 막는다. `src/generated.test.ts`가 메모리에서 재생성한 결과와 커밋된 파일을 비교하므로, 어느 환경에서 `pnpm test`를 돌려도 생성 누락이 잡힌다.

런타임 검증은 Ajv 2020-12 + `ajv-formats`이고, 검증을 통과한 값에만 타입을 부여한다. 이것으로 "정책 파싱 결과가 런타임에서 검증된 타입으로 제공된다"를 구조적으로 만족한다.

## 8. 공개 API

```ts
// 버전
isPolicyVersion(value: string): boolean
parsePolicyVersion(value: string): PolicyVersionParts | undefined
comparePolicyVersion(a: string, b: string): -1 | 0 | 1
sortPolicyVersions(values: readonly string[]): string[]
latestPolicyVersion(values: readonly string[]): string | undefined

// 파싱 — 예외를 던지지 않는다
type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: readonly PolicyIssue[] }
parsePolicyDocument(input: unknown): ParseResult<PolicyDocument>
parsePolicyDocumentText(text: string): ParseResult<PolicyDocument>
parseCurrentPointer(input: unknown): ParseResult<CurrentPointer>
parseCurrentPointerText(text: string): ParseResult<CurrentPointer>

// 번들 로딩
interface PolicySource { readText(relativePath: string): Promise<string | null> }
loadActivePolicy(source, { policyId }): Promise<ParseResult<LoadedPolicy>>
loadPolicyVersion(source, { policyId, version }): Promise<ParseResult<LoadedPolicySnapshot>>

// 표시 전용
contractMessageKo(code: PolicyContractCode): string
checkMessageKo(titleKey: string): string | undefined
```

`@letscoding/policy-contract/node`가 `createFileSystemPolicySource(dir)`를 제공한다. 핵심 모듈은 `node:fs`에 의존하지 않으므로 배포 번들, 로컬 CLI, 테스트 fixture가 같은 로더를 공유한다.

예외 대신 `ParseResult`를 쓰는 이유는 MCP가 오류 코드와 JSON Pointer 위치를 구조화 응답과 감사 로그로 그대로 넘겨야 하기 때문이다.

## 9. Schema 호환성 원칙

패키지 README에 문서화했다. `schemaVersion`은 계약의 major 번호이며 정책 `version`과 다르다.

| 변경                           | 분류      | 처리                          |
| ------------------------------ | --------- | ----------------------------- |
| 선택 필드 추가                 | 하위 호환 | `schemaVersion` 유지          |
| 열거형 값 추가                 | 준-호환   | 소비자에 미지원 값 규칙 필요  |
| 필수 필드 추가, 필드 제거/개명 | 비호환    | `schemaVersion` +1            |
| 제한값 강화                    | 비호환    | `schemaVersion` +1            |
| 제한값 완화, 오류 코드 추가    | 하위 호환 | 유지                          |
| 오류 코드 의미 변경/개명       | 금지      | 새 코드 추가 + 기존 코드 은퇴 |

## 10. 테스트

`packages/policy-contract` 60개, `tests/policy-contract` 12개다.

**단위** — 버전 형식(잘못된 날짜, `N=0`, 선행 0, 접미사), 비교·정렬(`.9 < .10`), 계약 코드 ↔ 문구 양방향 커버리지, 생성물 drift.

**Schema 계약** — `tests/fixtures/policies/invalid/`의 11개 파일이 각각 하나의 실패 사유를 담고, 기대 `POLICY_*` 코드까지 단언한다.

| fixture                          | 기대 코드                            |
| -------------------------------- | ------------------------------------ |
| `missing-required-field`         | `POLICY_SCHEMA_INVALID`              |
| `unknown-field`                  | `POLICY_SCHEMA_INVALID`              |
| `bad-version-string`             | `POLICY_SCHEMA_INVALID`              |
| `version-zero-sequence`          | `POLICY_SCHEMA_INVALID`              |
| `empty-allowed-extensions`       | `POLICY_SCHEMA_INVALID`              |
| `error-severity-waivable`        | `POLICY_SCHEMA_INVALID`              |
| `version-not-a-calendar-date`    | `POLICY_VERSION_NOT_A_CALENDAR_DATE` |
| `duplicate-error-code`           | `POLICY_DUPLICATE_CHECK_CODE`        |
| `zip-size-inversion`             | `POLICY_ZIP_SIZE_INVERTED`           |
| `framework-check-code-not-found` | `POLICY_UNKNOWN_CHECK_CODE`          |
| `guide-path-mismatch`            | `POLICY_GUIDE_PATH_MISMATCH`         |

**로딩** — 인메모리 `PolicySource`로 포인터 없음, 스냅샷 없음, ID 불일치, 버전 불일치, 가이드 없음, 해시 불일치, 깨진 JSON, CRLF 정규화를 검사한다.

**참조 무결성** — 실제 `policies/lounge-deploy/`를 대상으로 활성 정책 로드, `framework-guide.md` 동일성, history 파일명 ↔ 버전 일치와 중복, 활성 버전이 최신인지, `titleKey` 문구 커버리지, `guideAnchor`가 가이드에 존재하는지 검사한다.

## 11. 완료 조건 매핑

| 이슈 #3 완료 조건                                | 근거                                                           |
| ------------------------------------------------ | -------------------------------------------------------------- |
| 유효한 정책 fixture가 Schema를 통과한다          | `valid/minimal.json`, 실제 `2026-08-12.1` 스냅샷               |
| 누락 필드·잘못된 크기·중복 코드·잘못된 버전 거부 | invalid fixture 11종                                           |
| 정책 버전은 발행 후 수정 불가                    | version ↔ 파일명 ↔ `guide.path` 일치, history 중복 검사        |
| 오류 코드가 한국어 문구와 분리                   | `titleKey` + `messages/ko.ts`, 정책 JSON 한글 문장 금지 테스트 |
| `current.json`이 없는 스냅샷을 가리키면 실패     | `POLICY_SNAPSHOT_MISSING`                                      |
| 파싱 결과가 런타임 검증된 타입으로 제공          | Ajv 검증 뒤에만 타입 부여, `ParseResult`                       |
| 호환성 원칙이 README에 문서화                    | `packages/policy-contract/README.md`                           |

## 12. 이 이슈에서 함께 바꾼 것

- `pnpm-workspace.yaml`과 root `workspaces`에 `tests/policy-contract` 추가.
- root `check` 순서를 `lint → format:check → build → typecheck → test`로 변경. `workspace:*` 의존 패키지가 `dist` 타입 선언을 사용하므로 빌드가 먼저 필요하다.
- `.prettierignore`에 `policies`와 `src/generated` 추가.
- eslint ignore에 `**/src/generated/**` 추가.

## 13. 다음 이슈로 넘긴 것

- 실제 규칙 값의 본격 이관과 확장 (#4). 현재 `2026-08-12.1`은 계약을 성립시키는 최초 스냅샷이다.
- 발행된 스냅샷의 Git 수준 불변성 강제, 정책 발행 CI, branch protection (#16).
- `POLICY_*` 코드를 MCP 응답에 어디까지 노출할지 (#9와 함께 결정).
