import * as THREE from './vendor/three.module.js';
import { BloodStream, createFluid } from './simulation.js';

export const KIDNEY_MODES = Object.freeze({
  normal: Object.freeze({ label: 'Normal', description: 'La glucosa pasa a las nefronas. La salida de orina no contiene partículas naranjas.' }),
  glucosuria: Object.freeze({ label: 'Glucosuria', description: 'La glucosa no reabsorbida recorre los cálices y la pelvis renal y sale por el uréter.' })
});

// Measured polylines preserve the vessel centerlines at bends and bifurcations.
// Display millimetres match the existing blood renderer; the enclosing group
// scales them back to the units of the textured kidney.
export class KidneyPath extends THREE.Curve {
  constructor(points, radii = [], clearances = []) {
    super();
    this.points = points.map(p => new THREE.Vector3(...p).multiplyScalar(1000));
    this.radii = radii.map(r => r * 1000);
    this.clearances = clearances.map(r => r * 1000);
    this.distances = [0];
    for (let i = 1; i < this.points.length; i++) {
      this.distances.push(this.distances[i - 1] + this.points[i].distanceTo(this.points[i - 1]));
    }
    this.length = this.distances.at(-1);
    if (!(this.length > 0)) throw new Error('Recorrido renal vacío.');
  }
  segmentAt(t) {
    const d = THREE.MathUtils.clamp(t, 0, 1) * this.length;
    let lo = 0, hi = this.points.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (this.distances[mid] <= d) lo = mid; else hi = mid;
    }
    return [lo, (d - this.distances[lo]) / Math.max(this.distances[lo + 1] - this.distances[lo], 1e-9)];
  }
  getPoint(t, target = new THREE.Vector3()) {
    const [i, f] = this.segmentAt(t);
    return target.copy(this.points[i]).lerp(this.points[i + 1], f);
  }
  getPointAt(t, target) { return this.getPoint(t, target); }
  getUtoTmapping(u) { return u; }
  getTangent(t, target = new THREE.Vector3()) {
    const [i] = this.segmentAt(t);
    return target.subVectors(this.points[i + 1], this.points[i]).normalize();
  }
  getTangentAt(t, target) { return this.getTangent(t, target); }
  radiusAt(t) {
    const [i, f] = this.segmentAt(t);
    return this.radii.length ? THREE.MathUtils.lerp(this.radii[i], this.radii[i + 1], f) : 5;
  }
  clearanceAt(t) {
    const [i, f] = this.segmentAt(t);
    return this.clearances.length ? THREE.MathUtils.lerp(this.clearances[i], this.clearances[i + 1], f) : 8;
  }
}

