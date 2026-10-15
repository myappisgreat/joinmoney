const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Matter = require('../vendor/matter.min.js');
const shapes = require('../assets/shapes.js');
const source = fs.readFileSync(path.join(__dirname, '../game.js'), 'utf8');

function loadGame(saved, records = [{ score: 512, date: '2026-10-15T12:00:00Z', level: 4 }]) {
  const values = new Map([['ckl-session', JSON.stringify(saved)], ['ckl-best', '512'], ['ckl-records', JSON.stringify(records)]]);
  const listeners = {}, intervals = [], frames = [], elements = new Map();
  let document;
  const context2d = new Proxy({}, { get: (obj, name) => obj[name] ?? (() => {}) });
  function element(id = '', tagName = 'DIV') {
    const events = {};
    return {
      id, tagName, dataset: {}, children: [], innerHTML: '', textContent: '', style: {}, open: false,
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {}, appendChild(child) { this.children.push(child); },
      addEventListener(name, callback) { events[name] = callback; },
      emit(name, event) { events[name]?.(event); },
      getContext() { return context2d; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 440, height: 600 }; },
      setPointerCapture() {},
      querySelector() { return get('modal-title'); },
      focus() { document.activeElement = this; },
      closest(selector) { return this.dataset.action && selector.includes('data-action') ? this : null; },
      showModal() { this.open = true; const button = element('', 'BUTTON'); button.dataset.action = 'restart'; button.focus(); },
      close() { this.open = false; }
    };
  }
  function get(id) { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); }
  document = { hidden: false, activeElement: null, getElementById: get, createElement: tag => element('', tag.toUpperCase()),
    addEventListener(name, callback) { listeners[name] = callback; } };
  const globals = {
    Matter, CHARACTER_SHAPES: shapes, document, console,
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    Image: class { complete = false; }, matchMedia: () => ({ matches: false }),
    addEventListener() {}, requestAnimationFrame: fn => frames.push(fn),
    setInterval: fn => intervals.push(fn), setTimeout: () => 1, clearTimeout() {}
  };
  globals.window = globals;
  vm.runInNewContext(source, globals, { filename: 'game.js' });
  return {
    document, get, values,
    session: () => JSON.parse(values.get('ckl-session')),
    autosave() { intervals.forEach(fn => fn()); },
    tick(time) { frames.shift()?.(time); },
    key(code, repeat = false) { const e = { code, repeat, target: document.activeElement, prevented: false, preventDefault() { this.prevented = true; } }; listeners.keydown(e); return e; },
    click(action) { const button = element('', 'BUTTON'); button.dataset.action = action; get('modal-content').emit('click', { target: button }); }
  };
}
const ended = { score: 512, coins: 0, current: 1, next: 0, highest: 3, drops: 12, over: true, resultState: 'over', recorded: true,
  balls: [{ level: 3, x: 220, y: 350, angle: .2 }] };

test('ended game restores its result, score and frozen board across refreshes', () => {
  const game = loadGame(ended);
  assert.equal(game.get('modal').open, true);
  assert.match(game.get('modal-content').innerHTML, /遊戲結束/);
  assert.match(game.get('modal-content').innerHTML, /重新開始/);
  assert.equal(game.document.activeElement.id, 'modal-title');
  game.tick(0); game.tick(1000); game.autosave();
  assert.equal(game.session().score, 512);
  assert.equal(game.session().over, true);
  assert.equal(game.session().balls.length, 1);
  assert.equal(game.session().balls[0].y, 350);
  const refreshed = loadGame(game.session());
  assert.equal(refreshed.get('modal').open, true);
  assert.match(refreshed.get('modal-content').innerHTML, /遊戲結束/);
});

test('held drop keys and Escape keep results; explicit restart creates a new game', () => {
  const game = loadGame(ended);
  assert.equal(game.key('Space', true).prevented, true);
  assert.equal(game.key('Enter', true).prevented, true);
  game.key('KeyR');
  game.get('modal').emit('cancel', { preventDefault() {} });
  game.autosave();
  assert.equal(game.session().over, true);
  assert.equal(game.get('modal').open, true);
  game.click('restart');
  assert.equal(game.get('modal').open, false);
  assert.equal(game.session().over, false);
  assert.equal(game.session().score, 0);
  assert.equal(game.session().balls.length, 0);
  assert.equal(JSON.parse(game.values.get('ckl-records')).length, 1);
});

