<a id="overview"></a>

# Lounge Deploy 정책 가이드 `2026-11-13.1`

- 정책 ID: `lounge-deploy`
- 정책 버전: `2026-11-13.1`
- 시행·발행 시각: `2026-11-13T00:00:00Z`
- Policy Owner: `@quirinal36`
- Policy Approver: `@quirinal36`
- 변경 사유: 라운지 1:1 대결 SDK(`LetscodingMatch`) 사용 규칙을 명문화

이 문서는 `history/2026-11-13.1.json`을 사람이 읽을 수 있게 설명하는 불변
snapshot이다. 현재 정책의 편집용 복사본은 `../framework-guide.md`이며 두 파일의
내용은 같아야 한다. 기계 판정은 JSON 정책과 공용 검증기를 기준으로 한다.

<a id="work-principles"></a>

## 적용 대상과 작업 원칙

라운지는 Node.js 서버나 프레임워크 개발 서버를 실행하지 않는다. HTML, CSS,
JavaScript, 이미지, 음원처럼 브라우저가 직접 실행할 수 있는 정적 결과물만
배포한다. 1차 에이전트 정책은 다음 산출물을 지원한다.

- `index.html` 하나인 단일 HTML 작품
- `index.html`과 로컬 자산으로 구성된 순수 HTML/CSS/JavaScript ZIP
- Vite의 정적 build 결과 ZIP
- Next.js의 정적 export 결과 ZIP

프로젝트 소스 폴더, `node_modules`, `.git`, 프레임워크 설정만 압축하지 않는다.
기존 lock 파일에 맞는 package manager로 의존성을 설치하고 실제 build를 통과한
출력 디렉터리의 **내용**을 검사·압축한다. TypeScript와 TSX는 업로드 전에
JavaScript로 컴파일되어야 한다. 빌드 오류를 감추기 위해 TypeScript나 lint 검사를
끄지 않는다.

정적 배포로 바꾸면 인증·결제·서버 비밀키 같은 기능의 의미가 달라지는 경우 가짜
클라이언트 기능으로 대체하지 말고 차단 사유를 보고한다.

<a id="zip-limits"></a>

## ZIP과 파일 제한

### 크기와 개수

| 항목                      |                               제한 | 판정         |
| ------------------------- | ---------------------------------: | ------------ |
| ZIP 압축 크기             |   30 MiB (`31,457,280` bytes) 이하 | 초과 시 오류 |
| 실제 해제 크기 합계       | 100 MiB (`104,857,600` bytes) 이하 | 초과 시 오류 |
| central directory 항목 수 |                           500 이하 | 초과 시 오류 |
| 파일 수                   |                           500 이하 | 초과 시 오류 |
| ZIP 내부 파일 경로 길이   |                         180자 이하 | 초과 시 오류 |

ZIP은 일반 단일 디스크 형식이어야 한다. ZIP64와 multi-disk ZIP은 허용하지 않는다.
선언된 해제 크기뿐 아니라 실제 스트리밍 해제 크기도 100 MiB 한도 안에서 다시
검사한다.

<a id="allowed-extensions"></a>

### 허용 확장자

확장자는 대소문자를 구분하지 않고 다음 목록만 허용한다.

- 문서·코드: `.html`, `.htm`, `.css`, `.js`, `.mjs`, `.json`, `.md`, `.txt`
- 이미지: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.ico`
- 오디오·비디오: `.mp3`, `.wav`, `.ogg`, `.mp4`
- 폰트: `.woff`, `.woff2`, `.ttf`

`.map`, `.wasm`, `.avif`, `.webm` 등 목록에 없는 산출물은 ZIP에 넣지 않는다.
기능을 유지할 수 있는 허용 형식으로 변환하거나 해당 출력을 비활성화한다.

<a id="path-rules"></a>

### 안전한 ZIP 내부 경로

ZIP 항목명은 다음 규칙을 모두 만족해야 한다.

- 디렉터리 구분자로 `/`만 사용한다. `assets\\app.js` 같은 백슬래시는 오류다.
- `/index.html` 같은 절대 경로를 사용하지 않는다.
- 경로가 비어 있으면 안 된다.
- 빈 세그먼트와 `.` 또는 `..` 세그먼트를 포함하지 않는다.
- U+0000~U+001F 제어문자를 포함하지 않는다.
- URL이나 스토리지 경로가 다르게 해석될 수 있는 `%`, `?`, `#`, `;`를 포함하지
  않는다.
