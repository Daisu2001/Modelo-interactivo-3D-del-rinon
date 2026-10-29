import * as THREE from './vendor/three.module.js';

// Las claves son COLOR_0 lineal del GLB; los colores visibles proceden de
// Models/Nefrona_colores.txt (sRGB). No se deducen nombres por proximidad.
export const NEPHRON_STRUCTURES = [
  { key: '76,188,125', name: 'Arteriola aferente', color: '#94DFBA',
    description: 'Vaso de entrada al glomérulo.',
    function: 'Lleva sangre a los capilares glomerulares y contribuye a regular la filtración.' },
  { key: '188,54,49', name: 'Glomérulo', color: '#DF7F79',
    description: 'Ovillo capilar dentro de la cápsula de Bowman.',
    function: 'Filtra agua y solutos pequeños; conserva las células sanguíneas y la mayor parte de las proteínas en la sangre.' },
  { key: '6,0,78', name: 'Cápsula de Bowman', color: '#2B0096',
    description: 'Cápsula que rodea el glomérulo y delimita el espacio urinario.',
    function: 'Recoge el filtrado y lo conduce al túbulo proximal; su capa visceral participa en la barrera de filtración.' },
  { key: '78,54,1', name: 'Arteriola eferente', color: '#967F07',
    description: 'Vaso de salida del glomérulo.',
    function: 'Conduce la sangre hacia la red capilar que rodea los túbulos.' },
  { key: '19,24,1', name: 'Red capilar', color: '#4E5709',
    description: 'Red vascular alrededor de los túbulos. La guía la identifica de forma tentativa como capilares.',
    function: 'Los capilares peritubulares y los vasos rectos devuelven a la circulación el agua y los solutos reabsorbidos.' },
  { key: '119,188,24', name: 'Túbulo proximal', color: '#B6DF57',
    description: 'Primer segmento tubular después de Bowman.',
    function: 'Reabsorbe gran parte del agua y las sales, y normalmente casi toda la glucosa y los aminoácidos filtrados.' },
  { key: '119,79,130', name: 'Asa de Henle', color: '#B697BD',
    description: 'Segmento en U que desciende a la médula y regresa hacia la corteza.',
    function: 'La rama descendente reabsorbe agua y la ascendente sales; ayuda a crear el gradiente para concentrar la orina.' },
  { key: '87,30,24', name: 'Túbulo contorneado distal', color: '#9E6157',
    description: 'Segmento tubular posterior al asa de Henle.',
    function: 'Ajusta la reabsorción de sales y calcio antes de la llegada al sistema colector.' },
  { key: '12,130,130', name: 'Conductos colectores', color: '#3EBDBD',
    description: 'Incluye el colector cortical y el conducto de Bellini. Comparten color en el archivo y se seleccionan juntos.',
    function: 'El sistema colector ajusta la recuperación de agua bajo la acción de ADH. Los conductos de Bellini desembocan en los cálices menores.' },
  { key: '0,134,56', name: 'Región verde sin identificar', color: '#00C080',
    description: 'Región presente en el GLB sin equivalencia en la guía de colores adjunta.',
    function: 'Pendiente de identificación anatómica; no se asigna una función a esta región.' },
  { key: '255,255,255', name: 'Regiones blancas sin identificar', color: '#FFFFFF',
    description: 'Superficies blancas del GLB sin nombre en la guía adjunta.',
    function: 'Pendientes de identificación anatómica; se conservan seleccionables para su revisión.' }
];

const palette = new Map(NEPHRON_STRUCTURES.map(part => [part.key, part]));

// Conserva cada triángulo y sus coordenadas. Solo agrupa las caras por el
// identificador pintado por el autor para raycast, ocultación y vista aislada.
export function prepareNephronMesh(mesh) {
  const source = mesh.geometry, color = source.getAttribute('color'), index = source.getIndex();
  if (!color || !index) throw new Error('La nefrona requiere índices y colores por vértice.');
  const regions = new Map();
  for (let i = 0; i < index.count; i += 3) {
    const vertex = index.getX(i);
    const key = [color.getX(vertex), color.getY(vertex), color.getZ(vertex)].map(value => Math.round(value * 255)).join(',');
    if (!palette.has(key)) throw new Error('Color de nefrona sin catalogar: ' + key);
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(index.getX(i), index.getX(i + 1), index.getX(i + 2));
  }
  const geometry = source.clone(), indices = new index.array.constructor(index.count), materials = [];
  geometry.clearGroups();
  let offset = 0;
  for (const [key, triangles] of regions) {
    const part = palette.get(key);
    const material = new THREE.MeshStandardMaterial({ color: part.color, roughness: .6, side: THREE.DoubleSide });
    material.name = part.name;
    material.userData.vertexColorKey = key;
    geometry.addGroup(offset, triangles.length, materials.length);
    indices.set(triangles, offset); offset += triangles.length; materials.push(material);
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  mesh.geometry = geometry;
  mesh.material = materials;
}
