/** Persistent HUD markup injected into the game host. */
export const TPL =
  '<div class="pg-root">' +
  ' <canvas class="pg-canvas"></canvas>' +
  ' <div class="pg-hud">' +
  '  <div class="pg-topbar">' +
  '   <div class="pg-stage"></div>' +
  '   <div class="pg-films"></div>' +
  '   <div class="pg-tbsp"><span class="pg-brand">pigeonoid</span></div>' +
  '   <button class="pg-tbtn pg-missionbtn">임무 (Tab)</button>' +
  '   <button class="pg-tbtn pg-pausebtn">설정</button>' +
  '   <div class="pg-net">오프라인</div>' +
  '  </div>' +
  '  <div class="pg-alertbar"><div class="pg-alertfill"></div></div>' +
  '  <div class="pg-hurt"></div>' +
  '  <div class="pg-hp"><span class="pg-hp-ic">HP</span><div class="pg-hp-track"><div class="pg-hp-fill"></div></div><span class="pg-hp-n"></span></div>' +
  '  <div class="pg-bosshp"><span class="l">적 사령관</span><div class="pg-bosshptrack"><div class="pg-bosshpfill"></div></div></div>' +
  '  <div class="pg-peerhp"></div>' +
  '  <canvas class="pg-map" width="150" height="100"></canvas>' +
  '  <div class="pg-roster"></div>' +
  '  <div class="pg-augs"></div>' +
  '  <div class="pg-objective"></div>' +
  '  <div class="pg-toast"></div>' +
  '  <div class="pg-bossban"></div>' +
  ' </div>' +
  ' <div class="pg-drawer">' +
  '  <div class="pg-dr-hd"><span class="k">Mission file</span><button class="pg-dr-x">닫기 ✕</button></div>' +
  '  <div class="pg-dr-bd"></div>' +
  ' </div>' +
  ' <div class="pg-abilities">' +
  '  <div class="pg-actions">' +
  '   <button class="pg-slot pg-b-dash"><span class="n">대시</span><span class="cd"></span></button>' +
  '   <button class="pg-slot pg-b-attack"><span class="n">공격</span></button>' +
  '   <button class="pg-slot pg-b-skill"><span class="n sk">스킬</span><span class="cd"></span></button>' +
  '  </div>' +
  ' </div>' +
  ' <button class="pg-install">앱 설치 ↓</button>' +
  ' <div class="pg-overlay"></div>' +
  '</div>';

