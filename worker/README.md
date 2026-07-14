# pigeonoid-worker

PIGEON PROTOCOL 온라인 플레이용 **WebSocket 릴레이**. Cloudflare Workers +
**Durable Object**(방 코드별 1개 인스턴스)로 동작하며, 같은 방의 다른 요원에게
메시지를 **브로드캐스트**한다. 프레즌스(위치) 동기화와 WebRTC 음성 시그널링이
모두 이 릴레이를 탄다.

정적 Pages 호스팅만으로는 여러 WebSocket 연결을 방 단위로 붙들 수 없어서 —
그게 이 Worker(+DO)가 필요한 이유다. **싱글플레이만 할 거면 이 워커는 불필요**하고
프론트(Pages)만 배포하면 된다.

## 엔드포인트

- `GET /health` — 상태 확인(텍스트).
- `GET /ws?room=<코드>` — WebSocket 업그레이드. `?room=`(또는 `/room/<코드>`)로
  방을 지정하면 해당 방의 Durable Object로 라우팅된다. 보낸 메시지는 같은 방의
  **나머지 소켓**에게 그대로 전달된다(보낸 본인 제외).

## 로컬 개발 / 검증

```bash
cd worker
pnpm install
pnpm type-check          # tsc --noEmit
pnpm dry-run             # wrangler가 번들만 만들고 배포는 안 함(계정 불필요)
pnpm dev                 # 로컬 실행: http://127.0.0.1:8787  (WS: ws://127.0.0.1:8787/ws?room=x)
```

## 배포

`production` 브랜치 푸시 시 `.github/workflows/deploy.yml`의 `worker` 잡이
`wrangler deploy`로 배포한다. 수동 배포는 `pnpm deploy`.

배포 후 workers.dev URL(예: `wss://pigeonoid-worker.<계정서브도메인>.workers.dev/ws`)을
프론트의 `VITE_RELAY_URL` repo variable로 넣으면 프론트가 공개 릴레이 대신 이
워커를 쓴다(미설정 시 공개 릴레이로 폴백).

> Durable Objects는 SQLite 스토리지 백엔드(`wrangler.toml`의 `new_sqlite_classes`)로
> Workers 무료 플랜에서도 사용할 수 있다.
