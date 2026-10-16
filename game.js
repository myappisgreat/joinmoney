/* 合成錢克禮. Physics powered by Matter.js (MIT), bundled locally. */
(function (root) {
  'use strict';
  const M = typeof module !== 'undefined' && module.exports ? require('./vendor/matter.min.js') : root.Matter;
  const SHAPES = typeof module !== 'undefined' && module.exports ? require('./assets/shapes.js') : root.CHARACTER_SHAPES;
  const WIDTH = 440, HEIGHT = 600, LIMIT = 112;
  const RADII = [24, 30, 36, 43, 50, 58, 67, 77, 88, 100, 113, 127, 142, 158];
  const NAMES = ['初見錢克禮', '睏睏錢克禮', '開飯錢克禮', '乾杯錢克禮', '沉思錢克禮', '自拍錢克禮', '採買錢克禮', '尋寶錢克禮', '開心錢克禮', '放空錢克禮', '散步錢克禮', '兜風錢克禮', '吃麵錢克禮', '究極錢克禮'];
  const COLORS = ['#bbcf97', '#e0bf87', '#d3aca4', '#b5cdcb', '#c9b4d5', '#e4c773', '#a9c6a3', '#d59f89', '#a3b9d3', '#ccbb83', '#9fbba4', '#c5abc8', '#c8ba74', '#d6a15e'];
  const IMAGE_VERSION = '73cffb8a74ca'; // Updated by npm run release.
  const photo = level => `assets/portrait-${String(level + 1).padStart(2, '0')}.svg?v=${IMAGE_VERSION}`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const BOUNCE = .38;
  const FLOOR_BOUNCE = .08;
  const BLAST_RADIUS = 100;

  class MergeWorld {
    constructor() {
      this.engine = M.Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 8 });
      this.engine.gravity.y = 1.15;
      this.events = []; this.contacts = []; this.danger = 0;
      M.Composite.add(this.engine.world, [
        M.Bodies.rectangle(-25, HEIGHT / 2, 50, HEIGHT * 3, { isStatic: true, friction: .24, restitution: BOUNCE }),
        M.Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 50, HEIGHT * 3, { isStatic: true, friction: .24, restitution: BOUNCE }),
        M.Bodies.rectangle(WIDTH / 2, HEIGHT + 25, WIDTH + 100, 50, { isStatic: true, label: 'floor', friction: .5, restitution: FLOOR_BOUNCE })
      ]);
      const collect = event => this.contacts.push(...event.pairs);
      M.Events.on(this.engine, 'collisionStart', collect);
      M.Events.on(this.engine, 'collisionActive', collect);
      M.Events.on(this.engine, 'collisionStart', event => {
        for (const pair of event.pairs) {
          const { bodyA: a, bodyB: b, collision } = pair;
          const onFloor = a.label === 'floor' || b.label === 'floor';
          // Matter combines restitution using max(), so override the actual
          // floor contact before velocity resolution instead of only its body.
          if (onFloor) { pair.restitution = FLOOR_BOUNCE; pair.friction = .4; }
          const normal = collision.normal;
          const speed = Math.abs((a.velocity.x - b.velocity.x) * normal.x + (a.velocity.y - b.velocity.y) * normal.y);
          if (speed < 1.6) continue;
          for (const body of [a, b]) if (!body.isStatic) {
            body.plugin.impact = { at: this.engine.timing.timestamp, strength: Math.min(onFloor ? .08 : .18, speed * (onFloor ? .006 : .012)), angle: Math.atan2(normal.y, normal.x) };
          }
        }
      });
    }
    get balls() { return M.Composite.allBodies(this.engine.world).filter(b => !b.isStatic); }
    add(level, x, y, velocity) {
      const r = RADII[level];
      const options = {
        restitution: BOUNCE, friction: .24, frictionStatic: .5, frictionAir: .004,
        density: .002, sleepThreshold: 60,
        plugin: { level, born: this.engine.timing.timestamp }
      };
      const shape = SHAPES?.[level];
      const b = shape?.vertices?.length >= 3
        ? M.Bodies.fromVertices(x, y, [shape.vertices.map(p => ({ x: p.x * r, y: p.y * r }))], options, false, .01, 1, .01)
        : M.Bodies.circle(x, y, r, options, 40);
      if (b.bounds.min.x < 1) M.Body.translate(b, { x: 1 - b.bounds.min.x, y: 0 });
      if (b.bounds.max.x > WIDTH - 1) M.Body.translate(b, { x: WIDTH - 1 - b.bounds.max.x, y: 0 });
      if (velocity) M.Body.setVelocity(b, velocity);
      M.Composite.add(this.engine.world, b); return b;
    }
    step(dt = 1000 / 60) {
      this.contacts.length = 0;
      M.Engine.update(this.engine, dt);
      const removed = new Set();
      for (const pair of this.contacts) {
        const a = pair.bodyA, b = pair.bodyB;
        if (a.isStatic || b.isStatic || removed.has(a.id) || removed.has(b.id)) continue;
        const level = a.plugin.level;
        if (level !== b.plugin.level || this.engine.timing.timestamp - Math.max(a.plugin.born, b.plugin.born) < 140) continue;
        removed.add(a.id); removed.add(b.id);
        const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
        M.Composite.remove(this.engine.world, [a, b]);
        const final = level === RADII.length - 1;
        if (!final) {
          const r = RADII[level + 1];
          const merged = this.add(level + 1, x, Math.min(HEIGHT - r - 1, y), {
            x: clamp((a.velocity.x + b.velocity.x) * .22, -2, 2), y: Math.min(-1.2, (a.velocity.y + b.velocity.y) * .15)
          });
          M.Body.setAngularVelocity(merged, (a.angularVelocity + b.angularVelocity) * .2);
        }
        this.events.push({ type: 'merge', level: final ? level : level + 1, x, y, points: final ? 500 : Math.min(500, 2 ** (level + 1)), final });
      }
      const dangerBalls = this.balls.filter(b => b.bounds.min.y < LIMIT && this.engine.timing.timestamp - b.plugin.born > 2200 && b.speed < 1.5);
      this.danger = dangerBalls.length ? this.danger + dt : Math.max(0, this.danger - dt * 2);
    }
    revive() {
      const above = this.balls.filter(b => b.bounds.min.y < LIMIT + 80);
      // Also clear the highest three pieces so a revive always creates useful room.
      const highest = [...this.balls].sort((a, b) => a.position.y - b.position.y).slice(0, 3);
      M.Composite.remove(this.engine.world, [...new Set([...above, ...highest])]);
      this.danger = 0;
      this.balls.forEach(b => { b.plugin.born = this.engine.timing.timestamp; M.Sleeping.set(b, false); });
    }
    blast(x, y, radius = BLAST_RADIUS) {
      const removed = this.balls.filter(body => {
        if (M.Query.point([body], { x, y }).length) return true;
        return body.vertices.some((a, i, vertices) => {
          const b = vertices[(i + 1) % vertices.length], dx = b.x - a.x, dy = b.y - a.y;
          const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
          return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) <= radius;
        });
      });
      if (!removed.length) return removed;
      M.Composite.remove(this.engine.world, removed);
      this.danger = 0;
      this.balls.forEach(b => M.Sleeping.set(b, false));
      return removed;
    }
    serialize() { return this.balls.map(b => ({ level: b.plugin.level, x: b.position.x, y: b.position.y, angle: b.angle })); }
    destroy() { M.Events.off(this.engine); M.Composite.clear(this.engine.world, false); M.Engine.clear(this.engine); }
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { MergeWorld, RADII, WIDTH, HEIGHT, LIMIT, BOUNCE, FLOOR_BOUNCE }; return; }
  if (!M) { document.getElementById('board-status').textContent = '物理引擎載入失敗，請重新整理'; return; }

  const $ = id => document.getElementById(id);
  const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(`ckl-${key}`)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(`ckl-${key}`, JSON.stringify(value)); } catch {} } };
  let world = new MergeWorld(), score = 0, coins = 0, earnedCoins = 0, highest = 0;
  let best = Number(storage.get('best', 0)) || 0;
  let unlocked = clamp(Number(storage.get('unlocked', 0)) || 0, 0, 13);
  let records = storage.get('records', []); if (!Array.isArray(records)) records = [];
  let sound = storage.get('sound', true), paused = false, over = false, recorded = false;
  let current = 0, next = 0, aim = WIDTH / 2, lastDrop = -1000, drops = 0, touching = false;
  let effects = [], labels = [], audio, toastTimer, frameTime = 0, accumulator = 0;
  let modalKind = '', resumed = false, resultState = '';
  let bombsLeft = 1, swapsLeft = 2, bombArmed = false;
  let bombAim = { x: WIDTH / 2, y: HEIGHT * .65 }, blastEffect = null;
  const modal = $('modal'), content = $('modal-content'), canvas = $('game'), ctx = canvas.getContext('2d');
  const images = NAMES.map((_, i) => { const im = new Image(); im.src = photo(i); return im; });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const session = storage.get('session', null);
  if (session && Array.isArray(session.balls) && session.balls.length <= 200 && Number.isFinite(session.score)) {
    score = Math.max(0, session.score); coins = clamp(session.coins || 0, 0, 10000); earnedCoins = Math.floor(score / 2000);
    current = clamp(session.current || 0, 0, 3); next = clamp(session.next || 0, 0, 3); highest = clamp(session.highest || 0, 0, 13); drops = session.drops || 0;
    for (const b of session.balls) if (Number.isInteger(b.level) && b.level >= 0 && b.level <= 13 && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      const body = world.add(b.level, b.x, clamp(b.y, -100, HEIGHT - RADII[b.level]));
      if (Number.isFinite(b.angle)) M.Body.setAngle(body, b.angle);
    }
    resumed = drops > 0;
    over = session.over === true;
    resultState = over ? (session.resultState === 'revive' && coins > 0 ? 'revive' : 'over') : '';
    recorded = session.recorded === true || resultState === 'over';
    bombsLeft = clamp(Math.floor(Number(session.bombsLeft ?? 1)) || 0, 0, 1);
    swapsLeft = clamp(Math.floor(Number(session.swapsLeft ?? 2)) || 0, 0, 2);
  }
  function save() {
    storage.set('best', best); storage.set('unlocked', unlocked);
    storage.set('session', { score, coins, current, next, highest, drops, over, resultState, recorded, bombsLeft, swapsLeft, balls: world.serialize() });
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600); }
  function beep(level = 0, drop = false) {
    if (!sound) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime, gain = audio.createGain(), osc = audio.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(drop ? 240 : 390 * 2 ** ((level % 8) / 12), t);
      osc.frequency.exponentialRampToValueAtTime(drop ? 115 : 780 * 2 ** ((level % 8) / 12), t + .08);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.09, t + .01); gain.gain.exponentialRampToValueAtTime(.001, t + .19);
      osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t + .2);
    } catch {}
  }
  function syncUI() {
    $('score').textContent = score.toLocaleString('en-US'); $('best').textContent = best.toLocaleString('en-US'); $('coins').textContent = coins;
    $('next-photo').src = photo(next); $('next-photo').alt = `下一個：${NAMES[next]}`;
    $('first-hint').classList.toggle('hidden', drops > 0);
    $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-label').textContent = sound ? '音效開啟' : '音效關閉'; $('sound-icon').textContent = sound ? '♫' : '♩';
    $('pause-button').innerHTML = paused ? '<span>▷</span> 繼續' : '<span>Ⅱ</span> 暫停';
    $('collection-count').textContent = `${unlocked + 1} / 14`; $('collection-caption').textContent = `已遇見 ${unlocked + 1} 種錢克禮`;
    $('collection-progress').style.width = `${(unlocked + 1) / 14 * 100}%`;
    for (let i = 0; i < 14; i++) $('collection-grid').children[i]?.classList.toggle('locked', i > unlocked);
    syncSkills();
  }
  function syncSkills() {
    const blocked = over || paused || modal.open;
    $('bomb-count').textContent = bombsLeft;
    $('swap-count').textContent = swapsLeft;
    $('bomb-button').disabled = blocked || !bombsLeft || !world.balls.length;
    $('swap-button').disabled = blocked || bombArmed || !swapsLeft;
    $('bomb-button').setAttribute('aria-pressed', String(bombArmed));
    $('bomb-button').setAttribute('aria-label', `${bombArmed ? '取消炸彈' : '炸彈清場'}，剩餘 ${bombsLeft} 次`);
    $('swap-button').setAttribute('aria-label', `換一張，剩餘 ${swapsLeft} 次`);
    $('bomb-label').textContent = bombArmed ? '取消炸彈' : '炸彈清場';
    $('skill-note').textContent = bombArmed ? '拖動或點選爆破範圍，放開引爆；再按炸彈或 Esc 可取消。' : '每局：炸彈 1 次・換一張 2 次。炸彈清除的照片不加分。';
    canvas.classList.toggle('bomb-aiming', bombArmed);
  }
  function cancelBomb() { bombArmed = false; accumulator = 0; frameTime = 0; syncSkills(); }
  function toggleBomb() {
    if (over || paused || modal.open || !bombsLeft || !world.balls.length) return;
    if (bombArmed) { cancelBomb(); return; }
    bombArmed = true; touching = false; accumulator = 0;
    bombAim = { x: aim, y: HEIGHT * .65 };
    syncSkills(); canvas.focus({ preventScroll: true });
    toast('選擇要清出的空間，點棋盤引爆！');
  }
  function detonate() {
    const removed = world.blast(bombAim.x, bombAim.y);
    if (!removed.length) { toast('這裡沒有照片，選個有照片的位置吧。'); return; }
    bombsLeft--; bombArmed = false; touching = false;
    lastDrop = world.engine.timing.timestamp;
    blastEffect = { x: bombAim.x, y: bombAim.y, life: 1 };
    for (const b of removed) addEffect({ x: b.position.x, y: b.position.y, level: b.plugin.level, points: 0 });
    labels = labels.filter(label => label.text !== '+0');
    syncUI(); save(); beep(6); toast(`炸彈清除了 ${removed.length} 張照片！`);
  }
  function swapPhoto() {
    if (over || paused || modal.open || bombArmed || !swapsLeft) return;
    const choices = [0, 1, 2, 3].filter(level => level !== current);
    current = choices[Math.floor(Math.random() * choices.length)];
    swapsLeft--; unlocked = Math.max(unlocked, current);
    aim = clamp(aim, RADII[current] + 2, WIDTH - RADII[current] - 2);
    syncUI(); save(); beep(2); toast(`換成「${NAMES[current]}」了！`);
  }
  $('bomb-button').addEventListener('click', toggleBomb);
  $('swap-button').addEventListener('click', swapPhoto);
  for (let i = 0; i < 14; i++) {
    const button = document.createElement('button'); button.className = 'collect-item'; button.setAttribute('aria-label', `查看第 ${i + 1} 階：${NAMES[i]}`);
    button.innerHTML = `<img src="${photo(i)}" alt="${NAMES[i]}" width="39" height="39"><span>${String(i + 1).padStart(2, '0')}</span>`;
    button.addEventListener('click', () => showModal('photo', `<div class="photo-detail"><small>LEVEL ${String(i + 1).padStart(2, '0')} / 14</small><img class="modal-photo" src="${photo(i)}" alt="${NAMES[i]}"><h2 class="modal-title" id="modal-title">${NAMES[i]}</h2><p class="modal-copy">${i <= unlocked ? '已解鎖・在遊戲裡遇見的快樂！' : `還沒遇見・合成兩個「${NAMES[i - 1]}」來解鎖。`}</p></div>`));
    $('collection-grid').appendChild(button);
  }
  function showModal(kind, html, closable = true) {
    bombArmed = false; touching = false;
    modalKind = kind; content.innerHTML = html; $('close-modal').hidden = !closable;
    if (!modal.open) modal.showModal();
    if (kind === 'over' || kind === 'revive') {
      // A held drop key must not activate the first button when this opens.
      const title = content.querySelector('#modal-title');
      title.tabIndex = -1; title.focus({ preventScroll: true });
    }
    accumulator = 0;
    syncSkills();
  }
  function closeModal() { if (modalKind === 'over' || modalKind === 'revive') return; if (modalKind === 'pause') { resume(); return; } modal.close(); modalKind = ''; frameTime = 0; syncSkills(); }
  $('close-modal').addEventListener('click', closeModal);
  modal.addEventListener('cancel', e => { e.preventDefault(); if (modalKind === 'pause') resume(); else closeModal(); });
  modal.addEventListener('click', e => { if (e.target === modal && modalKind !== 'pause') { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(); } });
  $('help-button').addEventListener('click', () => showModal('help', `<h2 class="modal-title" id="modal-title">好事，碰在一起就發生。</h2><ol class="help-list"><li><strong>瞄準投放：</strong>電腦移動滑鼠後點擊；手機拖動後放開。</li><li><strong>碰撞合成：</strong>兩個同階照片碰在一起，變成下一階。</li><li><strong>注意警戒線：</strong>照片穩定堆過虛線約 2 秒，這局就結束。</li><li><strong>再接再厲：</strong>每 2,000 分得到一枚復活幣，清掉頂部照片繼續玩。</li><li><strong>究極合成：</strong>兩個第 14 階相碰一起消除，獲得 500 分與一枚復活幣。</li><li><strong>小技能：</strong>每局炸彈清場 1 次、換一張 2 次。炸彈選範圍後引爆，不加分；空炸或取消不扣次數。</li></ol><p class="modal-copy">鍵盤：← → 瞄準，空白鍵投放，P 暫停，R 重開；B 炸彈、X 換一張。<br>分數、圖鑑和進度會儲存在目前的瀏覽器。</p><div class="modal-actions"><button data-action="close">來玩吧 →</button></div>`));
  $('album-button').addEventListener('click', () => showModal('album', `<h2 class="modal-title" id="modal-title">錢克禮的 14 種日常</h2><p class="modal-copy">相同階級 × 2 → 下一個錢克禮</p><div class="album-list">${NAMES.map((name, i) => `<div class="album-row"><img src="${photo(i)}" alt="${name}" loading="lazy"><b>${String(i + 1).padStart(2, '0')}　${name}</b><span>${i <= unlocked ? '已解鎖 ✓' : '等你遇見'}</span></div>`).join('')}</div>`));
  $('records-button').addEventListener('click', () => showModal('records', `<h2 class="modal-title" id="modal-title">每一場，都值得留念。</h2><p class="modal-copy">這台裝置的前 10 名紀錄・最佳分數 ${best.toLocaleString()}</p>${records.length ? records.slice(0, 10).map((r, i) => `<div class="record-row"><span class="record-medal">${String(i + 1).padStart(2, '0')}</span><b>${Number(r.score).toLocaleString()} <small>分</small></b><small>${new Date(r.date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })} · 第 ${clamp(Number(r.level) || 1, 1, 14)} 階</small></div>`).join('') : '<p class="modal-copy">還沒有完成的遊戲。<br>投下第一個錢克禮，開始你的紀錄吧！</p>'}`));
  function record() {
    if (recorded || !score) return;
    records.push({ score, date: new Date().toISOString(), level: highest + 1 }); records.sort((a, b) => b.score - a.score); records = records.slice(0, 10);
    storage.set('records', records); recorded = true;
  }
  function restart() {
    record(); world.destroy(); world = new MergeWorld(); score = 0; coins = 0; earnedCoins = 0; highest = 0; current = 0; next = 0; drops = 0;
    paused = false; over = false; recorded = false; resultState = ''; touching = false; lastDrop = -1000; aim = WIDTH / 2; effects = []; labels = [];
    bombsLeft = 1; swapsLeft = 2; bombArmed = false; blastEffect = null;
    modal.close(); modalKind = ''; accumulator = 0; frameTime = 0; syncUI(); save();
  }
  function requestRestart() {
    if (over) { if (resultState === 'revive') showRevive(); else showGameOver(); return; }
    if (!drops) { restart(); return; }
    showModal('restart', `<h2 class="modal-title" id="modal-title">重新開始一場快樂？</h2><p class="modal-copy">這局已有 <strong>${score.toLocaleString()} 分</strong>。分數會留在紀錄裡，已解鎖的圖鑑也會保留。</p><div class="modal-actions"><button class="secondary" data-action="close">繼續這一局</button><button data-action="restart">重新開始 ↻</button></div>`);
  }
  function resume() { paused = false; modal.close(); modalKind = ''; frameTime = 0; syncUI(); }
  function togglePause() {
    if (over) return;
    if (paused) { resume(); return; }
    paused = true; syncUI(); showModal('pause', `<h2 class="modal-title" id="modal-title">快樂，也可以慢慢來。</h2><p class="modal-copy">遊戲暫停中。休息一下，錢克禮會等你。</p><div class="modal-actions"><button data-action="resume">繼續遊戲 ▷</button></div>`);
  }
  $('restart-button').addEventListener('click', requestRestart); $('pause-button').addEventListener('click', togglePause);
  $('sound-button').addEventListener('click', () => { sound = !sound; storage.set('sound', sound); syncUI(); if (sound) beep(2); });
  function finish() {
    over = true; resultState = 'over'; touching = false; record(); save(); showGameOver();
  }
  function showGameOver() {
    $('board-status').textContent = '遊戲結束・這一場，也很精彩';
    $('play-status').textContent = '按重新開始再挑戰';
    showModal('over', `<div class="photo-detail"><img class="modal-photo" src="${photo(highest)}" alt="${NAMES[highest]}"><h2 class="modal-title" id="modal-title">遊戲結束</h2><div class="modal-score-label">本局分數</div><p class="modal-score">${score.toLocaleString()}</p><p class="modal-copy">合成到第 ${highest + 1} 階「${NAMES[highest]}」<br>最佳紀錄 ${best.toLocaleString()} 分<br>這一場，也很精彩。準備好再開始下一局。</p></div><div class="modal-actions"><button data-action="restart">重新開始 ↻</button></div>`, false);
  }
  function showRevive() {
    showModal('revive', `<h2 class="modal-title" id="modal-title">還能再合大一點！</h2><p class="modal-copy">這局已累積 <strong>${score.toLocaleString()} 分</strong>。<br>使用一枚復活幣，清除頂部照片，繼續挑戰。<br>目前還有 ${coins} 枚復活幣。</p><div class="modal-actions"><button class="secondary" data-action="finish">結束這一局</button><button data-action="revive">✦ 使用一枚復活幣</button></div>`, false);
  }
  function lose() {
    if (coins > 0) {
      over = true; resultState = 'revive'; touching = false; save(); showRevive();
    } else finish();
  }
  content.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') closeModal(); if (action === 'restart') restart(); if (action === 'resume') resume(); if (action === 'finish') finish();
    if (action === 'revive' && coins > 0) { coins--; world.revive(); over = false; resultState = ''; modal.close(); modalKind = ''; frameTime = 0; lastDrop = world.engine.timing.timestamp; syncUI(); save(); toast('再出發！這次一定可以更大。'); }
  });
  function drop() {
    const now = world.engine.timing.timestamp;
    if (over || paused || modal.open || document.hidden) return;
    if (bombArmed) { detonate(); return; }
    if (now - lastDrop < 480) return;
    const r = RADII[current]; world.add(current, clamp(aim, r + 2, WIDTH - r - 2), 67, { x: 0, y: .4 });
    lastDrop = now; drops++; beep(0, true); current = next;
    next = drops === 1 ? 0 : [0, 0, 0, 1, 1, 2, 2, 3][Math.floor(Math.random() * 8)];
    if (current > unlocked) { unlocked = current; }
    syncUI();
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WIDTH, y = (event.clientY - rect.top) / rect.height * HEIGHT;
    if (bombArmed) bombAim = { x: clamp(x, 0, WIDTH), y: clamp(y, 0, HEIGHT) };
    else aim = clamp(x, RADII[current] + 2, WIDTH - RADII[current] - 2);
  }
  canvas.addEventListener('pointermove', point);
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || modal.open || over || paused) return;
    e.preventDefault(); point(e); canvas.focus({ preventScroll: true });
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { touching = true; canvas.setPointerCapture(e.pointerId); } else drop();
  });
  canvas.addEventListener('pointerup', e => { if (touching) { point(e); touching = false; drop(); } });
  canvas.addEventListener('pointercancel', () => { touching = false; });
  document.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (modal.open) {
      if ((modalKind === 'over' || modalKind === 'revive') && ['Space', 'Enter'].includes(e.code)
          && (e.repeat || !e.target.closest('button[data-action]'))) e.preventDefault();
      if (e.code === 'KeyP' && modalKind === 'pause') { e.preventDefault(); resume(); }
      return;
    }
    if (e.code === 'Escape' && bombArmed) { e.preventDefault(); cancelBomb(); return; }
    if (e.code === 'KeyB' && !e.repeat) { e.preventDefault(); toggleBomb(); return; }
    if (e.code === 'KeyX' && !e.repeat) { e.preventDefault(); swapPhoto(); return; }
    if (bombArmed && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
      e.preventDefault();
      bombAim.x = clamp(bombAim.x + (e.code === 'ArrowLeft' ? -12 : e.code === 'ArrowRight' ? 12 : 0), 0, WIDTH);
      bombAim.y = clamp(bombAim.y + (e.code === 'ArrowUp' ? -12 : e.code === 'ArrowDown' ? 12 : 0), 0, HEIGHT);
      return;
    }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); aim = clamp(aim + (e.code === 'ArrowLeft' ? -12 : 12), RADII[current] + 2, WIDTH - RADII[current] - 2); }
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') { e.preventDefault(); if (!e.repeat) drop(); }
    if (e.code === 'KeyR' && !e.repeat) requestRestart(); if (e.code === 'KeyP' && !e.repeat) togglePause();
  });
  document.addEventListener('visibilitychange', () => { frameTime = 0; accumulator = 0; if (document.hidden) save(); });
  window.addEventListener('pagehide', save); setInterval(save, 2500);

  function addEffect(event) {
    const { x, y, level, points } = event;
    for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2, v = 1.3 + Math.random() * 3; effects.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, color: COLORS[level], r: 2 + Math.random() * 3 }); }
    labels.push({ x, y: y - 16, text: `+${points}`, life: 1 });
  }
  function onMerge(event) {
    score += event.points; best = Math.max(best, score); highest = Math.max(highest, event.level);
    if (event.level > unlocked) { unlocked = event.level; toast(`✦ 新的相遇！解鎖「${NAMES[event.level]}」`); }
    const earned = Math.floor(score / 2000); if (earned > earnedCoins) { coins += earned - earnedCoins; earnedCoins = earned; toast('✦ 2,000 分達成，獲得一枚復活幣！'); }
    if (event.final) { coins++; toast('究極合成！+500 分，再送一枚復活幣！'); }
    addEffect(event); beep(event.level); syncUI();
  }
  function drawBall(x, y, level, angle = 0, scale = 1, opacity = 1, impact) {
    const r = RADII[level], center = SHAPES?.[level]?.center || { x: 0, y: 0 };
    ctx.save(); ctx.globalAlpha = opacity; ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
    if (impact && !reducedMotion) {
      const elapsed = world.engine.timing.timestamp - impact.at;
      if (elapsed < 600) {
        const squash = impact.strength * Math.cos(elapsed / 43) * Math.exp(-elapsed / 145);
        const localAngle = impact.angle - angle;
        ctx.rotate(localAngle); ctx.scale(1 - squash, 1 / (1 - squash)); ctx.rotate(-localAngle);
      }
    }
    ctx.shadowColor = '#43553338'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 2;
    if (images[level].complete && images[level].naturalWidth) ctx.drawImage(images[level], -r - center.x * r, -r - center.y * r, r * 2, r * 2);
    ctx.restore();
  }
  function render() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    // Fine paper grid keeps the board calm and makes aiming visible.
    ctx.fillStyle = '#7f95600c'; for (let x = 18; x < WIDTH; x += 24) for (let y = 18; y < HEIGHT; y += 24) { ctx.beginPath(); ctx.arc(x, y, .75, 0, Math.PI * 2); ctx.fill(); }
    const danger = world.danger > 200;
    ctx.strokeStyle = danger ? '#d4846b' : '#c9d2b7'; ctx.lineWidth = 1; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(0, LIMIT); ctx.lineTo(WIDTH, LIMIT); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = danger ? '#c97763' : '#a8b198'; ctx.font = '9px "Microsoft JhengHei",sans-serif'; ctx.textAlign = 'right'; ctx.fillText(danger ? '小心，要滿出來了！' : '警戒線', WIDTH - 14, LIMIT - 9);
    if (!over && !paused && !bombArmed) {
      const x = clamp(aim, RADII[current] + 2, WIDTH - RADII[current] - 2);
      let bottom = HEIGHT;
      for (const b of world.balls) if (x + RADII[current] > b.bounds.min.x && x - RADII[current] < b.bounds.max.x) bottom = Math.min(bottom, b.bounds.min.y - RADII[current]);
      ctx.strokeStyle = '#a5b88c55'; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.moveTo(x, 67 + RADII[current] + 6); ctx.lineTo(x, bottom); ctx.stroke(); ctx.setLineDash([]);
      const ready = world.engine.timing.timestamp - lastDrop >= 480;
      drawBall(x, 67, current, 0, 1, ready ? .95 : .35);
      ctx.fillStyle = '#8ba275'; ctx.beginPath(); ctx.moveTo(x - 4, 39 - RADII[current]); ctx.lineTo(x + 4, 39 - RADII[current]); ctx.lineTo(x, 44 - RADII[current]); ctx.fill();
    }
    for (const b of world.balls) {
      const elapsed = world.engine.timing.timestamp - b.plugin.born;
      const scale = !reducedMotion && elapsed < 550 ? 1 - .2 * Math.cos(elapsed / 55) * Math.exp(-elapsed / 150) : 1;
      drawBall(b.position.x, b.position.y, b.plugin.level, b.angle, scale, 1, b.plugin.impact);
    }
    if (bombArmed && !over && !modal.open) {
      ctx.save(); ctx.fillStyle = '#eaa16a35'; ctx.strokeStyle = '#c67b4b'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(bombAim.x, bombAim.y, BLAST_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#78553c'; ctx.fillText('✦', bombAim.x, bombAim.y + 8);
      ctx.font = '11px "Microsoft JhengHei",sans-serif'; ctx.fillText('點選範圍引爆', bombAim.x, Math.max(25, bombAim.y - BLAST_RADIUS - 12)); ctx.restore();
    }
    if (blastEffect) {
      if (!paused && !modal.open && !document.hidden) blastEffect.life -= .035;
      ctx.save(); ctx.globalAlpha = Math.max(0, blastEffect.life); ctx.strokeStyle = '#df9259'; ctx.lineWidth = 6 * blastEffect.life;
      ctx.beginPath(); ctx.arc(blastEffect.x, blastEffect.y, BLAST_RADIUS * (1.25 - blastEffect.life * .5), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (blastEffect.life <= 0) blastEffect = null;
    }
    const running = !paused && !modal.open && !over && !bombArmed && !document.hidden;
    for (const p of effects) { if (running) { p.x += p.vx; p.y += p.vy; p.vy += .07; p.life -= .024; } ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; effects = effects.filter(p => p.life > 0);
    for (const p of labels) { if (running) { p.y -= .7; p.life -= .015; } ctx.globalAlpha = Math.max(0, p.life); ctx.font = 'bold 18px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#5a7847'; ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1; labels = labels.filter(p => p.life > 0);
  }
  function frame(t) {
    const delta = frameTime ? Math.min(t - frameTime, 60) : 0; frameTime = t;
    if (!paused && !over && !modal.open && !bombArmed && !document.hidden) {
      accumulator += delta;
      while (accumulator >= 1000 / 60) { world.step(); while (world.events.length) onMerge(world.events.shift()); accumulator -= 1000 / 60; if (world.danger > 1800) { lose(); break; } }
      const danger = world.danger > 200;
      $('board-status').textContent = danger ? '小心！留一點空間給快樂' : drops ? '好事，正在碰在一起' : '準備好就投一個吧';
      const ready = world.engine.timing.timestamp - lastDrop >= 480;
      $('play-status').textContent = danger ? '快滿了，找找合成機會' : ready ? '輪到你了' : '讓照片落一下…';
    } else {
      accumulator = 0;
      if (bombArmed) { $('board-status').textContent = '炸彈瞄準中・棋盤暫停'; $('play-status').textContent = '點棋盤引爆・Esc 取消'; }
    }
    render(); requestAnimationFrame(frame);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = WIDTH * dpr; canvas.height = HEIGHT * dpr; ctx.scale(dpr, dpr);
  syncUI();
  if (over) { if (resultState === 'revive') showRevive(); else showGameOver(); }
  else if (resumed) toast('歡迎回來，接著上次的快樂繼續玩。');
  requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : this);
