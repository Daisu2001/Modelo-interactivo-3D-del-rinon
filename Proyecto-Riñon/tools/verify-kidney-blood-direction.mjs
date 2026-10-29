import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { KidneyJourneySimulation } from '../kidney-journey.js';

const data = JSON.parse(fs.readFileSync(new URL('../kidney-routes.json', import.meta.url)));
const urinary = JSON.parse(fs.readFileSync(new URL('../kidney-urinary-routes.json', import.meta.url)));
const combined = { ...data, urinaryGlucoseRoutes: urinary.routes };
const key = point => point.map(x => x.toFixed(7)).join(',');
const edges = new Set(), downstream = new Map(), parents = new Map();
let maximumJoinGap = 0;
const start = data.arterialSegments.find(route => route.startDistance === 0);
assert.ok(start);
for (const route of data.arterialSegments) {
  for (let i = 1; i < route.points.length; i++) {
    const a = key(route.points[i - 1]), b = key(route.points[i]);
    assert.ok(!edges.has(b + '>' + a), 'No arterial edge is traversed in both directions.');
    assert.ok(!parents.has(b) || parents.get(b) === a, 'Each arterial node has one incoming direction.');
    edges.add(a + '>' + b); parents.set(b, a);
    if (!downstream.has(a)) downstream.set(a, new Set());
    downstream.get(a).add(b);
  }
}
const visited = new Set(), stack = [key(start.points[0])];
while (stack.length) {
  const node = stack.pop();
  assert.ok(!visited.has(node), 'The artery has no loop returning to an upstream node.');
  visited.add(node); stack.push(...(downstream.get(node) ?? []));
}
assert.equal(visited.size, parents.size + 1, 'Every branch originates at the renal arterial inlet.');
const make = () => new KidneyJourneySimulation(new THREE.Group(), combined);
const reference = make();
for (const child of reference.arterialStreams.filter(({ delay }) => delay > 0)) {
  const parent = reference.arterialStreams.find(candidate => candidate.path.points.at(-1).distanceTo(child.path.points[0]) < .001);
  assert.ok(parent, 'Daughter streams start exactly at their measured parent endpoint.');
  maximumJoinGap = Math.max(maximumJoinGap, Math.abs(child.delay - parent.delay - parent.path.length / reference.speed));
}
assert.ok(maximumJoinGap < .0001, 'Blood arrives at the fork before continuing through its daughters.');
const waiting = make();
for (const elapsed of [.1, 1, 2.5, 5, 10, 15]) {
  waiting.elapsed = elapsed; waiting.draw();
  for (const { delay, stream } of waiting.arterialStreams) {
    if (delay > elapsed) {
      assert.equal(stream.cells.count, 0, 'A distal branch cannot emit blood before the arterial front reaches it.');
      assert.equal(stream.fluid.material.uniforms.uFront.value, 0, 'No prefilled blood trail in a waiting branch.');
    }
  }
}
let trackedCells = 0;
for (const fps of [12, 20, 30, 60]) {
  const sim = make(); sim.elapsed = 25; sim.draw();
  let previous = sim.arterialStreams.map(() => new Map());
  for (let frame = 0; frame < fps * 3; frame++) {
    sim.update(1 / fps);
    sim.arterialStreams.forEach(({ path, stream }, index) => {
      assert.equal(stream.oneWay, true); assert.equal(stream.fluid.material.uniforms.uOneWay.value, 1);
      assert.ok(stream.cellSpacing >= 36, 'Spaced cells keep the direction legible at low frame rates.');
      assert.equal(new Set(stream.activeSlots).size, stream.activeSlots.length);
      const current = new Map();
      for (const cell of stream.cellPositions) {
        const old = previous[index].get(cell.id);
        if (old) {
          assert.equal(cell.slot, old.slot, 'A visible cell keeps its own instance until it leaves.');
          assert.ok(cell.distance > old.distance, 'The same red cell never jumps upstream.');
          assert.ok(Math.abs(cell.distance - old.distance - sim.speed / fps) < 1e-6);
          trackedCells++;
        }
        assert.ok(cell.distance > 0 && cell.distance < path.length);
        assert.ok(cell.point.distanceTo(path.getPoint(cell.distance / path.length)) < 1e-8);
        const matrix = new THREE.Matrix4(); stream.cells.getMatrixAt(cell.slot, matrix);
        const position = new THREE.Vector3().setFromMatrixPosition(matrix);
        assert.ok(position.distanceTo(cell.point) < .001, 'Rendered red cell matches the forward-moving particle.');
        current.set(cell.id, { ...cell });
      }
      previous[index] = current;
    });
  }
  sim.reset();
  for (const { stream } of sim.bloodStreams) {
    assert.equal(stream.cells.count, 0); assert.equal(stream.cellPositions.length, 0);
    assert.equal(stream.activeSlots.length, 0);
  }
}
assert.ok(trackedCells > 10000);
reference.setMode('glucosuria'); reference.update(60);
assert.ok(reference.urinaryGlucose.count > 0, 'The corrected blood flow preserves urinary glucosuria.');
assert.ok(reference.venousStreams.some(({ stream }) => stream.cellPositions.length > 0), 'Normal venous return remains separate.');
console.log(`OK: árbol arterial sin retornos, continuidad en las bifurcaciones y ${trackedCells} avances de glóbulos rojos sin saltos hacia atrás a 12/20/30/60 FPS; reinicio y glucosuria conservados.`);
