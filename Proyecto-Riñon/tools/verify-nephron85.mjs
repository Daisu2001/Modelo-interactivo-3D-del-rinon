import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import { Nephron85Simulation, NEPHRON85_MODES } from '../nephron85-simulation.js';
import { MODES } from '../simulation.js';
import { prepareNephron85Mesh, NEPHRON85_STRUCTURES, setNephron85Opacity } from '../nephron85-structures.js';

const bytes = fs.readFileSync(new URL('../Models/Nefrona_85.glb', import.meta.url));
const regions = JSON.parse(fs.readFileSync(new URL('../nephron85-regions.json', import.meta.url)));
const routeBytes = fs.readFileSync(new URL('../nephron85-routes.json', import.meta.url)), data = JSON.parse(routeBytes);
const report = JSON.parse(fs.readFileSync(new URL('./nephron85-geometry-validation.json', import.meta.url)));
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(bytes), regions.sourceSha256); assert.equal(hash(bytes), report.sourceSha256);
assert.equal(hash(routeBytes), report.routesSha256); assert.equal(regions.outlets, 4);
assert.equal(report.records.find(record => record.name === 'vascular').radiusFraction, .78);
for (const record of report.records) {
  assert.equal(record.outsideCenters, 0); assert.equal(record.outsideEnvelope, 0);
  assert.ok(record.centerSamples > 5000 && record.envelopeSamples > 130000);
}
const length = bytes.readUInt32LE(12), gltf = JSON.parse(bytes.toString('utf8', 20, 20 + length)), binary = bytes.subarray(28 + length);
const primitive = gltf.meshes[0].primitives[0];
function attribute(id) {
  const a = gltf.accessors[id], v = gltf.bufferViews[a.bufferView];
  const Type = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const b = binary.subarray(start, start + a.count * size * Type.BYTES_PER_ELEMENT);
  return new THREE.BufferAttribute(new Type(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), size, a.normalized ?? false);
}
const geometry = new THREE.BufferGeometry();
for (const [key, name] of Object.entries({ POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color' })) geometry.setAttribute(name, attribute(primitive.attributes[key]));
geometry.setIndex(attribute(primitive.indices)); assert.equal(geometry.index.count / 3, 22272);
const textures = gltf.images.map(image => {
  const v = gltf.bufferViews[image.bufferView], b = binary.subarray(v.byteOffset, v.byteOffset + v.byteLength);
  assert.equal(b.subarray(1, 4).toString('ascii'), 'PNG');
  return new THREE.Texture({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
});
const texture = index => textures[gltf.textures[index].source], material = gltf.materials[0];
const sourceMaterial = new THREE.MeshStandardMaterial({ map: texture(material.pbrMetallicRoughness.baseColorTexture.index),
  normalMap: texture(material.normalTexture.index), metalnessMap: texture(material.pbrMetallicRoughness.metallicRoughnessTexture.index),
  roughnessMap: texture(material.pbrMetallicRoughness.metallicRoughnessTexture.index) });
const anatomy = new THREE.Mesh(geometry, sourceMaterial), glucose = new THREE.Mesh(geometry, sourceMaterial);
prepareNephron85Mesh(anatomy, regions); const materials = prepareNephron85Mesh(glucose, regions, { simulation: true });
assert.equal(anatomy.geometry.index.count, geometry.index.count);
assert.deepEqual(anatomy.geometry.attributes.uv.array, geometry.attributes.uv.array);
const faces = index => { const result = []; for (let i = 0; i < index.length; i += 3) result.push(index.slice(i, i + 3).join(',')); return result.sort(); };
assert.deepEqual(faces([...anatomy.geometry.index.array]), faces([...geometry.index.array]));
assert.deepEqual(new Set(anatomy.material.map(m => m.name)), new Set(NEPHRON85_STRUCTURES.map(p => p.name)));
setNephron85Opacity(materials, .07);
for (const m of anatomy.material) {
  assert.equal(m.opacity, 1); assert.equal(m.vertexColors, false); assert.equal(m.color.getHex(), 0xffffff);
  for (const key of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) assert.equal(m[key], sourceMaterial[key]);
}
const source = fs.readFileSync(new URL('../anatomy-browser.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function visiblePart('), source.indexOf('export class ModelPreview')).replaceAll('export function', 'function');
const { extractPreview: preview, getAvailableAnatomyParts } = new Function('THREE', helpers + ';return {extractPreview, getAvailableAnatomyParts};')(THREE);
const model = new THREE.Group(); model.add(anatomy); model.updateMatrixWorld(true);
for (const part of NEPHRON85_STRUCTURES) {
  const isolated = preview(model, part.name); assert.ok(isolated.children.length, part.name);
  isolated.traverse(node => { if (node.isMesh) { assert.ok(node.material.map); assert.equal(node.material.opacity, 1); } });
}
const selectable = getAvailableAnatomyParts(model, NEPHRON85_STRUCTURES);
assert.equal(selectable.length, 9, 'Unidentified regions are preserved in the mesh and omitted from the anatomy list.');
assert.ok(selectable.every(part => part.description && part.function && !/sin identificar/i.test(part.name)));

const sim = new Nephron85Simulation(new THREE.Group(), data);
assert.equal(sim.returnGlucose.material.transparent, true, 'Highlight renders in the same pass as the translucent vessels.');
assert.equal(sim.returnCore.material.transparent, true);
assert.ok(sim.returnGlucose.renderOrder > sim.bloodStream.fluid.renderOrder);
assert.equal(sim.outlets.length, 4);
assert.ok(data.blood.points[0][2] < -.3, 'Entry uses the single upper arteriole');
assert.ok(data.bloodOutlets.every(p => p.points.at(-1)[2] > -.06), 'Exit uses the four shorter branches');
for (let i = 0; i < 4; i++) {
  assert.deepEqual(data.blood.points.at(-1), data.bloodOutlets[i].points[0]);
  assert.ok(sim.returns[i].getPoint(0).distanceTo(sim.tubule.getPoint(sim.reabsorptionEnd / sim.tubule.length)) < 1e-8);
  assert.ok(sim.returns[i].getPoint(1).distanceTo(sim.outlets[i].getPoint(.6)) < 1e-8);
  assert.ok(sim.returns[i].getTangent(1).dot(sim.outlets[i].getTangent(.6)) > .97);
}
const summaries = [];
for (const mode of ['low', 'normal', 'glucosuria']) {
  assert.ok(NEPHRON85_MODES[mode].spawnInterval < MODES[mode].spawnInterval, 'Every nephron state emits more particles.');
  assert.equal(NEPHRON85_MODES[mode].bloodSpeed, MODES[mode].bloodSpeed);
  assert.equal(NEPHRON85_MODES[mode].reabsorptionFraction, MODES[mode].reabsorptionFraction);
  sim.setMode(mode);
  const allocation = Array.from({length:1000},()=>sim.makeParticle());
  const allocated = allocation.filter(p=>p.willFilter);
  assert.equal(allocated.length,600);
  assert.equal(allocated.filter(p=>p.willReabsorb).length/allocated.length,mode==='glucosuria'?.45:1);
  sim.reset(); assert.equal(sim.particles.length, 1); assert.equal(sim.bloodStream.cells.count, 0);
  assert.ok(sim.outletStreams.every(s => s.cells.count === 0));
  assert.equal(sim.processStage, 0); assert.equal(sim.fluids[0].material.uniforms.uFront.value, 0);
  const seenUnfiltered = new Set(), seen = new Set(), stages = new Set([0]); let previousStage = 0;
  for (let i = 0; i < 210 * 30; i++) {
    const previous = new Map(sim.particles.map(p => [p.id, { position: sim.position(p), stage: p.stage, distance: p.distance }]));
    sim.update(1 / 30);
    assert.equal(sim.returnGlucose.count, sim.stats.reabsorbing + sim.stats.returnedActive + sim.stats.unfilteredActive);
    assert.equal(sim.returnCore.count, sim.returnGlucose.count);
    assert.equal(sim.returnGlucose.material.depthTest, false, 'The return highlight remains visible through vessel walls.');
    assert.equal(sim.serial, sim.particles.length + sim.absorbed + sim.excreted + sim.unfiltered);
    assert.ok(sim.processStage >= previousStage); previousStage = sim.processStage; stages.add(sim.processStage);
    for (const p of sim.particles) {
      assert.ok(sim.position(p).toArray().every(Number.isFinite)); assert.ok(sim.particleRadius(p) > 0);
      const before = previous.get(p.id);
      if (before) assert.ok(sim.position(p).distanceTo(before.position) < 4, 'No jumps between blood, filtration, tubular and return paths');
      if (!p.willFilter) {
        assert.equal(p.countedFiltered, false);
        assert.ok(['blood', 'unfiltered-blood'].includes(p.stage));
      }
      if (p.stage === 'unfiltered-blood') seenUnfiltered.add(p.branch);
      if (p.stage === 'return-blood') {
        assert.equal(p.willReabsorb, true); seen.add(p.branch);
        const room = sim.outlets[p.branch].radiusAt(p.distance / sim.outlets[p.branch].length);
        assert.ok(sim.particleRadius(p) <= room * .78 + 1e-8);
        if (before?.stage === 'return-blood') assert.ok(p.distance > before.distance, 'Return only moves towards the outlets');
      }
    }
  }
  assert.equal(seen.size, 4); assert.equal(seenUnfiltered.size, 4); assert.ok(sim.unfiltered > 0); assert.ok(sim.absorbed > 0);
  assert.deepEqual([...stages], mode === 'glucosuria' ? [0, 1, 2] : [0, 1]);
  if (mode === 'glucosuria') assert.ok(sim.collectorGlucose > 0 && sim.excreted > 0);
  else { assert.equal(sim.collectorGlucose, 0); assert.equal(sim.excreted, 0); }
  summaries.push({ mode, ...sim.stats });
}
for (const mode of ['low', 'normal', 'glucosuria']) {
  sim.setMode(mode); const other = new Nephron85Simulation(new THREE.Group(), data); other.setMode(mode);
  for (let i = 0; i < 3600; i++) sim.update(1 / 30);
  for (let i = 0; i < 7200; i++) other.update(1 / 60);
  assert.deepEqual(sim.stats, other.stats);
  assert.deepEqual(sim.particles.map(p => p.id), other.particles.map(p => p.id));
}
sim.setMode('normal'); assert.equal(sim.collectorGlucose, 0); assert.equal(sim.absorbed, 0);
assert.equal(sim.returnGlucose.count, 0); assert.equal(sim.returnCore.count, 0);
assert.ok(sim.returnStartTimes.every(v => v === Infinity)); assert.equal(sim.particles.length, 1);
console.log('OK: Nefrona 85% texturizada, 22.272 caras, once regiones conservadas, nueve fichas válidas, materiales independientes, entrada compartida con la sangre, cuatro salidas, retorno continuo, glucosa filtrada y sin filtrar en los tres estados, glucosuria, conservación, 30/60 FPS y reinicio.');
console.table(summaries.map(({ mode, absorbed, collectorGlucose, excreted, active }) => ({ mode, absorbed, collectorGlucose, excreted, active })));
