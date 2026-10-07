import * as THREE from './vendor/three.module.js';

// COLOR_0 está en espacio lineal; la guía del artista usa colores sRGB.
export const GLOMERULUS_STRUCTURES = [
  { key: '80,0,84', name: 'Arteriola aferente', color: '#98009B', opacity: .40,
    description: 'Pequeño vaso que lleva la sangre hacia los capilares del glomérulo.',
    function: 'Aporta sangre al glomérulo y ayuda a regular el flujo y la presión de filtración.' },
  { key: '204,74,10', name: 'Arteriola eferente', color: '#E79338', opacity: .40,
    description: 'Vaso por el que la sangre sale del glomérulo después de la filtración.',
    function: 'Conduce la sangre hacia los capilares peritubulares y contribuye a mantener la presión glomerular.' },
  { key: '255,255,255', name: 'Capilares glomerulares', color: '#bd3b52', opacity: .32,
    description: 'Red de pequeños vasos sanguíneos situada dentro de la cápsula de Bowman.',
    function: 'Permite el paso de agua y moléculas pequeñas, como la glucosa, al filtrado; retiene las células sanguíneas y la mayor parte de las proteínas.' },
  { key: '121,9,17', name: 'Cápsula de Bowman', color: '#B73448', opacity: .14,
    description: 'Estructura que rodea los capilares glomerulares y delimita el espacio de Bowman.',
    function: 'Recoge el filtrado en el espacio de Bowman y lo dirige al túbulo proximal. Su capa visceral participa en la barrera de filtración.' },
  { key: '121,84,23', name: 'Túbulo proximal', color: '#B79B55', opacity: .22,
    description: 'Primer segmento tubular que recibe el filtrado desde la cápsula de Bowman.',
    function: 'Reabsorbe normalmente casi toda la glucosa filtrada, además de agua y otros solutos, para devolverlos a la sangre.' },
  { key: '23,51,84', name: 'Túbulo distal', color: '#557C9B', opacity: .36,
    description: 'Segmento de la nefrona posterior al asa de Henle. En este modelo aparece junto al polo vascular del glomérulo.',
    function: 'Ajusta la composición del filtrado mediante transporte de sales y calcio. La región de la mácula densa contribuye a regular la filtración.' }
];
const palette = new Map(GLOMERULUS_STRUCTURES.map(part => [part.key, part]));

export function prepareGlomerulusMesh(node, materials, { anatomy = false } = {}) {
  const geometry = node.geometry.clone(), color = geometry.getAttribute('color'), index = geometry.getIndex();
  const regions = new Map();
  for (let i = 0; i < index.count; i += 3) {
    const v = index.getX(i), key = [color.getX(v), color.getY(v), color.getZ(v)].map(x => Math.round(x * 255)).join(',');
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  const indices = new index.array.constructor(index.count), slots = []; let offset = 0;
  geometry.clearGroups();
  for (const [key, triangles] of regions) {
    const part = palette.get(key) ?? { name: 'Estructura glomerular', color: '#c8b6a0', opacity: .25 };
    const material = new THREE.MeshStandardMaterial({ color: part.color, opacity: anatomy ? 1 : part.opacity,
      roughness: .6, transparent: !anatomy, side: THREE.DoubleSide, depthWrite: anatomy });
    material.name = part.name;
    material.userData.baseOpacity = part.opacity;
    material.userData.vertexColorKey = key;
    materials.push(material);
    geometry.addGroup(offset, triangles.length, slots.length);
    indices.set(triangles, offset); offset += triangles.length; slots.push(material);
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  node.geometry = geometry; node.material = slots; node.renderOrder = anatomy ? 0 : 1;
}