- 각 항목의 해제 크기는 0 이상의 유한한 값이어야 한다.

경로의 어떤 세그먼트든 대소문자를 무시했을 때 `.env`로 시작하면 차단한다.
예를 들어 `.env`, `.ENV.local`, `config/.env-prod.txt`, `.env_backup.txt`가 모두
해당한다. `runtime-config.js`라는 파일은 루트뿐 아니라 모든 하위 경로에서
대소문자를 무시하고 차단한다.

<a id="wrapper-directory"></a>

### `index.html`과 wrapper directory

에이전트는 ZIP 최상위에 `index.html`을 생성해야 한다.

```text
index.html
assets/
images/
```

`dist/index.html` 또는 `my-game/index.html`처럼 한 폴더로 감싼 ZIP은 만들지 않는다.
다만 현재 라운지 업로드 구현은 호환성을 위해 ZIP 전체가 단일 wrapper 폴더 안에
있고 그 폴더에 `index.html`이 있으면 wrapper를 제거해 받아들인다. wrapper 밖에
파일이 섞여 있으면 오류다. 정책의 `requireRootIndexHtml`은 이 정규화가 끝난 뒤의
루트를 뜻하며, `allowSingleWrapperDirectory`가 현재의 호환 동작을 명시한다.

<a id="asset-paths"></a>

## 라운지 하위 경로와 자산 URL

작품은 `https://사이트주소/play/{작품ID}` 아래에서 제공되고 라운지가 HTML에
`<base href="/play/{작품ID}/">`를 삽입한다. ZIP 안의 로컬 파일은 다음처럼 작품
기준 상대 URL을 사용한다.

```html
<link rel="stylesheet" href="./assets/app.css" />
<script type="module" src="./assets/app.js"></script>
<img src="./images/logo.png" alt="로고" />
```

CSS는 `url("./font.woff2")`, JavaScript는 `fetch("./data/level.json")`처럼 참조한다.
`/images/logo.png`, `/_next/app.js`, `/assets/app.css` 같은 루트 절대 URL은 작품
자산이면 깨질 수 있다.

루트 절대 URL은 일괄 오류가 아니라 `LD_ASSET_ROOT_ABSOLUTE` 경고다. 라운지 내부
API처럼 도메인 루트를 의도한 요청일 수 있기 때문이다. 경고를 해제하려면 해당
URL이 로컬 정적 자산이 아니며 루트 호출이 필요한 이유를 사람이 확인해 기록해야
한다. 이유가 확인되지 않은 로컬 자산 URL은 상대 경로로 고친다.

외부 API와 CDN 요청은 라운지의 Content Security Policy 또는 대상 서버의 CORS에
막힐 수 있다. 필요한 외부 origin은 최종 보고에서 별도로 밝히고 실제 플레이
경로에서 확인한다.

<a id="lounge-api"></a>

## 라운지 내부 API와 로그인 표시 이름

작품은 `/play/{작품ID}` 아래에서 실행되므로 라운지가 제공하는 동일 출처 API를
루트 절대 경로로 호출할 수 있다. 이런 요청은 작품 자산이 아니므로 `./` 상대
경로로 바꾸지 않는다. `LD_ASSET_ROOT_ABSOLUTE` 경고가 함께 보고되면 로컬 자산이
아니라 의도된 라운지 API라는 사유를 확인해 기록한다. 동일 출처 호출이므로 외부
origin으로 보고하지 않는다.

로그인한 사용자의 표시 이름은 다음 API로 읽는다.

