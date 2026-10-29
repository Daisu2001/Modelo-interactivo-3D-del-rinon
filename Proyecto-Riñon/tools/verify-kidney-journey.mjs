import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import { KidneyJourneySimulation, KidneyJourney, KidneyPath } from '../kidney-journey.js';

const data = JSON.parse(fs.readFileSync(new URL('../kidney-routes.json', import.meta.url)));
const geometryCheck = JSON.parse(fs.readFileSync(new URL('./kidney-geometry-validation.json', import.meta.url)));
assert.equal(geometryCheck.routeSha256, createHash('sha256').update(fs.readFileSync(new URL('../kidney-routes.json', import.meta.url))).digest('hex'), 'Route edits require validation against the original 3D vessels.');
for (const check of Object.values(geometryCheck.vessels)) {
  assert.ok(check.centerSamples > 20000 && check.envelopeSamples > 600000);
  assert.equal(check.outsideCenters, 0); assert.equal(check.outsideEnvelope, 0);
}
assert.equal(data.version, 3);
assert.equal(data.voxelSpacing, .0025);
assert.ok(data.glucoseRoutes.length >= 6, 'Multiple real arterial branches are included.');
assert.equal(data.drainage.length, 4);
assert.ok(!data.circuits && !data.handoff, 'No concatenated vascular circuit or external handoff curve.');
for (const [name, hash] of Object.entries(data.sourceHashes)) {
  const bytes = fs.readFileSync(new URL('../Models/' + name, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, 'Routes match the actual vessel model.');
}
const key = point => point.map(x => x.toFixed(7)).join(',');
const incomingEdges = new Set();
for (const route of [...data.arterialSegments, ...data.venousSegments]) {
  assert.equal(route.clearances.length, route.points.length);
  assert.ok(route.clearances.every(radius => radius > 0));
  assert.ok(route.radii.every((radius, i) => radius <= route.clearances[i] + 1e-7));
}
for (const route of data.arterialSegments) {
  for (let i = 1; i < route.points.length; i++) incomingEdges.add(key(route.points[i - 1]) + '>' + key(route.points[i]));
}
const roots = data.arterialSegments.filter(route => route.startDistance === 0);
assert.equal(roots.length, 1);
for (const route of data.glucoseRoutes) {
  assert.deepEqual(route.points[0], roots[0].points[0]);
  for (let i = 1; i < route.points.length; i++) {
    assert.ok(incomingEdges.has(key(route.points[i - 1]) + '>' + key(route.points[i])), 'Orange paths only use directed incoming vessel edges.');
  }
  assert.deepEqual(route.entry.point, route.points.at(-1));
  const gap = new THREE.Vector3(...route.entry.point).distanceTo(new THREE.Vector3(...route.entry.nearCalyxPoint));
  assert.ok(gap < .14, 'Every orange branch ends near the calyx region.');
  assert.ok(Math.abs(gap - route.entry.distanceToCalyx) < 1e-6);
}
const glb = fs.readFileSync(new URL('../Models/Caliz_Corte.glb', import.meta.url));
const jsonLength = glb.readUInt32LE(12), gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
const binary = glb.subarray(28 + jsonLength), primitive = gltf.meshes[0].primitives[0];
function attribute(id) {
  const accessor = gltf.accessors[id], view = gltf.bufferViews[accessor.bufferView];
  const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[accessor.componentType];
  const size = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const bytes = binary.subarray(start, start + accessor.count * size * Type.BYTES_PER_ELEMENT);
  return new THREE.BufferAttribute(new Type(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), size, accessor.normalized ?? false);
}
const position = attribute(primitive.attributes.POSITION), index = attribute(primitive.indices), colors = attribute(primitive.attributes.COLOR_0);
const calyxSamples = [], translation = new THREE.Vector3(...gltf.nodes[0].translation);
for (let i = 0; i < index.count; i += 3) {
  const vertex = index.getX(i);
  const color = [colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)].map(x => Math.round(x * 255)).join(',');
  if (color !== '70,0,255') continue;
  const center = new THREE.Vector3();
  for (let k = 0; k < 3; k++) {
    const point = new THREE.Vector3().fromBufferAttribute(position, index.getX(i + k)).add(translation);
    center.add(point); calyxSamples.push(point);
  }
  calyxSamples.push(center.multiplyScalar(1 / 3));
}
for (const route of data.glucoseRoutes) {
  const nearest = new THREE.Vector3(...route.entry.nearCalyxPoint);
  assert.ok(calyxSamples.some(point => point.distanceTo(nearest) < 1e-6), 'The nearby calyx point belongs to the real mesh.');
}
const simulate = (fps, duration) => {
  const simulation = new KidneyJourneySimulation(new THREE.Group(), data);
  assert.equal(simulation.glucose.count, 1); assert.equal(simulation.urine.count, 0);
  assert.equal(simulation.handoffComplete, false);
  assert.equal(simulation.transitionGuide, undefined);
  assert.equal(simulation.handoffPath, undefined);
  for (const { stream } of simulation.bloodStreams) {
    assert.equal(stream.cells.count, 0);
    assert.equal(stream.fluid.material.uniforms.uFront.value, 0);
  }
  for (let frame = 0; frame < fps * duration; frame++) simulation.update(1 / fps);
  return simulation;
};
const a = simulate(30, 50), b = simulate(60, 50);
assert.equal(a.glucose.count, b.glucose.count);
for (let i = 0; i < a.visibleGlucose.length; i++) {
  const p = a.visibleGlucose[i], q = b.visibleGlucose[i];
  assert.equal(p.id, q.id); assert.equal(p.stage, 'arterial');
  assert.ok(p.point.distanceTo(q.point) < 1e-6, 'Independent of frame rate.');
  const path = a.glucosePaths[p.branch];
  assert.ok(p.distance < path.length);
  assert.ok(p.radius <= path.clearanceAt(p.distance / path.length) * .75 + 1e-8, 'Orange size stays within measured lumen clearance.');
  const matrix = new THREE.Matrix4(); a.glucose.getMatrixAt(i, matrix);
  const scale = new THREE.Vector3().setFromMatrixScale(matrix);
  assert.ok(scale.x * 5 <= p.radius + 1e-5);
  assert.ok(p.point.distanceTo(path.getPoint(p.distance / path.length)) < 1e-9);
}
assert.ok(a.venousStreams.some(({ stream }) => stream.cells.count > 0), 'Red blood continues in the venous return.');
for (const { stream } of a.venousStreams) assert.equal(stream.group.getObjectById(a.glucose.id), undefined, 'No orange particles in a venous stream.');
assert.ok(a.urine.count > 0); assert.ok(a.glucose.count < a.capacity);
const first = a.glucosePaths.map((path, i) => ({ id: i, time: i * a.spawnInterval + path.length / a.speed })).sort((x, y) => x.time - y.time)[0];
a.reset(); a.update(first.time - .000001);
assert.equal(a.handoffComplete, false);
assert.ok(a.visibleGlucose.some(p => p.id === first.id));
a.update(.000002);
assert.equal(a.handoffComplete, true);
assert.ok(!a.visibleGlucose.some(p => p.id === first.id), 'Orange vanishes at its incoming branch endpoint.');
a.update(20); assert.equal(a.handoffComplete, true);
a.reset(); assert.equal(a.handoffComplete, false); assert.equal(a.glucose.count, 1);

