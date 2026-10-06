import * as THREE from './vendor/three.module.js';
import { GlomerulusSimulation } from './glomerulus-simulation.js';
import { calculateRenalState } from './renal-physiology.js';

import { prepareGlomerulusMesh } from './glomerulus-structures.js';

export class FiltrationModule {
  constructor(scene) {
    this.root = new THREE.Group(); this.root.name = 'Glomérulo: filtración'; this.root.scale.setScalar(.18);
    this.root.visible = false; scene.add(this.root);
    this.active = false; this.paused = false; this.state = calculateRenalState(); this.materials = [];
    document.querySelector('#filtration-pause').addEventListener('click', () => {
      this.paused = !this.paused; this.refresh();
    });
    document.querySelector('#filtration-restart').addEventListener('click', () => {
      this.simulation?.reset(); this.refresh();
    });
    document.querySelector('#glomerulus-opacity').addEventListener('input', event => {
      const multiplier = Number(event.target.value) / .2;
      for (const material of this.materials) material.opacity = Math.min(.85, material.userData.baseOpacity * multiplier);
      document.querySelector('#glomerulus-opacity-value').textContent = Math.round(Number(event.target.value) * 100) + '%';
    });
    this.refresh();
  }
  async load(loader) {
    const [gltf, response] = await Promise.all([
      loader.loadAsync('./Models/Glomerulo.glb'), fetch('./glomerulus-routes.json')
    ]);
    if (!response.ok) throw new Error('No se pudieron cargar las rutas del glomérulo');
    const routes = await response.json();
    this.anatomy = gltf.scene;
    this.anatomy.traverse(node => { if (node.isMesh) prepareGlomerulusMesh(node, this.materials); });
    const multiplier = Number(document.querySelector('#glomerulus-opacity').value) / .2;
    for (const material of this.materials) material.opacity = Math.min(.85, material.userData.baseOpacity * multiplier);
    this.root.add(this.anatomy);
    this.simulation = new GlomerulusSimulation(this.root, routes);
    this.simulation.setState(this.state); this.refresh();
    return this.root;
  }
  setState(state) { this.state = state; this.simulation?.setState(state); this.refresh(); }
  setActive(active) { this.active = active; this.root.visible = active; this.refresh(); }
  update(dt) {
    if (!this.active || !this.simulation) return;
    if (!this.paused) this.simulation.update(dt);
    this.refreshStats();
  }
  refreshStats() {
    const stats = this.simulation?.stats ?? { filtered: 0, absorbed: 0, continued: 0 };
    for (const key of ['filtered', 'absorbed', 'continued']) document.querySelector('#glomerulus-' + key).textContent = stats[key];
  }
  refresh() {
    document.querySelector('#filtration-flow-state').textContent = this.state.filtrationState;
    document.querySelector('#filtration-glucose-state').textContent = this.state.glucoseState;
    document.querySelector('#filtration-active-tfg').textContent = this.state.tfg.toFixed(1) + ' mL/min';
    document.querySelector('#filtration-source').textContent = this.state.linkStarling ? 'TFG de Starling' : 'TFG manual';
    document.querySelector('#filtration-fraction').textContent = this.state.filtered > 0
      ? (100 * this.state.reabsorptionFraction).toFixed(1) + '% reabsorbida · ' +
        (100 * this.state.fractionExcreted).toFixed(1) + '% continúa'
      : 'Sin paso de glucosa al filtrado';
    document.querySelector('#filtration-pause').textContent = this.paused ? 'Continuar' : 'Pausar';
    document.querySelector('#filtration-pause-notice').hidden = !this.active || !this.paused;
    document.querySelector('#filtration-legend').hidden = !this.active;
    this.refreshStats();
  }
}