```js
const projectId = new URL(document.baseURI).pathname.split("/")[2];

const response = await fetch(
  `/api/me?projectId=${encodeURIComponent(projectId)}`,
  { credentials: "same-origin" },
);
```

성공하면 `{ "profile": { "display_name": "렛츠코딩" } }` 형태로 응답한다. 응답에는
사용자 UUID, 이메일, 인증 token이 들어 있지 않다.

- 작품 ID는 라운지가 삽입한 `<base href="/play/{작품ID}/">`에서 읽는다. 라운지
  밖에서 실행하는 로컬 테스트에는 이 태그와 API가 없으므로 이름을 읽지 못하는
  경로를 항상 함께 준비한다.
- 요청은 `credentials: "same-origin"`으로 보낸다. 작품 코드에 라운지 인증 쿠키,
  사용자 UUID, Supabase key 같은 값을 넣지 않는다.
- 로그인하지 않았거나 작품 주소로 직접 접속하면 `401 Unauthorized`가 온다. 이때는
  작품이 준비한 안내 문구를 보여 주고 작품은 계속 동작한다.
- `display_name`은 화면 표시에만 사용한다. 저장하거나 다른 origin으로 보내지
  않으며 점수 키, 저장 슬롯 키, 사용자 식별자로 쓰지 않는다.
- `display_name`은 다른 사용자가 정한 문자열이므로 `textContent`로만 출력한다.
  `innerHTML`이나 raw HTML 템플릿에 넣지 않는다.
- 로그인 화면, 프로필 페이지, 로그인·로그아웃 버튼을 작품에 만들지 않는다.
  로그인은 라운지가 담당하고 작품은 이미 로그인한 방문자의 이름만 읽는다.
- 랭킹 점수 제출은 별도 API가 로그인 세션을 검증한다. 작품이 사용자 식별자를
  저장하거나 전송할 필요가 없다.

<a id="lounge-match"></a>

## 라운지 1:1 대결 SDK

라운지는 두 사람이 한 작품에서 1:1로 대결하는 SDK `LetscodingMatch`를 제공한다.
사용자가 두 사람 대결을 요청한 경우에만 넣는다. 혼자 하는 작품에 임의로 추가하지
않는다.

### 맞는 게임과 맞지 않는 게임

| `mode` | 진행 | 맞는 게임 |
| ------ | ---- | --------- |
| `turn` | 한 사람씩 번갈아 수를 둔다 | 체스, 오목, 틱택토, 카드 턴제 |
| `round` | 라운드마다 둘 다 내고, 둘 다 낸 뒤에 함께 공개된다 | 가위바위보, 동시 퀴즈, 경매 |
| `free` | 순서 없이 각자 보낸다. 상태 칸으로 진행 상황을 공유한다 | 같은 문제를 각자 풀고 점수를 겨루는 게임 |

상대 입력은 약 1~2초 뒤에 도착한다. 탁구·레이싱·격투처럼 위치를 초당 여러 번
맞춰야 하는 액션 게임의 동기화에는 쓰지 않는다. 그런 요청은 제한 사항으로 보고한다.
채팅도 제공하지 않는다.

### 넣는 법

```html
<script src="/sdk/letscoding-match.js"></script>
```

이 주소는 Play 도메인의 동일 출처 SDK다. `./` 상대 경로로 바꾸지 않고 외부 origin으로
보고하지 않는다. `LD_ASSET_ROOT_ABSOLUTE` 경고가 보고되면 의도된 라운지 SDK라는
사유를 기록한다.

