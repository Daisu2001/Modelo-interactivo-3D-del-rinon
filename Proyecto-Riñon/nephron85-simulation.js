import * as THREE from './vendor/three.module.js';
import { MeasuredPath, BloodStream, createFluid, CONFIG, MODES } from './simulation.js';

export const NEPHRON85_MODES = Object.freeze(Object.fromEntries(Object.entries(MODES).map(([key, profile]) =>
  [key, Object.freeze({ ...profile, spawnInterval: key === 'low' ? 1.2 : .4, visualFiltrationFraction: .6 })])));

const clamp = THREE.MathUtils.clamp;
const join = (...routes) => ({ points: routes.flatMap((r, i) => i ? r.points.slice(1) : r.points),
  radii: routes.flatMap((r, i) => i ? r.radii.slice(1) : r.radii) });
const measured = r => new MeasuredPath(r.points, r.radii);
const local = p => [p.x / 1000, p.z / 1000 - .01693821, -p.y / 1000];

export class Nephron85Simulation {
  constructor(parent, data) {
    this.data = data; this.group = new THREE.Group(); this.group.name = 'Nefrona 85% · glucosa'; parent.add(this.group);
    this.vascularGroup = new THREE.Group(); this.group.add(this.vascularGroup);
    this.tubule = measured(data.tubule); this.filtration = measured(data.filtration);
    const firstHalf = { points: data.glomerulus.points.slice(0, data.glomerulus.filterIndex + 1),
      radii: data.glomerulus.radii.slice(0, data.glomerulus.filterIndex + 1) };
    this.blood = measured(join(data.blood, firstHalf));
    this.bloodCircuit = measured(join(data.blood, data.glomerulus));
    this.outlets = data.bloodOutlets.map(measured);
    this.reabsorptionStart = data.reabsorption.startDistance * 1000;
    this.reabsorptionEnd = data.reabsorption.endDistance * 1000;
    this.proximalEnd = data.tubule.segments.find(s => s.name === 'proximal').end * 1000;
    this.collectorStart = data.tubule.segments.find(s => s.name === 'colector').start * 1000;
    this.returnJoinDistances = this.outlets.map(path => path.length * data.reabsorption.outletJoinFraction);
    this.returns = this.outlets.map((path, i) => {
      const start = this.tubule.getPoint(this.reabsorptionEnd / this.tubule.length);
      const end = path.getPoint(this.returnJoinDistances[i] / path.length);
      const tangent = path.getTangent(this.returnJoinDistances[i] / path.length);
      const c1 = start.clone().add(new THREE.Vector3((end.x - start.x) * .25, -30, 14));
      const c2 = end.clone().addScaledVector(tangent, -18);
      const curve = new THREE.CubicBezierCurve3(start, c1, c2, end);
      return new MeasuredPath(curve.getPoints(64).map(local), Array(65).fill(.001));
    });
    const stream = path => new BloodStream(path, { oneWay: true, lateralOffset: 0,
      cellRadiusAt: u => Math.min(CONFIG.bloodCellRadius, path.radiusAt(u) * .5) });
    this.bloodStream = stream(this.bloodCircuit);
    this.outletStreams = this.outlets.map(stream);
    for (const s of [this.bloodStream, ...this.outletStreams]) this.vascularGroup.add(s.group);
    this.fluids = [createFluid(this.tubule, '#60dace')]; this.group.add(this.fluids[0]);
    this.returnFluids = this.returns.map(path => {
      const mesh = createFluid(path, '#60dace', .45); this.group.add(mesh); return mesh;
    });
    this.glucose = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#ffae3c', emissive: '#ef6d09', emissiveIntensity: .8,
        roughness: .28, transparent: true, depthWrite: false }), CONFIG.maxParticles);
    this.glucose.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.glucose.frustumCulled = false;
    this.glucose.renderOrder = 4; this.glucose.raycast = () => {}; this.group.add(this.glucose);
    // The returning solute stays inside the same measured lumen. An unlit
    // overlay keeps its amber color legible through the translucent vessel.
    this.returnGlucose = new THREE.InstancedMesh(this.glucose.geometry,
      new THREE.MeshBasicMaterial({ color: '#bf5608', transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false }), CONFIG.maxParticles);
    this.returnGlucose.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.returnGlucose.frustumCulled = false;
    this.returnGlucose.renderOrder = 7; this.returnGlucose.raycast = () => {}; this.group.add(this.returnGlucose);
    this.returnCore = new THREE.InstancedMesh(this.glucose.geometry,
      new THREE.MeshBasicMaterial({ color: '#ffd36e', transparent: true, opacity: 1, depthTest: false, depthWrite: false, toneMapped: false }), CONFIG.maxParticles);
    this.returnCore.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.returnCore.frustumCulled = false;
    this.returnCore.renderOrder = 8; this.returnCore.raycast = () => {}; this.group.add(this.returnCore);
    this.dummy = new THREE.Object3D(); this.mode = 'low'; this.profile = NEPHRON85_MODES.low; this.reset();
  }
  setMode(mode) {
    if (!Object.hasOwn(NEPHRON85_MODES, mode)) throw new Error('Estado de simulación desconocido: ' + mode);
    this.mode = mode; this.profile = NEPHRON85_MODES[mode]; this.reset();
  }
  makeParticle(lifeAge = 0) {
    const id = this.serial++;
    // Independent allocations preserve the reabsorption fraction among filtered
    // particles. The split is illustrative, not a measured filtration rate.
    const willFilter = (id * 7) % 10 < this.profile.visualFiltrationFraction * 10;
    const filteredId = willFilter ? this.filteredSerial++ : -1;
    return { id, branch: id % this.outlets.length, lifeAge, stage: 'blood', distance: 0, transferAge: 0,
      willFilter, willReabsorb: willFilter && (this.profile.reabsorptionFraction === 1 || (filteredId * 7) % 20 < 9),
      countedFiltered: false, countedContinuing: false, countedCollector: false, countedReturning: false };
  }
  reset() {
    this.elapsed = 0; this.spawnClock = 0; this.serial = 0; this.filteredSerial = 0; this.filtered = 0; this.absorbed = 0; this.unfiltered = 0;
    this.collectorGlucose = 0; this.excreted = 0; this.continuingGlucose = 0; this.reabsorbedStarted = 0;
    this.bloodDuration = this.blood.length / this.profile.bloodSpeed;
    this.transferDuration = this.profile.filtrationSeconds;
    this.returnStartTimes = this.outlets.map(() => Infinity);
    this.particles = [this.makeParticle()]; this.updateFluids(); this.draw();
  }
  advanceParticle(p, dt) {
    p.lifeAge += dt;
    if (!p.willFilter) {
      const distance = p.lifeAge * this.profile.bloodSpeed;
      if (distance < this.bloodCircuit.length) { p.stage = 'blood'; p.distance = distance; }
      else {
        p.stage = 'unfiltered-blood'; p.distance = distance - this.bloodCircuit.length;
        if (p.distance >= this.outlets[p.branch].length) { p.stage = 'unfiltered'; this.unfiltered++; }
      }
      return;
    }
    if (p.lifeAge < this.bloodDuration) {
      p.stage = 'blood'; p.distance = p.lifeAge * this.profile.bloodSpeed; return;
    }
    const afterBlood = p.lifeAge - this.bloodDuration;
    if (afterBlood < this.transferDuration) { p.stage = 'filtration'; p.transferAge = afterBlood; return; }
    if (!p.countedFiltered) { p.countedFiltered = true; this.filtered++; }
    const tubularAge = afterBlood - this.transferDuration;
    p.distance = tubularAge * this.profile.tubularSpeed;
    if (p.willReabsorb && p.distance >= this.reabsorptionEnd) {
      if (!p.countedReturning) { p.countedReturning = true; this.reabsorbedStarted++; }
      const returnAge = tubularAge - this.reabsorptionEnd / this.profile.tubularSpeed;
      const capture = this.returns[p.branch], captureDuration = capture.length / this.profile.bloodSpeed;
      this.returnStartTimes[p.branch] = Math.min(this.returnStartTimes[p.branch], this.elapsed - returnAge);
      if (returnAge < captureDuration) {
        p.stage = 'reabsorbing'; p.distance = returnAge * this.profile.bloodSpeed;
      } else {
        p.stage = 'return-blood';
        p.distance = this.returnJoinDistances[p.branch] + (returnAge - captureDuration) * this.profile.bloodSpeed;
        if (p.distance >= this.outlets[p.branch].length) { p.stage = 'absorbed'; this.absorbed++; }
      }
      return;
    }
    p.stage = 'tubule';
    if (!p.willReabsorb) {
      if (p.distance >= this.reabsorptionEnd && !p.countedContinuing) { p.countedContinuing = true; this.continuingGlucose++; }
      if (p.distance >= this.collectorStart && !p.countedCollector) { p.countedCollector = true; this.collectorGlucose++; }
      if (p.distance >= this.tubule.length) { p.stage = 'excreted'; this.excreted++; }
    }
  }
  position(p) {
    if (p.stage === 'blood') {
      const path = p.willFilter ? this.blood : this.bloodCircuit;
      return path.getPoint(p.distance / path.length);
    }
    if (p.stage === 'filtration') return this.filtration.getPoint(clamp(p.transferAge / this.transferDuration, 0, 1));
    if (p.stage === 'reabsorbing') return this.returns[p.branch].getPoint(p.distance / this.returns[p.branch].length);
    if (p.stage === 'return-blood' || p.stage === 'unfiltered-blood') return this.outlets[p.branch].getPoint(p.distance / this.outlets[p.branch].length);
    return this.tubule.getPoint(p.distance / this.tubule.length);
  }
  particleRadius(p) {
    if (p.stage === 'blood') {
      const path = p.willFilter ? this.blood : this.bloodCircuit;
      return Math.min(1.6, path.radiusAt(p.distance / path.length) * .65);
    }
    if (p.stage === 'return-blood' || p.stage === 'unfiltered-blood') {
      const path = this.outlets[p.branch], u = p.distance / path.length;
      const fraction = THREE.MathUtils.lerp(.78, .65, THREE.MathUtils.smoothstep(u, .98, 1));
      return Math.min(2.1, path.radiusAt(u) * fraction);
    }
    if (p.stage === 'reabsorbing') {
      const u = p.distance / this.returns[p.branch].length;
      const a = Math.min(1.6, this.tubule.radiusAt(this.reabsorptionEnd / this.tubule.length) * .4);
      const b = Math.min(2.1, this.outlets[p.branch].radiusAt(this.returnJoinDistances[p.branch] / this.outlets[p.branch].length) * .78);
      return THREE.MathUtils.lerp(a, b, THREE.MathUtils.smoothstep(u, .6, 1));
    }
    return p.stage === 'filtration' ? 1.6 : Math.min(1.6, this.tubule.radiusAt(p.distance / this.tubule.length) * .4);
  }
  updateFluids() {
    const speed = this.profile.bloodSpeed;
    this.bloodStream.update(this.elapsed, speed);
    const afterGlomerulus = Math.max(0, this.elapsed - this.bloodCircuit.length / speed);
    this.outletStreams.forEach(stream => stream.update(afterGlomerulus, speed));
    const fluid = this.fluids[0].material.uniforms;
    fluid.uTime.value = this.elapsed; fluid.uSpeed.value = this.profile.tubularSpeed;
    fluid.uFront.value = Math.min(this.tubule.length + 2,
      Math.max(0, (this.elapsed - this.bloodDuration - this.transferDuration) * this.profile.tubularSpeed));
    this.returnFluids.forEach((mesh, i) => {
      mesh.material.uniforms.uTime.value = this.elapsed;
      mesh.material.uniforms.uSpeed.value = speed;
      mesh.material.uniforms.uFront.value = Math.min(this.returns[i].length,
        Math.max(0, (this.elapsed - this.returnStartTimes[i]) * speed));
    });
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Delta time debe ser finito y no negativo.');
    this.elapsed += dt;
    for (const p of this.particles) this.advanceParticle(p, dt);
    this.particles = this.particles.filter(p => p.stage !== 'absorbed' && p.stage !== 'excreted' && p.stage !== 'unfiltered');
    this.spawnClock += dt;
    while (this.spawnClock + 1e-9 >= this.profile.spawnInterval) {
      this.spawnClock = Math.max(0, this.spawnClock - this.profile.spawnInterval);
      if (this.particles.length >= CONFIG.maxParticles) continue;
      const p = this.makeParticle(this.spawnClock); this.advanceParticle(p, 0);
      if (p.stage !== 'absorbed' && p.stage !== 'excreted' && p.stage !== 'unfiltered') this.particles.push(p);
    }
    this.updateFluids(); this.draw();
  }
  draw() {
    this.glucose.count = this.particles.length;
    let returning = 0;
    this.particles.forEach((p, i) => {
      this.dummy.position.copy(this.position(p)); this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(this.particleRadius(p)); this.dummy.updateMatrix();
      this.glucose.setMatrixAt(i, this.dummy.matrix);
      if (p.stage === 'reabsorbing' || p.stage === 'return-blood' || p.stage === 'unfiltered-blood') {
        this.returnGlucose.setMatrixAt(returning, this.dummy.matrix);
        this.dummy.scale.multiplyScalar(.74); this.dummy.updateMatrix();
        this.returnCore.setMatrixAt(returning++, this.dummy.matrix);
      }
    }); this.glucose.instanceMatrix.needsUpdate = true;
    this.returnGlucose.count = returning; this.returnGlucose.instanceMatrix.needsUpdate = true;
    this.returnCore.count = returning; this.returnCore.instanceMatrix.needsUpdate = true;
  }
  get processStage() { return this.mode === 'glucosuria' && this.reabsorbedStarted > 0 && this.continuingGlucose > 0
    ? 2 : this.reabsorbedStarted > 0 ? 1 : 0; }
  get stats() { return { mode: this.mode, processStage: this.processStage, filtered: this.filtered, absorbed: this.absorbed,
    unfiltered: this.unfiltered, unfilteredActive: this.particles.filter(p => p.stage === 'unfiltered-blood').length,
    collectorGlucose: this.collectorGlucose, excreted: this.excreted, continuingGlucose: this.continuingGlucose,
    active: this.particles.length, reabsorbing: this.particles.filter(p => p.stage === 'reabsorbing').length,
    returnedActive: this.particles.filter(p => p.stage === 'return-blood').length,
    laterTubule: this.particles.filter(p => p.stage === 'tubule' && p.distance > this.proximalEnd).length,
    collectorActive: this.particles.filter(p => p.stage === 'tubule' && p.distance >= this.collectorStart).length }; }
}
