const test = require('node:test');
const assert = require('node:assert/strict');
const Matter = require('../vendor/matter.min.js');
const shapes = require('../assets/shapes.js');
const { MergeWorld, RADII, HEIGHT } = require('../game.js');
const simulate = (world, frames) => { for (let i = 0; i < frames; i++) world.step(); };

test('same photos merge once and award points', () => {
  const w = new MergeWorld(); w.add(0, 220, 180); w.add(0, 220, 250);
  simulate(w, 240); assert.equal(w.balls.length, 1); assert.equal(w.balls[0].plugin.level, 1);
  assert.equal(w.events.length, 1); assert.equal(w.events[0].points, 2); w.destroy();
});
test('different photos collide without merging and remain inside board', () => {
  const w = new MergeWorld(); w.add(0, 1, 160); w.add(1, 30, 240);
  simulate(w, 600); assert.equal(w.balls.length, 2); assert.equal(w.events.length, 0);
  for (const b of w.balls) { assert.ok(b.bounds.max.y <= HEIGHT + 2); assert.ok(b.bounds.min.x >= -2); }
  assert.equal(w.danger, 0); w.destroy();
});
test('four same photos chain into a third level without duplicating bodies', () => {
  const w = new MergeWorld();
  // Arrange two separate mature contact pairs, then bring their products together.
  for (const x of [160, 160, 280, 280]) { const b = w.add(0, x, 300); b.plugin.born = -1000; }
  w.step(); assert.equal(w.balls.length, 2);
  for (const b of w.balls) { b.plugin.born = -1000; Matter.Body.setPosition(b, { x: 220, y: 300 }); }
  w.step(); assert.equal(w.balls.length, 1); assert.equal(w.balls[0].plugin.level, 2);
  assert.equal(w.events.reduce((sum, e) => sum + e.points, 0), 8); w.destroy();
});
test('two final photos clear and grant final bonus', () => {
  const w = new MergeWorld();
  for (const x of [210, 230]) { const b = w.add(13, x, 300); b.plugin.born = -1000; }
  w.step(); assert.equal(w.balls.length, 0); assert.equal(w.events.length, 1);
  assert.equal(w.events[0].final, true); assert.equal(w.events[0].points, 500); w.destroy();
});
test('newly dropped photos do not cause a loss and revive clears space', () => {
  const w = new MergeWorld(); for (const [i, x] of [100, 200, 300, 380].entries()) w.add(i, x, 60);
  simulate(w, 60); assert.equal(w.danger, 0);
  const before = w.balls.length; w.danger = 2000; w.revive(); assert.ok(w.balls.length < before); assert.equal(w.danger, 0); w.destroy();
});

test('all portraits land with a small rebound and settle on the floor', () => {
  for (let level = 0; level < 14; level++) {
    const w = new MergeWorld(); const b = w.add(level, 220, 150);
    let rebound = 0, impact = false;
    for (let i = 0; i < 360; i++) {
      w.step();
      if (b.plugin.impact) { impact = true; rebound = Math.min(rebound, b.velocity.y); }
      assert.ok(Number.isFinite(b.position.x) && Number.isFinite(b.position.y));
    }
    assert.ok(impact);
    assert.ok(rebound > -4, `level ${level + 1} rebound velocity ${rebound}`);
    assert.ok(b.speed < .5, `level ${level + 1} must settle`);
    w.destroy();
  }
});

test('all fourteen pieces use finite alpha-derived polygon bounds', () => {
  assert.equal(shapes.length, 14);
  const w = new MergeWorld();
  for (let level = 0; level < 14; level++) {
    assert.ok(shapes[level].vertices.length >= 3);
    const b = w.add(level, 220, 300);
    assert.equal(b.circleRadius, 0);
    assert.ok(b.area > 0 && Number.isFinite(b.mass));
    assert.ok(b.bounds.min.x >= 0 && b.bounds.max.x <= 440);
    const imageCenter = { x: b.position.x - shapes[level].center.x * RADII[level], y: b.position.y - shapes[level].center.y * RADII[level] };
    const first = shapes[level].vertices[0];
    // Rendering and physics both use the same alpha hull after center-of-mass adjustment.
    const expected = { x: imageCenter.x + first.x * RADII[level], y: imageCenter.y + first.y * RADII[level] };
    assert.ok(b.vertices.some(v => Math.hypot(v.x - expected.x, v.y - expected.y) < .02));
  }
  w.destroy();
});

test('portrait framing has comparable width and height and grows at every level', () => {
  let previous = 0;
  for (let i = 0; i < 14; i++) {
    const { width, height } = shapes[i].portraitBounds;
    assert.ok(Math.min(width, height) / Math.max(width, height) >= .89);
    const longest = Math.max(width, height) / 256 * RADII[i];
    assert.ok(longest > previous);
    previous = longest;
  }
  assert.ok(RADII[0] >= 24);
});