export class KidneyJourneySimulation {
  constructor(parent, data) {
    this.group = new THREE.Group();
    this.group.name = 'Recorrido renal';
    this.group.scale.setScalar(.001);
    parent.add(this.group);
    this.speed = 150;
    this.spawnInterval = .9;
    this.mode = 'normal';
    this.vascularGroup = new THREE.Group();
    this.group.add(this.vascularGroup);
    // Incoming glucose never shares a return path. Both blood trees follow
    // measured vessel segments; no interpolated bridge joins artery and vein.
    this.glucosePaths = data.glucoseRoutes.map(route => new KidneyPath(route.points, route.radii, route.clearances));
    this.handoffContactTime = Math.min(...this.glucosePaths.map((path, i) =>
      i * this.spawnInterval + path.length / this.speed));
    const makeStream = (route, delay, kind) => {
      const path = new KidneyPath(route.points, route.radii, route.clearances);
      const stream = new BloodStream(path, {
        cellRadiusAt: u => Math.min(2.5, path.clearanceAt(u) * .7), lateralOffset: 0,
        oneWay: true, cellSpacing: 36
      });
      stream.group.name = kind;
      stream.cells.material.opacity = .9;
      this.vascularGroup.add(stream.group);
      return { path, stream, delay, kind };
    };
    // Route offsets use the GLB's model units; speed and KidneyPath lengths use
    // display millimetres. All daughter streams wait for the incoming front.
    this.arterialStreams = data.arterialSegments.map(route =>
      makeStream(route, route.startDistance * 1000 / this.speed, 'Sangre: entrada arterial'));
    this.venousStreams = data.venousSegments.map(route =>
      makeStream(route, this.handoffContactTime + 1.5 + route.distanceFromLeafFront * 1000 / this.speed,
        'Sangre: retorno venoso, sin partículas naranjas'));
    this.bloodStreams = [...this.arterialStreams, ...this.venousStreams];
    this.drainage = data.drainage.map(route => {
      const path = new KidneyPath(route.points, route.radii);
      const fluid = createFluid(path, '#49c5c4', undefined, 100);
      fluid.name = 'Orina: cálices → pelvis → uréter';
      this.group.add(fluid);
      return { path, fluid };
    });
    this.urineDelay = this.handoffContactTime + 3;
    this.nephronTransitDuration = 3;
    this.urinarySpeed = 100;
    this.urinaryGlucosePaths = (data.urinaryGlucoseRoutes ?? []).map(route =>
      new KidneyPath(route.points, route.radii, route.clearances));
    // The microscopic nephron is opened separately. Its outgoing glucose starts
    // at a real calyx mouth after that interval; no curve joins blood and urine.
    this.urinaryPathByBranch = this.glucosePaths.map(arterial => {
      const end = arterial.getPoint(1);
      let selected = -1, gap = Infinity;
      this.urinaryGlucosePaths.forEach((path, i) => {
        const distance = end.distanceToSquared(path.getPoint(0));
        if (distance < gap) { gap = distance; selected = i; }
      });
      return selected;
    });
    this.capacity = Math.ceil(Math.max(...this.glucosePaths.map(path => path.length / this.speed)) / this.spawnInterval) + 10;
    this.glucose = new THREE.InstancedMesh(new THREE.SphereGeometry(5, 12, 9),
      new THREE.MeshStandardMaterial({ color: '#ffad35', emissive: '#d66c04', emissiveIntensity: .8,
        roughness: .35, transparent: true, depthWrite: false }), this.capacity);
    this.glucose.name = 'Glucosa: solo ramas de entrada, hasta el enlace con la nefrona';
    this.glucose.renderOrder = 5;
    this.glucose.frustumCulled = false;
    this.glucose.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.vascularGroup.add(this.glucose);
    this.urinaryCapacity = Math.ceil((Math.max(...this.glucosePaths.map(path => path.length / this.speed))
      + this.nephronTransitDuration + Math.max(0, ...this.urinaryGlucosePaths.map(path => path.length / this.urinarySpeed)))
      / this.spawnInterval) + 10;
    this.urinaryGlucose = new THREE.InstancedMesh(this.glucose.geometry, this.glucose.material, this.urinaryCapacity);
    this.urinaryGlucose.name = 'Glucosuria: glucosa en la orina → cálices → pelvis → uréter';
    this.urinaryGlucose.renderOrder = 6;
    this.urinaryGlucose.frustumCulled = false;
    this.urinaryGlucose.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.urinaryGlucose);
    this.urine = new THREE.InstancedMesh(new THREE.SphereGeometry(3.6, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#4ad1d0', emissive: '#168585', emissiveIntensity: .45,
        transparent: true, depthWrite: false }), 160);
    this.urine.name = 'Orina: sin partículas de glucosa';
    this.urine.renderOrder = 4;
    this.urine.frustumCulled = false;
    this.group.add(this.urine);
    this.dummy = new THREE.Object3D();
    this.group.traverse(node => { if (node.isMesh) node.raycast = () => {}; });
    this.reset();
  }
  setMode(mode) {
    if (!Object.hasOwn(KIDNEY_MODES, mode)) throw new Error('Estado renal desconocido: ' + mode);
    if (mode === 'glucosuria' && !this.urinaryGlucosePaths.length) throw new Error('Falta el recorrido urinario de glucosa.');
    this.mode = mode;
    this.reset();
  }
  reset() {
    this.elapsed = 0;
    this.draw();
  }
  update(dt) {
    this.elapsed += Math.max(0, dt);
    this.draw();
  }
  draw() {
    for (const blood of this.bloodStreams) blood.stream.update(Math.max(0, this.elapsed - blood.delay), this.speed);
    this.handoffComplete = this.elapsed >= this.handoffContactTime;
    this.visibleGlucose = [];
    const serial = Math.floor(this.elapsed / this.spawnInterval);
    let count = 0;
    for (let id = Math.max(0, serial - this.capacity); id <= serial; id++) {
      const branch = id % this.glucosePaths.length;
      const path = this.glucosePaths[branch];
      const age = this.elapsed - id * this.spawnInterval;
      const distance = age * this.speed;
      if (distance >= path.length) continue;
      const point = path.getPoint(distance / path.length);
      this.dummy.position.copy(point);
      const radius = Math.min(5, path.clearanceAt(distance / path.length) * .75);
      this.dummy.scale.setScalar(radius / 5 * (1 - THREE.MathUtils.smoothstep(distance,
        Math.max(0, path.length - 50), path.length)));
      this.dummy.updateMatrix();
      this.glucose.setMatrixAt(count++, this.dummy.matrix);
      this.visibleGlucose.push({ id, branch, distance, radius, stage: 'arterial', point: point.clone() });
    }
    this.glucose.count = count;
    this.glucose.instanceMatrix.needsUpdate = true;
    this.dummy.scale.setScalar(1);
    const urineElapsed = Math.max(0, this.elapsed - this.urineDelay);
    count = 0;
    for (const { path, fluid } of this.drainage) {
      const front = urineElapsed * 100;
      fluid.material.uniforms.uTime.value = urineElapsed;
      fluid.material.uniforms.uFront.value = Math.min(front, path.length + 2);
      const maxVisible = Math.min(front, path.length), phase = front % 100;
      for (let d = phase; maxVisible > 0 && d <= maxVisible; d += 100) {
        this.dummy.position.copy(path.getPoint(d / path.length));
        this.dummy.updateMatrix();
        if (count < this.urine.instanceMatrix.count) this.urine.setMatrixAt(count++, this.dummy.matrix);
      }
    }
    this.urine.count = count;
    this.urine.instanceMatrix.needsUpdate = true;
    this.drawUrinaryGlucose();
  }
  drawUrinaryGlucose() {
    this.visibleUrinaryGlucose = [];
    this.urinaryGlucose.visible = this.mode === 'glucosuria';
    let count = 0;
    if (this.mode === 'glucosuria') {
      const serial = Math.floor(this.elapsed / this.spawnInterval);
      for (let id = Math.max(0, serial - this.urinaryCapacity); id <= serial; id++) {
        // Same visual allocation as the nephron's glucosuria scenario. The
        // number of particles is illustrative, not a clinical excretion rate.
        if ((id * 7) % 20 < 9) continue;
        const branch = id % this.glucosePaths.length;
        const urinaryBranch = this.urinaryPathByBranch[branch];
        const path = this.urinaryGlucosePaths[urinaryBranch];
        const age = this.elapsed - id * this.spawnInterval
          - this.glucosePaths[branch].length / this.speed - this.nephronTransitDuration;
        const distance = age * this.urinarySpeed;
        if (age < 0 || distance >= path.length) continue;
        const t = distance / path.length, point = path.getPoint(t);
        const radius = Math.min(5, path.clearanceAt(t) * .75);
        const fade = THREE.MathUtils.smoothstep(distance, 0, 25)
          * (1 - THREE.MathUtils.smoothstep(distance, Math.max(0, path.length - 25), path.length));
        this.dummy.position.copy(point);
        this.dummy.scale.setScalar(radius / 5 * fade);
        this.dummy.updateMatrix();
        this.urinaryGlucose.setMatrixAt(count++, this.dummy.matrix);
        this.visibleUrinaryGlucose.push({ id, branch, urinaryBranch, distance, radius,
          stage: 'urinary', point: point.clone() });
      }
    }
    this.urinaryGlucose.count = count;
    this.urinaryGlucose.instanceMatrix.needsUpdate = true;
    this.dummy.scale.setScalar(1);
  }
}

