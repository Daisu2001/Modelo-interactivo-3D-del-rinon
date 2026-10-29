import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLOMERULUS_STRUCTURES } from './glomerulus-structures.js';
import { NEPHRON_STRUCTURES } from './nephron-structures.js';
import { NEPHRON85_STRUCTURES } from './nephron85-structures.js';

const KIDNEY_STRUCTURES = [
  { name: 'Corteza renal', color: '#a83232', description: 'Capa externa del riñón que contiene los corpúsculos renales y segmentos de los túbulos.', function: 'Aloja la filtración glomerular y parte de la reabsorción y secreción tubular.' },
  { name: 'Médula renal', color: '#631818', description: 'Región interna del riñón, organizada en pirámides renales.', function: 'Participa en la concentración de la orina y conduce el líquido hacia las papilas.' },
  { name: 'Pirámides renales', color: '#d97724', description: 'Estructuras de la médula renal con forma de cono.', function: 'Contienen segmentos de las nefronas y conductos colectores que llevan la orina hacia las papilas.' },
  { name: 'Cálices menores', color: '#e09b53', description: 'Pequeñas cavidades que rodean las papilas renales.', function: 'Recogen la orina que sale de las pirámides y la conducen a los cálices mayores.' },
  { name: 'Cálices mayores', color: '#d4a837', description: 'Cavidades formadas por la unión de varios cálices menores.', function: 'Reúnen la orina y la dirigen hacia la pelvis renal.' },
  { name: 'Pelvis renal', color: '#c2b093', description: 'Cavidad central con forma de embudo, conectada con el uréter.', function: 'Recibe la orina de los cálices y la conduce al uréter.' },
  { name: 'Arteria renal', color: '#d92b2b', description: 'Vaso sanguíneo que lleva sangre desde la aorta hacia el riñón.', function: 'Aporta la sangre que será filtrada y el oxígeno que necesita el tejido renal.' },
  { name: 'Vena renal', color: '#2b6bd9', description: 'Vaso sanguíneo por el que la sangre sale del riñón.', function: 'Devuelve la sangre a la circulación a través de la vena cava inferior.' },
  { name: 'Uréter', color: '#e6b800', description: 'Conducto muscular que conecta la pelvis renal con la vejiga.', function: 'Transporta la orina hasta la vejiga mediante contracciones de su pared.' },
  { name: 'Sistema colector', color: '#c2b093', description: 'Vista conjunta de los cálices, la pelvis renal y el inicio del uréter. En este GLB, su superficie exterior comparte una región; la vista de corte permite seleccionar sus regiones internas por separado.', function: 'Recoge la orina procedente de las papilas y la conduce hacia el uréter.' }
];

const MODELS = {
  kidney: { label: 'Riñón', parts: KIDNEY_STRUCTURES, initial: 'Corteza renal' },
  glomerulus: { label: 'Glomérulo', parts: GLOMERULUS_STRUCTURES, initial: 'Capilares glomerulares' },
  nephron: { label: 'Nefrona', parts: NEPHRON_STRUCTURES, initial: 'Glomérulo' },
  nephron85: { label: 'Nefrona 85%', parts: NEPHRON85_STRUCTURES, initial: 'Glomérulo' }
};

function visiblePart(node, root) {
  for (let part = node; part && part !== root; part = part.parent) if (!part.visible) return false;
  return true;
}

export function getAvailableAnatomyParts(model, parts) {
  if (!model) return [];
  const names = new Set(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  model.traverse(node => {
    if (!node.isMesh || !visiblePart(node, model)) return;
    const geometry = node.geometry, position = geometry.getAttribute('position'), index = geometry.getIndex();
    if (!position) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index?.count ?? position.count, materialIndex: 0 }];
    for (const group of groups) {
      const name = materials[group.materialIndex ?? 0]?.name;
      if (!name || names.has(name)) continue;
      for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
        a.fromBufferAttribute(position, index ? index.getX(i) : i);
        b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).sub(a);
        c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).sub(a);
        if (b.cross(c).lengthSq() > 1e-20) { names.add(name); break; }
      }
    }
  });
  return parts.filter(part => names.has(part.name) && part.description?.trim() && part.function?.trim()
    && !/sin identificar|sin clasificar|tentativ|pendiente|no se asigna|no.*identificad/i.test(
      [part.name, part.description, part.function].join(' ')));
}

