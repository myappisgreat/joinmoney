const test = require('node:test');
const assert = require('node:assert/strict');
const { MergeWorld, RADII, HEIGHT } = require('../game.js');
const simulate = (world, frames) => { for (let i = 0; i < frames; i++) world.step(); };

test('same photos merge once and award points', () => {
  const w = new MergeWorld(); w.add(0, 200, HEIGHT - 18); w.add(0, 231, HEIGHT - 18);
  simulate(w, 90); assert.equal(w.balls.length, 1); assert.equal(w.balls[0].plugin.level, 1);
  assert.equal(w.events.length, 1); assert.equal(w.events[0].points, 2); w.destroy();
});
test('different photos collide without merging and remain inside board', () => {
  const w = new MergeWorld(); w.add(0, 1, 160); w.add(1, 30, 240);
  simulate(w, 600); assert.equal(w.balls.length, 2); assert.equal(w.events.length, 0);
  for (const b of w.balls) { const r = RADII[b.plugin.level]; assert.ok(b.position.y <= HEIGHT - r + 2); assert.ok(b.position.x >= r - 2); }
  assert.equal(w.danger, 0); w.destroy();
});
test('four same photos chain into a third level without duplicating bodies', () => {
  const w = new MergeWorld(); for (const y of [400, 440, 480, 520]) w.add(0, 220, y);
  simulate(w, 900); assert.equal(w.balls.length, 1); assert.equal(w.balls[0].plugin.level, 2);
  assert.equal(w.events.reduce((sum, e) => sum + e.points, 0), 8); w.destroy();
});
test('two final photos clear and grant final bonus', () => {
  const w = new MergeWorld(); w.add(13, 135, 465); w.add(13, 305, 465);
  simulate(w, 90); assert.equal(w.balls.length, 0); assert.equal(w.events.length, 1);
  assert.equal(w.events[0].final, true); assert.equal(w.events[0].points, 500); w.destroy();
});
test('newly dropped photos do not cause a loss and revive clears space', () => {
  const w = new MergeWorld(); for (const [i, x] of [100, 200, 300, 380].entries()) w.add(i, x, 60);
  simulate(w, 60); assert.equal(w.danger, 0);
  const before = w.balls.length; w.danger = 2000; w.revive(); assert.ok(w.balls.length < before); assert.equal(w.danger, 0); w.destroy();
});
