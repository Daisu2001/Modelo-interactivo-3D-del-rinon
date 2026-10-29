import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { GlomerulusSimulation } from '../glomerulus-simulation.js';
import { GLOMERULUS_STRUCTURES } from '../glomerulus-structures.js';
import { calculateRenalState } from '../renal-physiology.js';

const routes = JSON.parse(fs.readFileSync(new URL('../glomerulus-routes.json', import.meta.url)));
const sim = new GlomerulusSimulation(new THREE.Group(), routes);
// The requested single lower vessel is now the inlet; the four upper mouths
// are outlets. Anchor the check to the asset, rather than just property names.
assert.ok(new THREE.Vector3(...routes.afferent.points[0]).distanceTo(
  new THREE.Vector3(-1.3806726667, -.91366025, .0602720417)) < 1e-6);
assert.equal(GLOMERULUS_STRUCTURES.find(p => p.key === '204,74,10').name, 'Arteriola aferente');
assert.equal(GLOMERULUS_STRUCTURES.find(p => p.key === '80,0,84').name, 'Arteriola eferente');
assert.deepEqual(sim.afferentOwners, [0, 0, 0, 0]);
assert.deepEqual(sim.efferentOwners, [0, 1, 2, 3]);
for (const [i, outlet] of routes.efferents.entries()) {
  assert.ok(outlet.points.at(-1)[0] > .98 && outlet.points.at(-1)[1] > .9);
  const capillary = routes.capillaries[i % routes.capillaries.length];
  assert.deepEqual(routes.afferent.points.at(-1), capillary.points[0]);
  assert.deepEqual(capillary.points.at(-1), outlet.points[0]);
  assert.ok(sim.paths[i].getPoint(0).distanceTo(new THREE.Vector3(...routes.afferent.points[0])) < 1e-9);
  assert.ok(sim.paths[i].getPoint(1).distanceTo(new THREE.Vector3(...outlet.points.at(-1))) < 1e-9);
  assert.ok(sim.reabsorptions[i].getPoint(1).distanceTo(sim.efferents[i].getPoint(.8)) < 1e-9);
  assert.ok(sim.reabsorptions[i].getTangent(1).dot(sim.efferents[i].getTangent(.8)) > .99,
    'Reabsorbed glucose joins the branch in the direction of blood flow');
}

// A new red-cell emission must not reset the existing row towards the inlet.
sim.update(.28);
const before = new THREE.Matrix4(); sim.cells.getMatrixAt(0, before);
sim.update(.02);
const after = new THREE.Matrix4(); sim.cells.getMatrixAt(0, after);
const beforePosition = new THREE.Vector3().setFromMatrixPosition(before);
const afterPosition = new THREE.Vector3().setFromMatrixPosition(after);
assert.ok(beforePosition.distanceTo(sim.paths[0].getPoint(.28 * sim.bloodSpeed / sim.paths[0].length)) < 1e-6);
assert.ok(afterPosition.distanceTo(sim.paths[0].getPoint(.30 * sim.bloodSpeed / sim.paths[0].length)) < 1e-6);
assert.ok(afterPosition.distanceTo(beforePosition) < .011);

// Follow each reabsorbed particle through the tubular wall, capture by an
// efferent branch, and outward travel. No fade, jump, reverse, or early count.
for (const dt of [1 / 20, 1 / 30, 1 / 60]) {
  sim.reset();
  for (let branch = 0; branch < 4; branch++) {
    const p = { id: branch + 1, branch, stage: 'proximal', distance: sim.proximal.length * .37,
      transfer: 0, decided: true, reabsorptionDecided: true, reabsorb: true };
    let previous = sim.position(p), previousReturnDistance = -1;
    const stages = new Set();
    for (let t = 0; t < 20 && p.stage !== 'removed'; t += dt) {
      const absorbed = sim.absorbed;
      sim.advance(p, dt); stages.add(p.stage);
      if (p.stage === 'removed') { assert.equal(sim.absorbed, absorbed + 1); break; }
      assert.equal(sim.absorbed, absorbed);
      const position = sim.position(p);
      assert.ok(position.distanceTo(previous) < dt * 1.1, 'Continuous motion through both junctions');
      previous = position;
      if (p.stage === 'return-blood') {
        assert.ok(p.distance > previousReturnDistance, 'Captured glucose only travels outward');
        previousReturnDistance = p.distance;
      }
      sim.particles = [p]; sim.draw();
      const matrix = new THREE.Matrix4(); sim.glucose.getMatrixAt(0, matrix);
      assert.ok(new THREE.Vector3().setFromMatrixScale(matrix).x > .004, 'Reabsorbed glucose remains visible');
    }
    assert.equal(p.stage, 'removed');
    assert.ok(stages.has('reabsorption') && stages.has('return-blood'));
  }
  assert.equal(sim.absorbed, 4); assert.equal(sim.continued, 0);
}

// In glucosuria the excess stays tubular; reabsorbed solute returns to blood.
sim.reset(); sim.setState(calculateRenalState({ pglu: 240 }));
const returned = new Set(), urinary = new Set();
for (let i = 0; i < 180 * 20; i++) {
  sim.update(.05);
  assert.equal(sim.serial, sim.stats.active + sim.absorbed + sim.continued + sim.unfiltered);
  for (const p of sim.particles) {
    if (p.stage === 'return-blood') { assert.equal(p.reabsorb, true); returned.add(p.branch); }
    if (p.stage === 'proximal' && p.reabsorptionDecided && !p.reabsorb) urinary.add(p.id);
  }
}
assert.equal(returned.size, 4); assert.ok(urinary.size > 0 && sim.continued > 0);
assert.ok(Math.abs(sim.continued / (sim.absorbed + sim.continued) - 95 / 300) < .025);
sim.reset(); assert.ok(sim.returnFronts.every(v => v === 0));
assert.ok(sim.reabsorptionFluids.every(mesh => mesh.material.uniforms.front.value === 0));
assert.equal(sim.stats.returning, 0); assert.equal(sim.cells.count, 0);
console.log('OK: entrada única, cuatro salidas, retorno visible y continuo de glucosa a las cuatro ramas a 20/30/60 FPS, glucosuria, conservación y reinicio.');
