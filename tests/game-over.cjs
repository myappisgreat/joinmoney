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