export class KidneyJourney {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'Riñón en corte · recorrido';
    // Face the open half towards the initial camera, rather than its outer wall.
    this.root.rotation.y = -Math.PI / 2;
    this.root.visible = false;
    scene.add(this.root);
    this.materials = [];
    this.opacity = .2;
    this.vesselsVisible = true;
  }
  setModel(source, data, urinaryData) {
    if (this.anatomy) return;
    const visual = source.clone(false);
    visual.visible = true;
    visual.name = 'Riñón: geometría de referencia';
    this.root.add(visual);
    this.anatomy = new THREE.Group();
    visual.add(this.anatomy);
    for (const part of source.children.filter(part => part.userData.variant === 'corte')) {
      const copy = part.clone(true);
      copy.visible = true;
      const vascular = part.name.startsWith('arteria_') || part.name.startsWith('vena_');
      copy.userData.vascular = vascular;
      copy.traverse(node => {
        if (!node.isMesh) return;
        node.visible = true;
        const prepare = original => {
          const material = original.clone();
          material.visible = true;
          material.vertexColors = false;
          material.depthWrite = false;
          material.transparent = true;
          material.userData = {};
          this.materials.push(material);
          return material;
        };
        node.material = Array.isArray(node.material) ? node.material.map(prepare) : prepare(node.material);
      });
      this.anatomy.add(copy);
    }
    this.simulation = new KidneyJourneySimulation(visual, { ...data,
      urinaryGlucoseRoutes: urinaryData?.routes ?? [] });
    this.setOpacity(this.opacity);
    this.setVessels(this.vesselsVisible);
    this.root.updateMatrixWorld(true);
  }
  setOpacity(value) {
    this.opacity = value;
    for (const material of this.materials) material.opacity = value;
  }
  setVessels(visible) {
    this.vesselsVisible = visible;
    this.anatomy?.children.forEach(part => { if (part.userData.vascular) part.visible = visible; });
    if (this.simulation) this.simulation.vascularGroup.visible = visible;
  }
}