// Extrae solo las caras de la región seleccionada. La caja de la vista previa
// no incluye los vértices de otras regiones ni las variantes ocultas del riñón.
export function extractPreview(model, name = null) {
  const result = new THREE.Group();
  if (!model) return result;
  model.updateMatrixWorld(true);
  model.traverse(node => {
    if (!node.isMesh || !visiblePart(node, model)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const source = node.geometry, index = source.getIndex();
    const groups = source.groups.length ? source.groups : [{ start: 0, count: index?.count ?? source.attributes.position.count, materialIndex: 0 }];
    for (const group of groups) {
      const material = materials[group.materialIndex ?? 0];
      if (!material || (name && material.name !== name)) continue;
      const indices = [];
      for (let i = group.start; i < group.start + group.count; i++) indices.push(index ? index.getX(i) : i);
      const subset = source.clone();
      subset.clearGroups(); subset.setIndex(indices);
      const geometry = subset.toNonIndexed(); subset.dispose();
      geometry.applyMatrix4(node.matrixWorld);
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const previewMaterial = material.clone();
      previewMaterial.visible = true; previewMaterial.opacity = 1;
      previewMaterial.transparent = false; previewMaterial.depthWrite = true;
      previewMaterial.wireframe = false;
      if (previewMaterial.emissive) previewMaterial.emissive.set(0);
      result.add(new THREE.Mesh(geometry, previewMaterial));
    }
  });
  return result;
}

export class ModelPreview {
  constructor(canvas, interactive = false) {
    this.canvas = canvas;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#eae5de');
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 5, 8); this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(38, 1, .001, 10000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.controls = interactive ? new OrbitControls(this.camera, canvas) : null;
    if (this.controls) {
      this.controls.enablePan = false; this.controls.enableZoom = false;
      this.controls.addEventListener('change', () => this.render());
    }
    this.dirty = true;
  }
  setModel(model, name) {
    if (this.model) {
      this.scene.remove(this.model);
      this.model.traverse(node => {
        if (node.isMesh) { node.geometry.dispose(); node.material.dispose(); }
      });
    }
    this.model = extractPreview(model, name);
    this.scene.add(this.model); this.dirty = true; this.resize(); this.frame(); this.render();
    return this.model.children.length > 0;
  }
  frame() {
    if (!this.model?.children.length) return;
    const box = new THREE.Box3().setFromObject(this.model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.max(size.y, size.x / this.camera.aspect) / (2 * Math.tan(fov / 2)) * 1.15 + size.z / 2;
    this.camera.position.copy(center).add(new THREE.Vector3(0, 0, Math.max(distance, .01)));
    this.camera.lookAt(center);
    if (this.controls) { this.controls.target.copy(center); this.controls.update(); }
  }
  resize() {
    const width = Math.round(this.canvas.clientWidth), height = Math.round(this.canvas.clientHeight);
    if (width < 1 || height < 1) return;
    if (this.width === width && this.height === height) return;
    this.width = width; this.height = height;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix(); this.frame(); this.dirty = true;
  }
  render() { if (this.width && this.height) this.renderer.render(this.scene, this.camera); this.dirty = false; }
  update() { this.resize(); if (this.dirty) this.render(); }
}

export class AnatomyBrowser {
  constructor(onSelect, onSwitch) {
    this.kind = 'kidney'; this.selected = 'Corteza renal'; this.models = {};
    this.errors = new Set();
    this.onSelect = onSelect;
    this.picker = document.querySelector('#anatomy-model-picker');
    this.partPreview = new ModelPreview(document.querySelector('#structure-preview-canvas'), true);
    this.modelButtons = [...this.picker.querySelectorAll('[data-anatomy-model]')].map(button => {
      const kind = button.dataset.anatomyModel;
      button.addEventListener('click', () => onSwitch(kind));
      return { kind, button, preview: new ModelPreview(button.querySelector('canvas')) };
    });
  }
  setModel(kind, model) { this.models[kind] = model; this.errors.delete(kind); this.refresh(); }
  setModelError(kind) { this.errors.add(kind); this.refresh(); }
  setKind(kind) {
    this.kind = kind; this.selected = MODELS[kind].initial;
    this.refresh();
  }
  canSelect(name) { return this.parts?.some(part => part.name === name) ?? false; }
  refresh() {
    this.parts = getAvailableAnatomyParts(this.models[this.kind], MODELS[this.kind].parts);
    if (!this.canSelect(this.selected)) this.selected = this.canSelect(MODELS[this.kind].initial)
      ? MODELS[this.kind].initial : this.parts[0]?.name ?? null;
    const list = document.querySelector('#structure-list'); list.replaceChildren();
    this.parts.forEach(part => {
      const item = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.dataset.structure = part.name;
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.backgroundColor = part.color;
      button.append(dot, document.createTextNode(part.name));
      button.addEventListener('click', () => this.onSelect(part.name));
      item.append(button); list.append(item);
    });
    this.modelButtons.forEach(({ kind, button, preview }) => {
      const { label } = MODELS[kind];
      button.hidden = kind === this.kind;
      button.disabled = !this.models[kind];
      button.setAttribute('aria-label', 'Abrir ' + label.toLowerCase());
      button.querySelector('.model-switch-name').textContent = this.errors.has(kind) ? label + ' no disponible' : button.disabled ? 'Cargando ' + label.toLowerCase() + '…' : label;
      button.title = this.errors.has(kind) ? 'Recarga la página para reintentar la carga.' : '';
      // La miniatura muestra las piezas sin atenuación, incluso tras ocultarlas.
      preview.setModel(this.models[kind]);
    });
    document.querySelector('#anatomy-details').hidden = !this.parts.length;
    document.querySelector('#anatomy-list-section').hidden = !this.parts.length;
    if (!this.parts.length) {
      this.partPreview.setModel(null);
      document.querySelector('#structure-title').textContent = MODELS[this.kind].label;
    } else if (!this.picker.hidden) this.select(this.selected);
  }
  select(name) {
    if (!this.canSelect(name)) return false;
    this.selected = name;
    const part = this.parts?.find(part => part.name === name);
    document.querySelector('#structure-title').textContent = name;
    document.querySelector('#structure-desc').textContent = part?.description ?? 'Región del modelo seleccionada.';
    document.querySelector('#structure-function').textContent = part?.function ?? 'Selecciona una estructura identificada para consultar su función.';
    const available = this.partPreview.setModel(this.models[this.kind], name);
    const empty = document.querySelector('#structure-preview-empty');
    empty.hidden = available;
    empty.textContent = this.models[this.kind] ? 'Esta región no está separada en el modelo actual.' : 'Cargando vista previa…';
    this.partPreview.canvas.setAttribute('aria-label', 'Vista aislada de ' + name.toLowerCase());
    document.querySelectorAll('[data-structure]').forEach(button => {
      const selected = button.dataset.structure === name;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    return true;
  }
  setActive(active) { this.picker.hidden = !active; if (active) this.select(this.selected); }
  update() {
    if (!this.picker.hidden) {
      this.partPreview.update();
      this.modelButtons.forEach(({ button, preview }) => { if (!button.hidden) preview.update(); });
    }
  }
}
