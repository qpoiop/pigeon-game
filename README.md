# PIGEON PROTOCOL — 비둘기 특무

탑다운 3D 잠입 전략 게임. 전서구(스파이 비둘기) 요원이 모노크롬 시설에 잠입해
마이크로필름을 회수하고 적색 회수 구역으로 탈출한다. Modernist 팔레트
(화이트 / 잉크 / 레드), 절차적 캐릭터 애니메이션, 무료 공개 릴레이 기반의 온라인
동시 접속 + P2P 음성채팅.

Three.js로 렌더링하며 **Vite + React + TypeScript** 웹앱으로 구성되어 실제 배포와
콘텐츠 확장(요원·스테이지 추가, 데이터 관리)에 적합하도록 만들어졌다.

## 스크린샷

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/img/title.png" alt="타이틀 화면 — 요원·난이도·스테이지 선택·설정">
      <br><sub><b>타이틀</b> — 요원 · 난이도 · 스테이지 선택 · 설정</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/img/gameplay.png" alt="게임플레이 — 미니맵과 목표 방향 화살표">
      <br><sub><b>잠입</b> — 미니맵 · 목표 방향 화살표 · 경비 시야콘</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/img/mission-file.png" alt="임무 파일 드로어">
      <br><sub><b>임무 파일 (Tab)</b> — 체크리스트 · 장비 · 참가자</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/img/agent-magpie.png" alt="까치 요원, 어려움 난이도">
      <br><sub><b>요원 선택</b> — 까치(속도형) · 어려움</sub>
    </td>
  </tr>
</table>

> 스크린샷은 헤드리스 브라우저 캡처라 Archivo 웹폰트가 시스템 폰트로 대체되어 있다.
> 실제 배포 환경에서는 Archivo가 로드되어 Modernist 타이포그래피가 그대로 나온다.

각 화면 설명은 [`docs/SCREENSHOTS.md`](docs/SCREENSHOTS.md) 가이드를 참고.

---

## 실행

패키지 매니저는 **pnpm**을 사용한다.

```bash
pnpm install
pnpm dev           # http://localhost:5173 개발 서버
```

빌드 / 미리보기 / 타입체크:

```bash
pnpm build         # tsc -b && vite build → dist/
pnpm preview       # 빌드 결과 로컬 서빙
pnpm typecheck     # 타입만 검사
pnpm test          # vitest — 경비 길찾기 + 애니메이션 수학 단위 테스트
```

`dist/`는 정적 파일이며 어떤 정적 호스팅(GitHub Pages, Netlify, S3 등)에도 그대로
올릴 수 있다. `vite.config.ts`의 `base: './'` 덕분에 하위 경로에서도 동작한다.

---

## 배포 (Cloudflare)

`main` 브랜치에 푸시하면(또는 Actions 탭에서 수동 실행하면) `.github/workflows/deploy.yml`이
두 가지를 배포한다. 프로모트형 배포를 원하면 워크플로의 `branches`를 `[production]`으로 바꾼다.

| 대상 | 서비스 | 무엇 |
| --- | --- | --- |
| 프론트(정적 SPA) | **Cloudflare Pages** · `pigeonoid` | `pnpm build` → `dist/` 배포 |
| 온라인 WS API | **Cloudflare Workers** · `pigeonoid-worker` | `worker/`의 WebSocket 릴레이(Durable Object) |

**서버가 꼭 필요한가?** 게임 자체는 정적이라 **Pages만으로 완전히 동작**한다. 다만
온라인 멀티/음성은 WebSocket 릴레이가 필요한데, 정적 호스팅이나 일반 Worker로는 방
단위로 여러 연결을 붙들 수 없어 **Worker + Durable Object**(`pigeonoid-worker`)가 필요하다.
방 코드를 비우면 싱글 작전이므로, **싱글만 할 거면 워커 없이 Pages만** 배포하면 된다.
(워커를 안 띄우면 프론트는 무료 공개 릴레이로 폴백 — 불안정.)

