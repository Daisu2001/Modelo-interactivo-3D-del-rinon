import * as THREE from './vendor/three.module.js';
import { NEPHRON_STRUCTURES } from './nephron-structures.js';

export const NEPHRON85_ASSET_SCALE = 2.358;
export const NEPHRON85_STRUCTURES = NEPHRON_STRUCTURES.map(part => {
  if (part.key === '0,134,56') return { ...part, name: 'Región de conexión sin identificar',
    description: 'Segmento tubular junto al colector cuya identificación no está confirmada en el modelo de referencia.' };
  if (part.key === '255,255,255') return { ...part, name: 'Regiones sin identificar',
    description: 'Pequeñas superficies conservadas del modelo sin identificación anatómica confirmada.' };
  if (part.key === '19,24,1') return { ...part,
    description: 'Ramificaciones vasculares del vaso de salida, representadas junto a los túbulos.' };
  if (part.key === '12,130,130') return { ...part,
    description: 'Sistema tubular que recibe el filtrado del segmento distal y lo conduce hacia las papilas.' };
  return { ...part };
});
const palette = new Map(NEPHRON85_STRUCTURES.map(part => [part.key, part]));
const vascular = new Set(['Arteriola aferente', 'Arteriola eferente', 'Red capilar', 'Glomérulo']);

export function prepareNephron85Mesh(mesh, regions, { simulation = false } = {}) {
  const source = mesh.geometry, index = source.getIndex();
  const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!sourceMaterial?.map || index.count !== regions.triangles * 3) throw new Error('Modelo Nefrona 85% incompatible.');
  const geometry = source.clone(), indices = new index.array.constructor(index.count), materials = [];
  geometry.clearGroups(); let offset = 0;
  for (const group of regions.groups) {
    const part = palette.get(group.key);
    if (!part) throw new Error('Región de Nefrona 85% desconocida: ' + group.key);
    const material = sourceMaterial.clone();
    material.color.set(0xffffff); material.vertexColors = false; material.name = part.name;
    material.userData.vertexColorKey = group.key; material.userData.vascular = vascular.has(part.name);
    material.side = THREE.DoubleSide; material.transparent = simulation; material.depthWrite = !simulation;
    for (const triangle of group.triangles) for (let k = 0; k < 3; k++) indices[offset++] = index.getX(triangle * 3 + k);
    geometry.addGroup(offset - group.triangles.length * 3, group.triangles.length * 3, materials.length);
    materials.push(material);
  }
  if (offset !== index.count) throw new Error('Faltan caras de Nefrona 85%.');
  geometry.setIndex(new THREE.BufferAttribute(indices, 1)); mesh.geometry = geometry; mesh.material = materials;
  mesh.position.set(0, 0, 0); mesh.rotation.set(Math.PI / 2, 0, 0); mesh.scale.setScalar(1);
  mesh.renderOrder = simulation ? 1 : 0;
  if (simulation) setNephron85Opacity(materials, .2);
  return materials;
}

export function setNephron85Opacity(materials, value) {
  for (const material of materials) material.opacity = material.name === 'Glomérulo'
    ? Math.min(.85, value + .32) : material.userData.vascular ? Math.min(.8, value * 1.15 + .12) : value;
}
