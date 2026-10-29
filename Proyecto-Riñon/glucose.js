import { setControlLabel } from './icons.js';
import * as THREE from 'three';
import { MODES } from './simulation.js';
import { Nephron85Simulation } from './nephron85-simulation.js';
import { prepareNephron85Mesh, setNephron85Opacity, NEPHRON85_ASSET_SCALE } from './nephron85-structures.js';
import { KidneyJourney, KIDNEY_MODES } from './kidney-journey.js';
import { ModelPreview } from './anatomy-browser.js';

export class GlucoseModule {
  constructor(scene) {
    this.view = 'kidney';
    this.mode = 'low';
    this.kidneyMode = 'normal';
    this.active = false;
    this.ready = false;
    this.pauseStates = { kidney: false, nephron: false };
    this.opacityValues = { kidney: .2, nephron: .2 };
    this.vesselStates = { kidney: true, nephron: true };
    this.kidneyJourney = new KidneyJourney(scene);
    this.nephronRoot = new THREE.Group();
    this.nephronRoot.name = 'Recorrido de la glucosa · nefrona';
    this.nephronRoot.scale.setScalar(.001);
    this.nephronRoot.visible = false;
    scene.add(this.nephronRoot);
    this.nephronMaterials = [];
    this.nephronAnatomy = new THREE.Group();
    this.nephronRoot.add(this.nephronAnatomy);
    this.picker = document.querySelector('#glucose-model-picker');
    this.modelButtons = [...this.picker.querySelectorAll('[data-glucose-model]')].map(button => {
      button.addEventListener('click', () => this.setView(button.dataset.glucoseModel));
      return { view: button.dataset.glucoseModel, button, preview: new ModelPreview(button.querySelector('canvas')) };
    });
    this.bindControls();
    this.refresh();
  }
  get root() { return this.view === 'kidney' ? this.kidneyJourney.root : this.nephronRoot; }
  get anatomy() { return this.view === 'kidney' ? this.kidneyJourney.anatomy : this.nephronAnatomy; }
  get paused() { return this.pauseStates[this.view]; }
  set paused(value) { this.pauseStates[this.view] = value; }
  get currentSimulation() { return this.view === 'kidney' ? this.kidneyJourney.simulation : this.simulation; }

