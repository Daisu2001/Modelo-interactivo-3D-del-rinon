import * as THREE from 'three';
import { NormalSimulation, MODES } from './simulation.js';

// The measured routes and the anatomy share the exact transform from the
// standalone simulation. Scale the whole group to the Atlas model's units.
export class GlucoseModule {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'Recorrido de la glucosa';
    this.root.scale.setScalar(0.001);
    this.root.visible = false;
    scene.add(this.root);
    this.mode = 'low';
    this.paused = false;
    this.active = false;
    this.wall = new THREE.MeshStandardMaterial({ color: 0xc6b696, roughness: .55,
      transparent: true, opacity: .2, side: THREE.DoubleSide, depthWrite: false });
    this.vascular = new THREE.MeshStandardMaterial({ color: 0xbd4c64, roughness: .5,
      transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false });
    this.tuft = new THREE.MeshStandardMaterial({ color: 0xcb5168, roughness: .65,
      transparent: true, opacity: .52, side: THREE.DoubleSide, depthWrite: false });
    this.anatomy = new THREE.Group();
    this.root.add(this.anatomy);
    this.bindControls();
    this.refresh();
  }

  async load(loader) {
    const readJSON = async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
      return response.json();
    };
    const [gltf, routes, groups] = await Promise.all([
      loader.loadAsync('./Models/nefrona%20(1).glb'),
      readJSON('./routes.json'), readJSON('./mesh-groups.json')
    ]);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      const geometry = node.geometry.clone();
      geometry.clearGroups();
      for (const [start, count, index] of groups) geometry.addGroup(start, count, index);
      const mesh = new THREE.Mesh(geometry, [this.wall, this.vascular, this.tuft]);
      mesh.scale.setScalar(1000);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.z = 16.93821;
      mesh.renderOrder = 1;
      this.anatomy.add(mesh);
    });
    this.simulation = new NormalSimulation(this.root, routes);
    this.simulation.setMode(this.mode);
    // Procedural particles and fluid are visual layers, not selectable anatomy.
    this.simulation.group.traverse(node => { if (node.isMesh) node.raycast = () => {}; });
    this.setVessels(document.querySelector('#vessels').checked);
    this.refresh();
    return this.root;
  }

  bindControls() {
    document.querySelectorAll('.mode-buttons button').forEach(button => {
      button.addEventListener('click', () => {
        this.mode = button.dataset.mode;
        this.simulation?.setMode(this.mode);
        this.refresh();
      });
    });
    document.querySelector('#pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.refresh();
    });
    document.querySelector('#restart').addEventListener('click', () => {
      this.simulation?.reset();
      this.refresh();
    });
    document.querySelector('#opacity').addEventListener('input', event => {
      this.wall.opacity = Number(event.target.value);
      this.vascular.opacity = Math.min(.8, this.wall.opacity * 1.15 + .12);
      this.tuft.opacity = Math.min(.85, this.wall.opacity + .32);
      document.querySelector('#opacity-value').textContent = Math.round(this.wall.opacity * 100) + '%';
    });
    document.querySelector('#vessels').addEventListener('change', event => this.setVessels(event.target.checked));
  }

  setVessels(visible) {
    this.vascular.visible = this.tuft.visible = visible;
    if (this.simulation) this.simulation.vascularGroup.visible = visible;
  }

  setActive(active) {
    this.active = active;
    this.root.visible = active;
    this.refresh();
  }

  update(dt) {
    if (this.active && this.simulation && !this.paused) this.simulation.update(dt);
    if (this.active) this.refreshStats();
  }

  refreshStats() {
    const stats = this.simulation?.stats ?? { filtered: 0, absorbed: 0, collectorGlucose: 0, processStage: 0 };
    document.querySelector('#filtered').textContent = stats.filtered;
    document.querySelector('#absorbed').textContent = stats.absorbed;
    document.querySelector('#collector').textContent = stats.collectorGlucose;
    document.querySelectorAll('.glucose-step').forEach((step, i) => {
      const active = i === stats.processStage;
      step.classList.toggle('active', active);
      if (active) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
  }

  refresh() {
    const profile = MODES[this.mode];
    document.querySelector('#flow-title').textContent = profile.label;
    document.querySelector('#flow-description').textContent = profile.description;
    document.querySelectorAll('.mode-buttons button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === this.mode));
    });
    document.querySelector('#pause').textContent = this.paused ? 'Continuar' : 'Pausar';
    document.querySelector('#pause-notice').hidden = !this.active || !this.paused;
    document.querySelector('#step3-description').textContent = this.mode === 'glucosuria'
      ? 'La glucosa no reabsorbida continúa por el asa, el túbulo distal y el colector.'
      : 'El filtrado continúa; en este estado, toda la glucosa se reabsorbe antes del colector.';
    this.refreshStats();
  }
}
