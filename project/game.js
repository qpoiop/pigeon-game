/* PIGEON PROTOCOL — 비둘기 특무 v2
   Top-down 3D stealth-mission game. Vanilla web component <pigeon-game>.
   v2: character classes, difficulty, items(미끼/연막), mission drawer, roster, voice chat, larger maps.
   Palette: Modernist — bg #f3f2f2, ink #201e1d, accent #ec3013. */
(function () {
  'use strict';
  if (customElements.get('pigeon-game')) return;

  var INK = 0x201e1d, BG = 0xf3f2f2, ACCENT = 0xec3013,
      MID = 0x8a8683, PAPER = 0xe9e7e5;

  /* ---------------- Characters ---------------- */
  var CHARS = {
    pigeon: { name: '비둘기', role: '균형형', desc: '속도와 은신의 균형. 표준 특무요원.', speed: 1, detect: 1, dashCd: 1.4, kind: 'pigeon',
      pal: { body: 0xe8e6e4, head: 0x35322f, wing: 0x201e1d, accent: ACCENT } },
    magpie: { name: '까치', role: '속도형', desc: '빠르고 대시 재사용이 짧다. 대신 눈에 잘 띈다.', speed: 1.22, detect: 1.18, dashCd: 0.9, kind: 'magpie',
      pal: { body: 0x201e1d, head: 0x201e1d, wing: 0xf3f2f2, accent: ACCENT } },
    owl: { name: '부엉이', role: '은신형', desc: '느리지만 조용하다. 경비의 시야가 좁아진다.', speed: 0.85, detect: 0.68, dashCd: 1.8, kind: 'owl',
      pal: { body: 0xbdb4a9, head: 0xa39a8e, wing: 0x6d675f, accent: ACCENT } }
  };
  var DIFFS = {
    easy: { name: '쉬움', gs: 0.8, gr: 0.85, dt: 1.05, start: { decoy: 1, smoke: 1 } },
    normal: { name: '보통', gs: 1.0, gr: 1.0, dt: 0.75, start: { decoy: 1, smoke: 0 } },
    hard: { name: '어려움', gs: 1.22, gr: 1.15, dt: 0.55, start: { decoy: 0, smoke: 0 } }
  };

  /* ---------------- Level data (large maps) ---------------- */
  var LEVELS = [
    {
      name: '01 — 외곽 훈련 구역', w: 60, d: 40,
      brief: '외곽 감시 시설. 마이크로필름 4개를 회수하고 북쪽 회수 지점으로 탈출하라. 회색 은폐 구역과 아이템을 활용할 것.',
      spawn: [0, 17], extract: [0, -17, 5, 3.5],
      walls: [
        { x: -15, z: 8, w: 14, d: 1.4 }, { x: 15, z: 8, w: 14, d: 1.4 },
        { x: -24, z: -2, w: 1.4, d: 14 }, { x: 24, z: -2, w: 1.4, d: 14 },
        { x: 0, z: 2, w: 1.4, d: 10 }, { x: -10, z: -8, w: 12, d: 1.4 },
        { x: 12, z: -8, w: 10, d: 1.4 }, { x: -6, z: 14, w: 1.4, d: 5 }
      ],
      covers: [
        { x: -27, z: 13, w: 3.5, d: 4 }, { x: 27, z: 13, w: 3.5, d: 4 },
        { x: 9, z: 3, w: 4, d: 3 }, { x: -18, z: -13, w: 4, d: 3 },
        { x: 18, z: -13, w: 4, d: 3 }, { x: 4, z: -4, w: 3, d: 3 }
      ],
      films: [[-27, -17], [27, -17], [-27, 3], [27, 3]],
      items: [{ t: 'decoy', x: -10, z: 13 }, { t: 'smoke', x: 10, z: -13 }],
      guards: [
        { path: [[-18, 4], [18, 4]], speed: 2.2, range: 8 },
        { path: [[-20, -12], [-2, -12]], speed: 2.3, range: 8 },
        { path: [[20, -12], [5, -12], [5, -2]], speed: 2.3, range: 8 }
      ]
    },
    {
      name: '02 — 기록 보관소', w: 76, d: 50,
      brief: '거대한 서고. 필름 5개 회수 후 남동쪽 하수구로 탈출. 경비 순찰선이 겹친다 — 미끼로 흐트러뜨려라.',
      spawn: [-34, 21], extract: [34, -21, 5, 4],
      walls: [
        { x: -14, z: 12, w: 22, d: 1.4 }, { x: 14, z: 12, w: 22, d: 1.4 },
        { x: -28, z: 0, w: 1.4, d: 16 }, { x: 28, z: 0, w: 1.4, d: 16 },
        { x: -10, z: -6, w: 16, d: 1.4 }, { x: 12, z: -6, w: 1.4, d: 16 },
        { x: -2, z: -16, w: 18, d: 1.4 }, { x: 22, z: -16, w: 8, d: 1.4 },
        { x: 0, z: 20, w: 1.4, d: 8 }
      ],
      covers: [
        { x: -34, z: 10, w: 3.5, d: 4 }, { x: 4, z: 16, w: 4, d: 3 },
        { x: 34, z: 10, w: 3.5, d: 4 }, { x: -20, z: -11, w: 4, d: 3 },
        { x: 20, z: 2, w: 4, d: 3 }, { x: 0, z: -21, w: 4, d: 3 }
      ],
      films: [[-34, -21], [-2, 6], [34, 21], [22, -11], [-14, -21]],
      items: [{ t: 'decoy', x: -24, z: 6 }, { t: 'decoy', x: 14, z: 17 }, { t: 'smoke', x: 2, z: -11 }],
      guards: [
        { path: [[-22, 6], [8, 6]], speed: 2.4, range: 8.5 },
        { path: [[10, 17], [30, 17], [30, 6]], speed: 2.4, range: 8.5 },
        { path: [[-22, -11], [4, -11], [4, -21]], speed: 2.5, range: 8.5 },
        { path: [[16, -21], [32, -21], [32, -9]], speed: 2.5, range: 8.5 }
      ]
    },
    {
      name: '03 — 중앙 관제', w: 90, d: 60,
      brief: '심장부다. 필름 6개, 경비 6명. 순찰이 빠르고 시야가 넓다. 조용히, 확실하게.',
      spawn: [0, 26], extract: [0, -26, 6, 4],
      walls: [
        { x: -20, z: 16, w: 20, d: 1.4 }, { x: 20, z: 16, w: 20, d: 1.4 },
        { x: -34, z: 2, w: 1.4, d: 20 }, { x: 34, z: 2, w: 1.4, d: 20 },
        { x: -12, z: -2, w: 1.4, d: 12 }, { x: 12, z: -2, w: 1.4, d: 12 },
        { x: 0, z: 8, w: 14, d: 1.4 }, { x: -20, z: -14, w: 16, d: 1.4 },
        { x: 20, z: -14, w: 16, d: 1.4 }, { x: 0, z: -20, w: 1.4, d: 6 }
      ],
      covers: [
        { x: -40, z: 22, w: 4, d: 4 }, { x: 40, z: 22, w: 4, d: 4 },
        { x: 0, z: 20, w: 4, d: 3 }, { x: -28, z: -8, w: 4, d: 3 },
        { x: 28, z: -8, w: 4, d: 3 }, { x: 0, z: -9, w: 3, d: 3 },
        { x: -16, z: -24, w: 4, d: 3 }, { x: 16, z: -24, w: 4, d: 3 }
      ],
      films: [[-40, -26], [40, -26], [-40, 8], [40, 8], [0, 2], [24, 26]],
      items: [{ t: 'decoy', x: -30, z: 20 }, { t: 'smoke', x: 30, z: 20 }, { t: 'decoy', x: 0, z: -15 }, { t: 'smoke', x: -24, z: -26 }],
      guards: [
        { path: [[-14, 22], [14, 22]], speed: 2.7, range: 9 },
        { path: [[-28, 12], [-28, -8], [-16, -8]], speed: 2.6, range: 9 },
        { path: [[28, 12], [28, -8], [16, -8]], speed: 2.6, range: 9 },
        { path: [[-26, -18], [-26, -26], [-6, -26]], speed: 2.7, range: 9 },
        { path: [[26, -18], [26, -26], [6, -26]], speed: 2.7, range: 9 },
        { path: [[-6, 2], [6, 2], [6, -5], [-6, -5]], speed: 3.0, range: 9 }
      ]
    }
  ];

  /* ---------------- Audio (minimal synth) ---------------- */
  function Sfx() { this.ctx = null; this.muted = false; }
  Sfx.prototype.ensure = function () {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };
  Sfx.prototype.tone = function (f0, f1, dur, type, gain, when) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime + (when || 0);
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.08, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  };
  Sfx.prototype.pickup = function () { this.tone(660, 990, 0.12, 'sine', 0.09); this.tone(990, 1480, 0.14, 'sine', 0.07, 0.09); };
  Sfx.prototype.item = function () { this.tone(440, 660, 0.1, 'triangle', 0.08); };
  Sfx.prototype.use = function () { this.tone(300, 520, 0.14, 'triangle', 0.07); };
  Sfx.prototype.alert = function () { this.tone(340, 210, 0.16, 'square', 0.05); };
  Sfx.prototype.spotted = function () { this.tone(520, 520, 0.09, 'square', 0.06); this.tone(520, 520, 0.09, 'square', 0.06, 0.12); };
  Sfx.prototype.fail = function () { this.tone(330, 110, 0.5, 'sawtooth', 0.06); };
  Sfx.prototype.clear = function () { var f = [523, 659, 784, 1046]; for (var i = 0; i < 4; i++) this.tone(f[i], f[i], 0.16, 'sine', 0.08, i * 0.11); };
  Sfx.prototype.dash = function () { this.tone(180, 420, 0.1, 'triangle', 0.05); };
  Sfx.prototype.ui = function () { this.tone(880, 880, 0.05, 'sine', 0.05); };

  /* ---------------- Voice chat (WebRTC over relay signaling) ---------------- */
  function Voice(net) {
    this.net = net; this.enabled = false; this.muted = false;
    this.stream = null; this.pcs = {}; this.audios = {};
  }
  Voice.prototype.enable = async function () {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.enabled = true; this.setMuted(false);
      return true;
    } catch (e) { return false; }
  };
  Voice.prototype.setMuted = function (m) {
    this.muted = m;
    if (this.stream) this.stream.getAudioTracks().forEach(function (t) { t.enabled = !m; });
  };
  Voice.prototype.maybeConnect = function (peerId) {
    if (!this.enabled || this.pcs[peerId]) return;
    if (this.net.id < peerId) this._create(peerId, true);
  };
  Voice.prototype._create = function (peerId, initiator) {
    var self = this;
    var pc;
    try { pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }); }
    catch (e) { return null; }
    this.pcs[peerId] = pc;
    if (this.stream) this.stream.getTracks().forEach(function (t) { pc.addTrack(t, self.stream); });
    pc.onicecandidate = function (e) { if (e.candidate) self.net.signal(peerId, 'ice', e.candidate); };
    pc.ontrack = function (e) {
      var a = self.audios[peerId];
      if (!a) { a = document.createElement('audio'); a.autoplay = true; self.audios[peerId] = a; document.body.appendChild(a); }
      a.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = function () {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') self.drop(peerId);
    };
    if (initiator) {
      pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
        .then(function () { self.net.signal(peerId, 'offer', pc.localDescription); }).catch(function () { });
    }
    return pc;
  };
  Voice.prototype.handleSignal = async function (from, kind, data) {
    if (!this.enabled) return;
    var pc = this.pcs[from] || this._create(from, false);
    if (!pc) return;
    try {
      if (kind === 'offer') {
        await pc.setRemoteDescription(data);
        var a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        this.net.signal(from, 'answer', pc.localDescription);
      } else if (kind === 'answer') await pc.setRemoteDescription(data);
      else if (kind === 'ice') await pc.addIceCandidate(data);
    } catch (e) { }
  };
  Voice.prototype.drop = function (id) {
    var pc = this.pcs[id]; if (pc) { try { pc.close(); } catch (e) { } }
    delete this.pcs[id];
    var a = this.audios[id];
    if (a) { a.srcObject = null; if (a.parentNode) a.parentNode.removeChild(a); }
    delete this.audios[id];
  };

  /* ---------------- Networking (free public relay) ---------------- */
  function Net(game) {
    this.game = game; this.ws = null; this.status = 'off';
    this.id = Math.random().toString(36).slice(2, 8);
    this.room = ''; this.name = 'AGENT';
    this.peers = {}; this.lastSend = 0;
    this.voice = new Voice(this);
  }
  Net.prototype.connect = function (room, name) {
    var self = this;
    this.room = room; this.name = (name || 'AGENT').slice(0, 10);
    if (!room) { this.status = 'off'; return; }
    try {
      this.status = 'connecting';
      this.game.netStatus();
      var ws = new WebSocket('wss://socketsbay.com/wss/v2/1/demo/');
      this.ws = ws;
      ws.onopen = function () { self.status = 'on'; self.game.netStatus(); };
      ws.onclose = function () { self.status = 'off'; self.game.netStatus(); };
      ws.onerror = function () { self.status = 'off'; self.game.netStatus(); try { ws.close(); } catch (e) { } };
      ws.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (!m || m.g !== 'pigeon-protocol' || m.room !== self.room || m.id === self.id) return;
        if (m.t === 'rtc') {
          if (m.to === self.id) self.voice.handleSignal(m.id, m.kind, m.data);
          return;
        }
        var p = self.peers[m.id] || (self.peers[m.id] = {});
        p.x = m.x; p.z = m.z; p.ry = m.ry; p.stage = m.st; p.name = m.n;
        p.crouch = m.c; p.char = m.ch || 'pigeon'; p.mic = m.v;
        p.seen = performance.now();
        self.voice.maybeConnect(m.id);
      };
    } catch (e) { this.status = 'off'; }
  };
  Net.prototype.signal = function (to, kind, data) {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify({ g: 'pigeon-protocol', room: this.room, id: this.id, t: 'rtc', to: to, kind: kind, data: data })); } catch (e) { }
  };
  Net.prototype.send = function (player, stage, charId) {
    if (!this.ws || this.ws.readyState !== 1) return;
    var now = performance.now();
    if (now - this.lastSend < 140) return;
    this.lastSend = now;
    try {
      this.ws.send(JSON.stringify({
        g: 'pigeon-protocol', room: this.room, id: this.id, n: this.name,
        x: +player.pos.x.toFixed(2), z: +player.pos.y.toFixed(2),
        ry: +player.facing.toFixed(2), c: player.crouch ? 1 : 0,
        st: stage, ch: charId, v: (this.voice.enabled && !this.voice.muted) ? 1 : 0
      }));
    } catch (e) { }
  };

  /* ---------------- Component ---------------- */
  var TPL =
    '<div class="pg-root">' +
    ' <canvas class="pg-canvas"></canvas>' +
    ' <div class="pg-hud">' +
    '  <div class="pg-topbar">' +
    '   <div class="pg-brand">PIGEON PROTOCOL<span class="pg-dot"></span></div>' +
    '   <div class="pg-stage"></div>' +
    '   <div class="pg-films"></div>' +
    '   <div class="pg-inv"></div>' +
    '   <div class="pg-tbsp"></div>' +
    '   <button class="pg-tbtn pg-mic">MIC 꺼짐</button>' +
    '   <button class="pg-tbtn pg-missionbtn">임무 (Tab)</button>' +
    '   <div class="pg-net">오프라인</div>' +
    '  </div>' +
    '  <div class="pg-alertbar"><div class="pg-alertfill"></div></div>' +
    '  <div class="pg-roster"></div>' +
    '  <div class="pg-objective"></div>' +
    '  <div class="pg-toast"></div>' +
    ' </div>' +
    ' <div class="pg-drawer">' +
    '  <div class="pg-dr-hd"><span class="k">Mission file</span><button class="pg-dr-x">닫기 ✕</button></div>' +
    '  <div class="pg-dr-bd"></div>' +
    ' </div>' +
    ' <div class="pg-touch">' +
    '  <div class="pg-stick"><div class="pg-knob"></div></div>' +
    '  <div class="pg-btns">' +
    '   <button class="pg-b pg-b-dash">대시</button><button class="pg-b pg-b-crouch">숨기</button>' +
    '   <button class="pg-b pg-b-decoy">미끼</button><button class="pg-b pg-b-smoke">연막</button>' +
    '  </div>' +
    ' </div>' +
    ' <div class="pg-overlay"></div>' +
    '</div>';

  var CSS =
    '.pg-root{position:absolute;inset:0;overflow:hidden;background:#f3f2f2;font-family:"Archivo","Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#201e1d;user-select:none;-webkit-user-select:none;touch-action:none}' +
    '.pg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.pg-hud{position:absolute;inset:0;pointer-events:none}' +
    '.pg-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:stretch;border-bottom:2px solid #201e1d;background:rgba(243,242,242,.92)}' +
    '.pg-topbar>div{padding:10px 14px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;display:flex;align-items:center;gap:8px}' +
    '.pg-brand{font-weight:700;border-right:2px solid #201e1d}' +
    '.pg-dot{width:8px;height:8px;background:#ec3013;display:inline-block}' +
    '.pg-stage{border-right:2px solid #201e1d;color:#5a5755}' +
    '.pg-films{border-right:2px solid #201e1d;font-weight:700}' +
    '.pg-films b{color:#ec3013}' +
    '.pg-inv{border-right:2px solid #201e1d;color:#3c3937}' +
    '.pg-inv b{color:#201e1d}' +
    '.pg-tbsp{flex:1}' +
    '.pg-tbtn{pointer-events:auto;border:0;border-left:2px solid #201e1d;background:transparent;font:700 12px/1 inherit;letter-spacing:.12em;text-transform:uppercase;padding:0 14px;color:#201e1d;cursor:pointer;text-align:left}' +
    '.pg-tbtn:hover{background:rgba(236,48,19,.08)}' +
    '.pg-tbtn.onn{background:#ec3013;color:#f3f2f2}' +
    '.pg-net{border-left:2px solid #201e1d;color:#8a8683}' +
    '.pg-net.on{color:#ec3013;font-weight:700}' +
    '.pg-alertbar{position:absolute;top:40px;left:0;right:0;height:4px}' +
    '.pg-alertfill{height:100%;width:0%;background:#ec3013;transition:width .1s linear}' +
    '.pg-roster{position:absolute;top:52px;right:12px;display:flex;flex-direction:column;gap:4px;align-items:flex-end}' +
    '.pg-roster .pr{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;background:rgba(243,242,242,.88);border:1px solid #d8d5d3;padding:4px 8px;color:#3c3937}' +
    '.pg-roster .pr .sq{width:7px;height:7px;background:#8a8683}' +
    '.pg-roster .pr.me .sq{background:#ec3013}' +
    '.pg-roster .pr .mic{color:#ec3013;font-weight:700}' +
    '.pg-objective{position:absolute;left:14px;bottom:14px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;border-left:2px solid #ec3013;padding:2px 0 2px 10px;color:#5a5755;max-width:46%}' +
    '.pg-toast{position:absolute;left:50%;top:64px;transform:translateX(-50%);font-size:12px;letter-spacing:.14em;text-transform:uppercase;background:#201e1d;color:#f3f2f2;padding:8px 14px;opacity:0;transition:opacity .25s}' +
    '.pg-toast.show{opacity:1}' +
    /* drawer */
    '.pg-drawer{position:absolute;top:42px;right:0;bottom:0;width:min(360px,86%);background:rgba(243,242,242,.97);border-left:2px solid #201e1d;transform:translateX(102%);transition:transform .22s ease;display:flex;flex-direction:column}' +
    '.pg-drawer.open{transform:none}' +
    '.pg-dr-hd{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #201e1d;padding:12px 16px}' +
    '.pg-dr-hd .k{font-size:11px;letter-spacing:.2em;color:#ec3013;font-weight:700;text-transform:uppercase}' +
    '.pg-dr-x{border:2px solid #201e1d;background:transparent;font:700 11px/1 inherit;letter-spacing:.1em;padding:7px 10px;cursor:pointer;color:#201e1d}' +
    '.pg-dr-x:hover{background:rgba(236,48,19,.08)}' +
    '.pg-dr-bd{padding:14px 16px;overflow-y:auto;font-size:13px;line-height:1.6}' +
    '.pg-dr-bd h3{margin:16px 0 6px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8683;border-bottom:1px solid #d8d5d3;padding-bottom:5px}' +
    '.pg-dr-bd h3:first-child{margin-top:0}' +
    '.pg-dr-bd ul{margin:0;padding:0;list-style:none}' +
    '.pg-dr-bd li{padding:6px 0;border-bottom:1px solid #e4e2e0;display:flex;justify-content:space-between;gap:10px}' +
    '.pg-dr-bd li .ok{color:#ec3013;font-weight:700}' +
    '.pg-dr-bd li .todo{color:#8a8683}' +
    '.pg-dr-bd .brief{color:#3c3937;margin:0}' +
    /* touch */
    '.pg-touch{position:absolute;inset:0;pointer-events:none;display:none}' +
    '.pg-touch.show{display:block}' +
    '.pg-stick{position:absolute;left:22px;bottom:64px;width:112px;height:112px;border:2px solid #201e1d;background:rgba(243,242,242,.55);pointer-events:auto}' +
    '.pg-knob{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;background:#201e1d}' +
    '.pg-btns{position:absolute;right:22px;bottom:64px;display:grid;grid-template-columns:1fr 1fr;gap:10px;pointer-events:auto}' +
    '.pg-b{width:76px;height:52px;border:2px solid #201e1d;background:rgba(243,242,242,.75);font:700 13px/1 inherit;letter-spacing:.1em;text-align:left;padding-left:10px;color:#201e1d;text-transform:uppercase}' +
    '.pg-b:active{background:#ec3013;color:#f3f2f2;border-color:#ec3013}' +
    '.pg-b.onn{background:#201e1d;color:#f3f2f2}' +
    /* overlay */
    '.pg-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(243,242,242,.94);overflow:auto}' +
    '.pg-overlay.show{display:flex}' +
    '.pg-panel{width:min(620px,92%);max-height:92%;overflow-y:auto;border:2px solid #201e1d;background:#f3f2f2;margin:16px 0}' +
    '.pg-panel .hd{border-bottom:2px solid #201e1d;padding:16px 22px;display:flex;align-items:baseline;gap:12px}' +
    '.pg-panel .hd .k{font-size:11px;letter-spacing:.2em;color:#ec3013;font-weight:700;text-transform:uppercase}' +
    '.pg-panel h1{margin:0;font-size:clamp(22px,3.4vw,32px);font-weight:800;letter-spacing:-.01em;text-transform:uppercase}' +
    '.pg-panel .bd{padding:16px 22px;font-size:14px;line-height:1.6;color:#3c3937}' +
    '.pg-panel .bd p{margin:0 0 12px}' +
    '.pg-lbl{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a8683;margin:14px 0 6px}' +
    '.pg-lbl:first-child{margin-top:0}' +
    '.pg-chars{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}' +
    '.pg-char{border:2px solid #d8d5d3;background:#f3f2f2;text-align:left;padding:10px 12px;cursor:pointer;font-family:inherit;color:#201e1d}' +
    '.pg-char:hover{border-color:#8a8683}' +
    '.pg-char.sel{border-color:#ec3013;background:rgba(236,48,19,.06)}' +
    '.pg-char .nm{font-weight:800;font-size:15px;display:block}' +
    '.pg-char .rl{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#ec3013;font-weight:700;display:block;margin:2px 0 6px}' +
    '.pg-char .ds{font-size:11px;line-height:1.5;color:#5a5755;display:block}' +
    '.pg-seg{display:flex;border:2px solid #201e1d;width:fit-content}' +
    '.pg-seg button{border:0;background:transparent;font:700 12px/1 inherit;letter-spacing:.12em;text-transform:uppercase;padding:10px 18px;cursor:pointer;color:#201e1d;border-right:2px solid #201e1d}' +
    '.pg-seg button:last-child{border-right:0}' +
    '.pg-seg button.sel{background:#201e1d;color:#f3f2f2}' +
    '.pg-seg button:hover:not(.sel){background:rgba(236,48,19,.08)}' +
    '.pg-row{display:flex;gap:10px;margin-top:4px;flex-wrap:wrap}' +
    '.pg-field{flex:1;min-width:130px}' +
    '.pg-field label{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a8683;margin-bottom:5px}' +
    '.pg-field input{width:100%;box-sizing:border-box;border:2px solid #201e1d;background:#f3f2f2;padding:9px 10px;font:600 14px/1 inherit;letter-spacing:.06em;color:#201e1d;border-radius:0;outline:none}' +
    '.pg-field input:focus-visible{outline:2px solid #ec3013;outline-offset:2px}' +
    '.pg-rules{margin:0;padding:0;list-style:none;font-size:12px;color:#5a5755}' +
    '.pg-rules li{padding:6px 0;border-top:1px solid #d8d5d3;display:flex;gap:10px}' +
    '.pg-rules li:first-child{border-top:0}' +
    '.pg-rules b{color:#201e1d;min-width:110px;font-weight:700}' +
    '.pg-panel .ft{border-top:2px solid #201e1d;padding:14px 22px;display:flex;gap:10px;flex-wrap:wrap}' +
    '.pg-btn{border:2px solid #ec3013;background:#ec3013;color:#f3f2f2;font:700 14px/1 inherit;letter-spacing:.12em;text-transform:uppercase;padding:13px 40px 13px 16px;text-align:left;cursor:pointer;border-radius:0}' +
    '.pg-btn:hover{background:#c92a10;border-color:#c92a10}' +
    '.pg-btn.ghost{background:transparent;color:#201e1d;border-color:#201e1d}' +
    '.pg-btn.ghost:hover{background:rgba(236,48,19,.08)}' +
    '.pg-btn:focus-visible,.pg-char:focus-visible,.pg-seg button:focus-visible,.pg-tbtn:focus-visible{outline:2px solid #ec3013;outline-offset:2px}' +
    '.pg-hint{font-size:11px;letter-spacing:.06em;color:#8a8683;margin-top:10px;line-height:1.6}' +
    '@media(max-width:760px){.pg-topbar>div{padding:8px 8px;font-size:10px}.pg-tbtn{padding:0 8px;font-size:10px}.pg-objective{display:none}.pg-chars{grid-template-columns:1fr}.pg-roster{top:48px}}';

  function PG() { return Reflect.construct(HTMLElement, [], PG); }
  PG.prototype = Object.create(HTMLElement.prototype);
  PG.prototype.constructor = PG;
  Object.setPrototypeOf(PG, HTMLElement);

  PG.observedAttributes = ['show-cones', 'cam-dist'];
  PG.prototype.attributeChangedCallback = function () { this._syncAttrs && this._syncAttrs(); };

  PG.prototype.connectedCallback = function () {
    if (this._init) return; this._init = true;
    var style = document.createElement('style'); style.textContent = CSS;
    this.appendChild(style);
    var host = document.createElement('div'); host.innerHTML = TPL;
    this.appendChild(host.firstChild);
    this.style.position = 'absolute'; this.style.inset = '0'; this.style.display = 'block';
    this._boot();
  };

  PG.prototype._syncAttrs = function () {
    this.showCones = this.getAttribute('show-cones') !== 'false';
    this.camDist = parseFloat(this.getAttribute('cam-dist')) || 17;
    if (this.guards) for (var i = 0; i < this.guards.length; i++) this.guards[i].cone.visible = this.showCones;
  };

  PG.prototype._boot = async function () {
    var self = this;
    this.$ = function (s) { return self.querySelector(s); };
    this.sfx = new Sfx();
    this.net = new Net(this);
    this.charId = 'pigeon';
    this.diffId = 'normal';
    this.inv = { decoy: 0, smoke: 0 };
    this._syncAttrs();
    var THREE;
    try {
      THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
    } catch (e) {
      this.$('.pg-overlay').classList.add('show');
      this.$('.pg-overlay').innerHTML = '<div class="pg-panel"><div class="hd"><span class="k">Error</span><h1>3D 엔진 로드 실패</h1></div><div class="bd"><p>네트워크 연결을 확인한 뒤 새로고침해 주세요.</p></div></div>';
      return;
    }
    this.THREE = THREE;
    this._setup3D();
    this._setupInput();
    this._setupHudButtons();
    this._showTitle();
    this._loop();
  };

  /* ---------- 3D setup ---------- */
  PG.prototype._setup3D = function () {
    var T = this.THREE, self = this;
    var canvas = this.$('.pg-canvas');
    var r = new T.WebGLRenderer({ canvas: canvas, antialias: true });
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer = r;
    var scene = new T.Scene();
    scene.background = new T.Color(BG);
    scene.fog = new T.Fog(BG, 38, 80);
    this.scene = scene;
    this.camera = new T.PerspectiveCamera(42, 1, 0.1, 220);
    scene.add(new T.AmbientLight(0xffffff, 0.85));
    var sun = new T.DirectionalLight(0xffffff, 1.6);
    sun.position.set(14, 26, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 36; sun.shadow.camera.bottom = -36;
    sun.shadow.bias = -0.0004;
    scene.add(sun); scene.add(sun.target);
    this.sun = sun;
    this.levelGroup = new T.Group(); scene.add(this.levelGroup);
    this.actorGroup = new T.Group(); scene.add(this.actorGroup);
    this.fxGroup = new T.Group(); scene.add(this.fxGroup);
    this._spawnPlayer();
    this.peersMeshes = {};
    var ro = new ResizeObserver(function () { self._resize(); });
    ro.observe(this);
    this._resize();
    this.raycaster = new T.Raycaster();
    this.groundPlane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  };

  PG.prototype._spawnPlayer = function () {
    var T = this.THREE;
    var old = this.player;
    var C = CHARS[this.charId];
    var p = this._makeBird(C.pal, C.kind);
    p.pos = old ? old.pos : new T.Vector2(0, 0);
    p.facing = old ? old.facing : 0;
    p.crouch = false;
    if (old) this.actorGroup.remove(old.group);
    this.actorGroup.add(p.group);
    // smoke shell
    var sm = new T.Mesh(new T.SphereGeometry(1.1, 14, 10), new T.MeshBasicMaterial({ color: 0xb9b6b3, transparent: true, opacity: 0.4, depthWrite: false }));
    sm.position.y = 0.7; sm.visible = false;
    p.group.add(sm);
    p.smokeShell = sm;
    this.player = p;
  };

  PG.prototype._resize = function () {
    var w = this.clientWidth || 800, h = this.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /* ---------- Bird builder (pigeon / magpie / owl / guard) ---------- */
  PG.prototype._makeBird = function (pal, kind) {
    var T = this.THREE;
    var g = new T.Group();
    function mat(c) { return new T.MeshLambertMaterial({ color: c }); }
    var isOwl = kind === 'owl', isMag = kind === 'magpie', isGuard = kind === 'guard';
    var body = new T.Mesh(new T.SphereGeometry(0.46, 18, 14), mat(pal.body));
    if (isMag) body.scale.set(0.82, 0.76, 1.32);
    else if (isOwl) body.scale.set(1.05, 0.92, 1.1);
    else body.scale.set(0.95, 0.82, 1.25);
    body.position.y = 0.62; body.castShadow = true;
    g.add(body);
    var tailLen = isMag ? 0.72 : 0.42;
    var tail = new T.Mesh(new T.BoxGeometry(isMag ? 0.2 : 0.34, 0.07, tailLen), mat(pal.wing));
    tail.position.set(0, 0.72, -(0.42 + tailLen / 2 - 0.05)); tail.rotation.x = isMag ? -0.25 : -0.45; tail.castShadow = true;
    g.add(tail);
    if (!isOwl) {
      var neck = new T.Mesh(new T.CylinderGeometry(0.13, 0.19, 0.3, 10), mat(pal.body));
      neck.position.set(0, 0.95, 0.3); neck.rotation.x = 0.5;
      g.add(neck);
    }
    var head = new T.Group();
    var headR = isOwl ? 0.32 : 0.24;
    var skull = new T.Mesh(new T.SphereGeometry(headR, 16, 12), mat(pal.head));
    skull.castShadow = true; head.add(skull);
    var beak = new T.Mesh(new T.ConeGeometry(isOwl ? 0.07 : 0.09, isOwl ? 0.16 : 0.24, 8), mat(pal.accent));
    beak.rotation.x = Math.PI / 2; beak.position.set(0, isOwl ? -0.06 : -0.02, headR + 0.06);
    head.add(beak);
    var eyeR = isOwl ? 0.085 : 0.045;
    var eyeGeo = new T.SphereGeometry(eyeR, 8, 8), eyeMat = mat(0xf3f2f2);
    var e1 = new T.Mesh(eyeGeo, eyeMat); e1.position.set(headR * 0.55, 0.06, headR * 0.62); head.add(e1);
    var e2 = new T.Mesh(eyeGeo, eyeMat); e2.position.set(-headR * 0.55, 0.06, headR * 0.62); head.add(e2);
    if (isOwl) {
      var pupGeo = new T.SphereGeometry(0.035, 6, 6), pupMat = mat(INK);
      var p1 = new T.Mesh(pupGeo, pupMat); p1.position.set(headR * 0.55, 0.06, headR * 0.62 + 0.06); head.add(p1);
      var p2 = new T.Mesh(pupGeo, pupMat); p2.position.set(-headR * 0.55, 0.06, headR * 0.62 + 0.06); head.add(p2);
      var tuft1 = new T.Mesh(new T.ConeGeometry(0.07, 0.2, 6), mat(pal.head));
      tuft1.position.set(0.18, headR + 0.06, 0); head.add(tuft1);
      var tuft2 = tuft1.clone(); tuft2.position.x = -0.18; head.add(tuft2);
    }
    if (isGuard) {
      var cap = new T.Mesh(new T.CylinderGeometry(headR * 0.9, headR * 1.02, 0.1, 12), mat(0x171514));
      cap.position.set(0, headR * 0.8, 0); head.add(cap);
      var visor = new T.Mesh(new T.BoxGeometry(headR * 1.6, 0.06, 0.05), mat(ACCENT));
      visor.position.set(0, 0.05, headR + 0.02); head.add(visor);
    } else if (!isOwl) {
      var beret = new T.Mesh(new T.CylinderGeometry(headR * 0.85, headR, 0.08, 12), mat(pal.accent));
      beret.position.set(0.03, headR * 0.88, -0.02); beret.rotation.z = -0.18;
      head.add(beret);
    }
    head.position.set(0, isOwl ? 1.1 : 1.16, isOwl ? 0.3 : 0.42);
    g.add(head);
    function wing(side) {
      var w = new T.Mesh(new T.SphereGeometry(0.3, 10, 8), mat(pal.wing));
      w.scale.set(0.28, 0.55, 1); w.position.set((isOwl ? 0.46 : 0.42) * side, 0.66, -0.05);
      w.rotation.z = -0.15 * side; w.castShadow = true;
      return w;
    }
    var w1 = wing(1), w2 = wing(-1); g.add(w1); g.add(w2);
    function foot(side) {
      var f = new T.Group();
      var leg = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.26, 6), mat(pal.accent));
      leg.position.y = 0.13; f.add(leg);
      var toe = new T.Mesh(new T.BoxGeometry(0.14, 0.045, 0.22), mat(pal.accent));
      toe.position.set(0, 0.02, 0.05); f.add(toe);
      f.position.set(0.16 * side, 0, 0.05);
      return f;
    }
    var f1 = foot(1), f2 = foot(-1); g.add(f1); g.add(f2);
    return { group: g, body: body, head: head, wings: [w1, w2], feet: [f1, f2], tail: tail, phase: 0, idleT: 0, baseHeadY: isOwl ? 1.1 : 1.16, baseHeadZ: isOwl ? 0.3 : 0.42 };
  };

  /* ---------- Level build ---------- */
  PG.prototype._buildLevel = function (idx) {
    var T = this.THREE, L = LEVELS[idx], self = this;
    this.level = L; this.stageIdx = idx;
    while (this.levelGroup.children.length) this.levelGroup.remove(this.levelGroup.children[0]);
    while (this.fxGroup.children.length) this.fxGroup.remove(this.fxGroup.children[0]);
    this.guards = []; this.films = []; this.items = []; this.decoys = [];
    function mat(c) { return new T.MeshLambertMaterial({ color: c }); }
    var ground = new T.Mesh(new T.PlaneGeometry(L.w, L.d), mat(PAPER));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.levelGroup.add(ground);
    var outer = new T.Mesh(new T.PlaneGeometry(L.w + 80, L.d + 80), mat(0xe2e0de));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; outer.receiveShadow = true;
    this.levelGroup.add(outer);
    var grid = new T.GridHelper(Math.max(L.w, L.d), Math.max(L.w, L.d) / 2, 0xd8d5d3, 0xd8d5d3);
    grid.position.y = 0.01;
    this.levelGroup.add(grid);
    var frameMat = mat(INK);
    function bar(x, z, w, d, h, m) {
      var b = new T.Mesh(new T.BoxGeometry(w, h, d), m || frameMat);
      b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true;
      self.levelGroup.add(b); return b;
    }
    var t = 0.3, hw = L.w / 2, hd = L.d / 2;
    bar(0, -hd - t / 2, L.w + t * 2, t, 0.5);
    bar(0, hd + t / 2, L.w + t * 2, t, 0.5);
    bar(-hw - t / 2, 0, t, L.d, 0.5);
    bar(hw + t / 2, 0, t, L.d, 0.5);
    this.walls = [];
    for (var i = 0; i < L.walls.length; i++) {
      var wl = L.walls[i];
      bar(wl.x, wl.z, wl.w, wl.d, 1.7);
      this.walls.push({ minX: wl.x - wl.w / 2, maxX: wl.x + wl.w / 2, minZ: wl.z - wl.d / 2, maxZ: wl.z + wl.d / 2 });
    }
    this.covers = [];
    for (var c = 0; c < L.covers.length; c++) {
      var cv = L.covers[c];
      var cm = new T.Mesh(new T.PlaneGeometry(cv.w, cv.d), new T.MeshBasicMaterial({ color: 0xc9c6c3, transparent: true, opacity: 0.75 }));
      cm.rotation.x = -Math.PI / 2; cm.position.set(cv.x, 0.02, cv.z);
      this.levelGroup.add(cm);
      var edges = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(cv.w, cv.d)), new T.LineBasicMaterial({ color: MID }));
      edges.rotation.x = -Math.PI / 2; edges.position.set(cv.x, 0.03, cv.z);
      this.levelGroup.add(edges);
      bar(cv.x - cv.w / 4, cv.z - cv.d / 4, cv.w / 3, cv.d / 3, 0.55, mat(0xc2bfbc));
      this.covers.push({ minX: cv.x - cv.w / 2, maxX: cv.x + cv.w / 2, minZ: cv.z - cv.d / 2, maxZ: cv.z + cv.d / 2 });
    }
    for (var f = 0; f < L.films.length; f++) {
      var fp = L.films[f];
      var fg = new T.Group();
      var core = new T.Mesh(new T.OctahedronGeometry(0.28), new T.MeshLambertMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.35 }));
      core.position.y = 0.8; core.castShadow = true; fg.add(core);
      var ring = new T.Mesh(new T.TorusGeometry(0.5, 0.03, 8, 32), new T.MeshBasicMaterial({ color: ACCENT }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; fg.add(ring);
      fg.position.set(fp[0], 0, fp[1]);
      this.levelGroup.add(fg);
      this.films.push({ x: fp[0], z: fp[1], mesh: fg, core: core, got: false });
    }
    // items
    for (var it = 0; it < (L.items || []).length; it++) {
      var id = L.items[it];
      var ig = new T.Group();
      var im;
      if (id.t === 'decoy') {
        im = new T.Mesh(new T.BoxGeometry(0.4, 0.4, 0.4), new T.MeshLambertMaterial({ color: INK }));
        var stripe = new T.Mesh(new T.BoxGeometry(0.42, 0.1, 0.42), new T.MeshLambertMaterial({ color: ACCENT }));
        stripe.position.y = 0.1; im.add(stripe);
      } else {
        im = new T.Mesh(new T.SphereGeometry(0.26, 12, 10), new T.MeshLambertMaterial({ color: MID }));
      }
      im.position.y = 0.7; im.castShadow = true; ig.add(im);
      var iring = new T.Mesh(new T.TorusGeometry(0.5, 0.025, 8, 32), new T.MeshBasicMaterial({ color: MID }));
      iring.rotation.x = -Math.PI / 2; iring.position.y = 0.06; ig.add(iring);
      ig.position.set(id.x, 0, id.z);
      this.levelGroup.add(ig);
      this.items.push({ t: id.t, x: id.x, z: id.z, mesh: ig, core: im, got: false });
    }
    var ex = L.extract;
    var exg = new T.Group();
    var exEdge = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(ex[2], ex[3])), new T.LineBasicMaterial({ color: ACCENT }));
    exEdge.rotation.x = -Math.PI / 2; exEdge.position.y = 0.04; exg.add(exEdge);
    var exFill = new T.Mesh(new T.PlaneGeometry(ex[2], ex[3]), new T.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.12 }));
    exFill.rotation.x = -Math.PI / 2; exFill.position.y = 0.035; exg.add(exFill);
    exg.position.set(ex[0], 0, ex[1]);
    this.levelGroup.add(exg);
    this.extractMesh = exFill;
    // guards
    var D = DIFFS[this.diffId];
    for (var gI = 0; gI < L.guards.length; gI++) {
      var gd = L.guards[gI];
      var pg = this._makeBird({ body: 0x2b2825, head: 0x201e1d, wing: 0x171514, accent: 0xec3013 }, 'guard');
      pg.group.scale.setScalar(1.12);
      this.levelGroup.add(pg.group);
      var range = gd.range * D.gr;
      var fov = Math.PI * 0.42;
      var coneGeo = new T.CircleGeometry(range, 26, -Math.PI / 2 - fov / 2, fov);
      coneGeo.rotateX(-Math.PI / 2);
      var cone = new T.Mesh(coneGeo, new T.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.10, depthWrite: false }));
      cone.position.y = 0.05;
      pg.group.add(cone);
      cone.visible = this.showCones;
      var bang = this._makeBang();
      bang.position.y = 2.0; bang.visible = false;
      pg.group.add(bang);
      this.guards.push({
        model: pg, cone: cone, bang: bang, path: gd.path, seg: 0,
        speed: gd.speed * D.gs, range: range, fov: fov,
        pos: new T.Vector2(gd.path[0][0], gd.path[0][1]), facing: 0,
        detect: 0, state: 'patrol', loseT: 0, lureT: 0, lure: null
      });
    }
    // reset player
    this.player.pos.set(L.spawn[0], L.spawn[1]);
    this.player.facing = Math.PI; this.player.crouch = false;
    this.player.smokeUntil = 0;
    this.$('.pg-b-crouch').classList.remove('onn');
    this.moveTarget = null;
    this.filmCount = 0; this.extractT = 0;
    this.inv = { decoy: D.start.decoy, smoke: D.start.smoke };
    this.$('.pg-stage').textContent = L.name;
    this._updFilms(); this._updInv();
    this.$('.pg-objective').textContent = '목표 — 마이크로필름 회수 후 적색 구역으로 탈출';
    this._updDrawer();
  };

  PG.prototype._makeBang = function () {
    var T = this.THREE;
    var cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    var c = cv.getContext('2d');
    c.fillStyle = '#ec3013'; c.font = '900 56px Archivo, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', 32, 36);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true }));
    sp.scale.set(0.7, 0.7, 1);
    return sp;
  };

  PG.prototype._updFilms = function () {
    this.$('.pg-films').innerHTML = '필름 <b>' + this.filmCount + '</b>/' + this.level.films.length;
  };
  PG.prototype._updInv = function () {
    this.$('.pg-inv').innerHTML = '미끼 <b>' + this.inv.decoy + '</b> · 연막 <b>' + this.inv.smoke + '</b>';
  };
  PG.prototype._toast = function (msg) {
    var el = this.$('.pg-toast'), self = this;
    el.textContent = msg; el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(function () { el.classList.remove('show'); }, 1800);
  };

  PG.prototype.netStatus = function () {
    var el = this.$('.pg-net');
    var s = this.net.status;
    el.classList.toggle('on', s === 'on');
    el.textContent = s === 'on' ? '온라인 · ' + this.net.room : s === 'connecting' ? '접속 중…' : '오프라인 (싱글)';
    this._updRoster();
  };

  /* ---------- Roster & Drawer ---------- */
  PG.prototype._updRoster = function () {
    var el = this.$('.pg-roster');
    if (!el) return;
    var html = '<div class="pr me"><span class="sq"></span>' +
      (this.net.name || 'AGENT') + ' · ' + (CHARS[this.charId].name) +
      ((this.net.voice.enabled && !this.net.voice.muted) ? ' <span class="mic">MIC</span>' : '') + '</div>';
    var now = performance.now();
    for (var id in this.net.peers) {
      var p = this.net.peers[id];
      if (now - p.seen > 6000) continue;
      html += '<div class="pr"><span class="sq"></span>' +
        (p.name || '요원') + ' · ' + (CHARS[p.char] ? CHARS[p.char].name : '비둘기') +
        ' · S' + ((p.stage | 0) + 1) +
        (p.mic ? ' <span class="mic">MIC</span>' : '') + '</div>';
    }
    el.innerHTML = html;
  };

  PG.prototype._updDrawer = function () {
    var bd = this.$('.pg-dr-bd');
    if (!bd || !this.level) return;
    var L = this.level;
    var h = '<h3>작전 — ' + L.name + '</h3><p class="brief">' + L.brief + '</p>';
    h += '<h3>체크리스트</h3><ul>';
    for (var i = 0; i < this.films.length; i++) {
      var f = this.films[i];
      h += '<li><span>마이크로필름 #' + (i + 1) + '</span>' + (f.got ? '<span class="ok">회수</span>' : '<span class="todo">미회수</span>') + '</li>';
    }
    var ready = this.filmCount === this.films.length;
    h += '<li><span>회수 지점 탈출</span>' + (ready ? '<span class="ok">개방됨</span>' : '<span class="todo">필름 전부 필요</span>') + '</li></ul>';
    h += '<h3>장비</h3><ul>' +
      '<li><span>미끼 (1키) — 경비를 유인</span><b>' + this.inv.decoy + '</b></li>' +
      '<li><span>연막 (2키) — 5초 은신</span><b>' + this.inv.smoke + '</b></li></ul>';
    h += '<h3>요원 — ' + CHARS[this.charId].name + ' · ' + DIFFS[this.diffId].name + '</h3>' +
      '<p class="brief">' + CHARS[this.charId].desc + '</p>';
    h += '<h3>참가자</h3><ul>';
    h += '<li><span>' + (this.net.name || 'AGENT') + ' (나)</span><span class="ok">' + CHARS[this.charId].name + '</span></li>';
    var now = performance.now(), any = false;
    for (var id in this.net.peers) {
      var p = this.net.peers[id];
      if (now - p.seen > 6000) continue;
      any = true;
      h += '<li><span>' + (p.name || '요원') + (p.mic ? ' · MIC' : '') + '</span><span class="todo">S' + ((p.stage | 0) + 1) + '</span></li>';
    }
    if (!any) h += '<li><span class="todo">' + (this.net.status === 'on' ? '같은 방의 다른 요원 없음' : '오프라인 — 싱글 작전') + '</span></li>';
    h += '</ul>';
    bd.innerHTML = h;
  };

  PG.prototype._toggleDrawer = function (force) {
    var d = this.$('.pg-drawer');
    var open = force !== undefined ? force : !d.classList.contains('open');
    d.classList.toggle('open', open);
    if (open) this._updDrawer();
  };

  /* ---------- HUD buttons ---------- */
  PG.prototype._setupHudButtons = function () {
    var self = this;
    this.$('.pg-missionbtn').addEventListener('click', function () { self.sfx.ensure(); self.sfx.ui(); self._toggleDrawer(); });
    this.$('.pg-dr-x').addEventListener('click', function () { self._toggleDrawer(false); });
    this.$('.pg-drawer').style.pointerEvents = 'auto';
    this.$('.pg-mic').addEventListener('click', async function () {
      self.sfx.ensure();
      var v = self.net.voice, btn = self.$('.pg-mic');
      if (!v.enabled) {
        btn.textContent = 'MIC 요청중';
        var ok = await v.enable();
        if (!ok) { btn.textContent = 'MIC 불가'; self._toast('마이크 권한이 거부되었습니다'); return; }
        btn.textContent = 'MIC 켜짐'; btn.classList.add('onn');
        if (self.net.status !== 'on') self._toast('음성은 온라인(방 코드 입력) 시 다른 요원에게 전달됩니다');
      } else {
        v.setMuted(!v.muted);
        btn.textContent = v.muted ? 'MIC 꺼짐' : 'MIC 켜짐';
        btn.classList.toggle('onn', !v.muted);
      }
      self._updRoster();
    });
  };

  /* ---------- Input ---------- */
  PG.prototype._setupInput = function () {
    var self = this;
    this.keys = {};
    this.joy = new this.THREE.Vector2(0, 0);
    this.dashT = -10;
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Tab' || e.code === 'KeyM') {
        if (self.mode === 'play') { e.preventDefault(); self._toggleDrawer(); }
        return;
      }
      if (self.mode !== 'play') return;
      self.keys[e.code] = true;
      if (e.code === 'KeyC' || e.code === 'ControlLeft') self._toggleCrouch();
      if (e.code === 'ShiftLeft' || e.code === 'Space') { self._dash(); e.preventDefault(); }
      if (e.code === 'Digit1') self._useDecoy();
      if (e.code === 'Digit2') self._useSmoke();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
      self.moveTarget = null;
    });
    window.addEventListener('keyup', function (e) { self.keys[e.code] = false; });
    var canvas = this.$('.pg-canvas');
    canvas.addEventListener('pointerdown', function (e) {
      if (self.mode !== 'play') return;
      self.sfx.ensure();
      var rect = canvas.getBoundingClientRect();
      var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      self.raycaster.setFromCamera({ x: nx, y: ny }, self.camera);
      var pt = new self.THREE.Vector3();
      if (self.raycaster.ray.intersectPlane(self.groundPlane, pt)) {
        self.moveTarget = new self.THREE.Vector2(pt.x, pt.z);
      }
    });
    var stick = this.$('.pg-stick'), knob = this.$('.pg-knob'), stickId = null;
    function setKnob(dx, dy) { knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)'; }
    stick.addEventListener('pointerdown', function (e) { stickId = e.pointerId; stick.setPointerCapture(stickId); moveStick(e); });
    stick.addEventListener('pointermove', function (e) { if (e.pointerId === stickId) moveStick(e); });
    function endStick(e) { if (e.pointerId === stickId) { stickId = null; self.joy.set(0, 0); setKnob(0, 0); } }
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);
    function moveStick(e) {
      var r = stick.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      var len = Math.hypot(dx, dy), max = r.width / 2 - 10;
      if (len > max) { dx *= max / len; dy *= max / len; }
      setKnob(dx, dy);
      self.joy.set(dx / max, dy / max);
      self.moveTarget = null;
      self.sfx.ensure();
    }
    this.$('.pg-b-dash').addEventListener('pointerdown', function (e) { e.preventDefault(); self._dash(); });
    this.$('.pg-b-crouch').addEventListener('pointerdown', function (e) { e.preventDefault(); self._toggleCrouch(); });
    this.$('.pg-b-decoy').addEventListener('pointerdown', function (e) { e.preventDefault(); self._useDecoy(); });
    this.$('.pg-b-smoke').addEventListener('pointerdown', function (e) { e.preventDefault(); self._useSmoke(); });
    if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) {
      this.$('.pg-touch').classList.add('show');
    }
  };

  PG.prototype._toggleCrouch = function () {
    this.player.crouch = !this.player.crouch;
    this.$('.pg-b-crouch').classList.toggle('onn', this.player.crouch);
    this.sfx.ensure(); this.sfx.ui();
  };
  PG.prototype._dash = function () {
    var now = performance.now() / 1000;
    if (now - this.dashT < CHARS[this.charId].dashCd) return;
    this.dashT = now;
    this.sfx.ensure(); this.sfx.dash();
  };
  PG.prototype._useDecoy = function () {
    if (this.mode !== 'play') return;
    if (this.inv.decoy <= 0) { this._toast('미끼가 없다 — 맵에서 회수하라'); return; }
    this.inv.decoy--; this._updInv(); this._updDrawer();
    this.sfx.ensure(); this.sfx.use();
    var T = this.THREE, P = this.player;
    var dx = Math.sin(P.facing), dz = Math.cos(P.facing);
    var x = P.pos.x + dx * 3, z = P.pos.y + dz * 3;
    var g = new T.Group();
    var cube = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.34), new T.MeshLambertMaterial({ color: INK }));
    cube.position.y = 0.2; cube.castShadow = true; g.add(cube);
    var ring = new T.Mesh(new T.TorusGeometry(0.6, 0.03, 8, 32), new T.MeshBasicMaterial({ color: ACCENT }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    g.position.set(x, 0, z);
    this.fxGroup.add(g);
    this.decoys.push({ x: x, z: z, mesh: g, t: 6 });
    this._toast('미끼 투척 — 경비가 유인된다');
  };
  PG.prototype._useSmoke = function () {
    if (this.mode !== 'play') return;
    if (this.inv.smoke <= 0) { this._toast('연막이 없다 — 맵에서 회수하라'); return; }
    this.inv.smoke--; this._updInv(); this._updDrawer();
    this.sfx.ensure(); this.sfx.use();
    this.player.smokeUntil = performance.now() / 1000 + 5;
    this._toast('연막 전개 — 5초간 은신');
  };

  /* ---------- Overlays ---------- */
  PG.prototype._overlay = function (html) {
    var ov = this.$('.pg-overlay');
    ov.innerHTML = html; ov.classList.add('show');
    ov.style.pointerEvents = 'auto';
  };
  PG.prototype._closeOverlay = function () { this.$('.pg-overlay').classList.remove('show'); };

  PG.prototype._showTitle = function () {
    var self = this;
    this.mode = 'menu';
    this._buildLevel(0);
    this._toggleDrawer(false);
    var charBtns = '';
    for (var cid in CHARS) {
      var C = CHARS[cid];
      charBtns += '<button class="pg-char' + (cid === this.charId ? ' sel' : '') + '" data-c="' + cid + '">' +
        '<span class="nm">' + C.name + '</span><span class="rl">' + C.role + '</span><span class="ds">' + C.desc + '</span></button>';
    }
    var diffBtns = '';
    for (var did in DIFFS) {
      diffBtns += '<button data-d="' + did + '" class="' + (did === this.diffId ? 'sel' : '') + '">' + DIFFS[did].name + '</button>';
    }
    this._overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Classified</span><h1>Pigeon Protocol<br>비둘기 특무</h1></div>' +
      '<div class="bd">' +
      '<div class="pg-lbl">요원 선택</div><div class="pg-chars">' + charBtns + '</div>' +
      '<div class="pg-lbl">난이도</div><div class="pg-seg pg-diff">' + diffBtns + '</div>' +
      '<div class="pg-lbl">신원</div>' +
      '<div class="pg-row">' +
      '<div class="pg-field"><label>콜사인</label><input class="pg-name" maxlength="10" value="AGENT-' + Math.floor(Math.random() * 90 + 10) + '"></div>' +
      '<div class="pg-field"><label>작전 방 코드 (온라인 · 선택)</label><input class="pg-room" maxlength="12" placeholder="예: NEST-7"></div>' +
      '</div>' +
      '<div class="pg-lbl">브리핑</div>' +
      '<ul class="pg-rules">' +
      '<li><b>이동</b><span>WASD / 화살표 · 바닥 클릭 · 모바일 조이스틱</span></li>' +
      '<li><b>숨기 (C)</b><span>느리지만 덜 띈다. 회색 은폐 구역에선 완전 은신</span></li>' +
      '<li><b>대시 (Shift)</b><span>짧은 돌진</span></li>' +
      '<li><b>미끼 (1)</b><span>경비를 그 자리로 유인</span></li>' +
      '<li><b>연막 (2)</b><span>5초간 완전 은신</span></li>' +
      '<li><b>임무 (Tab)</b><span>체크리스트 · 장비 · 참가자 확인</span></li>' +
      '</ul>' +
      '<div class="pg-hint">같은 방 코드의 요원이 함께 보이며, 상단 MIC 버튼으로 음성채팅(P2P)이 연결됩니다. 무료 공개 릴레이라 불안정할 수 있고, 방 코드를 비우면 싱글 작전입니다.</div>' +
      '</div>' +
      '<div class="ft"><button class="pg-btn pg-go">작전 개시 →</button></div></div>'
    );
    var ov = this.$('.pg-overlay');
    ov.querySelectorAll('.pg-char').forEach(function (b) {
      b.addEventListener('click', function () {
        self.charId = b.getAttribute('data-c');
        ov.querySelectorAll('.pg-char').forEach(function (x) { x.classList.toggle('sel', x === b); });
        self.sfx.ensure(); self.sfx.ui();
      });
    });
    ov.querySelectorAll('.pg-diff button').forEach(function (b) {
      b.addEventListener('click', function () {
        self.diffId = b.getAttribute('data-d');
        ov.querySelectorAll('.pg-diff button').forEach(function (x) { x.classList.toggle('sel', x === b); });
        self.sfx.ensure(); self.sfx.ui();
      });
    });
    this.$('.pg-go').addEventListener('click', function () {
      self.sfx.ensure(); self.sfx.ui();
      var room = (self.$('.pg-room').value || '').trim().toUpperCase();
      var name = (self.$('.pg-name').value || 'AGENT').trim();
      if (room && self.net.status !== 'on') self.net.connect(room, name);
      else self.net.name = name;
      self.netStatus();
      self._spawnPlayer();
      self._startStage(0);
    });
  };

  PG.prototype._startStage = function (idx) {
    var self = this;
    this._buildLevel(idx);
    this.mode = 'brief';
    var L = LEVELS[idx];
    this._overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Stage ' + (idx + 1) + '/' + LEVELS.length + ' · ' + DIFFS[this.diffId].name + '</span><h1>' + L.name + '</h1></div>' +
      '<div class="bd"><p>' + L.brief + '</p>' +
      '<ul class="pg-rules">' +
      '<li><b>필름</b><span>' + L.films.length + '개</span></li>' +
      '<li><b>경비</b><span>' + L.guards.length + '명</span></li>' +
      '<li><b>요원</b><span>' + CHARS[this.charId].name + ' · ' + CHARS[this.charId].role + '</span></li>' +
      '</ul></div>' +
      '<div class="ft"><button class="pg-btn pg-go2">잠입 →</button></div></div>'
    );
    this.$('.pg-go2').addEventListener('click', function () {
      self.sfx.ensure(); self.sfx.ui();
      self._closeOverlay(); self.mode = 'play';
    });
  };

  PG.prototype._fail = function () {
    var self = this;
    if (this.mode !== 'play') return;
    this.mode = 'fail';
    this.sfx.fail();
    this._overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">Mission failed</span><h1>발각되었다</h1></div>' +
      '<div class="bd"><p>경비에게 붙잡혔다. 같은 스테이지를 처음부터 다시 시도한다.</p></div>' +
      '<div class="ft"><button class="pg-btn pg-retry">재시도 →</button><button class="pg-btn ghost pg-menu">타이틀로</button></div></div>'
    );
    this.$('.pg-retry').addEventListener('click', function () { self._startStage(self.stageIdx); });
    this.$('.pg-menu').addEventListener('click', function () { self._showTitle(); });
  };

  PG.prototype._clearStage = function () {
    var self = this;
    this.mode = 'clear';
    this.sfx.clear();
    var last = this.stageIdx >= LEVELS.length - 1;
    this._overlay(
      '<div class="pg-panel"><div class="hd"><span class="k">' + (last ? 'All clear' : 'Stage clear') + '</span><h1>' + (last ? '작전 완수' : '탈출 성공') + '</h1></div>' +
      '<div class="bd"><p>' + (last ? '모든 마이크로필름이 본부로 전달되었다. 훌륭한 비행이었다, 요원.' : '필름 ' + this.level.films.length + '개 회수. 다음 구역으로 이동한다.') + '</p></div>' +
      '<div class="ft">' + (last ? '<button class="pg-btn pg-again">처음부터 →</button>' : '<button class="pg-btn pg-next">다음 스테이지 →</button>') + '<button class="pg-btn ghost pg-menu">타이틀로</button></div></div>'
    );
    if (last) this.$('.pg-again').addEventListener('click', function () { self._startStage(0); });
    else this.$('.pg-next').addEventListener('click', function () { self._startStage(self.stageIdx + 1); });
    this.$('.pg-menu').addEventListener('click', function () { self._showTitle(); });
  };

  /* ---------- Sim helpers ---------- */
  PG.prototype._inWall = function (x, z, pad) {
    pad = pad || 0;
    for (var i = 0; i < this.walls.length; i++) {
      var w = this.walls[i];
      if (x > w.minX - pad && x < w.maxX + pad && z > w.minZ - pad && z < w.maxZ + pad) return true;
    }
    return false;
  };
  PG.prototype._los = function (ax, az, bx, bz) {
    var dx = bx - ax, dz = bz - az, dist = Math.hypot(dx, dz);
    var steps = Math.ceil(dist / 0.4);
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      if (this._inWall(ax + dx * t, az + dz * t, 0)) return false;
    }
    return true;
  };
  PG.prototype._inCover = function (x, z) {
    for (var i = 0; i < this.covers.length; i++) {
      var c = this.covers[i];
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return true;
    }
    return false;
  };
  PG.prototype._collide = function (pos, r) {
    var hw = this.level.w / 2 - r, hd = this.level.d / 2 - r;
    pos.x = Math.max(-hw, Math.min(hw, pos.x));
    pos.y = Math.max(-hd, Math.min(hd, pos.y));
    for (var i = 0; i < this.walls.length; i++) {
      var w = this.walls[i];
      var cx = Math.max(w.minX, Math.min(w.maxX, pos.x));
      var cz = Math.max(w.minZ, Math.min(w.maxZ, pos.y));
      var dx = pos.x - cx, dz = pos.y - cz;
      var d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        var d = Math.sqrt(d2) || 0.001;
        pos.x = cx + (dx / d) * r;
        pos.y = cz + (dz / d) * r;
      }
    }
  };

  /* ---------- Animation ---------- */
  PG.prototype._animBird = function (P, speed, dt, crouch, t) {
    var moving = speed > 0.15;
    P.phase += speed * dt * 3.4;
    var lift = crouch ? 0.06 : 0.11;
    var s = Math.sin(P.phase * Math.PI);
    P.feet[0].position.z = 0.05 + (moving ? s * 0.22 : 0);
    P.feet[0].position.y = moving ? Math.max(0, s) * lift : 0;
    P.feet[1].position.z = 0.05 + (moving ? -s * 0.22 : 0);
    P.feet[1].position.y = moving ? Math.max(0, -s) * lift : 0;
    var baseY = crouch ? -0.16 : 0;
    P.body.position.y = 0.62 + baseY + (moving ? Math.abs(s) * 0.05 : Math.sin(t * 1.8) * 0.015);
    P.body.rotation.x = crouch ? 0.28 : (moving ? 0.1 : 0);
    var hy = P.baseHeadY + baseY * 1.4;
    if (moving) {
      P.head.position.z = P.baseHeadZ + Math.sin(P.phase * Math.PI * 2) * 0.07;
      P.head.position.y = hy - (crouch ? 0.14 : 0);
      P.head.rotation.x = crouch ? 0.3 : 0.05;
      P.idleT = 0;
      P.head.rotation.y *= 0.85;
    } else {
      P.idleT += dt;
      var peck = Math.max(0, Math.sin(P.idleT * 1.1 - 2)) * 0.5;
      P.head.position.z = P.baseHeadZ + peck * 0.12;
      P.head.position.y = hy - peck * 0.3;
      P.head.rotation.x = peck * 0.9;
      P.head.rotation.y = Math.sin(P.idleT * 0.7) * 0.5;
    }
    var flut = moving ? Math.sin(P.phase * Math.PI * 2) * 0.08 * Math.min(speed / 4, 1) : 0;
    P.wings[0].rotation.z = -0.15 + flut;
    P.wings[1].rotation.z = 0.15 - flut;
    P.tail.rotation.x = -0.45 + (moving ? s * 0.08 : Math.sin(t * 2.3) * 0.04);
  };

  /* ---------- Main loop ---------- */
  PG.prototype._loop = function () {
    var self = this, T = this.THREE, last = performance.now();
    var camPos = new T.Vector3(0, 16, 14);
    var rosterT = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      var t = now / 1000;
      var P = self.player;
      var C = CHARS[self.charId];
      var speed = 0;
      rosterT += dt;
      if (rosterT > 1) { rosterT = 0; self._updRoster(); if (self.$('.pg-drawer').classList.contains('open')) self._updDrawer(); }
      var smokeActive = t < (P.smokeUntil || 0);
      if (P.smokeShell) {
        P.smokeShell.visible = smokeActive;
        if (smokeActive) { P.smokeShell.material.opacity = 0.25 + Math.sin(t * 6) * 0.1; P.smokeShell.rotation.y = t; }
      }
      if (self.mode === 'play') {
        var ix = 0, iz = 0;
        if (self.keys.KeyW || self.keys.ArrowUp) iz -= 1;
        if (self.keys.KeyS || self.keys.ArrowDown) iz += 1;
        if (self.keys.KeyA || self.keys.ArrowLeft) ix -= 1;
        if (self.keys.KeyD || self.keys.ArrowRight) ix += 1;
        ix += self.joy.x; iz += self.joy.y;
        if (self.moveTarget) {
          var tdx = self.moveTarget.x - P.pos.x, tdz = self.moveTarget.y - P.pos.y;
          var td = Math.hypot(tdx, tdz);
          if (td < 0.25) self.moveTarget = null;
          else { ix = tdx / td; iz = tdz / td; }
        }
        var il = Math.hypot(ix, iz);
        if (il > 1) { ix /= il; iz /= il; }
        var dashing = (t - self.dashT) < 0.22;
        var maxSp = (P.crouch ? 2.1 : 4.4) * C.speed * (dashing ? 2.3 : 1);
        P.pos.x += ix * maxSp * dt;
        P.pos.y += iz * maxSp * dt;
        self._collide(P.pos, 0.5);
        speed = il * maxSp;
        if (il > 0.05) {
          var want = Math.atan2(ix, iz);
          var da = want - P.facing;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          P.facing += da * Math.min(1, dt * 10);
        }
        // films
        for (var f = 0; f < self.films.length; f++) {
          var fl = self.films[f];
          if (fl.got) continue;
          fl.core.rotation.y = t * 2.2;
          fl.core.position.y = 0.8 + Math.sin(t * 2.5 + f) * 0.08;
          if (Math.hypot(fl.x - P.pos.x, fl.z - P.pos.y) < 1.1) {
            fl.got = true; fl.mesh.visible = false;
            self.filmCount++; self._updFilms(); self._updDrawer(); self.sfx.pickup();
            if (self.filmCount === self.films.length) {
              self.$('.pg-objective').textContent = '목표 — 적색 회수 구역으로 탈출하라';
              self._toast('필름 전부 회수 — 탈출구 개방');
            }
          }
        }
        // items
        for (var itI = 0; itI < self.items.length; itI++) {
          var itm = self.items[itI];
          if (itm.got) continue;
          itm.core.rotation.y = t * 1.6;
          if (Math.hypot(itm.x - P.pos.x, itm.z - P.pos.y) < 1.1) {
            itm.got = true; itm.mesh.visible = false;
            self.inv[itm.t]++;
            self._updInv(); self._updDrawer(); self.sfx.item();
            self._toast(itm.t === 'decoy' ? '미끼 획득 (1키)' : '연막 획득 (2키)');
          }
        }
        // decoys tick
        for (var dI = self.decoys.length - 1; dI >= 0; dI--) {
          var dc = self.decoys[dI];
          dc.t -= dt;
          dc.mesh.children[1].scale.setScalar(1 + Math.sin(t * 5) * 0.15);
          if (dc.t <= 0) { self.fxGroup.remove(dc.mesh); self.decoys.splice(dI, 1); }
        }
        // extraction
        var ex = self.level.extract;
        var ready = self.filmCount === self.films.length;
        self.extractMesh.material.opacity = ready ? 0.28 + Math.sin(t * 5) * 0.12 : 0.08;
        if (ready && Math.abs(P.pos.x - ex[0]) < ex[2] / 2 && Math.abs(P.pos.y - ex[1]) < ex[3] / 2) {
          self.extractT += dt;
          self.$('.pg-objective').textContent = '탈출 중… ' + Math.min(100, Math.round(self.extractT / 1.2 * 100)) + '%';
          if (self.extractT > 1.2) self._clearStage();
        } else self.extractT = 0;
        // guards
        var maxDetect = 0;
        var hidden = smokeActive || (P.crouch && self._inCover(P.pos.x, P.pos.y));
        var D = DIFFS[self.diffId];
        for (var gI = 0; gI < self.guards.length; gI++) {
          var G = self.guards[gI];
          var gSpeed = 0;
          if (G.state === 'chase') {
            var cdx = P.pos.x - G.pos.x, cdz = P.pos.y - G.pos.y;
            var cd = Math.hypot(cdx, cdz);
            if (cd > 0.01) {
              var sp = G.speed * 1.65;
              G.pos.x += (cdx / cd) * sp * dt; G.pos.y += (cdz / cd) * sp * dt;
              G.facing = Math.atan2(cdx, cdz);
              gSpeed = sp;
            }
            self._collide(G.pos, 0.55);
            if (cd < 0.95) self._fail();
            var seeNow = !hidden && self._los(G.pos.x, G.pos.y, P.pos.x, P.pos.y) && cd < G.range * 1.5;
            if (seeNow) G.loseT = 0; else {
              G.loseT += dt;
              if (G.loseT > 2.4) { G.state = 'patrol'; G.detect = 0; G.bang.visible = false; }
            }
          } else {
            // lure check
            if (G.state !== 'lured' && self.decoys.length) {
              for (var dj = 0; dj < self.decoys.length; dj++) {
                var dcx = self.decoys[dj];
                if (Math.hypot(dcx.x - G.pos.x, dcx.z - G.pos.y) < 11 && self._los(G.pos.x, G.pos.y, dcx.x, dcx.z)) {
                  G.state = 'lured'; G.lure = dcx; break;
                }
              }
            }
            if (G.state === 'lured') {
              var lu = G.lure;
              if (!lu || lu.t <= 0) { G.state = 'patrol'; G.lure = null; }
              else {
                var ldx = lu.x - G.pos.x, ldz = lu.z - G.pos.y;
                var ld = Math.hypot(ldx, ldz);
                if (ld > 1.2) {
                  G.pos.x += (ldx / ld) * G.speed * dt;
                  G.pos.y += (ldz / ld) * G.speed * dt;
                  gSpeed = G.speed;
                }
                G.facing = Math.atan2(ldx, ldz);
                self._collide(G.pos, 0.55);
              }
            } else {
              var tp = G.path[(G.seg + 1) % G.path.length];
              var pdx = tp[0] - G.pos.x, pdz = tp[1] - G.pos.y;
              var pd = Math.hypot(pdx, pdz);
              if (pd < 0.15) G.seg = (G.seg + 1) % G.path.length;
              else {
                G.pos.x += (pdx / pd) * G.speed * dt;
                G.pos.y += (pdz / pd) * G.speed * dt;
                var wantG = Math.atan2(pdx, pdz);
                var dg = wantG - G.facing;
                while (dg > Math.PI) dg -= Math.PI * 2;
                while (dg < -Math.PI) dg += Math.PI * 2;
                G.facing += dg * Math.min(1, dt * 6);
                gSpeed = G.speed;
              }
            }
            // detection (also while lured)
            var vdx = P.pos.x - G.pos.x, vdz = P.pos.y - G.pos.y;
            var vd = Math.hypot(vdx, vdz);
            var effRange = G.range * (P.crouch ? 0.55 : 1) * C.detect;
            var inCone = false;
            if (!hidden && vd < effRange) {
              var ang = Math.atan2(vdx, vdz) - G.facing;
              while (ang > Math.PI) ang -= Math.PI * 2;
              while (ang < -Math.PI) ang += Math.PI * 2;
              if (Math.abs(ang) < G.fov / 2 && self._los(G.pos.x, G.pos.y, P.pos.x, P.pos.y)) inCone = true;
            }
            if (inCone) {
              if (G.detect === 0) self.sfx.spotted();
              G.detect = Math.min(1, G.detect + dt / D.dt);
              if (G.detect >= 1) { G.state = 'chase'; G.loseT = 0; G.bang.visible = true; self.sfx.alert(); }
            } else G.detect = Math.max(0, G.detect - dt / 1.2);
          }
          maxDetect = Math.max(maxDetect, G.state === 'chase' ? 1 : G.detect);
          G.cone.material.opacity = 0.08 + G.detect * 0.18 + (G.state === 'chase' ? 0.14 : 0);
          G.model.group.position.set(G.pos.x, 0, G.pos.y);
          G.model.group.rotation.y = G.facing;
          self._animBird(G.model, gSpeed, dt, false, t + gI * 3);
        }
        self.$('.pg-alertfill').style.width = (maxDetect * 100) + '%';
        self.net.send(P, self.stageIdx, self.charId);
      }
      P.group.position.set(P.pos.x, 0, P.pos.y);
      P.group.rotation.y = P.facing;
      self._animBird(P, speed, dt, P.crouch, t);
      self._updatePeers();
      var cd2 = self.camDist;
      camPos.set(P.pos.x, cd2, P.pos.y + cd2 * 0.72);
      self.camera.position.lerp(camPos, Math.min(1, dt * 4));
      self.camera.lookAt(P.pos.x, 0.4, P.pos.y);
      self.sun.position.set(P.pos.x + 14, 26, P.pos.y + 10);
      self.sun.target.position.set(P.pos.x, 0, P.pos.y);
      self.sun.target.updateMatrixWorld();
      self.renderer.render(self.scene, self.camera);
    }
    requestAnimationFrame(frame);
  };

  PG.prototype._updatePeers = function () {
    var now = performance.now();
    var peers = this.net.peers;
    for (var id in peers) {
      var p = peers[id];
      var stale = now - p.seen > 4000 || p.stage !== this.stageIdx;
      var m = this.peersMeshes[id];
      if (stale) {
        if (m) { this.actorGroup.remove(m.pg.group); delete this.peersMeshes[id]; }
        if (now - p.seen > 15000) { this.net.voice.drop(id); delete peers[id]; this._updRoster(); }
        continue;
      }
      if (!m || m.char !== p.char) {
        if (m) this.actorGroup.remove(m.pg.group);
        var kind = CHARS[p.char] ? CHARS[p.char].kind : 'pigeon';
        var pg = this._makeBird({ body: 0xb9b6b3, head: 0x8a8683, wing: 0x6d6a67, accent: 0x8a8683 }, kind);
        var label = this._makeLabel(p.name || '요원');
        label.position.y = 1.9;
        pg.group.add(label);
        this.actorGroup.add(pg.group);
        m = this.peersMeshes[id] = { pg: pg, x: p.x, z: p.z, ry: p.ry, char: p.char };
      }
      m.x += (p.x - m.x) * 0.15; m.z += (p.z - m.z) * 0.15;
      var dr = p.ry - m.ry;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      m.ry += dr * 0.15;
      var moving = Math.hypot(p.x - m.x, p.z - m.z) > 0.05;
      m.pg.group.position.set(m.x, 0, m.z);
      m.pg.group.rotation.y = m.ry;
      this._animBird(m.pg, moving ? 3 : 0, 1 / 60, !!p.crouch, now / 1000);
    }
  };

  PG.prototype._makeLabel = function (text) {
    var T = this.THREE;
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    var c = cv.getContext('2d');
    c.fillStyle = '#201e1d'; c.font = '700 30px Archivo, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text.slice(0, 12), 128, 32);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true }));
    sp.scale.set(2.2, 0.55, 1);
    return sp;
  };

  customElements.define('pigeon-game', PG);
})();
