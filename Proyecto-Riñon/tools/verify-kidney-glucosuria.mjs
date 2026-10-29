import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import { KidneyJourneySimulation, KIDNEY_MODES } from '../kidney-journey.js';
const data = JSON.parse(fs.readFileSync(new URL('../kidney-routes.json', import.meta.url)));
const urinaryBytes = fs.readFileSync(new URL('../kidney-urinary-routes.json', import.meta.url));
const urinary = JSON.parse(urinaryBytes);
const check = JSON.parse(fs.readFileSync(new URL('./kidney-urinary-geometry-validation.json', import.meta.url)));
assert.deepEqual(Object.keys(KIDNEY_MODES), ['normal', 'glucosuria']);
assert.equal(check.routeSha256, createHash('sha256').update(urinaryBytes).digest('hex'));
assert.equal(urinary.sourceSha256, createHash('sha256').update(fs.readFileSync(new URL('../Models/' + urinary.source, import.meta.url))).digest('hex'));
assert.equal(check.sourceSha256, urinary.sourceSha256);
assert.ok(check.centerSamples > 10000 && check.envelopeSamples > 260000);
assert.equal(check.outsideCenters, 0); assert.equal(check.outsideEnvelope, 0);
assert.equal(urinary.routes.length, 7);
const downstream = new Map(), key = point => point.join(',');
for (const route of urinary.routes) {
  assert.equal(route.direction, 'calyx-to-ureter');
  assert.equal(route.points.length, route.clearances.length);
  assert.ok(route.clearances.every(r => r > 0));
  assert.deepEqual(route.points.at(-1), urinary.routes[0].points.at(-1));
  assert.ok(route.points[0][1] > route.points.at(-1)[1]);
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = key(route.points[i]), b = key(route.points[i + 1]);
    assert.ok(!downstream.has(a) || downstream.get(a) === b, 'Calyx branches merge toward one outlet without returning into another branch.');
    downstream.set(a, b);
  }
}
const combined = { ...data, urinaryGlucoseRoutes: urinary.routes };
const make = () => new KidneyJourneySimulation(new THREE.Group(), combined);
const normal = make(), withoutUrinary = new KidneyJourneySimulation(new THREE.Group(), data);
assert.equal(normal.mode, 'normal'); assert.equal(normal.urinaryGlucose.count, 0);
assert.equal(normal.urinaryGlucose.visible, false);
for (let i = 0; i < 80; i++) {
  normal.update(1); withoutUrinary.update(1);
  assert.equal(normal.urinaryGlucose.count, 0, 'Normal never emits orange particles in urine.');
  assert.deepEqual(normal.visibleGlucose.map(p => [p.id, ...p.point]), withoutUrinary.visibleGlucose.map(p => [p.id, ...p.point]), 'The accepted normal arterial animation remains unchanged.');
}
const a = make(), b = make(); a.setMode('glucosuria'); b.setMode('glucosuria');
assert.equal(a.urinaryGlucose.count, 0, 'No urine glucose is prefilled when the scenario starts.');
a.update(a.handoffContactTime - 1e-6);
assert.equal(a.urinaryGlucose.count, 0, 'Glucose cannot reach urine before the nephron handoff.');
a.reset();
const seen = new Map(); let reachedUreter = false;
for (let i = 0; i < 75 * 30; i++) {
  a.update(1 / 30);
  for (const p of a.visibleUrinaryGlucose) {
    assert.equal(p.stage, 'urinary');
    assert.ok(p.distance >= (seen.get(p.id) ?? 0) - 1e-6, 'Every glucose particle moves downstream continuously.');
    seen.set(p.id, p.distance);
    const path = a.urinaryGlucosePaths[p.urinaryBranch];
    assert.ok(p.distance < path.length && p.radius <= path.clearanceAt(p.distance / path.length) * .75 + 1e-7);
    assert.ok(!a.visibleGlucose.some(incoming => incoming.id === p.id), 'One particle cannot occupy blood and urine simultaneously.');
    if (p.point.y < -850) reachedUreter = true;
  }
}
for (let i = 0; i < 75 * 60; i++) b.update(1 / 60);
assert.ok(seen.size > 10 && reachedUreter, 'Orange glucose reaches the visible lower ureter.');
assert.equal(a.urinaryGlucose.count, b.urinaryGlucose.count);
for (let i = 0; i < a.visibleUrinaryGlucose.length; i++) {
  assert.equal(a.visibleUrinaryGlucose[i].id, b.visibleUrinaryGlucose[i].id);
  assert.ok(a.visibleUrinaryGlucose[i].point.distanceTo(b.visibleUrinaryGlucose[i].point) < 1e-6, 'Urinary motion is independent of frame rate.');
}
assert.ok(a.urinaryGlucose.count < a.urinaryCapacity);
assert.equal(a.urinaryGlucose.parent, a.group, 'The blood-vessel visibility toggle does not hide urinary glucose.');
a.vascularGroup.visible = false; assert.equal(a.urinaryGlucose.visible, true);
assert.equal(a.glucose.material, a.urinaryGlucose.material, 'Urinary glucose has the same orange appearance.');
const candidate = a.visibleUrinaryGlucose[0];
const exitTime = candidate.id * a.spawnInterval + a.glucosePaths[candidate.branch].length / a.speed
  + a.nephronTransitDuration + a.urinaryGlucosePaths[candidate.urinaryBranch].length / a.urinarySpeed;
a.elapsed = exitTime + 1e-5; a.draw();
assert.ok(!a.visibleUrinaryGlucose.some(p => p.id === candidate.id), 'Glucose is removed at the ureter outlet.');
a.setMode('normal'); assert.equal(a.elapsed, 0); assert.equal(a.urinaryGlucose.count, 0);
assert.equal(a.urinaryGlucose.visible, false); assert.equal(a.glucose.count, 1);
a.setMode('glucosuria'); a.update(50); a.reset();
assert.equal(a.mode, 'glucosuria'); assert.equal(a.urinaryGlucose.count, 0);
assert.equal(a.handoffComplete, false); assert.throws(() => a.setMode('low'));
console.log('OK: dos estados renales, Normal conserva su recorrido; glucosuria sale por cálices/pelvis/uréter, sin duplicación ni retroceso, con inicio limpio, cambio/reinicio, 30/60 FPS y tamaño validado contra el GLB.');
