# Gadia API 최신 모델 목록

이 파일은 `scripts/refresh-gadia-models.mjs`가 생성한다. 직접 수정하지 않는다.

목록 갱신 시각: 2026-11-06 · 항목 수: 31

조회: `https://api.gadia.ai/v1/models`. 변경이 없으면 파일을 다시 쓰지 않으며, 매 실행의 확인 시각과 결과는 로컬 작업 로그에 기록한다.

지원 표기는 API 메타데이터이며 실제 생성·도구·이미지 기능의 검증 결과가 아니다. 별칭의 미공개 필드는 미지원이라는 뜻이 아니다.

| ID | 이름 | 제공사 | 티어 | 등급 | 컨텍스트(토큰) | 도구 | 비전 | 출력 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plexus/auto | 자동 라우팅 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 |
| plexus/claude-fable-5 | Claude Fable 5 | claude | t3 | frontier | 1000000 | 예 | 예 | text |
| plexus/claude-fable-5-1 | Claude Fable 5.1 | claude | t3 | frontier | 1000000 | 예 | 예 | text |
| plexus/claude-haiku | Claude Haiku 4.5 | claude | t1 | economy | 200000 | 예 | 예 | text |
| plexus/claude-opus | Claude Opus 4.8 | claude | t3 | performance | 1000000 | 예 | 예 | text |
| plexus/claude-opus-5 | Claude Opus 5 | claude | t3 | performance | 1000000 | 예 | 예 | text |
| plexus/claude-opus-5-5 | Claude Opus 5.5 | claude | t3 | performance | 1000000 | 예 | 예 | text |
| plexus/claude-sonnet | Claude Sonnet 5 | claude | t2 | standard | 1000000 | 예 | 예 | text |
| plexus/claude-sonnet-5-5 | Claude Sonnet 5.5 | claude | t2 | standard | 1000000 | 예 | 예 | text |
| plexus/gemini-flash | Gemini 3.8 Flash | gemini | t1 | economy | 1049000 | 예 | 예 | text |
| plexus/gemini-pro | Gemini 3.1 Pro | gemini | t3 | performance | 1000000 | 예 | 예 | text |
| plexus/gemini-pro-max | Gemini 3.1 Pro (최대 추론) | gemini | t3 | performance | 1000000 | 예 | 예 | text |
| plexus/gpt | GPT-5.5 | chatgpt | t2 | standard | 1050000 | 예 | 예 | text |
| plexus/gpt-6-astra | GPT-6 Astra | chatgpt | t3 | frontier | 1050000 | 예 | 예 | text |
| plexus/gpt-6-astra-pro | GPT-6 Astra Pro | chatgpt | t3 | frontier | 1050000 | 예 | 예 | text |
| plexus/gpt-6-sol-pro | GPT-6.1 sol Pro | chatgpt | t3 | performance | 1050000 | 예 | 예 | text |
| plexus/gpt-luna | GPT-6 luna | chatgpt | t1 | economy | 1050000 | 예 | 예 | text |
| plexus/gpt-luna-pro | GPT-6 luna Pro | chatgpt | t1 | economy | 1050000 | 예 | 예 | text |
| plexus/gpt-mini | GPT-5.4 mini | chatgpt | t1 | economy | 400000 | 예 | 예 | text |
| plexus/gpt-pro | GPT-5.5 Pro | chatgpt | t3 | performance | 1050000 | 예 | 예 | text |
| plexus/gpt-sol | GPT-6.1 sol | chatgpt | t3 | performance | 1050000 | 예 | 예 | text |
| plexus/gpt-terra | GPT-5.6 terra | chatgpt | t3 | performance | 1050000 | 예 | 예 | text |
| plexus/grok-46 | Grok 4.6 | xai | t2 | standard | 500000 | 예 | 예 | text |
| plexus/grok-47 | Grok 4.7 | xai | t2 | standard | 500000 | 예 | 예 | text |
| plexus/llama-maverick | Llama 4 Maverick | custom | t2 | standard | 미공개 | 예 | 예 | text |
| plexus/llama-scout | Llama 4 Scout | custom | t1 | economy | 미공개 | 예 | 예 | text |
| plexus/perplexity-sonar | Perplexity Sonar Pro | custom | t2 | standard | 미공개 | 아니오 | 아니오 | text |
| plexus/t0 | 티어 T0 | 미공개 | t0 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 |
| plexus/t1 | 티어 T1 | 미공개 | t1 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 |
| plexus/t2 | 티어 T2 | 미공개 | t2 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 |
| plexus/t3 | 티어 T3 | 미공개 | t3 | 미공개 | 미공개 | 미공개 | 미공개 | 미공개 |