```js
// 시작할 때 먼저 이어 하기를 확인한다. 진행 중인 대결이 없거나 비로그인이면 null.
let room = await LetscodingMatch.resume();

// 방 만들기: room.code(6자리)를 화면에 크게 보여 주고 상대에게 알려 준다.
room = await LetscodingMatch.create({ mode: "turn", first: "random", turnSeconds: 300 });

// 코드로 참가
room = await LetscodingMatch.join("K7M2QD");

room.on("start", () => {});                            // 상대가 들어와 대결이 시작됨
room.on("move", ({ seq, data, round }) => {});         // 상대가 보낸 수. 내 수는 오지 않는다
room.on("round", ({ round, me, opponent }) => {});     // round 방식: 두 사람 것이 함께 공개됨
room.on("status", (data) => {});                      // 상대의 상태 칸이 바뀜
room.on("opponent", ({ online }) => {});               // 상대 접속 여부가 바뀜
room.on("drawOffer", ({ from }) => {});                // "me" | "opponent" | null
room.on("update", (room) => {});                       // 방 상태가 바뀔 때마다
room.on("end", ({ result, reason, status }) => {});    // 대결이 끝남
room.on("error", (error) => {});                       // 연결 오류가 이어짐

await room.send({ cell: 4 });                          // 내 수
await room.setStatus({ score: 120, progress: 0.4 });   // 상태 칸(최신값 하나만 남는다)
await room.finish("win");                              // "win" | "loss" | "draw"
await room.resign();
await room.offerDraw();  await room.acceptDraw();  await room.declineDraw();
await room.reportInvalid();                            // 상대가 규칙에 없는 수를 보냄
await room.leave();
```

`create()`의 `first`는 `"me"`·`"opponent"`·`"random"`이고 `turn` 방식에서만 뜻이
있다. `turnSeconds`는 30~3600 사이 정수이며 기본값은 300이다.

읽을 수 있는 값은 다음과 같다.

| 값 | 뜻 |
| -- | -- |
| `room.code` | 6자리 초대 코드 |
| `room.status` | `waiting`·`active`·`finished`·`aborted`·`disputed`·`expired` |
| `room.mode`, `room.seat` | 진행 방식, 내 자리(0=만든 사람, 1=들어온 사람) |
| `room.me`, `room.opponent` | `{ name, status }`, 상대는 `online`이 더 있다. 상대가 없으면 `null` |
| `room.myTurn` | 지금 보낼 수 있는지 |
| `room.first` | `turn` 방식에서 먼저 두는 쪽(`"me"`·`"opponent"`) |
| `room.round`, `room.opponentSubmitted` | `round` 방식의 라운드 번호, 상대가 이번 라운드에 냈는지 |
| `room.turnRemainingMs` | 이번 수·라운드의 남은 시간 |
| `room.drawOffer` | 걸려 있는 무승부 제안 |
| `room.result`, `room.reason` | 끝난 뒤의 결과(`win`·`loss`·`draw`·`null`)와 사유 |
| `room.moves` | 지금까지의 수. 각 항목은 `{ seq, mine, data, round? }` |

### 작품이 지켜야 할 것

- **실행 조건**: 라운지에 로그인한 사용자가 라운지 작품 페이지의 플레이 버튼으로
  들어와야 한다. 작품은 게시되어 있어야 상대도 실행할 수 있다. 로컬 실행, 라운지
  밖, Studio 미리보기에는 `window.LetscodingMatch`가 없다. 이때는 안내 문구를
  보여 주고 혼자 하기나 한 화면에서 번갈아 하기로 돌아간다.
- **이어 하기**: 시작할 때 `resume()`을 먼저 부른다. 돌려받은 `room.moves`를 처음부터
  적용해 화면을 다시 그린다. 내 수는 `mine`이 `true`다.
- **규칙 검사**: 서버는 차례, 순서, 크기, 시한만 지킨다. 수가 게임 규칙에 맞는지는
  양쪽 작품이 각자 검사한다. 상대의 수가 규칙에 어긋나면 `reportInvalid()`를 부르고,
  대결은 `aborted`로 끝난다.
- **결과 보고**: 게임이 끝나면 양쪽이 각자 판정해 `finish()`로 보고한다.
  `finish("loss")`와 `resign()`은 즉시 확정된다. `"win"`·`"draw"`는 상대의 보고와
  맞아야 확정되고, 어긋나면 `disputed`로 끝나며 승패를 기록하지 않는다. 결과
  화면은 `end` 이벤트의 `result`로 그린다.