test('revive offer survives refresh and finishing it keeps the game-over screen', () => {
  const game = loadGame({ ...ended, coins: 1, resultState: 'revive', recorded: false }, []);
  assert.match(game.get('modal-content').innerHTML, /使用一枚復活幣/);
  game.click('finish'); game.autosave();
  assert.equal(game.session().resultState, 'over');
  assert.equal(game.session().score, 512);
  assert.match(game.get('modal-content').innerHTML, /遊戲結束/);
  assert.equal(JSON.parse(game.values.get('ckl-records')).length, 1);
});

const playing = { ...ended, over: false, resultState: '', recorded: false,
  balls: [{ level: 0, x: 220, y: 390, angle: 0 }, { level: 2, x: 390, y: 555, angle: 0 }] };

test('bomb selection freezes the board and can be cancelled without spending a use', () => {
  const game = loadGame(playing, []);
  game.get('game').focus(); game.key('KeyB');
  assert.equal(game.get('bomb-label').textContent, '取消炸彈');
  game.tick(0); game.tick(1000); game.autosave();
  assert.equal(game.session().balls[0].y, 390);
  assert.equal(game.session().bombsLeft, 1);
  game.key('Escape'); game.autosave();
  assert.equal(game.get('bomb-label').textContent, '炸彈清場');
  assert.equal(game.session().bombsLeft, 1);
});

test('an empty blast costs nothing; touch release clears only its area and persists the spent use', () => {
  const game = loadGame(playing, []);
  game.get('game').focus(); game.key('KeyB');
  game.get('game').emit('pointermove', { clientX: 10, clientY: 10 });
  game.key('Space'); game.autosave();
  assert.equal(game.session().bombsLeft, 1);
  assert.equal(game.session().balls.length, 2);
  assert.equal(game.get('bomb-label').textContent, '取消炸彈');
  game.get('game').emit('pointerdown', { button: 0, pointerType: 'touch', pointerId: 1, clientX: 220, clientY: 390, preventDefault() {} });
  game.autosave(); assert.equal(game.session().bombsLeft, 1);
  game.get('game').emit('pointerup', { clientX: 220, clientY: 390 });
  assert.equal(game.session().bombsLeft, 0);
  assert.equal(game.session().balls.length, 1);
  assert.equal(game.session().balls[0].level, 2);
  assert.equal(game.session().score, playing.score);
  assert.equal(game.session().drops, playing.drops);
  assert.equal(game.session().current, playing.current);
  const refreshed = loadGame(game.session(), []);
  assert.equal(refreshed.get('bomb-button').disabled, true);
  assert.equal(refreshed.get('bomb-count').textContent, 0);
});

test('swap changes the current photo twice, preserves the preview, and refills only on restart', () => {
  const game = loadGame(playing, []);
  game.get('game').focus();
  game.key('KeyX'); const first = game.session();
  assert.notEqual(first.current, playing.current);
  assert.equal(first.next, playing.next);
  assert.equal(first.swapsLeft, 1);
  game.key('KeyX'); const second = game.session();
  assert.notEqual(second.current, first.current);
  assert.equal(second.swapsLeft, 0);
  game.key('KeyX'); assert.equal(game.session().current, second.current);
  const refreshed = loadGame(game.session(), []);
  assert.equal(refreshed.get('swap-button').disabled, true);
  refreshed.get('restart-button').emit('click', {}); refreshed.click('restart');
  assert.equal(refreshed.session().bombsLeft, 1);
  assert.equal(refreshed.session().swapsLeft, 2);
});

test('skills cannot change finished games or spend uses while paused', () => {
  const game = loadGame(ended);
  game.get('bomb-button').emit('click', {}); game.get('swap-button').emit('click', {}); game.autosave();
  assert.equal(game.session().over, true);
  assert.equal(game.session().score, ended.score);
  assert.equal(game.session().bombsLeft, 1);
  assert.equal(game.session().swapsLeft, 2);
  const active = loadGame(playing, []);
  active.get('game').focus(); active.key('KeyP');
  active.get('swap-button').emit('click', {}); active.autosave();
  assert.equal(active.session().swapsLeft, 2);
});
