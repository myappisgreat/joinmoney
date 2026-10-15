/* 合成錢克禮. Physics powered by Matter.js (MIT), bundled locally. */
(function (root) {
  'use strict';
  const M = typeof module !== 'undefined' && module.exports ? require('./vendor/matter.min.js') : root.Matter;
  const SHAPES = typeof module !== 'undefined' && module.exports ? require('./assets/shapes.js') : root.CHARACTER_SHAPES;
  const WIDTH = 440, HEIGHT = 600, LIMIT = 112;
  const RADII = [17, 22, 27, 33, 39, 46, 54, 63, 73, 84, 96, 109, 121, 134];
  const NAMES = ['初見錢克禮', '睏睏錢克禮', '開飯錢克禮', '乾杯錢克禮', '沉思錢克禮', '自拍錢克禮', '採買錢克禮', '尋寶錢克禮', '開心錢克禮', '放空錢克禮', '散步錢克禮', '兜風錢克禮', '吃麵錢克禮', '究極錢克禮'];
  const COLORS = ['#bbcf97', '#e0bf87', '#d3aca4', '#b5cdcb', '#c9b4d5', '#e4c773', '#a9c6a3', '#d59f89', '#a3b9d3', '#ccbb83', '#9fbba4', '#c5abc8', '#c8ba74', '#d6a15e'];
  const photo = level => `assets/cutout-${String(level + 1).padStart(2, '0')}.webp`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const BOUNCE = .62;

  class MergeWorld {
    constructor() {
      this.engine = M.Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 8 });
      this.engine.gravity.y = 1.15;
      this.events = []; this.contacts = []; this.danger = 0;
      M.Composite.add(this.engine.world, [
        M.Bodies.rectangle(-25, HEIGHT / 2, 50, HEIGHT * 3, { isStatic: true, friction: .24, restitution: BOUNCE }),
        M.Bodies.rectangle(WIDTH + 25, HEIGHT / 2, 50, HEIGHT * 3, { isStatic: true, friction: .24, restitution: BOUNCE }),
        M.Bodies.rectangle(WIDTH / 2, HEIGHT + 25, WIDTH + 100, 50, { isStatic: true, friction: .32, restitution: BOUNCE })
      ]);
      const collect = event => this.contacts.push(...event.pairs);
      M.Events.on(this.engine, 'collisionStart', collect);
      M.Events.on(this.engine, 'collisionActive', collect);
      M.Events.on(this.engine, 'collisionStart', event => {
        for (const { bodyA: a, bodyB: b, collision } of event.pairs) {
          const normal = collision.normal;
          const speed = Math.abs((a.velocity.x - b.velocity.x) * normal.x + (a.velocity.y - b.velocity.y) * normal.y);
          if (speed < 1.6) continue;
          for (const body of [a, b]) if (!body.isStatic) {
            body.plugin.impact = { at: this.engine.timing.timestamp, strength: Math.min(.23, speed * .016), angle: Math.atan2(normal.y, normal.x) };
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
    serialize() { return this.balls.map(b => ({ level: b.plugin.level, x: b.position.x, y: b.position.y, angle: b.angle })); }
    destroy() { M.Events.off(this.engine); M.Composite.clear(this.engine.world, false); M.Engine.clear(this.engine); }
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { MergeWorld, RADII, WIDTH, HEIGHT, LIMIT, BOUNCE }; return; }
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
  let modalKind = '', resumed = false;
  const modal = $('modal'), content = $('modal-content'), canvas = $('game'), ctx = canvas.getContext('2d');
  const images = NAMES.map((_, i) => { const im = new Image(); im.src = photo(i); return im; });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const session = storage.get('session', null);
  if (session && Array.isArray(session.balls) && session.balls.length <= 200 && Number.isFinite(session.score) && !session.over) {
    score = Math.max(0, session.score); coins = clamp(session.coins || 0, 0, 10000); earnedCoins = Math.floor(score / 2000);
    current = clamp(session.current || 0, 0, 3); next = clamp(session.next || 0, 0, 3); highest = clamp(session.highest || 0, 0, 13); drops = session.drops || 0;
    for (const b of session.balls) if (Number.isInteger(b.level) && b.level >= 0 && b.level <= 13 && Number.isFinite(b.x) && Number.isFinite(b.y)) {
      const body = world.add(b.level, b.x, clamp(b.y, -100, HEIGHT - RADII[b.level]));
      if (Number.isFinite(b.angle)) M.Body.setAngle(body, b.angle);
    }
    resumed = drops > 0;
  }
  function save() {
    storage.set('best', best); storage.set('unlocked', unlocked);
    storage.set('session', over ? null : { score, coins, current, next, highest, drops, balls: world.serialize() });
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
  }
  for (let i = 0; i < 14; i++) {
    const button = document.createElement('button'); button.className = 'collect-item'; button.setAttribute('aria-label', `查看第 ${i + 1} 階：${NAMES[i]}`);
    button.innerHTML = `<img src="${photo(i)}" alt="${NAMES[i]}" width="39" height="39"><span>${String(i + 1).padStart(2, '0')}</span>`;
    button.addEventListener('click', () => showModal('photo', `<div class="photo-detail"><small>LEVEL ${String(i + 1).padStart(2, '0')} / 14</small><img class="modal-photo" src="${photo(i)}" alt="${NAMES[i]}"><h2 class="modal-title" id="modal-title">${NAMES[i]}</h2><p class="modal-copy">${i <= unlocked ? '已解鎖・在遊戲裡遇見的快樂！' : `還沒遇見・合成兩個「${NAMES[i - 1]}」來解鎖。`}</p></div>`));
    $('collection-grid').appendChild(button);
  }
  function showModal(kind, html, closable = true) {
    modalKind = kind; content.innerHTML = html; $('close-modal').hidden = !closable;
    if (!modal.open) modal.showModal();
    accumulator = 0;
  }
  function closeModal() { if (modalKind === 'over' || modalKind === 'revive') return; if (modalKind === 'pause') { resume(); return; } modal.close(); modalKind = ''; frameTime = 0; }
  $('close-modal').addEventListener('click', closeModal);
  modal.addEventListener('cancel', e => { e.preventDefault(); if (modalKind === 'pause') resume(); else closeModal(); });
  modal.addEventListener('click', e => { if (e.target === modal && modalKind !== 'pause') { const r = modal.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeModal(); } });
  $('help-button').addEventListener('click', () => showModal('help', `<h2 class="modal-title" id="modal-title">好事，碰在一起就發生。</h2><ol class="help-list"><li><strong>瞄準投放：</strong>電腦移動滑鼠後點擊；手機拖動後放開。</li><li><strong>碰撞合成：</strong>兩個同階照片碰在一起，變成下一階。</li><li><strong>注意警戒線：</strong>照片穩定堆過虛線約 2 秒，這局就結束。</li><li><strong>再接再厲：</strong>每 2,000 分得到一枚復活幣，清掉頂部照片繼續玩。</li><li><strong>究極合成：</strong>兩個第 14 階相碰一起消除，獲得 500 分與一枚復活幣。</li></ol><p class="modal-copy">鍵盤：← → 瞄準，空白鍵投放，P 暫停，R 重開。<br>分數、圖鑑和進度會儲存在目前的瀏覽器。</p><div class="modal-actions"><button data-action="close">來玩吧 →</button></div>`));
  $('album-button').addEventListener('click', () => showModal('album', `<h2 class="modal-title" id="modal-title">錢克禮的 14 種日常</h2><p class="modal-copy">相同階級 × 2 → 下一個錢克禮</p><div class="album-list">${NAMES.map((name, i) => `<div class="album-row"><img src="${photo(i)}" alt="${name}" loading="lazy"><b>${String(i + 1).padStart(2, '0')}　${name}</b><span>${i <= unlocked ? '已解鎖 ✓' : '等你遇見'}</span></div>`).join('')}</div>`));
  $('records-button').addEventListener('click', () => showModal('records', `<h2 class="modal-title" id="modal-title">每一場，都值得留念。</h2><p class="modal-copy">這台裝置的前 10 名紀錄・最佳分數 ${best.toLocaleString()}</p>${records.length ? records.slice(0, 10).map((r, i) => `<div class="record-row"><span class="record-medal">${String(i + 1).padStart(2, '0')}</span><b>${Number(r.score).toLocaleString()} <small>分</small></b><small>${new Date(r.date).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })} · 第 ${clamp(Number(r.level) || 1, 1, 14)} 階</small></div>`).join('') : '<p class="modal-copy">還沒有完成的遊戲。<br>投下第一個錢克禮，開始你的紀錄吧！</p>'}`));
  function record() {
    if (recorded || !score) return;
    records.push({ score, date: new Date().toISOString(), level: highest + 1 }); records.sort((a, b) => b.score - a.score); records = records.slice(0, 10);
    storage.set('records', records); recorded = true;
  }
  function restart() {
    record(); world.destroy(); world = new MergeWorld(); score = 0; coins = 0; earnedCoins = 0; highest = 0; current = 0; next = 0; drops = 0;
    paused = false; over = false; recorded = false; lastDrop = -1000; aim = WIDTH / 2; effects = []; labels = [];
    modal.close(); modalKind = ''; accumulator = 0; frameTime = 0; syncUI(); save();
  }
  function requestRestart() {
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
    over = true; record(); save(); $('board-status').textContent = '這一場，也很精彩';
    showModal('over', `<div class="photo-detail"><img class="modal-photo" src="${photo(highest)}" alt="${NAMES[highest]}"><h2 class="modal-title" id="modal-title">快樂，明明還可以更大。</h2><div class="modal-score-label">本局分數</div><p class="modal-score">${score.toLocaleString()}</p><p class="modal-copy">合成到第 ${highest + 1} 階「${NAMES[highest]}」<br>最佳紀錄 ${best.toLocaleString()} 分</p></div><div class="modal-actions"><button data-action="restart">再來一局 ↻</button></div>`, false);
  }
  function lose() {
    if (coins > 0) {
      over = true;
      showModal('revive', `<h2 class="modal-title" id="modal-title">還能再合大一點！</h2><p class="modal-copy">這局已累積 <strong>${score.toLocaleString()} 分</strong>。<br>使用一枚復活幣，清除頂部照片，繼續挑戰。<br>目前還有 ${coins} 枚復活幣。</p><div class="modal-actions"><button class="secondary" data-action="finish">結束這一局</button><button data-action="revive">✦ 使用一枚復活幣</button></div>`, false);
    } else finish();
  }
  content.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') closeModal(); if (action === 'restart') restart(); if (action === 'resume') resume(); if (action === 'finish') finish();
    if (action === 'revive' && coins > 0) { coins--; world.revive(); over = false; modal.close(); modalKind = ''; frameTime = 0; lastDrop = world.engine.timing.timestamp; syncUI(); save(); toast('再出發！這次一定可以更大。'); }
  });
  function drop() {
    const now = world.engine.timing.timestamp;
    if (over || paused || modal.open || document.hidden || now - lastDrop < 480) return;
    const r = RADII[current]; world.add(current, clamp(aim, r + 2, WIDTH - r - 2), 67, { x: 0, y: .4 });
    lastDrop = now; drops++; beep(0, true); current = next;
    next = drops === 1 ? 0 : [0, 0, 0, 1, 1, 2, 2, 3][Math.floor(Math.random() * 8)];
    if (current > unlocked) { unlocked = current; }
    syncUI();
  }
  function point(event) { const rect = canvas.getBoundingClientRect(); aim = clamp((event.clientX - rect.left) / rect.width * WIDTH, RADII[current] + 2, WIDTH - RADII[current] - 2); }
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
    if (modal.open) { if (e.code === 'KeyP' && modalKind === 'pause') { e.preventDefault(); resume(); } return; }
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
    if (!over && !paused) {
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
    const running = !paused && !modal.open && !over && !document.hidden;
    for (const p of effects) { if (running) { p.x += p.vx; p.y += p.vy; p.vy += .07; p.life -= .024; } ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1; effects = effects.filter(p => p.life > 0);
    for (const p of labels) { if (running) { p.y -= .7; p.life -= .015; } ctx.globalAlpha = Math.max(0, p.life); ctx.font = 'bold 18px "Segoe UI",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#5a7847'; ctx.fillText(p.text, p.x, p.y); }
    ctx.globalAlpha = 1; labels = labels.filter(p => p.life > 0);
  }
  function frame(t) {
    const delta = frameTime ? Math.min(t - frameTime, 60) : 0; frameTime = t;
    if (!paused && !over && !modal.open && !document.hidden) {
      accumulator += delta;
      while (accumulator >= 1000 / 60) { world.step(); while (world.events.length) onMerge(world.events.shift()); accumulator -= 1000 / 60; if (world.danger > 1800) { lose(); break; } }
      const danger = world.danger > 200;
      $('board-status').textContent = danger ? '小心！留一點空間給快樂' : drops ? '好事，正在碰在一起' : '準備好就投一個吧';
      const ready = world.engine.timing.timestamp - lastDrop >= 480;
      $('play-status').textContent = danger ? '快滿了，找找合成機會' : ready ? '輪到你了' : '讓照片落一下…';
    } else accumulator = 0;
    render(); requestAnimationFrame(frame);
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = WIDTH * dpr; canvas.height = HEIGHT * dpr; ctx.scale(dpr, dpr);
  syncUI(); if (resumed) toast('歡迎回來，接著上次的快樂繼續玩。'); requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : this);