const source = new THREE.Group(); source.rotation.y = Math.PI; source.position.set(.1, -.2, 3.4);
const originalMaterial = new THREE.MeshStandardMaterial({ opacity: 1 });
for (const name of ['rinon', 'arteria', 'vena', 'caliz', 'piramide']) {
  for (const variant of ['completo', 'corte']) {
    const part = new THREE.Group(); part.name = name + '_' + variant; part.userData.variant = variant;
    part.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), originalMaterial)); source.add(part);
  }
}
const journey = new KidneyJourney(new THREE.Scene()); journey.setModel(source, data);
assert.equal(journey.anatomy.children.length, 5);
journey.setOpacity(.07); assert.ok(journey.materials.every(material => material.opacity === .07));
assert.equal(originalMaterial.opacity, 1);
journey.setVessels(false); assert.equal(journey.simulation.vascularGroup.visible, false);
assert.ok(journey.anatomy.children.filter(part => part.userData.vascular).every(part => !part.visible));
assert.ok(journey.anatomy.children.filter(part => !part.userData.vascular).every(part => part.visible));
journey.setVessels(true); assert.equal(journey.simulation.vascularGroup.visible, true);
const front = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), source.rotation.y + journey.root.rotation.y);
assert.ok(front.z > .99);
const path = new KidneyPath([[0, 0, 0], [0, 0, .1], [0, .1, .1]]);
assert.ok(path.getPoint(.5).distanceTo(new THREE.Vector3(0, 0, 100)) < 1e-8);
console.log('OK: ' + data.glucoseRoutes.length + ' ramas arteriales 3D de glucosa, tamaño ajustado a la luz vascular, desaparición cerca de los cálices reales, retorno venoso rojo sin naranjas, ausencia de puentes inventados, aviso persistente, 30/60 FPS y controles independientes.');