  async load(loader, kidneySource) {
    const readJSON = async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
      return response.json();
    };
    const [gltf, routes, regions, kidney, kidneyRoutes, urinaryRoutes] = await Promise.all([
      loader.loadAsync('./Models/Nefrona_85.glb'),
      readJSON('./nephron85-routes.json'), readJSON('./nephron85-regions.json'), kidneySource,
      readJSON('./kidney-routes.json'), readJSON('./kidney-urinary-routes.json')
    ]);
    if (!kidney) throw new Error('El modelo renal no está disponible.');
    this.kidneyJourney.setModel(kidney, kidneyRoutes, urinaryRoutes);
    this.kidneyJourney.simulation.setMode(this.kidneyMode);
    gltf.scene.traverse(node => {
      if (!node.isMesh) return;
      const mesh = new THREE.Mesh(node.geometry, node.material);
      this.nephronMaterials.push(...prepareNephron85Mesh(mesh, regions, { simulation: true }));
      mesh.scale.setScalar(1000 / NEPHRON85_ASSET_SCALE);
      mesh.position.z = 16.93821;
      this.nephronAnatomy.add(mesh);
    });
    this.simulation = new Nephron85Simulation(this.nephronRoot, routes);
    this.simulation.setMode(this.mode);
    this.simulation.group.traverse(node => { if (node.isMesh) node.raycast = () => {}; });
    this.ready = true;
    for (const { view, preview } of this.modelButtons) {
      preview.setModel(view === 'kidney' ? this.kidneyJourney.anatomy : this.nephronAnatomy);
    }
    this.applyVisibility();
    this.refresh();
    return this.root;
  }

  bindControls() {
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.addEventListener('click', () => {
        if (this.view !== 'nephron') return;
        this.mode = button.dataset.mode;
        this.simulation?.setMode(this.mode);
        this.refresh();
      });
    });
    document.querySelectorAll('[data-kidney-mode]').forEach(button => {
      button.addEventListener('click', () => this.setKidneyMode(button.dataset.kidneyMode));
    });
    document.querySelector('#pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.refresh();
    });
    document.querySelector('#restart').addEventListener('click', () => {
      this.currentSimulation?.reset();
      this.refresh();
    });
    document.querySelector('#opacity').addEventListener('input', event => {
      const value = Number(event.target.value);
      this.opacityValues[this.view] = value;
      if (this.view === 'kidney') this.kidneyJourney.setOpacity(value);
      else {
        setNephron85Opacity(this.nephronMaterials, value);
      }
      document.querySelector('#opacity-value').textContent = Math.round(value * 100) + '%';
    });
    document.querySelector('#vessels').addEventListener('change', event => this.setVessels(event.target.checked));
  }
  setVessels(visible) {
    this.vesselStates[this.view] = visible;
    if (this.view === 'kidney') this.kidneyJourney.setVessels(visible);
    else {
      this.nephronMaterials.forEach(material => { if (material.userData.vascular) material.visible = visible; });
      if (this.simulation) this.simulation.vascularGroup.visible = visible;
    }
  }
  setKidneyMode(mode) {
    if (this.view !== 'kidney' || !Object.hasOwn(KIDNEY_MODES, mode) || mode === this.kidneyMode) return;
    this.kidneyMode = mode;
    this.kidneyJourney.simulation?.setMode(mode);
    this.refresh();
  }
  setView(view) {
    if (!this.ready || !['kidney', 'nephron'].includes(view) || view === this.view) return;
    this.view = view;
    this.currentSimulation.reset();
    this.applyVisibility();
    this.refresh();
    document.dispatchEvent(new CustomEvent('glucose-view-change', { detail: { view } }));
  }
  applyVisibility() {
    this.kidneyJourney.root.visible = this.active && this.view === 'kidney';
    this.nephronRoot.visible = this.active && this.view === 'nephron';
  }
  setActive(active) {
    this.active = active;
    this.applyVisibility();
    this.refresh();
  }
  update(dt) {
    if (!this.active) return;
    if (!this.paused) this.currentSimulation?.update(dt);
    if (this.view === 'nephron') this.refreshStats();
    this.refreshHandoff();
    for (const { button, preview } of this.modelButtons) if (!button.hidden) preview.update();
  }
  refreshHandoff() {
    const complete = this.active && this.view === 'kidney' && this.kidneyJourney.simulation?.handoffComplete === true;
    document.querySelector('#nephron-handoff-notice').hidden = !complete;
    this.picker.classList.toggle('handoff-ready', complete);
  }
  refreshStats() {
    const stats = this.simulation?.stats ?? { filtered: 0, absorbed: 0, collectorGlucose: 0, processStage: 0 };
    document.querySelector('#filtered').textContent = stats.filtered;
    document.querySelector('#absorbed').textContent = stats.absorbed;
    document.querySelector('#nephron-unfiltered').textContent = stats.unfiltered ?? 0;
    document.querySelector('#collector').textContent = stats.collectorGlucose;
    document.querySelectorAll('.glucose-step').forEach((step, i) => {
      const active = i === stats.processStage;
      step.classList.toggle('active', active);
      if (active) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
    });
  }
  refresh() {
    const kidney = this.view === 'kidney', profile = MODES[this.mode];
    document.querySelector('#kidney-journey-info').hidden = !kidney;
    document.querySelector('#nephron-journey-info').hidden = kidney;
    document.querySelector('#glucose-return-legend').hidden = kidney;
    document.querySelector('#nephron-mode-controls').hidden = kidney;
    document.querySelector('#kidney-mode-controls').hidden = !kidney;
    document.querySelector('#kidney-flow-title').textContent = KIDNEY_MODES[this.kidneyMode].label;
    document.querySelector('#kidney-flow-description').textContent = KIDNEY_MODES[this.kidneyMode].description;
    document.querySelector('#flow-title').textContent = profile.label;
    document.querySelector('#flow-description').textContent = profile.description;
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.mode === this.mode));
    });
    document.querySelectorAll('[data-kidney-mode]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.kidneyMode === this.kidneyMode));
      button.disabled = !this.ready;
    });
    document.querySelector('#opacity').value = this.opacityValues[this.view];
    document.querySelector('#opacity-value').textContent = Math.round(this.opacityValues[this.view] * 100) + '%';
    document.querySelector('#vessels').checked = this.vesselStates[this.view];
    setControlLabel(document.querySelector('#pause'), this.paused ? 'play' : 'pause', this.paused ? 'Continuar' : 'Pausar');
    document.querySelector('#pause-notice').hidden = !this.active || !this.paused;
    document.querySelector('#glucose-simulation-note').textContent = kidney
      ? this.kidneyMode === 'glucosuria'
        ? 'La glucosa que no se reabsorbe continúa con la orina por los cálices, la pelvis renal y el uréter. Selecciona la nefrona para observar el proceso en detalle.'
        : 'Las partículas naranjas desaparecen en las ramas de entrada próximas a los cálices para continuar en la nefrona. El retorno venoso se representa solo con sangre roja. Ocultar las partículas indica un cambio de escala; no significa que la sangre venosa carezca de glucosa.'
      : 'Las partículas naranjas son glucosa. Parte se filtra y parte continúa en sangre. El enlace de reabsorción y el reparto de partículas son esquemáticos.';
    document.querySelector('#step3-description').textContent = this.mode === 'glucosuria'
      ? 'La glucosa no reabsorbida continúa por el asa, el túbulo distal y el colector.'
      : 'El filtrado continúa; en este estado, toda la glucosa se reabsorbe antes del colector.';
    this.picker.hidden = !this.active;
    for (const { view, button } of this.modelButtons) {
      button.hidden = view === this.view;
      button.disabled = !this.ready;
    }
    this.refreshStats();
    this.refreshHandoff();
  }
}