- **데이터**: `send()`와 `setStatus()`에는 객체나 배열만 보낸다. 수 하나는 2KB,
  상태 칸은 1KB까지다. 대결 하나의 수는 1,000개, 요청은 자리마다 10초에 30회까지다.
  상태 칸은 기록에 쌓이지 않고 최신값 하나만 남으므로 점수·진행률처럼 자주 바뀌는
  값에 쓴다.
- **시한**: `turn`은 수마다, `round`는 라운드마다 `turnSeconds`가 걸린다. 넘기면 내지
  않은 쪽이 진다. `free`는 한쪽만 60초 동안 연결이 끊기면 남은 쪽이 이긴다. 상대
  없이 10분 지난 방과 양쪽 모두 30분 동안 요청이 없는 대결은 승패 없이 끝난다.
- **한 사람 한 대결**: 한 사람은 한 작품에서 동시에 하나의 대결만 할 수 있다.
  `match_in_progress` 오류가 오면 `resume()`으로 이어 하거나 `leave()`로 끝낸다.
- **개인정보와 안전**: 상대 이름(`room.opponent.name`)은 다른 사람이 정한 문자열이므로
  `textContent`로만 출력한다. `data`와 상태 칸에 채팅 문장이나 자유 입력 글을 싣지
  않는다. 사용자 UUID, 이메일, 쿠키, 토큰을 작품 코드에 넣거나 보내지 않는다. 대결
  자격은 라운지가 HttpOnly 쿠키로 관리하며 작품은 읽을 수 없다.

### 오류

실패한 호출은 `error.code`와 사용자에게 보여 줄 한국어 `error.message`를 가진 오류로
거절된다. 메시지는 그대로 보여 준다.

| `error.code` | 상황 |
| ------------ | ---- |
| `login_required` | 로그인하지 않았거나 플레이 버튼으로 들어오지 않았다 |
| `invalid_code`, `room_not_found`, `own_room`, `room_full` | 코드가 틀렸거나, 방이 없거나, 내 방이거나, 이미 찼다 |
| `match_in_progress` | 이 작품에서 진행 중인 대결이 이미 있다 |
| `not_your_turn`, `already_submitted`, `not_active` | 내 차례가 아니거나, 이번 라운드에 이미 냈거나, 대결이 끝났다 |
| `invalid_data`, `data_too_large` | 객체·배열이 아니거나 크기 제한을 넘었다 |
| `rate_limited`, `too_many_rooms`, `service_unavailable` | 잠시 후 다시 시도한다 |
| `invalid_ticket` | 대결 연결이 끊겼다. 다시 참가한다 |

끝난 사유(`room.reason`)는 `reported`(결과 보고), `resign`, `draw_agreed`, `timeout`,
`abandoned`, `left`, `dispute`, `invalid_move`, `no_opponent`, `idle`, `cancelled` 중
하나다.

### 시험

게시한 뒤 서로 다른 계정 두 개로 각각 로그인해(다른 브라우저나 시크릿 창) 작품
페이지의 플레이 버튼으로 들어간다. 방 만들기, 코드로 참가, 번갈아 두기, 새로고침 뒤
이어 하기, 기권, 승패·무승부 확정, 한쪽 탭을 닫았을 때의 접속 표시를 확인한다.

<a id="plain-html"></a>

## 단일 HTML과 순수 HTML/CSS/JavaScript

단일 `.html` 또는 `.htm` 업로드는 라운지가 `index.html`로 저장한다. ZIP이라면
최상위 `index.html`과 허용 확장자의 자산만 포함한다.

- `<script src>`, `<link href>`, `<img src>`, `fetch()`와 CSS `url()`의 로컬 URL을
  상대 경로로 작성한다.
- 소스 트리와 build 설정을 결과물에 섞지 않는다.
- 라운지처럼 `/play/임시작품ID/` 하위에서 주요 기능, 새로고침, 이미지, 소리와
  브라우저 콘솔 오류를 확인한다.

<a id="vite"></a>

## Vite