필요한 repo secrets (Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN` — `.env`의 `CF_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID` — `.env`의 `CF_ACCOUNT_ID`

선택 repo variable:

- `VITE_RELAY_URL` — 워커 배포 후 workers.dev URL(예:
  `wss://pigeonoid-worker.<계정서브도메인>.workers.dev/ws`). 설정하면 프론트가 공개 릴레이
  대신 자체 워커를 쓴다. 미설정 시 공개 릴레이로 폴백한다.

WS 릴레이의 로컬 실행·검증 방법은 [`worker/README.md`](worker/README.md) 참고.

---

## 게임플레이

- **목표** — 스테이지의 마이크로필름을 전부 회수하면 적색 회수 구역이 열린다.
  회수 구역에 잠시 머무르면 탈출, 다음 스테이지로.
- **발각** — 경비의 시야콘 안에 들어가면 감지 게이지가 찬다. 게이지가 가득 차면
  추격당하고, 붙잡히면 스테이지 재시작.
- **은신** — `숨기(C)`로 느리게 이동하며 덜 띄고, 회색 은폐 구역에서 웅크리면 완전
  은신. `연막(2)`은 5초 완전 은신, `미끼(1)`는 경비를 그 자리로 유인.

### 조작

| 입력 | 동작 |
| --- | --- |
| `WASD` / 화살표 / 바닥 클릭 / 모바일 조이스틱 | 이동 |
| `C` 또는 `Ctrl` | 숨기(웅크리기) 토글 |
| `Shift` 또는 `Space` | 대시 |
| `1` / `2` | 미끼 / 연막 사용 |
| `Tab` 또는 `M` | 임무 파일(체크리스트·장비·참가자) |
| 상단 `MIC` 버튼 | 음성채팅 켜기/음소거 |

### 요원 · 난이도 · 온라인

- **요원 3종** — 비둘기(균형) · 까치(속도형, 눈에 잘 띔) · 부엉이(은신형, 경비 시야 축소).
- **난이도 3단계** — 쉬움 / 보통 / 어려움 (경비 속도·시야·발각 속도·시작 장비 차등).
- **온라인** — 타이틀에서 같은 방 코드를 입력한 요원들이 서로 보이고, MIC로 P2P
  음성채팅이 연결된다. 무료 공개 릴레이(socketsbay 데모 채널)라 불안정할 수 있으며,
  방 코드를 비우면 싱글 작전으로 진행된다.
- **타이틀 설정** — 경비 시야콘 표시 토글과 카메라 거리(11–24m) 슬라이더.

### 진행 · 점수 (업데이트)

- **미니맵** — 좌상단에 벽·은폐·필름·아이템·탈출구·경비(상태별 색)·참가자·플레이어를 실시간 표시.
- **목표 방향 화살표** — 바닥에 가장 가까운 미회수 필름(전부 회수 시 탈출구) 방향을 가리킨다.
- **경비 AI 강화** — 시야에서 놓쳐도 곧바로 포기하지 않고 마지막 목격 지점을 **수색**하며,
  발각 시 근처(16m) 경비에게 **경보가 전파**된다.
- **경비 협동 (분산 수색 · 협공)** — 경보가 울리면 수색조가 한 점에 몰리지 않고 목격 지점
  주변으로 **흩어져 훑고**, 여러 명이 추격할 땐 가장 가까운 경비가 직접 쫓는 동안 나머지는
  플레이어 진행 방향 옆을 **파고들어 퇴로를 차단**한다(`src/game/ai/squad.ts`, 순수·테스트됨).
- **경비 길찾기 (A\*)** — 추격·수색·미끼 유인 시 직선이 아니라 **벽을 돌아 경로를 찾아**
  이동한다. 레벨 벽에서 반경 팽창 격자(`NavGrid`)를 만들고 8방향 A\* + 시야 스트링풀로
  자연스러운 웨이포인트를 뽑으며, 개활지에선 직진(LOS)해 추격이 답답하지 않다.
  순수 함수라 유닛 테스트로 검증한다(`pnpm test`).
- **랭크 · 기록** — 스테이지 클리어 시 소요 시간과 발각 횟수로 **S/A/B/C 랭크**를 매기고,
  최고 기록과 스테이지 해제 상태를 브라우저(`localStorage`)에 저장한다. 타이틀에서
  **스테이지 선택**(클리어한 곳까지 해제, 최고 랭크 표시)과 요원·난이도·콜사인이 유지된다.
- **자연스러운 동작 (절차적 애니메이션)** — 걸음 위에 레이어를 얹어 무게감을 준다:
  비둘기 특유의 **머리 까딱임(head-thrust)** 과 좌우 뒤뚱거림, 속도·회전에 따른 **기울임/뱅크**,
  대시 시 **앞으로 늘어나는 런지(스쿼시·스트레치)**, 부드러운 웅크림 블렌딩, 그리고 경비를
  **곁눈질로 주시**하는 머리 회전. 순수 이징/커브 함수는 테스트로 검증(`src/game/anim.ts`).
- **연출** — 픽업·대시 시 파티클 버스트, 잠입 중 미니멀 앰비언트 드론, 이동 방향 카메라 룩어헤드.

---

## 구조

```
index.html                     앱 진입점 (Archivo 폰트 로드)
src/
  main.tsx                     React 루트
  App.tsx                      기본 옵션으로 게임 마운트
  react/PigeonGame.tsx         엔진을 감싸 마운트/정리하는 React 컴포넌트
  data/                        ── 콘텐츠 데이터 (확장 지점) ──
    palette.ts                 Modernist 색상
    characters.ts              CHARS — 요원 정의
    difficulties.ts            DIFFS — 난이도 프리셋
    levels.ts                  LEVELS — 스테이지(맵/경비/필름/아이템)
  game/                        ── 엔진 ──
    engine.ts                  PigeonGame 클래스 (씬·시뮬레이션·HUD·루프)
    birds.ts                   비둘기 모델 빌더 + 레이어드 절차적 애니메이션
    anim.ts                    순수 애니메이션 수학 (damp·pigeonBob 등, 테스트됨)
    audio.ts                   WebAudio 미니멀 신스 (Sfx)
    net.ts                     공개 릴레이 접속/프레즌스 (Net)
    voice.ts                   WebRTC P2P 음성 (Voice)
    template.ts                HUD 마크업 + 컴포넌트 CSS
    three-utils.ts             Object3D 리소스 정리(disposeObject, 테스트됨)
    types.ts                   런타임 엔티티 타입
    ai/                        ── 경비 AI (순수·테스트 가능) ──
      navgrid.ts               벽에서 만든 반경 팽창 격자 (NavGrid)
      pathfind.ts              8방향 A* + 시야 스트링풀 (findPath)
      squad.ts                 분산 수색 + 협공 목표점 (searchPoint·flankPoint)
      *.test.ts                pathfinder·squad 단위 + 실제 맵 navigability 테스트
  styles/
    modernist.css              Modernist 디자인 시스템 토큰/기본 타입
    index.css                  전역 리셋
```

렌더링·시뮬레이션 로직은 프레임워크에 독립적인 `PigeonGame` 클래스에 들어 있고,
React는 마운트 대상 `<div>`를 만들어 엔진을 붙이고 언마운트 시 `dispose()`로
정리만 한다. 덕분에 게임 코어는 React에 묶이지 않는다.

### 콘텐츠 확장

모든 정적 콘텐츠는 `src/data/`의 타입이 붙은 모듈에 있다 — 게임 코드를 건드리지
않고 데이터만 추가하면 된다.

- **새 요원(모델) 추가** — `characters.ts`의 `CHARS`에 항목을 추가한다. `kind`는
  실루엣 변형(`pigeon`/`magpie`/`owl`)을, `pal`은 색을, `speed`/`detect`/`dashCd`는
  능력치를 정한다. 완전히 새로운 실루엣이 필요하면 `game/birds.ts`에 `kind` 분기를
  추가한다.
- **새 스테이지 추가** — `levels.ts`의 `LEVELS`에 맵 크기·벽·은폐·필름·아이템·경비
  순찰 경로를 담은 항목을 추가한다.
- **새 난이도** — `difficulties.ts`의 `DIFFS`에 프리셋을 추가한다.

메뉴/로스터/드로어는 이 데이터를 순회하므로 새 항목은 UI에 자동 반영된다.

---

## 디자인 원본

이 저장소는 Claude Design 핸드오프에서 시작됐다. 원본 프로토타입과 대화 기록은
참고용으로 보존되어 있다:

- `chats/` — 디자인 어시스턴트와의 대화(요구사항이 여기 있다).
- `project/` — 원본 HTML/CSS/JS 프로토타입과 Modernist 디자인 시스템 번들.

구현은 이 프로토타입을 픽셀 단위로 재현하되, 실제 배포·확장이 가능한 웹앱 구조로
재구성한 것이다.

## 크레딧 (3D 에셋)

- 피존 모델: This work is based on ["Pigeon"](https://sketchfab.com/3d-models/pigeon-cc14e3b4eab54e21b1e1f665b249f63f)
  by [kanevsky](https://sketchfab.com/kanevsky), licensed under
  [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/). 웹 배포용으로
  디시메이션 + Draco 압축(149MB → 141KB). 원본은 `public/pigeon/license.txt` 참조.
