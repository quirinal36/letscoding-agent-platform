# 렛츠코딩 라운지 스튜디오 — OpenRouter API 활용 매뉴얼

이 매뉴얼은 렛츠코딩 라운지와 스튜디오가 쓰는 OpenRouter의 연결 설정, 모델 지정 방법, 모델 목록 조회, 한도와 오류, 데이터 정책, 라운지의 현재 사용 현황과 운영 전 확인 사항을 정리한다. 이 저장소에는 연동 참고 문서로 보관하며, 라운지 코드 변경은 포함하지 않는다. 텍스트 전용 Gadia는 [Gadia API 활용 매뉴얼](gadia-api-manual.md), 이미지·영상·음악 생성용 kie.ai는 [kie.ai API 활용 매뉴얼](kie-api-manual.md)을 본다.

기준일: **2026-11-08** · 대상: 스튜디오·라운지 개발·운영 담당자

현재 사용 가능한 모델은 [OpenRouter 최신 모델 목록](openrouter-models.md)을 확인한다. 출처는 [OpenRouter 공식 문서](https://openrouter.ai/docs)와 `GET /api/v1/models` 응답이며, 실제 호출 검증 결과는 9절에 기록했다.

## 1. 적용 범위

OpenRouter는 여러 제공사의 모델을 하나의 키와 하나의 OpenAI 호환 API로 호출하는 중계 서비스다. 세 서비스 가운데 유일하게 **라운지가 이미 운영에서 쓰고 있다.** 스튜디오의 코드 생성·이미지 생성, 라운지 메뉴 도우미, 학습 분석, 이름·콘텐츠 검수가 모두 OpenRouter를 거친다(7절).

2026-11-08 `GET /api/v1/models?output_modalities=all` 기준 모델은 **705개**다. 기본 호출(`output_modalities` 없음)은 텍스트 출력 모델 **460개**만 돌려준다.

| 출력 종류       | 모델 수 | 라운지 사용           |
| --------------- | ------- | --------------------- |
| 텍스트          | 460     | 코드 생성·도우미·검수 |
| 이미지 생성     | 53      | 스튜디오 이미지 모드  |
| 영상 생성       | 31      | 없음                  |
| 음성 합성       | 38      | 없음                  |
| 음성 인식       | 30      | 없음                  |
| 임베딩          | 45      | 없음                  |
| 리랭크          | 12      | 없음                  |
| 판정(decisions) | 36      | 없음                  |

텍스트 460개 가운데 12개는 `:free` 변형이고, 19개는 `~제공사/이름-latest` 형태의 별칭이다. 목록 파일에 비고로 표시했다.

스튜디오 기본 모델, 노출 모델, 작업별 배정, 예산 정책은 라운지 저장소의 결정 기록(`docs/2026-10-14-studio-integration.md`, `docs/2026-10-30-assistant-human-decisions.md`)을 따른다. 이 문서는 그 결정을 바꾸지 않는다.

## 2. API 연결 설정

| 항목             | 설정값                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| Base URL         | `https://openrouter.ai/api/v1`                                                |
| API 형식         | OpenAI 호환 (`/chat/completions`, `/responses`), Anthropic 호환 (`/messages`) |
| 인증 헤더        | `Authorization: Bearer <API_KEY>`                                             |
| 키 형식          | `sk-or-v1-`로 시작하는 키                                                     |
| 키 상태 조회     | `GET /api/v1/key` — 키 한도, 예산, 사용량, 무료 모델 일일 요청 수             |
| 크레딧 잔액      | `GET /api/v1/credits` — 누적 충전액과 누적 사용액                             |
| 모델 목록        | `GET /api/v1/models` (인증 불필요)                                            |
| 요청의 모델 필드 | `model`                                                                       |
| 실행 모델 확인   | 응답의 `model`과 `provider`                                                   |
| 앱 식별(선택)    | `HTTP-Referer: <앱 URL>`, `X-OpenRouter-Title: <앱 이름>`                     |

앱 식별 헤더는 OpenRouter 순위·분석에 앱을 등록하는 용도이며 없어도 호출은 된다. 라운지 코드는 현재 이 헤더를 보내지 않는다.

키는 발급 화면([openrouter.ai/keys](https://openrouter.ai/keys))에서 **키별 크레딧 한도**를 걸 수 있다. 공식 문서는 모든 키에 한도를 두라고 권고한다. 2026-11-08 라운지 로컬 키는 주 50달러 한도이고 작업 공간 예산(일 50·주 300·월 1,000달러)이 함께 적용된다(9절).

운영 안내: 키는 서버 비밀 설정에서만 다루고 브라우저 코드·로그에 남기지 않는다. OpenRouter 키는 OAuth와 한도 설정까지 다루는 키라서 모델 제공사 키보다 권한이 넓다.

## 3. 모델 지정

### 3.1 ID 형식

`model`에는 목록의 ID를 `제공사/이름` 형태 그대로 넣는다. 예: `openai/gpt-6.1-sol`, `anthropic/claude-haiku-5.5`.

```json
{
  "model": "openai/gpt-5.4-mini",
  "messages": [{ "role": "user", "content": "안녕하세요" }],
  "usage": { "include": true }
}
```

`usage.include: true`를 넣으면 응답 `usage`에 요청 비용(`cost`, USD)이 붙는다. 라운지 스튜디오는 이 값을 모아 예산을 정산한다.

### 3.2 변형 접미사

ID 뒤에 `:접미사`를 붙여 동작을 바꾼다. 두 종류가 있다.

| 접미사      | 종류   | 상태      | 의미                                                            |
| ----------- | ------ | --------- | --------------------------------------------------------------- |
| `:free`     | 목록형 | 사용 가능 | 무료 버전. 목록에 별도 항목으로 있고 그 항목이 있는 모델만 지원 |
| `:batch`    | 목록형 | 사용 가능 | 배치 API 단가 항목. 배치 API가 기본 ID로부터 스스로 고른다      |
| `:nitro`    | 라우팅 | 사용 가능 | 처리량 우선 제공사 정렬. 우선 등급 엔드포인트가 잡히면 그 단가  |
| `:floor`    | 라우팅 | 사용 가능 | 가격 우선 제공사 정렬. 유연 등급 엔드포인트가 잡히면 그 단가    |
| `:exacto`   | 라우팅 | 사용 가능 | 도구 호출 신뢰도 기준 제공사 정렬                               |
| `:thinking` | 목록형 | 지원 종료 | `reasoning` 파라미터로 대체                                     |
| `:extended` | 목록형 | 지원 종료 | 현재 제공 모델 없음                                             |
| `:online`   | 라우팅 | 지원 종료 | `openrouter:web_search` 서버 도구로 대체                        |

라우팅 접미사는 어떤 ID에나 붙일 수 있지만 모델 목록에는 나오지 않는다. 목록형 접미사는 해당 항목이 없는 모델에 붙이면 기본 모델로 돌아가지 않고 실패한다. 접미사는 여러 개를 이어 붙일 수 있다(`openai/gpt-5.2:nitro:exacto`).

### 3.3 라우터 모델

| ID                     | 동작                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `openrouter/auto`      | 요청마다 모델과 추론 강도를 OpenRouter가 고른다. 실제 모델은 응답 `model`에서 확인 |
| `openrouter/auto-code` | 코딩 에이전트용으로 조정한 같은 라우터                                             |
| `openrouter/free`      | 무료 모델 사이에서만 고른다                                                        |

### 3.4 제공사 라우팅 옵션

요청 본문 `provider` 객체로 어느 제공사에 보낼지 제한한다. 라운지가 쓰는 값은 굵게 표시했다.

| 필드                  | 값                             | 의미                                                          |
| --------------------- | ------------------------------ | ------------------------------------------------------------- |
| **`data_collection`** | `"allow"`/`"deny"`             | `deny`면 사용자 데이터를 저장·학습에 쓸 수 있는 제공사를 제외 |
| `zdr`                 | boolean                        | 데이터 미보관(ZDR) 엔드포인트로만 라우팅                      |
| `only`                | string[]                       | 허용할 제공사 slug 목록                                       |
| `ignore`              | string[]                       | 제외할 제공사 slug 목록                                       |
| `order`               | string[]                       | 시도 순서                                                     |
| `allow_fallbacks`     | boolean(기본 true)             | 1순위 제공사 불가 시 다른 제공사로 넘길지                     |
| `require_parameters`  | boolean                        | 요청 파라미터를 전부 지원하는 제공사만 사용                   |
| `sort`                | `price`/`throughput`/`latency` | 제공사 정렬 기준                                              |
| `max_price`           | object                         | 허용할 최대 단가                                              |

`models` 배열로 대체 모델을 지정할 수 있다. 단, `:free` 모델 뒤에 유료 모델을 두면 무료 모델이 막혔을 때 **유료로 과금**된다.

## 4. 모델 목록 API

| 요청                                             | 용도                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `GET /api/v1/models`                             | 텍스트 출력 모델만(기본)                                           |
| `GET /api/v1/models?output_modalities=all`       | 전체. `image`, `video`, `speech`, `embeddings` 등으로 좁힐 수 있다 |
| `GET /api/v1/models?supported_parameters=tools`  | 도구 호출 지원 모델만                                              |
| `GET /api/v1/models?zdr=true`                    | ZDR 엔드포인트가 있는 모델만                                       |
| `GET /api/v1/models?sort=pricing-low-to-high`    | 서버 정렬. `newest`, `most-popular`, `context-high-to-low` 등      |
| `GET /api/v1/models/count?output_modalities=all` | 개수만                                                             |
| `GET /api/v1/model/{제공사}/{이름}`              | 모델 하나. 별칭·접미사를 서버가 풀어 준다                          |
| `GET /api/v1/models/{제공사}/{이름}/endpoints`   | 그 모델을 서비스하는 제공사 엔드포인트와 단가                      |
| `GET /api/v1/images/models`                      | 전용 이미지 API용 모델 목록. 라운지 이미지 모드가 사용             |

응답 항목의 주요 필드는 `id`, `name`, `context_length`, `architecture.input_modalities`/`output_modalities`, `pricing.prompt`/`completion`(토큰당 USD), `supported_parameters`, `top_provider.max_completion_tokens`, `reasoning`, `expiration_date`(제공 종료 예정일), `alias_target`(별칭의 실제 모델)이다. 모델 목록 파일은 이 가운데 운영에 필요한 열만 옮겼다.

## 5. 한도와 오류

OpenRouter는 kie.ai와 달리 **HTTP 상태 코드가 실제 오류를 뜻한다.**

| 코드 | 의미                                                          | 대응                                             |
| ---- | ------------------------------------------------------------- | ------------------------------------------------ |
| 400  | 요청 형식 오류                                                | 파라미터 확인                                    |
| 401  | 키 무효·비활성                                                | 키 교체                                          |
| 402  | 크레딧 부족. `limit_source`가 진행 중 예산이면 잠시 뒤 재시도 | `Retry-After` 있으면 대기 후 재시도, 없으면 충전 |
| 403  | 예산 소진, 가드레일 차단, 콘텐츠 검열                         | `error.metadata.limit_source`로 분기             |
| 408  | 시간 초과                                                     | 재시도                                           |
| 429  | 속도 제한(OpenRouter 또는 상위 제공사)                        | 지수 백오프, `Retry-After` 준수                  |
| 502  | 모델 다운 또는 제공사 응답 오류                               | 재시도 또는 대체 모델                            |
| 503  | 라우팅 조건을 만족하는 제공사 없음                            | 제공사 제한 완화                                 |

예산 소진(403) 응답의 `error.metadata`에는 `limit_source`(`openrouter_key_limit`, `openrouter_workspace_budget`, `openrouter_guardrail_budget`), `limit_usd`, `spend_usd`, `resets_at`이 들어 있다. 스트리밍 도중 오류는 HTTP 상태 대신 SSE 이벤트의 `finish_reason: "error"`로 온다.

**속도 제한:** 유료 모델에는 플랫폼 차원의 요청 수 상한이 없고 제공사 쪽 한도만 있다. `:free` 모델은 분당 20회, 하루 50회(누적 충전 10달러 미만) 또는 1,000회(10달러 이상)다. `GET /api/v1/key`와 `GET /api/v1/credits`는 IP당 분당 호출 수 제한이 있어 자주 부르지 않는다.

## 6. 데이터 정책

- OpenRouter 자체는 사용자가 로그 저장을 켜지 않는 한 프롬프트·응답을 저장하지 않는다. 토큰 수·지연 같은 메타데이터만 남긴다.
- 제공사 쪽 저장 여부는 요청의 `provider.data_collection`과 `provider.zdr`로 제어한다.
- **라운지 결정(2026-10-20):** ZDR은 필수에서 권고로 바꿨고, `data_collection: "deny"`는 모든 요청에 유지한다. 근거와 조건은 라운지 `docs/2026-10-14-studio-integration.md`의 "2026-10-20 ZDR 강제에서 권고로 변경" 절에 있다.
- OpenRouter 계정·키·가드레일에 별도 ZDR 강제가 걸려 있으면 앱 코드만으로는 풀리지 않는다. 운영 콘솔 설정은 따로 확인한다.

## 7. 라운지의 현재 사용 현황

라운지 저장소(`letscoding_lounge`)의 코드와 2026-11-08 로컬 `.env.local` 기준이다. 운영 값은 Vercel 환경변수를 따로 확인한다(라운지 `docs/03-deployment.md`).

### 7.1 환경변수

| 변수                         | 용도                                                                   | 로컬 값(2026-11-08)                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`         | 공용 키. 스튜디오 AI와 라운지 도우미가 공유                            | (비공개)                                                                                                                      |
| `OPENROUTER_MODEL`           | 라운지 메뉴 도우미 모델. 비우면 `openai/gpt-6.1-sol`                   | `openai/gpt-6.1-sol`                                                                                                          |
| `OPENROUTER_MODELS`          | 스튜디오에서 고를 수 있는 모델. 최대 12개, `MODEL_CATALOG`에 있어야 함 | `deepseek/deepseek-v4.1-flash`, `openai/gpt-6-luna`, `openai/gpt-6.1-sol`, `openai/gpt-image-2`, `anthropic/claude-haiku-5.5` |
| `OPENROUTER_MODEL_IMAGE`     | 이미지 생성 모델                                                       | `openai/gpt-image-2`                                                                                                          |
| `OPENROUTER_MODEL_CODE`      | 이전 방식의 코딩 모델. `OPENROUTER_MODELS`가 있으면 이미지 외에는 무시 | `x-ai/grok-4.7`                                                                                                               |
| `OPENROUTER_MODEL_AUX`       | 이전 방식의 보조 대화 모델. 위와 같음                                  | `google/gemini-3.1-flash-lite`                                                                                                |
| `OPENROUTER_MODEL_VISION`    | 이전 방식의 이미지 이해 모델. 위와 같음                                | `openai/gpt-4.1-mini`                                                                                                         |
| `AI_LEARNING_ANALYSIS_MODEL` | 학습 분석 모델. 비우면 `anthropic/claude-haiku-5.5`                    | 미설정                                                                                                                        |
| `EDITOR_AI_MODERATION_MODEL` | 요청 검수 모델. 비우면 키워드 규칙만 적용                              | 미설정                                                                                                                        |

### 7.2 코드에 고정된 모델

| 위치                                       | 모델                         | 용도                             |
| ------------------------------------------ | ---------------------------- | -------------------------------- |
| `src/features/studio/lib/model-catalog.ts` | 12개 후보(아래)              | 스튜디오 선택 가능 목록의 상한   |
| `src/features/studio/lib/image-mode.ts`    | `openai/gpt-image-2`         | 이미지 생성 모드                 |
| `src/features/studio/lib/learning-mode.ts` | `anthropic/claude-haiku-5.5` | 학습 모드                        |
| `src/features/studio/lib/server/haiku.ts`  | `anthropic/claude-haiku-5.5` | 이름·콘텐츠 검수(`reasoning` 끔) |
| `src/lib/assistant/agent.ts`               | `openai/gpt-6.1-sol`(기본)   | 라운지 메뉴 도우미               |

`MODEL_CATALOG` 후보: `openai/gpt-6.1-sol`(매우 높은 수준), `openai/gpt-6-luna`, `anthropic/claude-sonnet-5.5`, `anthropic/claude-haiku-5.5`(학습 모드), `anthropic/claude-opus-5.5`, `google/gemini-3.8-flash`, `google/gemini-3.5-flash-lite`, `qwen/qwen3.8-27b`, `deepseek/deepseek-v4.1-flash`(보통 수준), `deepseek/deepseek-v4.1-flash-1017`(높은 수준), `google/gemini-3-pro-image`(이미지 생성), `openai/gpt-image-2`(이미지 생성 모드). 2026-11-08 목록 조회에서 **12개 모두 현재 목록에 있다.**

### 7.3 호출 방식

- 스튜디오 서버(`src/features/studio/lib/server/models.ts`)는 `GET /api/v1/models`를 인증 없이 10초 제한으로 조회해 도구 지원과 단가를 확인한 뒤에만 유료 호출한다. 확인 실패 모델은 선택을 막는다.
- 도우미(`src/lib/openrouter-ai.ts`)는 `@openrouter/ai-sdk-provider`로 호출하며 `provider.data_collection: "deny"`를 모든 요청에 넣는다.
- 이미지 모드(`src/features/studio/lib/server/image.ts`)는 모델에 따라 `/api/v1/images` 또는 `/api/v1/chat/completions`를 쓴다. 생성 결과는 WebP로 자체 저장한다.
- 비용은 응답 `usage.cost`를 생성 ID별로 모으고, 스트림이 끊기면 `/api/v1/generation`에서 두 번까지 다시 조회한다.

## 8. 스튜디오 적용 전 확인 사항

새 모델을 스튜디오에 추가하거나 바꿀 때 확인한다.

| 항목        | 확인할 내용                                                                      |
| ----------- | -------------------------------------------------------------------------------- |
| 목록 등재   | `GET /api/v1/model/{id}`가 200인지, `expiration_date`가 없는지                   |
| 기능        | `supported_parameters`에 `tools`가 있는지, 입력에 `image`가 있는지, 출력 형식    |
| 단가        | `pricing.prompt`/`completion`과 이미지 단가. 스튜디오 정렬·예산 계산의 기준      |
| 데이터 정책 | `data_collection: "deny"`로 라우팅 가능한 제공사가 있는지. ZDR은 권고            |
| 카탈로그    | `MODEL_CATALOG`에 항목을 추가해야 `OPENROUTER_MODELS`에 넣어도 노출된다          |
| 키 한도     | 키별 한도·작업 공간 예산이 예상 사용량을 감당하는지(9절의 현재 값)               |
| 오류 처리   | 402·403·429의 `Retry-After`와 `limit_source` 분기                                |
| 변형 접미사 | `:free`는 하루 요청 상한이 있고 대체 모델이 유료일 수 있다. 운영에는 쓰지 않는다 |

## 9. 실제 API 호출 검증 기록

검증일: **2026-11-08**. 라운지 `.env.local`의 `OPENROUTER_API_KEY`로 인증했다. 키 값은 문서에 저장하지 않는다.

### 9.1 인증과 한도

`GET https://openrouter.ai/api/v1/key` → **HTTP 200**. 잘못된 키는 HTTP 401(`User not found.`)을 돌려주었다.

| 항목                | 값                                                                |
| ------------------- | ----------------------------------------------------------------- |
| 키 한도             | 주 50달러, 남은 금액 49.52달러, 2026-11-09 00:00 UTC 초기화       |
| 작업 공간 예산      | 일 50달러(사용 0), 주 300달러(사용 0.48), 월 1,000달러(사용 0.57) |
| 실제 적용 예산      | 키 한도(가장 먼저 막히는 항목)                                    |
| 누적 사용           | 6.27달러                                                          |
| 무료 모델 일일 요청 | 1,000회 중 0회 사용                                               |
| 키 만료             | 2027-04-02                                                        |
| 데이터 지역         | `global`                                                          |

`GET /api/v1/credits` → 누적 충전 160달러, 누적 사용 108.81달러. 키 한도와 계정 잔액은 별개다.

### 9.2 모델 목록

`GET /api/v1/models` → 460개(텍스트). `?output_modalities=all` → 705개. `/models/count?output_modalities=all` → 705로 일치했다. 라운지가 설정·코드에서 쓰는 모델 ID 15개와 라우터 3개(`openrouter/auto`, `auto-code`, `free`)가 모두 목록에 있었다.

### 9.3 텍스트 생성

`POST https://openrouter.ai/api/v1/chat/completions`에 아래 JSON을 보냈다.

```json
{
  "model": "openai/gpt-5.4-mini",
  "max_tokens": 16,
  "messages": [{ "role": "user", "content": "Reply with exactly OK." }],
  "usage": { "include": true }
}
```

| 항목      | 값                                               |
| --------- | ------------------------------------------------ |
| HTTP      | 200                                              |
| 응답      | `OK`, `finish_reason: stop`                      |
| 실행      | `model: openai/gpt-5.4-mini`, `provider: OpenAI` |
| 토큰      | 입력 11, 출력 5, 합계 16                         |
| 비용      | `usage.cost` 0.00003075달러                      |
| 응답 시간 | 약 0.91초(1회 측정)                              |

### 9.4 남은 검증 범위

이미지 생성, 스트리밍, 도구 호출, `openrouter/auto`의 실제 선택, 변형 접미사, 402·403·429 처리는 검증하지 않았다. 라운지 운영 코드가 이미 텍스트·이미지 생성을 쓰고 있으므로 이번 검증은 **키 유효성과 한도, 목록 일치, 짧은 텍스트 생성**으로 한정했다.

## 10. 목록 갱신 절차

OpenRouter는 모델 목록 API가 있어 Gadia처럼 자동 갱신할 수 있지만, 2026-11-08 현재는 수동 갱신이다. Gadia의 `scripts/refresh-gadia-models.mjs`와 같은 방식의 주간 작업은 아직 만들지 않았다.

1. `curl "https://openrouter.ai/api/v1/models?output_modalities=all"`로 전체 목록을 받는다. 인증은 필요 없다.
2. 항목별로 `id`, `name`, `context_length`, `architecture.input_modalities`/`output_modalities`, `pricing.prompt`/`completion`(×1,000,000으로 100만 토큰 단가 환산), `supported_parameters`의 `tools` 유무, `reasoning` 유무, `expiration_date`, `alias_target`을 뽑는다.
3. 출력 종류별로 나누고 ID 순으로 정렬해 [openrouter-models.md](openrouter-models.md)를 다시 쓴다. 라운지 열은 라운지 `.env.local`과 `model-catalog.ts`를 다시 읽어 채운다.
4. 7절의 라운지 사용 모델이 모두 목록에 남아 있는지, `expiration_date`가 붙지 않았는지 확인하고 기준일을 고친다.
