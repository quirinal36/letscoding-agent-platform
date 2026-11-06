# 렛츠코딩 라운지 스튜디오 — kie.ai API 활용 매뉴얼

이 매뉴얼은 렛츠코딩 라운지 > 스튜디오에서 사용할 수 있는 kie.ai 모델의 연결 설정, 호출 방식, 전체 목록과 운영 전 확인 사항을 정리한다. 이 저장소에는 연동 참고 문서로 보관하며, 스튜디오에 모델을 적용하는 코드 변경은 포함하지 않는다. 텍스트 모델 위주의 Gadia API는 [Gadia API 활용 매뉴얼](gadia-api-manual.md)을 본다.

기준일: **2026-11-07** · 대상: 스튜디오 개발·운영 담당자

출처: kie.ai 공식 문서 색인 [docs.kie.ai/llms.txt](https://docs.kie.ai/llms.txt)와 색인에 등재된 API 문서 248개. 각 문서의 OpenAPI 명세에서 엔드포인트와 `model` 값을 추출했다. 실제 API 호출 검증 결과는 8절에 기록했다.

## 1. 적용 범위

kie.ai에는 Gadia의 `GET /v1/models` 같은 모델 목록 API가 없다. 공식 안내는 [Market 페이지](https://kie.ai/market)에서 최신 모델을 확인하라고 한다. 이 문서의 목록은 2026-11-07 공식 문서 색인 기준이며, Market 페이지와 1:1로 대조하지는 않았다.

| 분류      | API 문서 수 | 호출 방식                |
| --------- | ----------- | ------------------------ |
| 채팅      | 44          | 동기. 제공사별 전용 경로 |
| 이미지    | 73          | 비동기 작업              |
| 영상      | 99          | 비동기 작업              |
| 음악·음성 | 32          | 비동기 작업              |
| 합계      | 248         |                          |

문서 1개가 모델 1개에 대응하는 경우가 대부분이다. 다만 Suno·Veo·Flux Kontext처럼 문서 하나 안에서 하위 버전을 고르는 경우가 있고, 반대로 Suno 가사 생성·WAV 변환처럼 모델이라기보다 기능 단위인 문서도 있다. 공식 명세에서 `deprecated: true`로 표기된 7개 문서는 목록에 ⚠️로 표시했다.

스튜디오 기본 모델, 사용자에게 노출할 모델, 작업별 배정, 과금 정책은 정해져 있지 않다. 아래 절차는 공식 문서를 활용하기 위한 운영 안내이며 확정된 스튜디오 정책이 아니다.

## 2. API 연결 설정

| 항목             | 설정값                                                                           |
| ---------------- | -------------------------------------------------------------------------------- |
| Base URL         | `https://api.kie.ai`                                                             |
| 인증 헤더        | `Authorization: Bearer <API_KEY>`                                                |
| 본문 형식        | `Content-Type: application/json` (파일 스트림 업로드만 multipart)                |
| 키 발급·관리     | [kie.ai/api-key](https://kie.ai/api-key) — 키별 사용량 상한, IP 허용 목록        |
| 크레딧 잔액 조회 | `GET /api/v1/chat/credit`                                                        |
| 작업 내역        | [kie.ai/logs](https://kie.ai/logs) — 크레딧 사용량 확인의 기준                   |
| 가격표           | [kie.ai/pricing](https://kie.ai/pricing) — 모든 모델이 하나의 크레딧 잔액을 공유 |

**오류 응답 주의:** `/api/v1/*`와 업로드 엔드포인트는 오류가 나도 HTTP 200을 돌려주고 본문의 `code`에 실제 상태(401, 429 등)를 담는다. HTTP 상태만 보지 말고 반드시 `code`를 확인한다.

운영 안내: 키는 서버의 비밀 설정에서만 다루고 브라우저 코드·로그에 남기지 않는다. 공식 문서도 프런트엔드 노출을 금지한다.

## 3. 호출 방식

### 3.1 비동기 작업 — 이미지·영상·음악·음성

1. `POST /api/v1/jobs/createTask`에 `model`과 `input`(모델별 파라미터)을 보낸다. 선택 사항으로 `callBackUrl`을 넣는다.
2. 응답 `{"code": 200, "data": {"taskId": "…"}}`는 **작업 접수만 뜻한다.** 완료가 아니다.
3. `GET /api/v1/jobs/recordInfo?taskId=…`로 상태를 조회하거나 콜백을 받는다. 상태는 `waiting` → `queuing` → `generating` → `success` / `fail` 순이다.
4. `success`이면 `resultJson`에서 결과 파일 URL을 꺼낸다.

```json
{
  "model": "google/nano-banana",
  "callBackUrl": "https://your-domain.com/api/callback",
  "input": { "prompt": "..." }
}
```

`input`의 필드는 모델마다 다르다. 6절 표의 모델 이름 링크에서 각 명세를 확인한다. 하위 버전 옵션(Suno의 `V5`, Veo의 `veo3_fast` 등)은 `model`이 아니라 요청 본문 안의 별도 필드로 고른다.

**결과 보관 기간:** 생성 파일은 **14일** 후, 작업 기록은 2개월 후 자동 삭제된다. 서비스에서 계속 쓰려면 결과를 받아 자체 저장소에 옮겨야 한다. kie.ai 응답 URL을 영구 주소로 쓰지 않는다.

### 3.2 채팅 — 동기

채팅 모델은 작업 ID 없이 응답을 바로 돌려준다. 제공사마다 경로와 요청 형식이 다르므로 6.1절 표의 엔드포인트를 그대로 쓴다.

| 계열          | 엔드포인트                                                                               | 요청 형식                             |
| ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------- |
| Claude        | `POST /claude/v1/messages`                                                               | Anthropic Messages                    |
| GPT·Codex     | `POST /codex/v1/responses`                                                               | OpenAI Responses                      |
| Grok          | `POST /grok/v1/responses`                                                                | OpenAI Responses                      |
| DeepSeek·Kimi | `POST /openai/v1/responses`                                                              | OpenAI Responses                      |
| Gemini        | `POST /<모델>/v1/chat/completions` 또는 `/gemini/v1/models/<모델>:streamGenerateContent` | OpenAI Chat 호환 또는 Gemini 네이티브 |
| GPT 5.2       | `POST /gpt-5-2/v1/chat/completions`                                                      | OpenAI Chat 호환                      |

Gemini와 GPT 5.2는 모델 이름이 경로에 들어간다. 명세상 모든 채팅 계열이 `stream: true`(SSE)를 지원한다. Claude 엔드포인트는 `stream`이 **필수 필드**다. 빠뜨리면 오류 없이 응답이 오지 않아 60초 시간 초과가 났다(8절). 응답에는 사용 크레딧이 `credits_consumed`로 붙는다.

### 3.3 보조 API

| 용도              | 엔드포인트                                                                        |
| ----------------- | --------------------------------------------------------------------------------- |
| 크레딧 잔액       | `GET /api/v1/chat/credit`                                                         |
| 작업 상태·결과    | `GET /api/v1/jobs/recordInfo`                                                     |
| 결과 다운로드 URL | `POST /api/v1/common/download-url`                                                |
| 파일 업로드       | `POST /api/file-url-upload`, `/api/file-base64-upload`, `/api/file-stream-upload` |

## 4. 요청 한도

계정당 **10초에 새 생성 요청 20건**까지다. 동시 실행 작업은 보통 100건 이상 가능하다. 초과하면 `code: 429`를 받고 그 요청은 대기열에 들어가지 않는다. 자동 재시도할 때는 간격을 두어야 한다.

## 5. 라운지의 기존 사용 이력

- 라운지 저장소의 `scripts/generate-studio-music.mjs`가 Suno(`ai-music-api/generate`, `ai-music-api/sounds` / `V6`)로 BGM과 효과음을 만든 기록이 있다. 기록은 라운지 `docs/2026-11-01-studio-music-library.md`에 있다. 당시 키 이름은 `KIEV2_API_KEY`였다.
- 현재 라운지 `.env.local`의 키 이름은 `KIE_API_KEY`다. 2026-11-07 첫 조회에서는 인증에 실패했고, 키 교체 후 재검증에서 정상 동작했다(8절).

## 6. 모델 전체 목록

`model` 값은 요청 본문의 `model` 필드에 그대로 넣는다. 모델 이름은 공식 명세 문서로 연결된다. ⚠️는 공식 명세에 `deprecated: true`로 표기된 항목이다. 하위 버전 옵션이 비어 있으면 명세에 별도 버전 선택지가 없다는 뜻이다.

### 6.1 채팅 (44개 문서)

| 계열     | 모델                                                                                      | `model` 값                                                               | 엔드포인트                                                      |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Claude   | [Claude Fable 5](https://docs.kie.ai/market/claude/claude-fable-5)                        | `claude-fable-5`                                                         | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Haiku 4.5](https://docs.kie.ai/market/claude/claude-haiku-4-5)                    | `claude-haiku-4-5`                                                       | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Haiku 5.5](https://docs.kie.ai/market/claude/claude-haiku-5-5)                    | `claude-haiku-5-5`                                                       | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Opus 4.5](https://docs.kie.ai/market/claude/claude-opus-4-5)                      | `claude-opus-4-5`                                                        | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Opus 4.6](https://docs.kie.ai/market/claude/claude-opus-4-6)                      | `claude-opus-4-6`                                                        | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Opus 4.7](https://docs.kie.ai/market/claude/claude-opus-4-7)                      | `claude-opus-4-7`                                                        | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Opus 4.8](https://docs.kie.ai/market/claude/claude-opus-4-8)                      | `claude-opus-4-8`                                                        | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Opus 5](https://docs.kie.ai/market/claude/claude-opus-5)                          | `claude-opus-5`                                                          | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Opus 5.5](https://docs.kie.ai/market/claude/claude-opus-5-5)                      | `claude-opus-5-5`                                                        | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Sonnet 4.5](https://docs.kie.ai/market/claude/claude-sonnet-4-5)                  | `claude-sonnet-4-5`                                                      | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Sonnet 4.6](https://docs.kie.ai/market/claude/claude-sonnet-4-6)                  | `claude-sonnet-4-6`                                                      | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Sonnet 5](https://docs.kie.ai/market/claude/claude-sonnet-5)                      | `claude-sonnet-5`                                                        | `POST /claude/v1/messages`                                      |
| Claude   | [Claude Sonnet 5.5](https://docs.kie.ai/market/claude/claude-sonnet-5-5)                  | `claude-sonnet-5-5`                                                      | `POST /claude/v1/messages`                                      |
| Codex    | [Codex API](https://docs.kie.ai/market/codex/gpt-codex)                                   | `gpt-6-astra`, `gpt-5-6-sol`, `gpt-5-6-terra`, `gpt-5-6-luna`, `gpt-5-5` | `POST /codex/v1/responses`                                      |
| Deepseek | [DeepSeek V4.1 Flash](https://docs.kie.ai/market/deepseek-v4-1-flash)                     | `deepseek-v4-1-flash`                                                    | `POST /openai/v1/responses`                                     |
| GPT      | [GPT 5.2](https://docs.kie.ai/market/chat/gpt-5-2)                                        | `gpt-5-2`                                                                | `POST /gpt-5-2/v1/chat/completions`                             |
| GPT      | [GPT 5.5 (response)](https://docs.kie.ai/market/chat/gpt-5-5)                             | `gpt-5-5`                                                                | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 5.6 Luna](https://docs.kie.ai/market/chat/gpt-5-6-luna)                              | `gpt-5-6-luna`                                                           | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 5.6 Sol](https://docs.kie.ai/market/chat/gpt-5-6-sol)                                | `gpt-5-6-sol`                                                            | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 5.6 Terra](https://docs.kie.ai/market/chat/gpt-5-6-terra)                            | `gpt-5-6-terra`                                                          | `POST /codex/v1/responses`                                      |
| GPT      | [Gpt 6 Astra](https://docs.kie.ai/market/chat/gpt-6-astra)                                | `gpt-6-astra`                                                            | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 6 Luna](https://docs.kie.ai/market/chat/gpt-6-luna)                                  | `gpt-6-luna`                                                             | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 6 Sol](https://docs.kie.ai/market/chat/gpt-6-sol)                                    | `gpt-6-sol`                                                              | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 6.1 Sol](https://docs.kie.ai/market/chat/gpt-6-1-sol)                                | `gpt-6-1-sol`                                                            | `POST /codex/v1/responses`                                      |
| GPT      | [GPT 6.1 Terra](https://docs.kie.ai/market/chat/gpt-6-1-terra)                            | `gpt-6-1-terra`                                                          | `POST /codex/v1/responses`                                      |
| Gemini   | [Gemini 2.5 Pro (openai)](https://docs.kie.ai/market/gemini/gemini-2-5-pro) ⚠️            | `gemini-2.5-pro` (경로에 포함)                                           | `POST /gemini-2.5-pro/v1/chat/completions`                      |
| Gemini   | [Gemini 3 Pro (openai)](https://docs.kie.ai/market/gemini/gemini-3-pro)                   | `gemini-3-pro` (경로에 포함)                                             | `POST /gemini-3-pro/v1/chat/completions`                        |
| Gemini   | [Gemini 3.1 Pro (openai)](https://docs.kie.ai/market/gemini/gemini-3-1-pro)               | `gemini-3.1-pro` (경로에 포함)                                           | `POST /gemini-3.1-pro/v1/chat/completions`                      |
| Gemini   | [Gemini 3.5 Flash](https://docs.kie.ai/market/gemini/gemini-3-5-flash) ⚠️                 | `gemini-3-5-flash` (경로에 포함)                                         | `POST /gemini/v1/models/gemini-3-5-flash:streamGenerateContent` |
| Gemini   | [Gemini 3.5 Flash (openai)](https://docs.kie.ai/market/gemini/gemini-3-5-flash-openai) ⚠️ | `gemini-3-5-flash-openai` (경로에 포함)                                  | `POST /gemini-3-5-flash-openai/v1/chat/completions`             |
| Gemini   | [Gemini 3.6 Flash](https://docs.kie.ai/market/gemini/gemini-3-6-flash)                    | `gemini-3-6-flash` (경로에 포함)                                         | `POST /gemini/v1/models/gemini-3-6-flash:streamGenerateContent` |
| Gemini   | [Gemini 3.6 Flash (openai)](https://docs.kie.ai/market/gemini/gemini-3-6-flash-openai)    | `gemini-3-6-flash-openai` (경로에 포함)                                  | `POST /gemini-3-6-flash-openai/v1/chat/completions`             |
| Gemini   | [Gemini 3.7 Flash](https://docs.kie.ai/market/gemini/gemini-3-7-flash) ⚠️                 | `gemini-3-7-flash` (경로에 포함)                                         | `POST /gemini/v1/models/gemini-3-7-flash:streamGenerateContent` |
| Gemini   | [Gemini 3.7 Flash (openai)](https://docs.kie.ai/market/gemini/gemini-3-7-flash-openai) ⚠️ | `gemini-3-7-flash-openai` (경로에 포함)                                  | `POST /gemini-3-7-flash-openai/v1/chat/completions`             |
| Gemini   | [Gemini 3.8 Flash](https://docs.kie.ai/market/gemini/gemini-3-8-flash)                    | `gemini-3-8-flash` (경로에 포함)                                         | `POST /gemini/v1/models/gemini-3-8-flash:streamGenerateContent` |
| Gemini   | [Gemini 3.8 Flash (openai)](https://docs.kie.ai/market/gemini/gemini-3-8-flash-openai)    | `gemini-3-8-flash-openai` (경로에 포함)                                  | `POST /gemini-3-8-flash-openai/v1/chat/completions`             |
| Gemini   | [Gemini 4 Argon](https://docs.kie.ai/market/gemini/gemini-4-argon)                        | `gemini-4-argon` (경로에 포함)                                           | `POST /gemini/v1/models/gemini-4-argon:streamGenerateContent`   |
| Gemini   | [Gemini 4 Argon (openai)](https://docs.kie.ai/market/gemini/gemini-4-argon-openai)        | `gemini-4-argon-openai` (경로에 포함)                                    | `POST /gemini-4-argon-openai/v1/chat/completions`               |
| Grok     | [Grok 4.3](https://docs.kie.ai/market/grok/grok-4-3)                                      | `grok-4-3`                                                               | `POST /grok/v1/responses`                                       |
| Grok     | [Grok 4.5](https://docs.kie.ai/market/grok/grok-4-5)                                      | `grok-4-5`                                                               | `POST /grok/v1/responses`                                       |
| Grok     | [Grok 4.6](https://docs.kie.ai/market/grok/grok-4-6)                                      | `grok-4-6`                                                               | `POST /grok/v1/responses`                                       |
| Grok     | [Grok 4.7](https://docs.kie.ai/market/grok/grok-4-7)                                      | `grok-4-7`                                                               | `POST /grok/v1/responses`                                       |
| Kimi     | [Kimi K3](https://docs.kie.ai/market/kimi/kimi-k3)                                        | `kimi-k3`                                                                | `POST /openai/v1/responses`                                     |
| Kimi     | [Kimi K3.1 Pro](https://docs.kie.ai/market/kimi/kimi-k3-1-pro)                            | `kimi-k3-1-pro`                                                          | `POST /openai/v1/responses`                                     |

### 6.2 이미지 (73개 문서)

| 계열             | 모델                                                                                                            | `model` 값                              | 하위 버전 옵션                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| 4o Image API     | [Generate 4o Image](https://docs.kie.ai/4o-image-api/generate-4-o-image)                                        | `4o-image-api`                          |                                              |
| Flux Kontext API | [Generate or Edit Image](https://docs.kie.ai/flux-kontext-api/generate-or-edit-image)                           | `flux1-kontext`                         | `flux-kontext-pro`, `flux-kontext-max`       |
| Flux-2           | [Flux-2 - Image to Image](https://docs.kie.ai/market/flux2/flex-image-to-image)                                 | `flux-2/flex-image-to-image`            |                                              |
| Flux-2           | [Flux-2 - Pro Image to Image](https://docs.kie.ai/market/flux2/pro-image-to-image)                              | `flux-2/pro-image-to-image`             |                                              |
| Flux-2           | [Flux-2 - Pro Text to Image](https://docs.kie.ai/market/flux2/pro-text-to-image)                                | `flux-2/pro-text-to-image`              |                                              |
| Flux-2           | [Flux-2 - Text to Image](https://docs.kie.ai/market/flux2/flex-text-to-image)                                   | `flux-2/flex-text-to-image`             |                                              |
| Flux-3           | [FLUX 3 Klein Edit Image](https://docs.kie.ai/market/flux3/klein-edit-image)                                    | `flux-3/klein-edit-image`               |                                              |
| Flux-3           | [FLUX 3 Klein Text to Image](https://docs.kie.ai/market/flux3/klein-text-to-image)                              | `flux-3/klein-text-to-image`            |                                              |
| GPT Image        | [GPT Image 2 - Image To Image](https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image)                       | `gpt-image-2-image-to-image`            |                                              |
| GPT Image        | [GPT Image 2.5 Flare - Image To Image](https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-image-to-image)       | `gpt-image-2-5-flare-image-to-image`    |                                              |
| GPT Image        | [GPT Image 2.5 Flare - Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-5-flare-text-to-image)         | `gpt-image-2-5-flare-text-to-image`     |                                              |
| GPT Image        | [GPT Image 2.5 Sunburst - Image To Image](https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-image-to-image) | `gpt-image-2-5-sunburst-image-to-image` |                                              |
| GPT Image        | [GPT Image 2.5 Sunburst - Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-5-sunburst-text-to-image)   | `gpt-image-2-5-sunburst-text-to-image`  |                                              |
| GPT Image        | [GPT Image 2.6 Economy - Image to Image](https://docs.kie.ai/market/gpt/gpt-image-2-6-economy-image-to-image)   | `gpt-image-2-6/economy-image-to-image`  |                                              |
| GPT Image        | [GPT Image 2.6 Economy - Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-6-economy-text-to-image)     | `gpt-image-2-6/economy-text-to-image`   |                                              |
| GPT Image        | [GPT Image 2.6 Flare - Image to Image](https://docs.kie.ai/market/gpt/gpt-image-2-6-flare-image-to-image)       | `gpt-image-2-6/flare-image-to-image`    |                                              |
| GPT Image        | [GPT Image 2.6 Flare - Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-6-flare-text-to-image)         | `gpt-image-2-6/flare-text-to-image`     | `gpt-6-sol`, `gpt-5.6-luna`, `gpt-5.6-terra` |
| GPT Image        | [GPT Image 2.6 Sunburst - Image to Image](https://docs.kie.ai/market/gpt/gpt-image-2-6-sunburst-image-to-image) | `gpt-image-2-6/sunburst-image-to-image` |                                              |
| GPT Image        | [GPT Image 2.6 Sunburst - Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-6-sunburst-text-to-image)   | `gpt-image-2-6/sunburst-text-to-image`  | `gpt-6-sol`, `gpt-5.6-luna`, `gpt-5.6-terra` |
| GPT Image        | [GPT Image-1.5 - Image to Image](https://docs.kie.ai/market/gpt-image/1-5-image-to-image)                       | `gpt-image/1.5-image-to-image`          |                                              |
| GPT Image        | [GPT Image-1.5 - Text to Image](https://docs.kie.ai/market/gpt-image/1-5-text-to-image)                         | `gpt-image/1.5-text-to-image`           |                                              |
| GPT Image        | [GPT Image-2 - Text to Image](https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image)                         | `gpt-image-2-text-to-image`             |                                              |
| Google           | [Google - imagen4](https://docs.kie.ai/market/google/imagen4)                                                   | `google/imagen4`                        |                                              |
| Google           | [Google - imagen4-fast](https://docs.kie.ai/market/google/imagen4-fast)                                         | `google/imagen4-fast`                   |                                              |
| Google           | [Google - imagen4-ultra](https://docs.kie.ai/market/google/imagen4-ultra)                                       | `google/imagen4-ultra`                  |                                              |
| Google           | [Google - Nano Banana](https://docs.kie.ai/market/google/nano-banana)                                           | `google/nano-banana`                    |                                              |
| Google           | [Google - Nano Banana 2](https://docs.kie.ai/market/google/nanobanana2)                                         | `nano-banana-2`                         |                                              |
| Google           | [Google - Nano Banana 2 Lite](https://docs.kie.ai/market/google/nano-banana-2-lite)                             | `nano-banana-2-lite`                    |                                              |
| Google           | [Google - Nano Banana 2.1](https://docs.kie.ai/market/google/nanobanana-2-1)                                    | `nano-banana-2-1`                       |                                              |
| Google           | [Google - Nano Banana Edit](https://docs.kie.ai/market/google/nano-banana-edit)                                 | `google/nano-banana-edit`               |                                              |
| Google           | [Google - Nano Banana Pro](https://docs.kie.ai/market/google/pro-image-to-image)                                | `nano-banana-pro`                       |                                              |
| Grok Imagine     | [Grok Imagine - image to image](https://docs.kie.ai/market/grok-imagine/image-to-image)                         | `grok-imagine/image-to-image`           |                                              |
| Grok Imagine     | [Grok Imagine - Text to Image](https://docs.kie.ai/market/grok-imagine/text-to-image)                           | `grok-imagine/text-to-image`            |                                              |
| Grok Imagine     | [Grok Imagine Image 2.0 Image Edit](https://docs.kie.ai/market/grok-imagine-image-2-0/image-to-image)           | `grok-imagine-image-2-0/image-edit`     |                                              |
| Grok Imagine     | [Grok Imagine Image 2.0 Segment Edit](https://docs.kie.ai/market/grok-imagine-image-2-0/image-edit)             | `grok-imagine-image-2-0/segment-edit`   |                                              |
| Grok Imagine     | [Grok Imagine Image 2.0 Segment Map](https://docs.kie.ai/market/grok-imagine-image-2-0/segment-map)             | `grok-imagine-image-2-0/segment-map`    |                                              |
| Grok Imagine     | [Grok Imagine Image 2.0 Text To Image](https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image)         | `grok-imagine-image-2-0/text-to-image`  |                                              |
| Ideogram         | [Ideogram - Character](https://docs.kie.ai/market/ideogram/character)                                           | `ideogram/character`                    |                                              |
| Ideogram         | [Ideogram - Character Edit](https://docs.kie.ai/market/ideogram/character-edit)                                 | `ideogram/character-edit`               |                                              |
| Ideogram         | [Ideogram - Character Remix](https://docs.kie.ai/market/ideogram/character-remix)                               | `ideogram/character-remix`              |                                              |
| Ideogram         | [Ideogram V3 Edit](https://docs.kie.ai/market/ideogram/v3-edit)                                                 | `ideogram/v3-edit`                      |                                              |
| Ideogram         | [Ideogram V3 Remix](https://docs.kie.ai/market/ideogram/v3-remix)                                               | `ideogram/v3-remix`                     |                                              |
| Ideogram         | [Ideogram V3 Text to Image](https://docs.kie.ai/market/ideogram/v3-text-to-image)                               | `ideogram/v3-text-to-image`             |                                              |
| Qwen             | [Qwen - Image Edit](https://docs.kie.ai/market/qwen/image-edit)                                                 | `qwen/image-edit`                       |                                              |
| Qwen             | [Qwen - Image to Image](https://docs.kie.ai/market/qwen/image-to-image)                                         | `qwen/image-to-image`                   |                                              |
| Qwen             | [Qwen - Text to Image](https://docs.kie.ai/market/qwen/text-to-image)                                           | `qwen/text-to-image`                    |                                              |
| Qwen             | [Qwen 2.1 - Image to Image](https://docs.kie.ai/market/qwen2-1/image-to-image)                                  | `qwen2-1/image-to-image`                |                                              |
| Qwen             | [Qwen 2.1 - Text to Image](https://docs.kie.ai/market/qwen2-1/text-to-image)                                    | `qwen2-1/text-to-image`                 |                                              |
| Qwen             | [Qwen2 - Image Edit](https://docs.kie.ai/market/qwen2/image-edit)                                               | `qwen2/image-edit`                      |                                              |
| Qwen             | [Qwen2 - Text To Image](https://docs.kie.ai/market/qwen2/text-to-image)                                         | `qwen2/text-to-image`                   |                                              |
| Qwen             | [Qwen3 Image to Image](https://docs.kie.ai/market/qwen3/image-to-image)                                         | `qwen3/image-to-image`                  |                                              |
| Qwen             | [Qwen3 Pro Image to Image](https://docs.kie.ai/market/qwen3-pro/image-to-image)                                 | `qwen3/pro-image-to-image`              |                                              |
| Qwen             | [Qwen3 Pro Text to Image](https://docs.kie.ai/market/qwen3-pro/text-to-image)                                   | `qwen3/pro-text-to-image`               |                                              |
| Qwen             | [Qwen3 Text to Image](https://docs.kie.ai/market/qwen3/text-to-image)                                           | `qwen3/text-to-image`                   |                                              |
| Recraft          | [Recraft - Crisp Upscale](https://docs.kie.ai/market/recraft/crisp-upscale)                                     | `recraft/crisp-upscale`                 |                                              |
| Recraft          | [Recraft - Remove Background](https://docs.kie.ai/market/recraft/remove-background)                             | `recraft/remove-background`             |                                              |
| Seedream         | [Seedream3.0 - Text to Image](https://docs.kie.ai/market/seedream/seedream)                                     | `bytedance/seedream`                    |                                              |
| Seedream         | [Seedream4.0 - Edit](https://docs.kie.ai/market/seedream/seedream-v4-edit)                                      | `bytedance/seedream-v4-edit`            |                                              |
| Seedream         | [Seedream4.0 - Text to Image](https://docs.kie.ai/market/seedream/seedream-v4-text-to-image)                    | `bytedance/seedream-v4-text-to-image`   |                                              |
| Seedream         | [Seedream4.5 - Edit](https://docs.kie.ai/market/seedream/4-5-edit)                                              | `seedream/4.5-edit`                     |                                              |
| Seedream         | [Seedream4.5 - Text to Image](https://docs.kie.ai/market/seedream/4-5-text-to-image)                            | `seedream/4.5-text-to-image`            |                                              |
| Seedream         | [Seedream5.0 Flash - Layer Decomposition](https://docs.kie.ai/market/seedream/5-flash-layer-decomposition)      | `seedream/5-flash-layer-decomposition`  |                                              |
| Seedream         | [Seedream5.0 Flash - Image to Image](https://docs.kie.ai/market/seedream/5-flash-image-to-image)                | `seedream/5-flash-image-to-image`       |                                              |
| Seedream         | [Seedream5.0 Flash - Text to Image](https://docs.kie.ai/market/seedream/5-flash-text-to-image)                  | `seedream/5-flash-text-to-image`        |                                              |
| Seedream         | [Seedream5.0 Lite - Image to Image](https://docs.kie.ai/market/seedream-5-lite-image-to-image)                  | `seedream/5-lite-image-to-image`        |                                              |
| Seedream         | [Seedream5.0 Lite - Text to Image](https://docs.kie.ai/market/seedream/5-lite-text-to-image)                    | `seedream/5-lite-text-to-image`         |                                              |
| Seedream         | [Seedream5.0 Pro - Layer Decomposition](https://docs.kie.ai/market/seedream/5-pro-layer-decomposition)          | `seedream/5-pro-layer-decomposition`    |                                              |
| Seedream         | [Seedream5.0 Pro - Image to Image](https://docs.kie.ai/market/seedream/5-pro-image-to-image)                    | `seedream/5-pro-image-to-image`         |                                              |
| Seedream         | [Seedream5.0 Pro - Text to Image](https://docs.kie.ai/market/seedream/5-pro-text-to-image)                      | `seedream/5-pro-text-to-image`          |                                              |
| Topaz            | [Topaz - Image Upscale](https://docs.kie.ai/market/topaz/image-upscale)                                         | `topaz/image-upscale`                   |                                              |
| Wan              | [Wan 2.7 Image](https://docs.kie.ai/market/wan/2-7-image)                                                       | `wan/2-7-image`                         |                                              |
| Wan              | [Wan 2.7 Image Pro](https://docs.kie.ai/market/wan/2-7-image-pro)                                               | `wan/2-7-image-pro`                     |                                              |
| Z-image          | [Z-Image](https://docs.kie.ai/market/z-image/z-image)                                                           | `z-image`                               |                                              |

### 6.3 영상 (99개 문서)

| 계열               | 모델                                                                                                    | `model` 값                             | 하위 버전 옵션                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| Bytedance          | [Bytedance - V1 Lite Image to Video](https://docs.kie.ai/market/bytedance/v1-lite-image-to-video)       | `bytedance/v1-lite-image-to-video`     |                                                 |
| Bytedance          | [Bytedance - V1 Lite Text to Video](https://docs.kie.ai/market/bytedance/v1-lite-text-to-video)         | `bytedance/v1-lite-text-to-video`      |                                                 |
| Bytedance          | [Bytedance - V1 Pro Text to Video](https://docs.kie.ai/market/bytedance/v1-pro-text-to-video)           | `bytedance/v1-pro-text-to-video`       |                                                 |
| Bytedance          | [Bytedance Seedance 2.0 Fast](https://docs.kie.ai/market/bytedance/seedance-2-fast)                     | `bytedance/seedance-2-fast`            |                                                 |
| Bytedance          | [Bytedance Seedance 2.0 Mini](https://docs.kie.ai/market/bytedance/seedance-2-mini)                     | `bytedance/seedance-2-mini`            |                                                 |
| Bytedance          | [Bytedance Seedance 2.5](https://docs.kie.ai/market/bytedance/seedance-2-5)                             | `bytedance/seedance-2-5`               |                                                 |
| Bytedance          | [Bytedance Seedance 2.5 Draft](https://docs.kie.ai/market/bytedance/seedance-2-5-draft)                 | `bytedance/seedance-2-5-draft`         |                                                 |
| Bytedance          | [Bytedance V1 Pro Fast Image to Video](https://docs.kie.ai/market/bytedance/v1-pro-fast-image-to-video) | `bytedance/v1-pro-fast-image-to-video` |                                                 |
| Bytedance          | [Bytedance V1 Pro Image to Video](https://docs.kie.ai/market/bytedance/v1-pro-image-to-video)           | `bytedance/v1-pro-image-to-video`      |                                                 |
| Bytedance          | [bytedance-seedance-2](https://docs.kie.ai/market/bytedance/seedance-2)                                 | `bytedance/seedance-2`                 |                                                 |
| Gemini Omni        | [Gemini Omni 1.1 Flash](https://docs.kie.ai/market/google/gemini-omni-flash-1-1)                        | `google/gemini-omni-flash-1-1`         |                                                 |
| Gemini Omni        | [Gemini Omni Audio](https://docs.kie.ai/market/gemini-omni-audio)                                       | —                                      | 엔드포인트 `POST /api/v1/omni/audio/create`     |
| Gemini Omni        | [Gemini Omni Character](https://docs.kie.ai/market/gemini-omni-character)                               | —                                      | 엔드포인트 `POST /api/v1/omni/character/create` |
| Gemini Omni        | [Gemini Omni Video](https://docs.kie.ai/market/gemini-omni-video)                                       | `gemini-omni-video`                    |                                                 |
| Grok Imagine       | [Grok Imagine - Video Extend](https://docs.kie.ai/market/grok-imagine/extend)                           | `grok-imagine/extend`                  |                                                 |
| Grok Imagine       | [Grok Imagine - Video Upscale](https://docs.kie.ai/market/grok-imagine/upscale)                         | `grok-imagine/upscale`                 |                                                 |
| Grok Imagine       | [Grok Imagine Image to Video](https://docs.kie.ai/market/grok-imagine/image-to-video)                   | `grok-imagine/image-to-video`          |                                                 |
| Grok Imagine       | [Grok Imagine Text to Video](https://docs.kie.ai/market/grok-imagine/text-to-video)                     | `grok-imagine/text-to-video`           |                                                 |
| Grok Imagine       | [Grok Imagine Video 1.5 Preview](https://docs.kie.ai/market/grok-imagine/1-5-preview)                   | `grok-imagine-video-1-5-preview`       |                                                 |
| Hailuo             | [Hailuo 2.3 Pro Image to Video](https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro)               | `hailuo/2-3-image-to-video-pro`        |                                                 |
| Hailuo             | [Hailuo 2.3 Standard Image to Video](https://docs.kie.ai/market/hailuo/2-3-image-to-video-standard)     | `hailuo/2-3-image-to-video-standard`   |                                                 |
| Hailuo             | [Hailuo Pro Image to Video](https://docs.kie.ai/market/hailuo/02-image-to-video-pro)                    | `hailuo/02-image-to-video-pro`         |                                                 |
| Hailuo             | [Hailuo Pro Text to Video](https://docs.kie.ai/market/hailuo/02-text-to-video-pro)                      | `hailuo/02-text-to-video-pro`          |                                                 |
| Hailuo             | [Hailuo Standard Image to Video](https://docs.kie.ai/market/hailuo/02-image-to-video-standard)          | `hailuo/02-image-to-video-standard`    |                                                 |
| Hailuo             | [Hailuo Standard Text to Video](https://docs.kie.ai/market/hailuo/02-text-to-video-standard)            | `hailuo/02-text-to-video-standard`     |                                                 |
| HappyHorse         | [HappyHorse-1-1 image-to-video](https://docs.kie.ai/market/happyhorse-1-1/image-to-video)               | `happyhorse-1-1/image-to-video`        |                                                 |
| HappyHorse         | [HappyHorse-1-1 reference-to-video](https://docs.kie.ai/market/happyhorse-1-1/reference-to-video)       | `happyhorse-1-1/reference-to-video`    |                                                 |
| HappyHorse         | [HappyHorse-1-1 text-to-video](https://docs.kie.ai/market/happyhorse-1-1/text-to-video)                 | `happyhorse-1-1/text-to-video`         |                                                 |
| HappyHorse         | [happyhorse-image-to-video](https://docs.kie.ai/market/happyhorse/image-to-video)                       | `happyhorse/image-to-video`            |                                                 |
| HappyHorse         | [happyhorse-text-to-video](https://docs.kie.ai/market/happyhorse/text-to-video)                         | `happyhorse/text-to-video`             |                                                 |
| HappyHorse         | [happyhorse/reference-to-video](https://docs.kie.ai/market/happyhorse/reference-to-video)               | `happyhorse/reference-to-video`        |                                                 |
| HappyHorse         | [happyhorse/video-edit](https://docs.kie.ai/market/happyhorse/video-edit)                               | `happyhorse/video-edit`                |                                                 |
| Infinitalk         | [Infinitalk - From Audio](https://docs.kie.ai/market/infinitalk/from-audio)                             | `infinitalk/from-audio`                |                                                 |
| Kling              | [Kling - V2.5 Turbo Image to Video Pro](https://docs.kie.ai/market/kling/v25-turbo-image-to-video-pro)  | `kling/v2-5-turbo-image-to-video-pro`  |                                                 |
| Kling              | [Kling - V2.5 Turbo Text to Video Pro](https://docs.kie.ai/market/kling/v25-turbo-text-to-video-pro)    | `kling/v2-5-turbo-text-to-video-pro`   |                                                 |
| Kling              | [Kling - V3 Turbo Image to Video](https://docs.kie.ai/market/kling/v3-turbo-image-to-video)             | `kling/v3-turbo-image-to-video`        |                                                 |
| Kling              | [Kling - V3 Turbo Text to Video](https://docs.kie.ai/market/kling/v3-turbo-text-to-video)               | `kling/v3-turbo-text-to-video`         |                                                 |
| Kling              | [Kling 2.6 Image to Video](https://docs.kie.ai/market/kling/image-to-video)                             | `kling-2.6/image-to-video`             |                                                 |
| Kling              | [Kling 2.6 motion-control](https://docs.kie.ai/market/kling/motion-control)                             | `kling-2.6/motion-control`             |                                                 |
| Kling              | [Kling 2.6 Text to Video](https://docs.kie.ai/market/kling/text-to-video)                               | `kling-2.6/text-to-video`              |                                                 |
| Kling              | [Kling 3.0](https://docs.kie.ai/market/kling/kling-3-0)                                                 | `kling-3.0/video`                      |                                                 |
| Kling              | [Kling 3.0 Omni Image To Video](https://docs.kie.ai/market/kling/v3-omni-image-to-video)                | `kling-3.0-omni/image-to-video`        |                                                 |
| Kling              | [Kling 3.0 Omni Reference To Video](https://docs.kie.ai/market/kling/v3-omni-reference-to-video)        | `kling-3.0-omni/reference-to-video`    |                                                 |
| Kling              | [Kling 3.0 Omni Text to Video](https://docs.kie.ai/market/kling/v3-omni-text-to-video)                  | `kling-3.0-omni/text-to-video`         |                                                 |
| Kling              | [Kling 3.0 Omni Transformation](https://docs.kie.ai/market/kling/v3-omni-transformation)                | `kling-3.0-omni/transformation`        |                                                 |
| Kling              | [Kling 4.0 Flash Keyframe To Video](https://docs.kie.ai/market/kling/v4-flash-keyframe-to-video)        | `kling-4.0/flash-keyframe-to-video`    |                                                 |
| Kling              | [Kling 4.0 Flash Reference To Video](https://docs.kie.ai/market/kling/v4-flash-reference-to-video)      | `kling-4.0/flash-reference-to-video`   |                                                 |
| Kling              | [Kling 4.0 Keyframe To Video](https://docs.kie.ai/market/kling/v4-keyframe-to-video)                    | `kling-4.0/keyframe-to-video`          |                                                 |
| Kling              | [Kling 4.0 Reference To Video](https://docs.kie.ai/market/kling/v4-reference-to-video)                  | `kling-4.0/reference-to-video`         |                                                 |
| Kling              | [Kling AI Avatar Pro](https://docs.kie.ai/market/kling/ai-avatar-pro)                                   | `kling/ai-avatar-pro`                  |                                                 |
| Kling              | [Kling AI Avatar Standard](https://docs.kie.ai/market/kling/ai-avatar-standard)                         | `kling/ai-avatar-standard`             |                                                 |
| Kling              | [Kling V2.1 Master Image to Video](https://docs.kie.ai/market/kling/v2-1-master-image-to-video)         | `kling/v2-1-master-image-to-video`     |                                                 |
| Kling              | [Kling V2.1 Master Text to Video](https://docs.kie.ai/market/kling/v2-1-master-text-to-video)           | `kling/v2-1-master-text-to-video`      |                                                 |
| Kling              | [Kling V2.1 Pro](https://docs.kie.ai/market/kling/v2-1-pro)                                             | `kling/v2-1-pro`                       |                                                 |
| Kling              | [Kling V2.1 Standard](https://docs.kie.ai/market/kling/v2-1-standard)                                   | `kling/v2-1-standard`                  |                                                 |
| Kling              | [Kling-3.0 motion-control](https://docs.kie.ai/market/kling/motion-control-v3)                          | `kling-3.0/motion-control`             |                                                 |
| MiniMax H3         | [MiniMax H3 Image-to-Video](https://docs.kie.ai/market/minimax-h3/image-to-video)                       | `minimax-h3/image-to-video`            |                                                 |
| MiniMax H3         | [MiniMax H3 Reference-to-Video](https://docs.kie.ai/market/minimax-h3/reference-to-video)               | `minimax-h3/reference-to-video`        |                                                 |
| MiniMax H3         | [MiniMax H3 Text-to-Video](https://docs.kie.ai/market/minimax-h3/text-to-video)                         | `minimax-h3/text-to-video`             |                                                 |
| OmniHuman          | [Omnihuman 1.5](https://docs.kie.ai/market/omnihuman-1-5)                                               | `omnihuman-1-5`                        |                                                 |
| OmniHuman          | [Omnihuman 1.5 Human Identification](https://docs.kie.ai/market/omnihuman-1-5/human-identification)     | `omnihuman-1-5/human-identification`   |                                                 |
| OmniHuman          | [OmniHuman 1.5 Subject Detection](https://docs.kie.ai/market/omnihuman-1-5/subject-detection)           | `omnihuman-1-5/subject-detection`      |                                                 |
| OmniHuman          | [Omnihuman 2.0](https://docs.kie.ai/market/omnihuman-2-0)                                               | `omnihuman-2-0`                        |                                                 |
| PixVerse           | [PixVerse V6 First & Last Frame Transition](https://docs.kie.ai/market/pixverse/transition)             | `pixverse-v6/transition`               |                                                 |
| PixVerse           | [PixVerse V6 Fusion / Reference-to-Video](https://docs.kie.ai/market/pixverse/reference-to-video)       | `pixverse-v6/reference-to-video`       |                                                 |
| PixVerse           | [PixVerse V6 Image-to-Video](https://docs.kie.ai/market/pixverse/image-to-video)                        | `pixverse-v6/image-to-video`           |                                                 |
| PixVerse           | [PixVerse V6 Max Image-to-Video](https://docs.kie.ai/market/pixverse/v6-max-image-to-video)             | `pixverse-v6-max/image-to-video`       |                                                 |
| PixVerse           | [PixVerse V6 Max Text-to-Video](https://docs.kie.ai/market/pixverse/v6-max-text-to-video)               | `pixverse-v6-max/text-to-video`        |                                                 |
| PixVerse           | [PixVerse V6 Text-to-Video](https://docs.kie.ai/market/pixverse/text-to-video)                          | `pixverse-v6/text-to-video`            |                                                 |
| PixVerse           | [PixVerse V6 Video Extension](https://docs.kie.ai/market/pixverse/extend)                               | `pixverse-v6/extend`                   |                                                 |
| Runway API         | [Extend AI Video](https://docs.kie.ai/runway-api/extend-ai-video)                                       | `runway/extend-ai-video`               |                                                 |
| Runway API         | [Generate AI Video](https://docs.kie.ai/runway-api/generate-ai-video)                                   | `runway`                               |                                                 |
| Runway API > Aleph | [Generate Aleph Video](https://docs.kie.ai/runway-api/generate-aleph-video) ⚠️                          | `runway/gen4-aleph`                    |                                                 |
| Topaz              | [Topaz - Video Upscale](https://docs.kie.ai/market/topaz/video-upscale)                                 | `topaz/video-upscale`                  |                                                 |
| Veo3.1 API         | [Extend Veo3.1 Video](https://docs.kie.ai/veo3-api/extend-video)                                        | `veo/extend`                           | `fast`, `quality`, `lite`                       |
| Veo3.1 API         | [Generate Veo3.1 Video](https://docs.kie.ai/veo3-api/generate-veo-3-video)                              | `veo-3-1`                              | `veo3_fast`, `veo3_lite`, `veo3`                |
| Veo3.1 API         | [Get 1080P Video](https://docs.kie.ai/veo3-api/get-veo-3-1080-p-video)                                  | `veo/get-1080p-video`                  |                                                 |
| Veo3.1 API         | [Get 4K Video](https://docs.kie.ai/veo3-api/get-veo-3-4k-video)                                         | `veo/get-4k-video`                     |                                                 |
| Vidu               | [Vidu Q4 Image To Video](https://docs.kie.ai/market/vidu-q4/image-to-video)                             | `vidu-q4/image-to-video`               |                                                 |
| Vidu               | [Vidu Q4 Reference To Video](https://docs.kie.ai/market/vidu-q4/reference-to-video)                     | `vidu-q4/reference-to-video`           |                                                 |
| Volcengine         | [Volcengine video to video lip sync](https://docs.kie.ai/market/volcengine/video-to-video-lip-sync)     | `volcengine/video-to-video-lip-sync`   |                                                 |
| Wan                | [Wan - 2-6-flash-video-to-video](https://docs.kie.ai/market/wan/2-6-flash-video-to-video)               | `wan/2-6-flash-video-to-video`         |                                                 |
| Wan                | [Wan - 2.2 A14B Image to Video Turbo](https://docs.kie.ai/market/wan/2-2-a14b-image-to-video-turbo)     | `wan/2-2-a14b-image-to-video-turbo`    |                                                 |
| Wan                | [Wan - 2.2 A14B Speech to Video Turbo](https://docs.kie.ai/market/wan/2-2-a14b-speech-to-video-turbo)   | `wan/2-2-a14b-speech-to-video-turbo`   |                                                 |
| Wan                | [Wan - 2.2 A14B Text to Video Turbo](https://docs.kie.ai/market/wan/2-2-a14b-text-to-video-turbo)       | `wan/2-2-a14b-text-to-video-turbo`     |                                                 |
| Wan                | [Wan - 2.6-flash-image-to-video](https://docs.kie.ai/market/wan/2-6-flash-image-to-video)               | `wan/2-6-flash-image-to-video`         |                                                 |
| Wan                | [Wan - Animate Move](https://docs.kie.ai/market/wan/2-2-animate-move)                                   | `wan/2-2-animate-move`                 |                                                 |
| Wan                | [Wan - Animate Replace](https://docs.kie.ai/market/wan/2-2-animate-replace)                             | `wan/2-2-animate-replace`              |                                                 |
| Wan                | [Wan 2.5 - Image to Video](https://docs.kie.ai/market/wan/2-5-image-to-video)                           | `wan/2-5-image-to-video`               |                                                 |
| Wan                | [Wan 2.5 - Text to Video](https://docs.kie.ai/market/wan/2-5-text-to-video)                             | `wan/2-5-text-to-video`                |                                                 |
| Wan                | [Wan 2.6 - Image to Video](https://docs.kie.ai/market/wan/2-6-image-to-video)                           | `wan/2-6-image-to-video`               |                                                 |
| Wan                | [Wan 2.6 - Text to Video](https://docs.kie.ai/market/wan/2-6-text-to-video)                             | `wan/2-6-text-to-video`                |                                                 |
| Wan                | [Wan 2.6 - Video to Video](https://docs.kie.ai/market/wan/2-6-video-to-video)                           | `wan/2-6-video-to-video`               |                                                 |
| Wan                | [Wan 2.7 - Image to Video](https://docs.kie.ai/market/wan/2-7-image-to-video)                           | `wan/2-7-image-to-video`               |                                                 |
| Wan                | [Wan 2.7 - Reference to Video](https://docs.kie.ai/market/wan/2-7-r2v)                                  | `wan/2-7-r2v`                          |                                                 |
| Wan                | [Wan 2.7 - Text to Video](https://docs.kie.ai/market/wan/2-7-text-to-video)                             | `wan/2-7-text-to-video`                |                                                 |
| Wan                | [Wan 2.7 - Video Edit](https://docs.kie.ai/market/wan/2-7-videoedit)                                    | `wan/2-7-videoedit`                    |                                                 |
| Wan                | [Wan 3.0 - Video](https://docs.kie.ai/market/wan/3-0-video)                                             | `wan/3-0-video`                        |                                                 |
| Wan                | [Wan 3.0 - Video Prime](https://docs.kie.ai/market/wan/3-0-video-prime)                                 | `wan/3-0-video-prime`                  |                                                 |

### 6.4 음악·음성 (32개 문서)

| 계열                          | 모델                                                                                                              | `model` 값                                  | 하위 버전 옵션                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| ElevenLabs                    | [elevenlabs/audio-isolation](https://docs.kie.ai/market/elevenlabs/audio-isolation) ⚠️                            | `elevenlabs/audio-isolation`                |                                                                               |
| ElevenLabs                    | [elevenlabs/text-to-dialogue-v3](https://docs.kie.ai/market/elevenlabs/text-to-dialogue-v3)                       | `elevenlabs/text-to-dialogue-v3`            |                                                                               |
| ElevenLabs                    | [elevenlabs/text-to-speech-multilingual-v2](https://docs.kie.ai/market/elevenlabs/text-to-speech-multilingual-v2) | `elevenlabs/text-to-speech-multilingual-v2` |                                                                               |
| ElevenLabs                    | [elevenlabs/text-to-speech-turbo-2-5](https://docs.kie.ai/market/elevenlabs/text-to-speech-turbo-2-5)             | `elevenlabs/text-to-speech-turbo-2-5`       |                                                                               |
| Gemini                        | [Gemini 2.5 Pro Text to Speech](https://docs.kie.ai/market/google/gemini-2-5-pro-tts)                             | `google/gemini-2-5-pro-tts`                 |                                                                               |
| Gemini                        | [Gemini 3.1 Flash Text to speech](https://docs.kie.ai/market/google/gemini-3-1-flash-tts)                         | `google/gemini-3-1-flash-tts`               |                                                                               |
| Gemini                        | [Gemini 3.8 Flash Lite Text to speech](https://docs.kie.ai/market/google/gemini-3-8-flash-lite-tts)               | `google/gemini-3-8-flash-lite-tts`          |                                                                               |
| Gemini                        | [Gemini 3.8 Flash Text to speech](https://docs.kie.ai/market/google/gemini-3-8-flash-tts)                         | `google/gemini-3-8-flash-tts`               |                                                                               |
| NVIDIA                        | [Nemotron 3.5 Transcribe](https://docs.kie.ai/market/nvidia/nemotron-3-5-transcribe)                              | `nvidia/nemotron-3-5-transcribe`            |                                                                               |
| Suno > Lyrics Generation      | [Generate Lyrics](https://docs.kie.ai/suno-api/generate-lyrics)                                                   | `ai-music-api/generate-lyrics`              |                                                                               |
| Suno > Music Generation       | [Add Instrumental to Music](https://docs.kie.ai/suno-api/add-instrumental)                                        | `ai-music-api/add-instrumental`             | `V4_5PLUS`, `V5`, `V5_5`, `V6`, `V6_MINI`, `V6_WILD`                          |
| Suno > Music Generation       | [Add Vocals to Music](https://docs.kie.ai/suno-api/add-vocals)                                                    | `ai-music-api/add-vocals`                   | `V4_5PLUS`, `V5`, `V5_5`, `V6`, `V6_MINI`, `V6_WILD`                          |
| Suno > Music Generation       | [Boost Music Style](https://docs.kie.ai/suno-api/boost-music-style)                                               | `ai-music-api/boost-music-style`            |                                                                               |
| Suno > Music Generation       | [Extend Music](https://docs.kie.ai/suno-api/extend-music)                                                         | `ai-music-api/extend`                       | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5`, `V5_5`, `V6`, `V6_WILD`, `V6_MINI` |
| Suno > Music Generation       | [Generate Mashup Music](https://docs.kie.ai/suno-api/generate-mashup)                                             | `ai-music-api/mashup`                       | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5`, `V5_5`, `V6`, `V6_WILD`, `V6_MINI` |
| Suno > Music Generation       | [Generate Music](https://docs.kie.ai/suno-api/generate-music)                                                     | `ai-music-api/generate`                     | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5`, `V5_5`, `V6`, `V6_MINI`, `V6_WILD` |
| Suno > Music Generation       | [Generate Music Cover](https://docs.kie.ai/suno-api/cover-suno)                                                   | `ai-music-api/cover-generate`               |                                                                               |
| Suno > Music Generation       | [Generate Persona](https://docs.kie.ai/suno-api/generate-persona)                                                 | `ai-music-api/generate-persona`             |                                                                               |
| Suno > Music Generation       | [Get Timestamped Lyrics](https://docs.kie.ai/suno-api/get-timestamped-lyrics)                                     | `ai-music-api/timeStamped-lyrics`           |                                                                               |
| Suno > Music Generation       | [Recovery Audio](https://docs.kie.ai/suno-api/recovery-audio)                                                     | `ai-music-api/suno-recovery-audio`          |                                                                               |
| Suno > Music Generation       | [Replace Music Section](https://docs.kie.ai/suno-api/replace-section)                                             | `ai-music-api/replace-section`              | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5`, `V5_5`, `V6`, `V6_MINI`, `V6_WILD` |
| Suno > Music Generation       | [Upload And Cover Audio](https://docs.kie.ai/suno-api/upload-and-cover-audio)                                     | `ai-music-api/upload-and-cover-audio`       | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5`, `V5_5`, `V6`, `V6_WILD`, `V6_MINI` |
| Suno > Music Generation       | [Upload And Extend Audio](https://docs.kie.ai/suno-api/upload-and-extend-audio)                                   | `ai-music-api/upload-and-extend-audio`      | `V4`, `V4_5`, `V4_5PLUS`, `V4_5ALL`, `V5`, `V5_5`, `V6`, `V6_WILD`, `V6_MINI` |
| Suno > Music Video Generation | [Create Music Video](https://docs.kie.ai/suno-api/create-music-video)                                             | `ai-music-api/create-music-video`           |                                                                               |
| Suno > Sounds Generation      | [Generate sounds](https://docs.kie.ai/suno-api/generate-sounds)                                                   | `ai-music-api/sounds`                       | `V5`, `V5_5`, `V6`, `V6_WILD`, `V6_MINI`                                      |
| Suno > Vocal Removal          | [Generate MIDI from Audio](https://docs.kie.ai/suno-api/generate-midi)                                            | `ai-music-api/generate-midi-from-audio`     |                                                                               |
| Suno > Vocal Removal          | [Vocal & Instrument Stem Separation](https://docs.kie.ai/suno-api/separate-vocals)                                | `ai-music-api/separate-vocals`              |                                                                               |
| Suno > WAV Conversion         | [Convert to WAV Format](https://docs.kie.ai/suno-api/convert-to-wav)                                              | `ai-music-api/convert-to-wav-format`        |                                                                               |
| Suno > voice                  | [Suno Voice Check Availability API](https://docs.kie.ai/suno-api/suno-voice-check-voice)                          | `ai-music-api/check-voice`                  |                                                                               |
| Suno > voice                  | [Suno Voice Create Custom Voice API](https://docs.kie.ai/suno-api/suno-voice-generate)                            | `ai-music-api/create-voice`                 |                                                                               |
| Suno > voice                  | [Suno Voice Generate Verification Phrase API](https://docs.kie.ai/suno-api/suno-voice-validate)                   | `ai-music-api/validation-phrase`            |                                                                               |
| Suno > voice                  | [Suno Voice Regenerate Verification Phrase](https://docs.kie.ai/suno-api/suno-voice-regenerate)                   | `ai-music-api/regenerate-phrase`            |                                                                               |

## 7. 스튜디오 적용 전 확인 사항

| 항목                  | 확인할 내용                                                                             |
| --------------------- | --------------------------------------------------------------------------------------- |
| API 키                | 운영 서버의 키 저장 위치, 키별 사용량 상한·IP 허용 설정                                 |
| 기본 모델과 노출 목록 | 스튜디오의 이미지·영상·음악 기본 모델, 사용자가 고를 수 있는 모델                       |
| 비용                  | [가격표](https://kie.ai/pricing)의 모델별 크레딧 단가. 이 문서에는 단가를 옮기지 않았다 |
| 결과 보관             | 14일 삭제 전에 자체 저장소로 옮기는 흐름                                                |
| 비동기 처리           | 콜백 수신 서버 또는 조회 주기, 시간 초과 기준, `fail` 처리                              |
| 오류 처리             | HTTP 200 안의 `code` 판정, 429 대응, 재시도와 대체 모델                                 |
| 권리·약관             | 모델별 상업적 이용 조건. Suno는 [현행 약관](https://suno.com/terms)도 따로 확인         |
| deprecated 항목       | ⚠️ 표시 모델은 새로 연동하지 않는다                                                     |

## 8. 실제 API 호출 검증 기록

검증일: **2026-11-07**. 라운지 `.env.local`의 `KIE_API_KEY`로 인증했다. 키 값은 문서에 저장하지 않는다.

### 8.1 인증과 크레딧 조회

첫 시도에서는 `GET /api/v1/chat/credit`가 HTTP 200에 본문 `code: 401`을 돌려주었다. 임의의 잘못된 키와 같은 응답이었다. 키를 교체한 뒤 같은 요청이 `{"code": 200, "msg": "success", "data": 3666.51}`을 반환했다. 잔액 단위는 크레딧이다.

### 8.2 채팅 생성

`POST https://api.kie.ai/claude/v1/messages`에 아래 JSON을 보냈다. 헤더는 `Authorization: Bearer <API_KEY>`, `Content-Type: application/json`이다.

```json
{
  "model": "claude-haiku-4-5",
  "max_tokens": 16,
  "stream": false,
  "messages": [{ "role": "user", "content": "Reply with exactly OK." }]
}
```

| 시도               | 결과                                         | 응답 시간  | 사용량                         |
| ------------------ | -------------------------------------------- | ---------- | ------------------------------ |
| `stream` 필드 없음 | 응답 없음, 60초 시간 초과                    | 60초 초과  | 크레딧 변화 없음               |
| `stream: false`    | HTTP 200, 응답 `OK`, `stop_reason: end_turn` | 약 12.76초 | 입력 7·출력 1 토큰, 0.01크레딧 |

응답의 `model`은 `claude-haiku-4-5-20251001`이었다. 호출 뒤 잔액은 3666.50으로, 응답의 `credits_consumed: 0.01`과 일치했다. 응답 시간은 1회 측정값이다.

### 8.3 남은 검증 범위

이미지·영상·음악 비동기 작업(`createTask` → `recordInfo`), 콜백, 다른 채팅 계열, 스트리밍, 오류·429 처리는 검증하지 않았다. 생성 작업은 크레딧을 쓰므로 실행 전 승인을 받는다. **6절 목록은 공식 문서 기준이며 각 모델의 실제 호출 가능 여부는 확인하지 않았다.**

## 9. 목록 갱신 방법

모델 목록 API가 없어 Gadia처럼 자동 갱신하지 않는다. 갱신할 때는 다음 순서로 공식 문서를 다시 읽는다.

1. [docs.kie.ai/llms.txt](https://docs.kie.ai/llms.txt)의 `## API Docs` 아래 영문 항목(`/cn/` 제외)을 모은다.
2. 각 문서(`.md`)의 OpenAPI 명세에서 `paths`의 엔드포인트, 요청 본문 `model`의 `enum`(없으면 `default`·`examples`), `deprecated` 표기를 읽는다.
3. 6절 표와 비교해 추가·삭제·deprecated 변경을 반영하고 기준일을 고친다.
