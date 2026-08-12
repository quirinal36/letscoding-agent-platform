# `@letscoding/artifact-validator`

파일 내용이나 ZIP 바이트를 읽지 않고, 출력 폴더 또는 ZIP의 manifest metadata를 정책에 따라 결정적으로 검사한다.

## 공개 API

```ts
import { validateArtifact } from "@letscoding/artifact-validator";

const result = validateArtifact({
  policy,
  manifest: {
    kind: "zip",
    compressedBytes: 12_345,
    files: [
      {
        path: "index.html",
        sizeBytes: 1_024,
        sha256: "<64 lowercase or uppercase hexadecimal characters>",
      },
    ],
  },
  warningWaivers: [
    { code: "POLICY_WARNING_CODE", reason: "사용자가 확인한 사유" },
  ],
});
```

정책은 제한값, 허용 확장자, 차단 파일·경로, 루트 파일, 검사별 code/severity/message를 제공한다. `rules`에 없는 검사는 비활성화된다. 호출 전에 `@letscoding/policy-contract`가 정책을 런타임 검증하는 것을 전제로 한다.

## 결과와 결정성

- 오류가 하나라도 있으면 `pass=false`다. 경고만 있으면 통과한다.
- 첫 오류에서 멈추지 않고 독립적으로 안전한 위반을 모두 수집한다.
- finding 순서는 rule catalog 순서와 manifest index 순서로 고정된다.
- 정책 ID와 version, 파일 수, 안전하게 계산한 전체 크기, 유효·무효 해시 수, 정렬된 file set의 SHA-256 요약을 항상 반환한다.
- file set digest는 입력 파일 순서와 SHA-256 대소문자 표현에 영향을 받지 않는다.
- 경고 해제에는 실제로 발생한 warning code와 비어 있지 않은 사용자 사유가 모두 필요하다. 적용된 해제와 해제된 경고 수는 결과에 남는다.

## 정보 경계

검증기는 파일 내용, ZIP 원문, `.env` 값을 입력받지 않는다. 정책 message에 manifest 값을 보간하지 않으며 결과 finding에는 원본 경로나 개별 SHA-256을 복사하지 않는다. 대신 `fileIndexes`로 입력 manifest 항목을 가리킨다. `summary.hashes.fileSetSha256`은 전체 항목의 정규화된 aggregate digest다.

HTML/CSS/JavaScript 내용 기반 URL 분석은 이 패키지의 범위가 아니다.

## 로컬 ZIP·출력 폴더 검사

Node.js 파일 시스템 API는 별도 export에서 제공한다.

```ts
import { artifactValidationPolicyFromDocument } from "@letscoding/artifact-validator";
import { inspectArtifact } from "@letscoding/artifact-validator/node";

const result = await inspectArtifact({
  kind: "zip",
  inputPath: "/absolute/path/to/artifact.zip",
  policy: artifactValidationPolicyFromDocument(policyDocument),
});
```

- ZIP central directory의 항목 수를 먼저 제한하고 ZIP64, multi-disk, 암호화,
  미지원 압축 방식을 명시적으로 거부한다.
- `store`와 `deflate` entry를 stream으로 읽으며 실제 inflate 크기, CRC-32,
  선언 크기, SHA-256을 함께 확인한다.
- central/local entry name이 같은지 확인하며 원래 백슬래시를 정규화하지 않는다.
- 출력 폴더는 symlink와 특수 파일을 거부하고 파일을 연 뒤 metadata를 다시
  확인한다.
- 결과에는 정책 버전, manifest, 압축/해제 크기, 파일 수, artifact hash가 있다.
  ZIP byte와 파일 내용은 출력하지 않는다.

비대화형 CLI는 정책 스냅샷 JSON을 명시적으로 받는다.

```sh
lounge-artifact-validate \
  --policy policies/lounge-deploy/history/2026-08-12.2.json \
  --zip ./artifact.zip

lounge-artifact-validate \
  --policy policies/lounge-deploy/history/2026-08-12.2.json \
  --directory ./dist
```

종료 코드는 통과 `0`, 정책/보안 검사 실패 `1`, 잘못된 호출·정책·내부 오류
`2`다. 모든 정상 출력은 단일 JSON 객체다.

보안 fixture 생성 API는 `@letscoding/artifact-validator/fixtures`에서 제공하며
`corepack pnpm build` 후 `corepack pnpm --filter
@letscoding/artifact-validator fixtures:generate`로 공용 fixture를 생성할 수 있다.
