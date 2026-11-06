# 렛츠코딩 라운지 스튜디오 — Gadia API 활용 매뉴얼

이 매뉴얼은 렛츠코딩 라운지 > 스튜디오에서 사용할 Gadia API 모델의 연결 설정, 모델 지정 방법, 전체 목록과 운영 전 확인 사항을 정리한다. 이 저장소에는 연동 참고 문서로 보관하며, 스튜디오에 모델을 적용하는 코드 변경을 포함하지 않는다.

기준일: **2026-11-06** · 대상: 스튜디오 개발·운영 담당자

현재 사용 가능한 모델은 [자동 갱신 모델 목록](gadia-models.md)을 확인한다. 이 문서의 4–6절과 9절은 2026-11-06 기준의 참조·검증 기록이며, 이후 목록 변경은 자동 갱신 파일에 반영한다.

출처: [Gadia API 모델 목록](https://docs.google.com/document/d/1fjReTEPMjxU9ZSdgtLHWJPxazKtOorFf_HqBB2_Pi4s/edit) — 원문 작성자 @Hyoung-gu. 2026-11-06에 원문을 재구성한 뒤 실제 API로 모델 목록과 짧은 텍스트 생성 2건을 확인했다. 검증 범위와 결과는 9절에 기록했다.

## 1. 적용 범위

Gadia API에는 2026-11-06 실제 목록 조회 기준 총 **31개 ID**가 있다. 개별 모델 26개와 라우팅·티어 별칭 5개이며 원문 목록과 일치한다. 목록에 등재된 사실과 모든 모델의 생성 성공 여부는 별개의 확인 사항이다.

이 문서는 모델 연동을 위한 참조 매뉴얼이다. 스튜디오 기본 모델, 사용자에게 노출할 모델, 작업별 배정, 과금 정책은 원문에 정해져 있지 않다. 아래의 사용·점검 절차는 원문 정보를 활용하기 위해 추가한 운영 안내이며, 확정된 스튜디오 정책을 뜻하지 않는다.

## 2. API 연결 설정

| 항목                     | 설정값                            |
| ------------------------ | --------------------------------- |
| Base URL                 | `https://api.gadia.ai/v1`         |
| API 형식                 | OpenAI 호환                       |
| 인증 헤더                | `Authorization: Bearer <API_KEY>` |
| 키 형식                  | `plx_`로 시작하는 키              |
| 모델 목록 조회           | `GET /v1/models`                  |
| 요청의 모델 지정 필드    | `model`                           |
| 실제 실행 모델 확인 필드 | 응답의 `plexus.executed_model`    |

요청에는 표시 이름이 아니라 목록의 **ID를 그대로** 사용한다. 예를 들어 “Claude Sonnet 5.5”를 지정할 때의 값은 `plexus/claude-sonnet-5-5`다.

운영 안내: 인증 키는 서버의 비밀 설정에서 관리하고 브라우저 코드나 로그에 노출하지 않는다. OpenAI 호환이라는 표기만으로 모든 엔드포인트와 옵션이 동일하게 동작한다고 가정하지 않는다.

## 3. 모델 지정 절차

1. 작업에서 도구 호출이나 이미지 입력이 필요한지 확인한다.

2. 사용할 개별 모델 ID 또는 라우팅·티어 별칭을 선택한다.

3. 요청의 `model` 필드에 해당 ID를 넣는다.

4. 별칭을 사용한 경우 응답의 `plexus.executed_model`로 실제 실행 모델을 확인한다.

5. 스튜디오에 적용하기 전에 실제 작업으로 응답 품질, 처리 시간, 오류 여부와 비용을 확인한다.

**개별 모델 지정 예시 — 요청 본문의 model 필드만 발췌**

```json
{
  "model": "plexus/claude-sonnet-5-5"
}
```

**자동 라우팅 지정 예시 — 요청 본문의 model 필드만 발췌**

```json
{
  "model": "plexus/auto"
}
```

위 예시는 모델 지정 방법만 보여준다. 실제로 성공한 `POST /v1/chat/completions` 요청 본문은 9절을 참고한다. 스트리밍과 전체 옵션 호환성은 아직 확인하지 않았다.

## 4. 라우팅·티어 별칭

별칭을 전달하면 Gadia가 실행 모델을 선택한다.

| ID            | 이름        | 원문에 기재된 동작                                 |
| ------------- | ----------- | -------------------------------------------------- |
| `plexus/auto` | 자동 라우팅 | 요청에 맞춰 티어·모델 자동 선택                    |
| `plexus/t0`   | 티어 T0     | T0 모델 중 선택. 개별 모델 목록에는 T0 모델이 없음 |
| `plexus/t1`   | 티어 T1     | economy 모델 중 선택                               |
| `plexus/t2`   | 티어 T2     | standard 모델 중 선택                              |
| `plexus/t3`   | 티어 T3     | performance·frontier 모델 중 선택                  |

**위 동작 설명은 원문에서도 티어 표기에 따른 추정이다.** 별칭의 구체적인 선택 기준은 API 응답에 나오지 않는다고 명시되어 있다. 따라서 특정 모델 실행을 보장하는 규칙으로 사용하지 않는다.

## 5. 등급과 기능 표기 읽는 법

| 티어 | 등급(band)  | 개별 모델 수 |
| ---- | ----------- | ------------ |
| T1   | economy     | 6            |
| T2   | standard    | 7            |
| T3   | performance | 9            |
| T3   | frontier    | 4            |

원문의 등급 순서는 **economy < standard < performance < frontier**다. `/v1/models` 응답에는 등급별 단가가 없다. 이번 생성 응답에는 요청별 `plexus.cost_won`이 포함되었으며, 이는 단가표와 구분한다.

개별 모델의 제공사별 구성은 Anthropic 8개, OpenAI 10개, Google 3개, xAI 2개, 기타 3개다.

아래 표의 컨텍스트는 토큰 단위다. “미공개”는 원문에 수치가 없다는 뜻이다. “도구·비전 지원”은 도구 호출과 이미지 입력을 모두 지원한다는 원문 표기이며, 이미지 생성 지원을 뜻하지 않는다. **개별 모델 26개 모두 출력 형식은 text**다.

## 6. 개별 모델 전체 목록

### 6.1 T1 · economy

아래 6개 모델은 모두 원문상 도구 호출·이미지 입력을 지원한다.

| ID                    | 모델 이름        | 제공사    | 컨텍스트(토큰) |
| --------------------- | ---------------- | --------- | -------------- |
| `plexus/claude-haiku` | Claude Haiku 4.5 | Anthropic | 200,000        |
| `plexus/gemini-flash` | Gemini 3.8 Flash | Google    | 1,049,000      |
| `plexus/gpt-mini`     | GPT-5.4 mini     | OpenAI    | 400,000        |
| `plexus/gpt-luna`     | GPT-6 luna       | OpenAI    | 1,050,000      |
| `plexus/gpt-luna-pro` | GPT-6 luna Pro   | OpenAI    | 1,050,000      |
| `plexus/llama-scout`  | Llama 4 Scout    | 기타      | 미공개         |

### 6.2 T2 · standard

| ID                         | 모델 이름            | 제공사    | 컨텍스트(토큰) | 도구·비전 지원 |
| -------------------------- | -------------------- | --------- | -------------- | -------------- |
| `plexus/claude-sonnet`     | Claude Sonnet 5      | Anthropic | 1,000,000      | 예             |
| `plexus/claude-sonnet-5-5` | Claude Sonnet 5.5    | Anthropic | 1,000,000      | 예             |
| `plexus/gpt`               | GPT-5.5              | OpenAI    | 1,050,000      | 예             |
| `plexus/grok-46`           | Grok 4.6             | xAI       | 500,000        | 예             |
| `plexus/grok-47`           | Grok 4.7             | xAI       | 500,000        | 예             |
| `plexus/llama-maverick`    | Llama 4 Maverick     | 기타      | 미공개         | 예             |
| `plexus/perplexity-sonar`  | Perplexity Sonar Pro | 기타      | 미공개         | 아니오         |

`plexus/perplexity-sonar`는 원문상 도구 호출과 이미지 입력을 모두 지원하지 않는다.

### 6.3 T3 · performance

아래 9개 모델은 모두 원문상 도구 호출·이미지 입력을 지원한다.

| ID                       | 모델 이름                  | 제공사    | 컨텍스트(토큰) |
| ------------------------ | -------------------------- | --------- | -------------- |
| `plexus/claude-opus`     | Claude Opus 4.8            | Anthropic | 1,000,000      |
| `plexus/claude-opus-5`   | Claude Opus 5              | Anthropic | 1,000,000      |
| `plexus/claude-opus-5-5` | Claude Opus 5.5            | Anthropic | 1,000,000      |
| `plexus/gemini-pro`      | Gemini 3.1 Pro             | Google    | 1,000,000      |
| `plexus/gemini-pro-max`  | Gemini 3.1 Pro (최대 추론) | Google    | 1,000,000      |
| `plexus/gpt-pro`         | GPT-5.5 Pro                | OpenAI    | 1,050,000      |
| `plexus/gpt-terra`       | GPT-5.6 terra              | OpenAI    | 1,050,000      |
| `plexus/gpt-sol`         | GPT-6.1 sol                | OpenAI    | 1,050,000      |
| `plexus/gpt-6-sol-pro`   | GPT-6.1 sol Pro            | OpenAI    | 1,050,000      |

### 6.4 T3 · frontier

아래 4개 모델은 모두 원문상 도구 호출·이미지 입력을 지원한다.

| ID                        | 모델 이름        | 제공사    | 컨텍스트(토큰) |
| ------------------------- | ---------------- | --------- | -------------- |
| `plexus/claude-fable-5`   | Claude Fable 5   | Anthropic | 1,000,000      |
| `plexus/claude-fable-5-1` | Claude Fable 5.1 | Anthropic | 1,000,000      |
| `plexus/gpt-6-astra`      | GPT-6 Astra      | OpenAI    | 1,050,000      |
| `plexus/gpt-6-astra-pro`  | GPT-6 Astra Pro  | OpenAI    | 1,050,000      |

## 7. 스튜디오 적용 전 확인 사항

다음 항목은 원문에 없는 정보이거나 실제 연동으로 확인해야 하는 사항이다.

| 항목                  | 확인할 내용                                                              |
| --------------------- | ------------------------------------------------------------------------ |
| 기본 모델과 노출 목록 | 스튜디오의 기본값, 사용자가 선택할 수 있는 모델                          |
| 작업별 모델 배정      | 코드 생성·수정 등 실제 스튜디오 작업에 사용할 모델                       |
| 비용                  | 모델·등급별 단가와 과금 방식. 9절의 값은 테스트 요청별 응답값            |
| 요청·응답 규격        | 비스트리밍 텍스트 생성 2건은 확인. 스트리밍·전체 옵션·오류 응답은 미확인 |
| 기능 호환성           | 도구 호출·이미지 입력은 목록의 지원 표기만 확인. 실제 동작은 미검증      |
| 품질·성능             | 실제 스튜디오 작업의 완료율, 결과 품질, 응답 시간, 동시 요청 처리        |
| 실패 처리             | 제한·시간 초과·모델 오류 시 재시도 또는 대체 모델 정책                   |
| 라우팅                | 자동 라우팅 실행 모델 표기는 확인. 전체 선택 기준과 티어별 동작은 미확인 |

운영 모델을 확정할 때는 모델 이름이나 등급 외에 실제 스튜디오 작업 결과를 함께 기록한다.

## 8. 목록 갱신 절차

2026-11-07부터 이 Mac의 사용자 `launchd` 작업으로 매주 모델 목록을 확인한다.

| 항목      | 설정                                                 |
| --------- | ---------------------------------------------------- |
| 작업 이름 | `com.letscoding.gadia-models.weekly`                 |
| 일정      | 매주 토요일 00:00, 금요일에서 토요일로 넘어가는 자정 |
| 시간대    | Mac 시스템 시간대 `Asia/Seoul`                       |
| 실행 파일 | `scripts/refresh-gadia-models.mjs`                   |
| 인증      | 저장소 루트 `.env.local`의 `GADIA_API_KEY`           |
| 조회      | `GET https://api.gadia.ai/v1/models`만 실행          |
| 비교 기준 | [gadia-models.json](gadia-models.json)               |
| 최신 목록 | [gadia-models.md](gadia-models.md)                   |

모델 ID의 추가·삭제와 이름, 제공사, 티어, 등급, 컨텍스트, 도구 호출, 이미지 입력, 출력 형식을 비교한다. 목록 순서와 `created` 같은 관리 필드는 변경으로 계산하지 않는다. 변경이 있으면 최신 목록과 JSON 기준 파일을 갱신하고 로그에 변경 전후 값을 남긴다. 변경이 없으면 목록 파일을 다시 쓰지 않고 로그에 `unchanged`와 확인 시각을 기록한다. 파일의 갱신 시각은 마지막 목록 변경 시각이며 매번 조회한 시각이 아니다. 로그의 ISO 시각은 UTC다.

조회 실패, 빈 목록, 중복 ID 또는 잘못된 필드 형식이면 기존 목록을 유지하고 실패로 종료한다. 생성 API, 원본 Google 문서, ChatGPT 페이지, 스튜디오 설정은 변경하지 않으며 커밋·푸시는 수행하지 않는다.

수동으로 같은 점검을 실행하려면 저장소 루트에서 다음을 실행한다. Node.js 24와 `.env.local`이 필요하다.

```sh
node scripts/refresh-gadia-models.mjs
```

예약 설정은 `~/Library/LaunchAgents/com.letscoding.gadia-models.weekly.plist`, 결과 로그는 `~/Library/Logs/letscoding/gadia-models.log`, 오류 로그는 같은 폴더의 `gadia-models-error.log`에 있다. 설정 파일에는 키 값이 들어 있지 않다. 이 Mac에 설치된 설정은 현재 저장소와 Node 실행 파일의 절대 경로를 사용하므로 폴더나 Node 위치를 옮기면 설정도 갱신해야 한다.

저장소가 macOS의 문서(Documents) 폴더 안에 있으므로 첫 백그라운드 실행에서 `node`의 문서 폴더 접근 허용이 필요할 수 있다. 권한 창이 대기 중이면 작업이 실행 중으로 표시되더라도 로그가 생기지 않을 수 있다. 허용 후 로그의 조회 결과와 `launchctl print`의 `last exit code = 0`을 함께 확인한다.

등록 상태와 수동 실행, 해제 명령은 다음과 같다.

```sh
launchctl print "gui/$(id -u)/com.letscoding.gadia-models.weekly"
launchctl kickstart "gui/$(id -u)/com.letscoding.gadia-models.weekly"
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.letscoding.gadia-models.weekly.plist"
```

Mac 시스템 시간대를 변경하면 예약 시각도 달라진다. 사용자 로그인 상태에서 실행되며, 잠자기 중 놓친 실행은 깨어날 때 한 번 실행된다. 전원이 꺼져 있거나 로그아웃한 상태의 실행은 보장하지 않는다. 예약 목표는 자정이지만 실제 시작은 운영체제 상태에 따라 늦어질 수 있다.

## 9. 실제 API 호출 검증 기록

검증일: **2026-11-06**. 로컬 `.env.local`의 `GADIA_API_KEY`를 읽어 인증했다. 키 값은 매뉴얼에 저장하지 않는다.

### 9.1 모델 목록 조회

`GET https://api.gadia.ai/v1/models` → **HTTP 200**. 총 31개 ID(개별 모델 26개, 별칭 5개)를 반환했다. 매뉴얼의 ID·모델명·컨텍스트 값과 일치하며, 티어·등급 및 도구·비전 지원 표기도 원문과 일치한다. 이는 API가 광고하는 메타데이터를 확인한 결과로, 각 기능의 실제 동작 테스트는 아니다.

### 9.2 텍스트 생성

`POST https://api.gadia.ai/v1/chat/completions`에 아래 JSON을 전송했다. 헤더는 `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`을 사용했다.

```json
{
  "model": "plexus/gpt-mini",
  "messages": [
    {
      "role": "user",
      "content": "Reply with exactly OK."
    }
  ],
  "max_tokens": 32,
  "stream": false
}
```

두 번째 호출은 같은 본문에서 `model`만 `plexus/auto`로 바꿨다. 두 요청 모두 HTTP 200, 응답 텍스트 `OK`, 종료 사유 `stop`을 반환했다.

| 요청 model        | 응답 model                    | plexus.executed_model | 전체 응답 시간 | usage.total_tokens | plexus.cost_won |
| ----------------- | ----------------------------- | --------------------- | -------------- | ------------------ | --------------- |
| `plexus/gpt-mini` | `openai/gpt-5.4-mini`         | `gpt-mini`            | 약 11.81초     | 16                 | 1               |
| `plexus/auto`     | `anthropic/claude-sonnet-5.5` | `claude-sonnet-5-5`   | 약 8.82초      | 22                 | 1               |

텍스트는 `choices[0].message.content`에서 확인했다. 두 응답 모두 `plexus.downgraded`와 `plexus.substituted`는 `false`였다. 이번 응답의 `plexus.executed_model`은 요청 ID의 `plexus/` 접두사 없이 반환되었다.

`plexus.cost_won`은 API가 보고한 요청별 값으로 합계 2다. 청구 내역과 대조하거나 모델별 단가를 검증한 것은 아니다. 전체 응답 시간은 각 1회 측정값이며 첫 토큰 시간이나 성능 비교 결과가 아니다. 자동 라우팅에서 Sonnet 5.5가 선택된 것도 이번 요청 1건의 관측값이다.

### 9.3 남은 검증 범위

전체 모델의 생성 성공 여부, 티어 별칭별 동작, 스트리밍, 도구 호출, 이미지 입력, 긴 컨텍스트, 오류·재시도 처리, 실제 스튜디오 코드 생성 품질과 동시 부하는 검증하지 않았다. 이번 확인 범위는 **인증·목록 조회·개별 모델 및 자동 라우팅의 짧은 비스트리밍 텍스트 생성**이다.