export const CSS =
  '.pg-root{position:absolute;inset:0;overflow:hidden;background:#f3f2f2;font-family:"Archivo","Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#201e1d;user-select:none;-webkit-user-select:none;touch-action:none}' +
  '.pg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
  '.pg-hud{position:absolute;inset:0;pointer-events:none}' +
  '.pg-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:stretch;border-bottom:2px solid #201e1d;background:rgba(243,242,242,.92)}' +
  '.pg-topbar>div{padding:0 11px;min-height:32px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;display:flex;align-items:center;gap:6px}' +
  '.pg-stage{color:#5a5755}' +
  '.pg-films{border-right:2px solid #201e1d;font-weight:700}' +
  '.pg-films b{color:#ec3013}' +
  '.pg-inv{border-right:2px solid #201e1d;color:#3c3937}' +
  '.pg-inv b{color:#201e1d}' +
  '.pg-tbsp{flex:1;justify-content:center}' +
  '.pg-brand{font:800 13px/1 inherit;letter-spacing:.18em;color:#201e1d;display:inline-flex;align-items:center}' +
  ".pg-brand::before{content:'';display:inline-block;width:8px;height:8px;background:#ec3013;margin-right:7px}" +
  '.pg-dot{width:8px;height:8px;background:#ec3013;display:inline-block;margin-left:5px}' +
  '.pg-tbtn{pointer-events:auto;border:0;border-left:2px solid #201e1d;background:transparent;font:700 11px/1 inherit;letter-spacing:.07em;text-transform:uppercase;padding:0 11px;min-height:32px;display:flex;align-items:center;color:#201e1d;cursor:pointer}' +
  '.pg-tbtn:hover{background:rgba(236,48,19,.08)}' +
  '.pg-tbtn.onn{background:#ec3013;color:#f3f2f2}' +
  '.pg-net{border-left:2px solid #201e1d;color:#8a8683}' +
  '.pg-net.on{color:#ec3013;font-weight:700}' +
  '.pg-alertbar{position:absolute;top:28px;left:0;right:0;height:3px}' +
  '.pg-alertfill{height:100%;width:0%;background:#ec3013;transition:width .1s linear}' +
  // player health gauge — compact, flat modernist bar, top-right under the roster
  '.pg-hp{position:absolute;top:72px;right:10px;display:flex;align-items:center;gap:6px;pointer-events:none}' +
  '.pg-hp-ic{font:700 10px/1 inherit;color:#ec3013;letter-spacing:.12em}' +
  '.pg-hp-track{position:relative;width:104px;height:7px;background:rgba(32,30,29,.14);border:1.5px solid #201e1d;overflow:hidden}' +
  '.pg-hp-fill{position:absolute;inset:0;width:100%;transform-origin:left center;background:#ec3013;transition:width .18s ease-out}' +
  '.pg-hp.low .pg-hp-fill{animation:pghppulse .7s ease-in-out infinite}' +
  '@keyframes pghppulse{0%,100%{opacity:1}50%{opacity:.5}}' +
  '.pg-hp-n{font:800 10px/1 inherit;color:#201e1d;min-width:26px;letter-spacing:.02em}' +
  // full-screen red vignette that flashes when the player takes damage
  '.pg-hurt{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:35;box-shadow:inset 0 0 90px 20px rgba(236,48,19,.75);transition:opacity .05s linear}' +
  // boss-entrance banner
  '.pg-bossban{position:absolute;top:38%;left:0;right:0;z-index:36;display:none;flex-direction:column;align-items:center;gap:4px;pointer-events:none;text-align:center}' +
  '.pg-bossban.show{display:flex;animation:pgboss 2.6s ease-out forwards}' +
  '.pg-bossban .k{font:800 12px/1 inherit;letter-spacing:.4em;color:#ec3013}' +
  '.pg-bossban .t{font:900 clamp(30px,7vw,56px)/1 inherit;letter-spacing:.02em;color:#f3f2f2;text-shadow:0 2px 12px rgba(0,0,0,.6),0 0 2px #ec3013;-webkit-text-stroke:1.5px #201e1d}' +
  '.pg-bossban .d{font:700 12px/1.4 inherit;color:#f3f2f2;text-shadow:0 1px 4px rgba(0,0,0,.7);max-width:80%}' +
  '@keyframes pgboss{0%{opacity:0;transform:scale(1.3)}12%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.96)}}' +
  // acquired-augment HUD strip (bottom-left)
  '.pg-augs{position:absolute;left:10px;bottom:12px;display:none;flex-direction:column;gap:4px;pointer-events:none;max-width:168px;z-index:9}' +
  '.pg-augs.show{display:flex}' +
  '.pg-augs .ag{display:flex;align-items:center;gap:6px;background:rgba(243,242,242,.92);border:1.5px solid #201e1d;border-left:4px solid #ec3013;padding:3px 8px;box-shadow:0 1px 4px rgba(0,0,0,.18)}' +
  '.pg-augs .ag .ic{color:#ec3013;font-size:12px;line-height:1}' +
  '.pg-augs .ag .nm{flex:1;white-space:nowrap;font:800 10px/1 inherit;letter-spacing:.02em;color:#201e1d}' +
  '.pg-augs .ag .pips{display:flex;gap:2px}' +
  '.pg-augs .ag .pips i{width:5px;height:5px;background:rgba(32,30,29,.22)}' +
  '.pg-augs .ag .pips i.on{background:#ec3013}' +
  // stage-clear augment cards
  '.pg-cardhd{margin:10px 0 8px;font:800 12px/1 inherit;letter-spacing:.12em;text-transform:uppercase;color:#ec3013;text-align:center}' +
  '.pg-cards{display:flex;flex-direction:column;gap:8px}' +
  '.pg-card{display:flex;flex-direction:row;align-items:center;gap:12px;padding:11px 13px;border:2px solid #201e1d;background:#f3f2f2;cursor:pointer;color:#201e1d;text-align:left;transition:background .08s,color .08s}' +
  '.pg-card:hover,.pg-card:active{background:#ec3013;color:#f3f2f2}' +
  '.pg-card .ic{font-size:22px;color:#ec3013;width:26px;text-align:center;flex:none}' +
  '.pg-card:hover .ic,.pg-card:active .ic{color:#f3f2f2}' +
  '.pg-card .mid{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}' +
  '.pg-card .nm{font:800 15px/1.1 inherit}' +
  '.pg-card .ds{font:500 11px/1.3 inherit;color:#5a5755}' +
  '.pg-card:hover .ds,.pg-card:active .ds{color:rgba(243,242,242,.85)}' +
  '.pg-card .lv{font:800 11px/1 inherit;letter-spacing:.08em;color:#ec3013;flex:none;white-space:nowrap}' +
  '.pg-card:hover .lv,.pg-card:active .lv{color:#f3f2f2}' +
  // dark backdrop variant (augment-select screen)
  '.pg-overlay.pg-dark{background:rgba(18,15,14,.92)}' +
  '.pg-overlay.pg-dark .pg-panel{background:#1c1917;border-color:#3a332e;color:#f3f2f2}' +
  '.pg-overlay.pg-dark .pg-panel .hd{border-color:#3a332e}' +
  '.pg-overlay.pg-dark .pg-panel h1{color:#f3f2f2}' +
  '.pg-overlay.pg-dark .pg-panel .bd{color:#c9c6c3}' +
  '.pg-overlay.pg-dark .pg-rules li{border-color:#3a332e;color:#c9c6c3}' +
  '.pg-overlay.pg-dark .pg-rules b{color:#8a8683}' +
  '.pg-overlay.pg-dark .pg-card{background:#26221f;border-color:#4a423b;color:#f3f2f2}' +
  '.pg-overlay.pg-dark .pg-card .ds{color:#a8a29b}' +
  '.pg-overlay.pg-dark .pg-btn{background:#26221f;border-color:#4a423b;color:#f3f2f2}' +
  '.pg-overlay.pg-dark .pg-btn.ghost{background:transparent}' +
  '.pg-bosshp{position:absolute;top:48px;left:50%;transform:translateX(-50%);width:min(440px,74%);display:none;text-align:center;pointer-events:none}' +
  '.pg-bosshp.show{display:block}' +
  '.pg-bosshp .l{font:800 10px/1 inherit;letter-spacing:.2em;color:#ec3013;text-transform:uppercase}' +
  '.pg-bosshptrack{margin-top:3px;height:9px;border:2px solid #201e1d;background:rgba(32,30,29,.15)}' +
  '.pg-bosshpfill{height:100%;width:100%;background:#ec3013;transition:width .12s linear}' +
  '.pg-peerhp{position:absolute;top:174px;left:12px;display:none;gap:2px;align-items:center;pointer-events:none}' +
  '.pg-peerhp.show{display:flex}' +
  '.pg-peerhp .l{font:700 8px/1 inherit;letter-spacing:.1em;color:#18a6c4}' +
  '.pg-peerhp i{width:11px;height:6px;background:#18a6c4;border:1px solid #201e1d;display:block}' +
  '.pg-peerhp i.e{background:rgba(32,30,29,.12)}' +
  '.pg-peerhp.down{opacity:.65}' +
  '.pg-map{position:absolute;top:40px;left:10px;border:2px solid rgba(32,30,29,.6);background:transparent;box-shadow:0 2px 8px rgba(0,0,0,.18)}' +
  '.pg-roster{position:absolute;top:38px;right:10px;display:flex;flex-direction:column;gap:4px;align-items:flex-end}' +
  '.pg-roster .pr{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;background:rgba(243,242,242,.88);border:1px solid #d8d5d3;padding:4px 8px;color:#3c3937}' +
  '.pg-roster .pr .sq{width:7px;height:7px;background:#8a8683}' +
  '.pg-roster .pr.me .sq{background:#ec3013}' +
  '.pg-roster .pr .mic{color:#ec3013;font-weight:700}' +
  '.pg-objective{position:absolute;left:14px;bottom:14px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;border-left:2px solid #ec3013;padding:2px 0 2px 10px;color:#5a5755;max-width:46%}' +
  '.pg-toast{position:absolute;left:50%;top:64px;transform:translateX(-50%);font-size:12px;letter-spacing:.14em;text-transform:uppercase;background:#201e1d;color:#f3f2f2;padding:8px 14px;opacity:0;transition:opacity .25s}' +
  '.pg-toast.show{opacity:1}' +
  /* drawer */
  '.pg-drawer{position:absolute;top:30px;right:0;bottom:0;width:min(360px,86%);background:rgba(243,242,242,.97);border-left:2px solid #201e1d;transform:translateX(102%);transition:transform .22s ease;display:flex;flex-direction:column;z-index:20}' +
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
  /* ability bar (Duckov-style slots with cooldown sweeps) */
  '.pg-abilities{position:absolute;bottom:16px;right:14px;display:flex;flex-direction:column;align-items:flex-end;z-index:10;pointer-events:auto}' +
  '.pg-actions{display:flex;gap:10px;align-items:flex-end}' +
  '.pg-slot{position:relative;overflow:hidden;width:76px;height:76px;border:2px solid #201e1d;background:rgba(243,242,242,.9);color:#201e1d;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
  '.pg-slot.pg-b-skill{background:#ec3013;color:#f3f2f2}' +
  '.pg-slot.aim{background:#e0a021;color:#201e1d}' +
  '.pg-slot:active{transform:translateY(1px)}' +
  '.pg-slot.dim{opacity:.45}' +
  '.pg-slot .n{font:800 15px/1.15 inherit;letter-spacing:.02em;text-align:center;white-space:nowrap;padding:0 4px}' +
  '.pg-slot .cd{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:800 24px/1 inherit;color:#201e1d;pointer-events:none}' +
  '.pg-slot.pg-b-skill .cd{color:#f3f2f2}' +
  /* overlay */
  '.pg-install{position:absolute;top:10px;right:12px;z-index:50;display:none;border:2px solid #ec3013;background:#ec3013;color:#f3f2f2;font:800 12px/1 inherit;letter-spacing:.08em;padding:9px 13px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}' +
  '.pg-install.show{display:block}' +
  '.pg-overlay{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(243,242,242,.86);overflow:auto;z-index:40}' +
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
  '.pg-seg button:disabled{opacity:.45;cursor:default;background:transparent}' +
  '.pg-row{display:flex;gap:10px;margin-top:4px;flex-wrap:wrap}' +
  '.pg-field{flex:1;min-width:130px}' +
  '.pg-field label{display:block;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#8a8683;margin-bottom:5px}' +
  '.pg-field input{width:100%;box-sizing:border-box;border:2px solid #201e1d;background:#f3f2f2;padding:9px 10px;font:600 14px/1 inherit;letter-spacing:.06em;color:#201e1d;border-radius:0;outline:none}' +
  '.pg-field input:focus-visible{outline:2px solid #ec3013;outline-offset:2px}' +
  /* settings (cone toggle + camera distance) */
  '.pg-set{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}' +
  '.pg-set .pg-field{min-width:150px}' +
  '.pg-toggle{display:flex;border:2px solid #201e1d;width:fit-content;height:38px;box-sizing:border-box}' +
  '.pg-toggle button{border:0;background:transparent;font:700 12px/1 inherit;letter-spacing:.12em;text-transform:uppercase;padding:0 16px;cursor:pointer;color:#201e1d;border-right:2px solid #201e1d}' +
  '.pg-toggle button:last-child{border-right:0}' +
  '.pg-toggle button.sel{background:#201e1d;color:#f3f2f2}' +
  '.pg-toggle button:hover:not(.sel){background:rgba(236,48,19,.08)}' +
  '.pg-range{display:flex;align-items:center;gap:10px}' +
  '.pg-range input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:2px;background:#201e1d;outline:none;margin:0}' +
  '.pg-range input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;background:#ec3013;cursor:pointer;border:0;border-radius:0}' +
  '.pg-range input[type=range]::-moz-range-thumb{width:16px;height:16px;background:#ec3013;cursor:pointer;border:0;border-radius:0}' +
  '.pg-range input[type=range]:focus-visible{outline:2px solid #ec3013;outline-offset:4px}' +
  '.pg-range .val{font:700 13px/1 inherit;color:#201e1d;min-width:44px;text-align:right}' +
  '.pg-rules{margin:0;padding:0;list-style:none;font-size:12px;color:#5a5755}' +
  '.pg-rules li{padding:6px 0;border-top:1px solid #d8d5d3;display:flex;gap:10px}' +
  '.pg-rules li:first-child{border-top:0}' +
  '.pg-rules b{color:#201e1d;min-width:110px;font-weight:700}' +
  '.pg-panel .ft{border-top:2px solid #201e1d;padding:14px 22px;display:flex;gap:10px;flex-wrap:wrap}' +
  '.pg-btn{border:2px solid #ec3013;background:#ec3013;color:#f3f2f2;font:700 14px/1 inherit;letter-spacing:.12em;text-transform:uppercase;padding:13px 40px 13px 16px;text-align:left;cursor:pointer;border-radius:0}' +
  '.pg-btn:hover{background:#c92a10;border-color:#c92a10}' +
  '.pg-btn.ghost{background:transparent;color:#201e1d;border-color:#201e1d}' +
  '.pg-btn.ghost:hover{background:rgba(236,48,19,.08)}' +
  '.pg-btn:focus-visible,.pg-char:focus-visible,.pg-seg button:focus-visible,.pg-toggle button:focus-visible,.pg-tbtn:focus-visible{outline:2px solid #ec3013;outline-offset:2px}' +
  '.pg-hint{font-size:11px;letter-spacing:.06em;color:#8a8683;margin-top:10px;line-height:1.6}' +
  // width OR short-height (landscape phone) → compact HUD, so both orientations fit.
  '@media(max-width:760px),(max-height:520px){.pg-topbar{overflow:hidden}.pg-topbar>div,.pg-tbtn{padding:8px 8px;font-size:10px;letter-spacing:.05em;gap:5px;white-space:nowrap}.pg-objective{display:none}.pg-chars{grid-template-columns:1fr}.pg-roster{top:48px}.pg-map{transform:scale(.85);transform-origin:top left}}' +
  // very narrow / very short: drop non-essential topbar items and keep each on one
  // line so it never overflows. (>.pg-* prefixes outrank the base `.pg-topbar>div`.)
  '@media(max-width:520px),(max-height:430px){.pg-topbar>div,.pg-tbtn{padding:7px 7px;font-size:9px;letter-spacing:.02em;gap:4px;white-space:nowrap}.pg-brand{font-size:11px;letter-spacing:.08em}.pg-brand::before{width:6px;height:6px;margin-right:5px}.pg-topbar>.pg-stage,.pg-topbar>.pg-inv{display:none}.pg-topbar>.pg-net{max-width:40vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}}' +
  // portrait: the HUD reads small on tall screens — scale the key areas up
  '@media(orientation:portrait){.pg-map{transform:scale(1.3);transform-origin:top left}.pg-slot{width:84px;height:84px}.pg-slot .n{font-size:16px}.pg-hp{top:96px}.pg-hp-track{width:124px;height:9px}.pg-hp-n{font-size:11px}.pg-hp-ic{font-size:11px}.pg-augs .ag{padding:5px 9px}.pg-augs .ag .nm{font-size:11px}.pg-roster .pr{font-size:12px;padding:5px 9px}}';
