import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { NEPHRON_STRUCTURES, prepareNephronMesh } from '../nephron-structures.js';

// Verifica la segmentación contra el GLB entregado, sin red ni renderizador.
const file = fs.readFileSync(new URL('../Models/Nefrona_anatomia.glb', import.meta.url));
assert.equal(file.toString('ascii', 0, 4), 'glTF');
const jsonLength = file.readUInt32LE(12);
const gltf = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
const binary = file.subarray(28 + jsonLength);
const primitive = gltf.meshes[0].primitives[0];
function attribute(id) {
  const accessor = gltf.accessors[id], view = gltf.bufferViews[accessor.bufferView];
  const TypedArray = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[accessor.componentType];
  const dimensions = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const offset = view.byteOffset + (accessor.byteOffset ?? 0);
  assert.ok(!view.byteStride, 'Esta prueba espera los atributos contiguos del archivo entregado.');
  const bytes = binary.subarray(offset, offset + accessor.count * dimensions * TypedArray.BYTES_PER_ELEMENT);
  const data = new TypedArray(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  return new THREE.BufferAttribute(data, dimensions, accessor.normalized ?? false);
}
const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', attribute(primitive.attributes.POSITION));
geometry.setAttribute('normal', attribute(primitive.attributes.NORMAL));
geometry.setAttribute('color', attribute(primitive.attributes.COLOR_0));
geometry.setIndex(attribute(primitive.indices));
const sourceIndices = [...geometry.index.array];
const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
prepareNephronMesh(mesh);
assert.equal(mesh.geometry.index.count / 3, 31116);
assert.equal(mesh.material.length, 11);
assert.deepEqual([...geometry.index.array], sourceIndices, 'No modifica la geometría fuente.');
assert.deepEqual(mesh.geometry.attributes.position.array, geometry.attributes.position.array);
function triangles(index) {
  const result = [];
  for (let i = 0; i < index.length; i += 3) result.push(index.slice(i, i + 3).join(','));
  return result.sort();
}
assert.deepEqual(triangles([...mesh.geometry.index.array]), triangles(sourceIndices), 'No pierde ni duplica caras.');
assert.deepEqual(new Set(mesh.material.map(m => m.name)), new Set(NEPHRON_STRUCTURES.map(p => p.name)));
const colors = geometry.attributes.color;
for (const group of mesh.geometry.groups) {
  const material = mesh.material[group.materialIndex];
  assert.ok(group.count > 0);
  for (let i = group.start; i < group.start + group.count; i++) {
    const vertex = mesh.geometry.index.getX(i);
    const key = [colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)].map(x => Math.round(x * 255)).join(',');
    assert.equal(key, material.userData.vertexColorKey, 'Cada cara pertenece solo a su región.');
  }
  const part = NEPHRON_STRUCTURES.find(p => p.name === material.name);
  assert.equal(material.color.getHexString(), part.color.slice(1).toLowerCase());
}
assert.equal(NEPHRON_STRUCTURES.filter(p => /sin identificar/.test(p.name)).length, 2);
assert.match(NEPHRON_STRUCTURES.find(p => p.name === 'Conductos colectores').description, /Comparten color/);
console.log('OK: GLB de nefrona, 31.116 triángulos conservados y 11 regiones conservadas; colores, nombres y regiones sin identificar.');
