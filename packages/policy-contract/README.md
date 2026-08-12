# @letscoding/policy-contract

Lounge Deploy 정책의 단일 기계 판독 계약이다. 정책 JSON, 검증기, MCP가 이
패키지의 Schema, 타입, 오류 코드를 공유한다.

이 패키지는 **정책이 무엇을 말하는가**를 정의한다. 규칙을 어떻게 집행하는지는
`@letscoding/artifact-validator`가, 실제 규칙 값은 `policies/lounge-deploy/`가
소유한다.

## 원칙

1. **불변 버전** — 발행된 스냅샷은 수정하지 않는다. `current.json`은 포인터일
   뿐이다.
2. **코드와 문구의 분리** — 오류 코드는 안정적인 식별자고, 한국어 문구는 교체
   가능한 표시 자원이다. 정책 JSON에는 사람이 읽는 문장을 넣지 않는다.
3. **fail-closed** — 계약을 만족하지 못하는 정책은 로드되지 않는다. 부분 파싱,
   기본값 보충, 오래된 정책으로의 대체를 하지 않는다.

## 사용

```ts
import { loadActivePolicy } from "@letscoding/policy-contract";
import { createFileSystemPolicySource } from "@letscoding/policy-contract/node";

const source = createFileSystemPolicySource("policies/lounge-deploy");
const result = await loadActivePolicy(source, { policyId: "lounge-deploy" });

if (!result.ok) {
  // issues[].code는 POLICY_* 계약 오류 코드다.
  throw new Error(result.issues.map((issue) => issue.code).join(", "));
}

result.value.document.version; // "2026-08-12.1"
```

파싱 API는 예외를 던지지 않고 `ParseResult`를 돌려준다. MCP가 오류 코드와 위치를
구조화 응답과 감사 로그로 그대로 넘겨야 하기 때문이다. 타입은 검증을 통과한
값에만 부여한다.

`PolicySource`를 직접 구현하면 배포 번들, 원격 저장소, 테스트 fixture에서도 같은
로더를 쓸 수 있다. 핵심 모듈은 `node:fs`에 의존하지 않는다.

## 버전 규칙

정책 버전은 `YYYY-MM-DD.N` 형식이다. 예: `2026-08-12.3`.

- 날짜는 **발행일 표기**이고 시행 시각이 아니다. 시행 시각은 `effectiveAt`에 있다.
- `N`은 그날의 발행 순번이며 `1`부터 시작한다. `0`과 선행 0은 거부한다.
- pattern만으로는 `2026-02-30` 같은 값을 거를 수 없어 파서가 실제 달력 날짜인지
  추가로 검사한다.
- 정렬은 반드시 `comparePolicyVersion()`을 쓴다. 문자열 정렬은 `.10`을 `.9`보다
  앞에 놓는다.
- 스냅샷의 `version`, 파일명, `guide.path`는 서로 일치해야 한다.
- rollback은 과거 파일 수정이 아니라 **이전 값을 담은 새 버전 발행**이다.

## 오류 코드

두 네임스페이스를 섞지 않는다.

| 접두사     | 의미                    | 소유자                 |
| ---------- | ----------------------- | ---------------------- |
| `LD_*`     | 사용자 작품에 대한 판정 | 정책 문서의 `checks[]` |
| `POLICY_*` | 정책 자체의 결함        | 이 패키지의 `codes.ts` |

`checks[]`가 유일한 `LD_*` 카탈로그다. `zip.codes`, `files.codes`,
`assetPaths`, `frameworks[].checks`는 모두 이 카탈로그를 참조하며, 없는 코드를
참조하면 `POLICY_UNKNOWN_CHECK_CODE`로 거부된다.

코드 규칙:

- 형식은 `^LD_[A-Z0-9]+(_[A-Z0-9]+)*$`이고 최대 48자다.
- 한번 발행한 코드는 **재사용·개명·의미 변경을 하지 않는다**. 규칙이 사라지면
  카탈로그에서 제거하고 그 코드는 영구 은퇴한다.
- 사람용 문구는 `checks[].titleKey`가 가리키는 표시 자원(`src/messages/ko.ts`)에
  둔다. 문구를 고칠 때 정책 버전을 올리지 않는다.

### 은퇴한 코드

아직 없다. 코드를 은퇴시키면 여기에 코드와 은퇴 버전을 기록하고 다시 사용하지
않는다.

## Schema 호환성 원칙

`schemaVersion`은 **정책 계약의 major 번호**이며 정책 `version`과 다르다.

| 변경                                   | 분류      | 처리                                  |
| -------------------------------------- | --------- | ------------------------------------- |
| 선택 필드 추가                         | 하위 호환 | `schemaVersion` 유지                  |
| 열거형에 값 추가                       | 준-호환   | 유지하되 소비자에 미지원 값 규칙 필요 |
| 필수 필드 추가, 필드 제거/개명         | 비호환    | `schemaVersion` +1, 이관 노트 필수    |
| 제한값 강화(pattern 강화, 최댓값 축소) | 비호환    | `schemaVersion` +1                    |
| 제한값 완화                            | 하위 호환 | 유지                                  |
| 오류 코드 추가                         | 하위 호환 | 유지                                  |
| 오류 코드 의미 변경/개명               | 금지      | 새 코드 추가 + 기존 코드 은퇴         |

추가 규칙:

- 모든 객체에 `additionalProperties: false`를 유지한다. 알 수 없는 필드는
  오타이거나 미지원 신규 필드이며, 둘 다 조용히 통과시키면 안 된다.
- 소비자는 지원하는 `schemaVersion`을 명시하고 범위 밖이면 실패한다.
- 이관이 필요하면 구/신 `schemaVersion`을 동시에 지원하는 기간을 명시적으로 둔다.

## 생성물

`schema/*.json`이 유일한 원본이다. `src/generated/`는 생성물이며 커밋한다.

```sh
pnpm --filter @letscoding/policy-contract run generate
```

`src/generated.test.ts`가 커밋된 내용과 재생성 결과를 비교하므로, schema를 고치고
생성을 잊으면 테스트가 실패한다. 생성 파일을 직접 수정하지 않는다.

## 가이드 해시

정책 스냅샷은 같은 버전 Markdown 가이드의 `sha256`을 담는다. JSON과 가이드가 같은
PR에서 원자적으로 발행되었는지 로드 시점에 확인하기 위해서다. 두 파일 모두 발행 후
불변이므로 해시가 추가 제약을 만들지는 않는다.

해시는 BOM을 제거하고 CRLF를 LF로 정규화한 뒤 계산한다. Windows checkout에서 같은
내용이 다른 해시를 갖지 않게 하기 위해서다. `policies/`는 Prettier 대상에서
제외한다. 재포맷이 발행된 스냅샷의 해시를 깨뜨리기 때문이다.

## 범위 밖

- 실제 정책 값의 이관 (Issue #4)
- ZIP·출력 폴더 검사 구현 (Issue #5, #6)
- 프레임워크 감지 알고리즘 (Issue #7)
- MCP 도구의 요청·응답 계약 (Issue #8, #9)
- 발행된 스냅샷의 Git 수준 불변성 강제와 정책 발행 CI (Issue #16)