기존 `vite.config`를 보존하면서 build일 때만 `base: "./"`를 적용한다.

```ts
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  // 기존 plugins와 설정 유지
  base: command === "build" ? "./" : "/",
}));
```

React 플러그인 등 기존 설정은 함께 유지한다. 일반 출력 폴더는 `dist`다.

- 개발 서버에서는 기본 `/` 경로를 유지한다.
- build 결과 `dist/index.html`의 로컬 CSS·JavaScript 경로가 `./assets/`인지
  확인한다.
- 서버 rewrite가 필요한 `BrowserRouter`보다 단일 페이지 또는 `HashRouter`를
  우선 검토한다.
- `dist` 폴더 자체가 아니라 그 안의 내용을 압축한다.

<a id="nextjs"></a>

## Next.js

설치된 Next.js 버전의 로컬 또는 공식 정적 export 문서를 먼저 확인한다. 기존
`next.config`를 보존하면서 작품용 설정을 build일 때만 적용한다.

```ts
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    // 기존 설정 유지
    output: isDev ? undefined : "export",
    assetPrefix: isDev ? undefined : ".",
    trailingSlash: isDev ? undefined : true,
    images: {
      // 기존 images 설정과 병합
      unoptimized: !isDev,
    },
  };
}
```

일반 출력 폴더는 `out`이다.

- 최신 Next.js에서는 별도 `next export` 대신 `output: "export"`와 일반 build를
  사용한다.
- 작품 ID를 미리 알 수 없으므로 임의의 `basePath`를 넣지 않는다.
- build 후 `out/index.html`의 script와 stylesheet가 `./_next/`로 시작해야 한다.
  `/_next/`이면 성공으로 보고하지 않는다.
- `assetPrefix`는 직접 작성한 `/images/...` 같은 `public/` URL을 고치지 않는다.
  JSX에서 `./images/logo.png`처럼 바꾼다.
- 이미지 최적화 서버가 없으므로 정적 build에서 `images.unoptimized`를 사용한다.
- `next/font`가 상대 prefix와 충돌하면 시스템 폰트나 프로젝트에 포함한 CSS
  폰트로 전환한다.
- 요청마다 실행되는 Server Action, API Route, 동적 SSR, ISR, runtime
  redirect/rewrite/header, 요청값 의존 Route Handler는 사용할 수 없다.
- 동적 route는 모든 경로를 build 시점에 생성할 수 있어야 한다.
- `window`, `document`, `localStorage`, `navigator`는 Client Component에서
  브라우저가 준비된 뒤 접근한다.
- 여러 페이지는 모두 정적으로 생성하고 루트 절대 링크 대신 상대 링크를 쓴다.

<a id="runtime-env"></a>

## 작품 비밀값과 런타임 설정

`.env` 파일과 `runtime-config.js`는 ZIP에 넣을 수 없으며, 작품 등록 화면에서도
별도 첨부하지 않는다. `window.__LETS_RUNTIME_ENV__` 같은 브라우저 런타임 객체를
새 작품의 설정 전달 방식으로 사용하지 않는다. 브라우저에서 읽을 수 있는 값은
비밀값이 아니므로 작품별 secret을 전달하는 수단이 될 수 없다.

API key, 비밀번호, token, private key, DB 연결 문자열, service-role key와 Sheets
secret은 정적 프로젝트, ZIP, MCP 입력·응답, 완료 보고서, 공개 API와 public Storage에
넣지 않는다. 필요한 작품별 비밀값은 Lounge 서버가 인증·권한 검사된 전용 관리
흐름에서 암호화해 보관하고, 서버 실행 또는 Sheets 프록시에서만 사용해야 한다.

정적 작품은 secret이 없어도 동작하는 공개 API만 호출할 수 있다. 서버 비밀값이
필요한 기능은 정적 ZIP에 억지로 구현하지 말고, 인증된 별도 backend 또는 Lounge의
server-side 기능이 준비될 때까지 제한 사항으로 보고한다.

<a id="final-check"></a>

## 최종 검사와 보고

ZIP을 만들기 전에 다음을 확인한다.

1. 기존 lock 파일에 맞는 재현 가능한 설치와 build가 성공했다.
2. 실제 출력 폴더의 정규화된 루트에 `index.html`이 있다.
3. 크기, 항목 수, 파일 수, 경로와 확장자 제한을 모두 통과한다.
4. `.env*`와 모든 경로의 `runtime-config.js`가 없다.
5. Vite는 `./assets/`, Next.js는 `./_next/` 자산 경로를 사용한다.
6. 루트 절대 URL은 수정하거나 의도된 내부 API 경고로 확인했다.
7. `.env`, runtime-config, secret과 runtime 환경 변수 이름·값을 ZIP, MCP, 보고서에
   넣지 않는다.
8. `/play/임시작품ID/` 하위에서 주요 기능과 자산 요청을 확인했다.
9. 라운지 내부 API를 호출한다면 로그인하지 않은 방문자와 라운지 밖 실행
   경로에서도 작품이 멈추지 않는지 확인했다.
10. 1:1 대결 SDK를 쓴다면 `LetscodingMatch`가 없는 실행 경로에서 작품이 멈추지
    않고, 게시 후 서로 다른 계정 두 개로 시험해야 한다는 점을 보고에 적었다.

완료 보고에는 프레임워크와 버전, 변경 파일, 실행 명령, 출력 폴더, ZIP 절대 경로,
압축·해제 크기, 파일 수, 루트 `index.html`, 확인한 기능, 외부 API/CDN과 secret이
필요해 제외한 기능, 적용 정책 버전 `2026-11-13.1`을 포함한다. 검증이 실패했다면 ZIP이
완성됐다고 말하지 않는다.

<a id="migration-notes"></a>

## Migration notes

현재 라운지 구현과 중앙 정책의 의도적 차이는 다음과 같다.

1. **wrapper directory**: 라운지 업로드 API는 단일 wrapper를 제거해 받아들이지만,
   에이전트는 재현 가능하고 도구 간 차이가 없는 산출물을 위해 ZIP 최상위
   `index.html`을 생성해야 한다. 중앙 검증기는 현재 호환 동작을 표현하되 권장
   패키징을 별도로 보고한다.
2. **루트 절대 URL**: 현재 업로드 API는 HTML/CSS/JavaScript 본문의 URL을 검사하지
   않는다. 중앙 검증은 로컬 자산 장애를 미리 찾기 위해 경고를 추가한다. 라운지
   내부 API처럼 의도된 URL은 사유 확인 후 해제할 수 있으며 오류로 승격하지 않는다.
3. **Markdown 직접 업로드**: 라운지 API는 `.md` 파일 하나를 HTML로 변환해 받을 수
   있다. 1차 에이전트 정책의 제작 대상은 이슈 범위에 따라 단일 HTML과 정적 ZIP으로
   제한한다. ZIP 내부의 `.md` 확장자는 계속 허용한다.
4. **500개 제한의 계수**: 사용자 문구는 파일 수 500개라고 설명하지만 현재 ZIP
   사전 검사는 디렉터리를 포함한 central directory 항목 수도 500개로 제한한다.
   첫 정책은 두 제한을 모두 기록해 현재 서버보다 느슨해지지 않게 한다.
5. **ZIP 루트의 의미**: `requireRootIndexHtml`은 wrapper 호환 정규화 이후의 저장
   루트를 뜻한다. 에이전트 권장 산출물의 물리적 ZIP 루트 규칙과 혼동하지 않는다.

<a id="source"></a>

## 출처

마지막 동기화 기준은 `yudanah/letscoding_lounge` commit
`e3b8a7016e78e98001595f1d8033ceeac7e6635a`이다. 2026-08-12T13:23:29Z에 다음
파일을 검토했다.

- `framework_guide.md`
- `src/lib/deploy-validation.ts`
- `src/lib/zip-inflate.ts`

정확한 파일별 SHA-256은 같은 버전의 JSON snapshot `source.files`에 기록한다.
