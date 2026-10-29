import * as THREE from './vendor/three.module.js';
import { calculateRenalState } from './renal-physiology.js';

const clamp = THREE.MathUtils.clamp;
export class GlomerularPath extends THREE.Curve {
  constructor(points, radii = []) {
    super();
    this.points = points.map(p => new THREE.Vector3(...p));
    this.radii = radii;
    this.distances = [0];
    for (let i = 1; i < this.points.length; i++) this.distances.push(this.distances[i - 1] +
      this.points[i].distanceTo(this.points[i - 1]));
    this.length = this.distances.at(-1);
    if (!(this.length > 0)) throw new Error('Ruta glomerular vacía');
  }
  segment(t) {
    const d = clamp(t, 0, 1) * this.length;
    let i = 0;
    while (i < this.points.length - 2 && this.distances[i + 1] < d) i++;
    return [i, (d - this.distances[i]) / Math.max(1e-9, this.distances[i + 1] - this.distances[i])];
  }
  getPoint(t, target = new THREE.Vector3()) {
    const [i, f] = this.segment(t);
    return target.copy(this.points[i]).lerp(this.points[i + 1], f);
  }
  getPointAt(t, target) { return this.getPoint(t, target); }
  getUtoTmapping(u) { return u; }
  radiusAt(t) {
    const [i, f] = this.segment(t);
    return this.radii.length ? THREE.MathUtils.lerp(this.radii[i], this.radii[i + 1], f) : .025;
  }
}
function joinRoutes(...routes) {
  const points = [], radii = [];
  for (const route of routes) for (let i = 0; i < route.points.length; i++) {
    const p = route.points[i];
    if (points.length && new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...points.at(-1))) < 1e-6) continue;
    points.push(p); radii.push(route.radii[i]);
  }
  return new GlomerularPath(points, radii);
}
export function glomerularFluid(path, color, fraction, blood = false) {
  const segments = Math.max(60, Math.ceil(path.length / .025));
  const geometry = new THREE.TubeGeometry(path, segments, 1, 8, false);
  const pos = geometry.attributes.position, center = new THREE.Vector3(), vertex = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    path.getPoint(i / segments, center);
    const radius = path.radiusAt(i / segments) * fraction;
    for (let k = 0; k <= 8; k++) {
      const index = i * 9 + k;
      vertex.fromBufferAttribute(pos, index).sub(center).multiplyScalar(radius).add(center);
      pos.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, color: { value: new THREE.Color(color) },
      length: { value: path.length }, front: { value: 0 }, speed: { value: .45 },
      alpha: { value: blood ? .82 : .50 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec2 vUv;uniform float time,length,front,speed,alpha;uniform vec3 color;void main(){if(vUv.x*length>front)discard;float wave=.7+.3*sin(vUv.x*length*40.-time*speed*40.);gl_FragColor=vec4(color*wave,alpha);}' });
  const mesh = new THREE.Mesh(geometry, material); mesh.renderOrder = 2; mesh.raycast = () => {};
  return mesh;
}

// Particles use separate vascular and urinary paths. The distal tube is an
// anatomical reference in this partial model, not a shortcut from the proximal.
export class GlomerulusSimulation {
  constructor(parent, routes) {
    this.group = new THREE.Group(); this.group.name = 'Filtración según fórmulas'; parent.add(this.group);
    const afferents = routes.afferents ?? [routes.afferent];
    const efferents = routes.efferents ?? [routes.efferent];
    const count = Math.max(afferents.length, routes.capillaries.length, efferents.length);
    const branches = Array.from({ length: count }, (_, i) => ({
      afferent: afferents[i % afferents.length], capillary: routes.capillaries[i % routes.capillaries.length],
      efferent: efferents[i % efferents.length]
    }));
    this.paths = branches.map(({ afferent, capillary, efferent }) => joinRoutes(afferent, capillary, efferent));
    this.afferentLengths = branches.map(({ afferent }) => new GlomerularPath(afferent.points).length);
    this.afferentOwners = branches.map(({ afferent }) => branches.findIndex(branch => branch.afferent === afferent));
    this.capillaryLengths = branches.map(({ capillary }) => new GlomerularPath(capillary.points).length);
    this.capillaryOwners = branches.map(({ capillary }) => branches.findIndex(branch => branch.capillary === capillary));
    this.afferentLength = this.afferentLengths[0];
    this.efferents = branches.map(({ efferent }) => new GlomerularPath(efferent.points, efferent.radii));
    this.efferentOwners = branches.map(({ efferent }) => branches.findIndex(branch => branch.efferent === efferent));
    this.efferentLengths = this.efferents.map(path => path.length);
    this.efferentLength = this.efferentLengths[0];
    this.proximal = new GlomerularPath(routes.proximal.points, routes.proximal.radii);
    this.reabsorptionDistance = this.proximal.length * (routes.reabsorption?.proximalFraction ?? .38);
    this.returnJoinDistances = this.efferents.map(path => path.length * (routes.reabsorption?.outletJoinFraction ?? .8));
    // The model omits the peritubular bed. These short schematic connections
    // show proximal -> blood; once captured, solute follows the measured lumen.
    this.reabsorptions = this.efferents.map((path, i) => {
      const start = this.proximal.getPoint(this.reabsorptionDistance / this.proximal.length);
      const end = path.getPoint(this.returnJoinDistances[i] / path.length);
      const c1 = start.clone().add(new THREE.Vector3(0, 1.05, .18));
      const tangent = path.getTangent(this.returnJoinDistances[i] / path.length);
      const c2 = end.clone().addScaledVector(tangent, -.35);
      const curve = new THREE.CubicBezierCurve3(start, c1, c2, end);
      const points = curve.getPoints(64).map(p => p.toArray());
      return new GlomerularPath(points, points.map(() => .018));
    });
    this.filterDistances = branches.map(({ capillary }, i) =>
      this.afferentLengths[i] + new GlomerularPath(capillary.points).length * .53);
    this.transfers = this.paths.map((path, i) => {
      const point = path.getPoint(this.filterDistances[i] / path.length);
      const surface = point.clone().add(new THREE.Vector3(path.radiusAt(this.filterDistances[i] / path.length), 0, 0));
      return new GlomerularPath([point.toArray(), surface.toArray(),
        [.72, point.y * .48, .035], routes.proximal.points[0]]);
    });
    this.bloodFluids = [];
    const usedBloodRoutes = new Set();
    branches.forEach(({ afferent, capillary, efferent }) => {
      let startDistance = 0;
      for (const route of [afferent, capillary, efferent]) {
        const path = new GlomerularPath(route.points, route.radii);
        if (!usedBloodRoutes.has(route)) {
          usedBloodRoutes.add(route);
          const mesh = glomerularFluid(path, '#a51129', .50, true);
          mesh.userData.startDistance = startDistance; this.bloodFluids.push(mesh);
        }
        startDistance += path.length;
      }
    });
    this.bloodFluids.forEach(mesh => this.group.add(mesh));
    this.filtrateFluid = glomerularFluid(this.proximal, '#43bcb0', .42);
    this.group.add(this.filtrateFluid);
    this.transferFluids = this.transfers.map(path => {
      path.radii = path.points.map(() => .037);
      const mesh = glomerularFluid(path, '#43bcb0', .65); this.group.add(mesh); return mesh;
    });
    this.reabsorptionFluids = this.reabsorptions.map(path => {
      const mesh = glomerularFluid(path, '#43bcb0', .40); this.group.add(mesh); return mesh;
    });
    const bloodGeometry = new THREE.SphereGeometry(1, 10, 8);
    const pos = bloodGeometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) *
      (.15 + .5 * (pos.getX(i) ** 2 + pos.getY(i) ** 2)));
    bloodGeometry.computeVertexNormals();
    this.cells = new THREE.InstancedMesh(bloodGeometry,
      new THREE.MeshStandardMaterial({ color: '#b41830', roughness: .4 }), 600);
    this.cells.frustumCulled = false; this.cells.count = 0; this.cells.renderOrder = 3;
    this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.cells);
    this.glucose = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#ff9e25', emissive: '#d96705', emissiveIntensity: .6,
        roughness: .3, transparent: true, depthWrite: false }), 1024);
    this.glucose.frustumCulled = false; this.glucose.renderOrder = 4;
    this.glucose.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(this.glucose);
    this.glucose.raycast = this.cells.raycast = () => {};
    this.dummy = new THREE.Object3D(); this.bloodSpeed = .45;
    this.state = calculateRenalState(); this.reset();
  }
  setState(state) {
    this.state = state;
    // Pending solute adapts at its next decision point; stopping filtration also
    // freezes fluid and solute already in Bowman/proximal instead of teleporting it.
    this.filtrateFluid.material.uniforms.speed.value = state.filtrateSpeed;
    this.transferFluids.forEach(mesh => { mesh.material.uniforms.speed.value = state.tfg > 0 ? Math.sqrt(state.tfg / 125) * .65 : 0; });
  }
  reset() {
    this.elapsed = 0; this.spawnCredit = 0; this.filterCredit = 0; this.reabsorbCredit = 0;
    this.serial = 0; this.flowStarted = this.paths.map(() => false); this.particles = []; this.filtered = 0; this.absorbed = 0; this.continued = 0; this.unfiltered = 0;
    this.filtrateFront = 0; this.transferFronts = this.paths.map(() => 0);
    this.returnFlowStarted = this.paths.map(() => false); this.returnFronts = this.paths.map(() => 0);
    this.updateFluids(); this.draw();
  }
  emit() { this.particles.push({ id: this.serial++, branch: this.serial % this.paths.length,
    stage: 'blood', distance: 0, transfer: 0, decided: false, reabsorptionDecided: false }); }
  advance(p, dt) {
    const path = this.paths[p.branch], state = this.state;
    if (p.stage === 'blood') {
      p.distance += dt * this.bloodSpeed;
      if (!p.decided && p.distance >= this.filterDistances[p.branch]) {
        p.decided = true; this.filterCredit += state.filtrationProbability;
        if (state.filtrationProbability > 0 && this.filterCredit >= 1 - 1e-9) {
          this.filterCredit = Math.max(0, this.filterCredit - 1);
          p.stage = 'filtration'; p.transfer = 0; this.filtered++; this.flowStarted[p.branch] = true;
          return;
        }
      }
      if (p.distance >= path.length) { p.stage = 'removed'; this.unfiltered++; }
    } else if (p.stage === 'filtration') {
      if (state.tfg <= 0) return;
      p.transfer += dt * Math.sqrt(state.tfg / 125) * .65;
      if (p.transfer >= this.transfers[p.branch].length) { p.stage = 'proximal'; p.distance = 0; }
    } else if (p.stage === 'proximal') {
      p.distance += dt * state.filtrateSpeed;
      const u = p.distance / this.proximal.length;
      if (!p.reabsorptionDecided && u >= .18) {
        p.reabsorptionDecided = true; this.reabsorbCredit += state.reabsorptionFraction;
        p.reabsorb = this.reabsorbCredit >= 1 - 1e-9;
        if (p.reabsorb) this.reabsorbCredit = Math.max(0, this.reabsorbCredit - 1);
      }
      if (p.reabsorb && p.distance >= this.reabsorptionDistance) {
        const remainingTime = (p.distance - this.reabsorptionDistance) / state.filtrateSpeed;
        p.stage = 'reabsorption'; p.transfer = remainingTime * this.bloodSpeed;
        this.returnFlowStarted[p.branch] = true;
      }
      else if (u >= 1) { p.stage = 'removed'; this.continued++; }
    } else if (p.stage === 'reabsorption') {
      p.transfer += dt * this.bloodSpeed;
      const path = this.reabsorptions[p.branch];
      if (p.transfer >= path.length) {
        p.stage = 'return-blood';
        p.distance = this.returnJoinDistances[p.branch] + p.transfer - path.length;
      }
    } else if (p.stage === 'return-blood') {
      p.distance += dt * this.bloodSpeed;
      if (p.distance >= this.efferentLengths[p.branch]) { p.stage = 'removed'; this.absorbed++; }
    }
  }
  update(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Delta inválido');
    this.elapsed += dt;
    // Substeps prevent a large frame from skipping decisions and preserve rate.
    for (let remaining = dt; remaining > 1e-9;) {
      const step = Math.min(remaining, .05); remaining -= step;
      for (const p of this.particles) this.advance(p, step);
      this.particles = this.particles.filter(p => p.stage !== 'removed');
      this.spawnCredit += step * this.state.inletRate;
      while (this.spawnCredit >= 1) {
        this.spawnCredit--;
        if (this.particles.length < 1024) this.emit();
      }
      if (this.filtered > 0 && this.state.tfg > 0) {
        this.transfers.forEach((path, i) => {
          if (this.flowStarted[i]) this.transferFronts[i] = Math.min(path.length,
            this.transferFronts[i] + step * Math.sqrt(this.state.tfg / 125) * .65);
        });
        if (this.transfers.some((path, i) => this.transferFronts[i] >= path.length)) {
          this.filtrateFront = Math.min(this.proximal.length, this.filtrateFront + step * this.state.filtrateSpeed);
        }
      }
      this.reabsorptions.forEach((path, i) => {
        if (this.returnFlowStarted[i]) this.returnFronts[i] = Math.min(path.length,
          this.returnFronts[i] + step * this.bloodSpeed);
      });
    }
    this.updateFluids(); this.draw();
  }
  updateFluids() {
    this.bloodFluids.forEach(mesh => {
      mesh.material.uniforms.time.value = this.elapsed;
      mesh.material.uniforms.front.value = this.elapsed * this.bloodSpeed - mesh.userData.startDistance;
    });
    this.filtrateFluid.material.uniforms.time.value = this.elapsed;
    this.filtrateFluid.material.uniforms.front.value = this.filtrateFront;
    this.transferFluids.forEach((mesh, i) => {
      mesh.material.uniforms.time.value = this.elapsed;
      mesh.material.uniforms.front.value = this.transferFronts[i];
    });
    this.reabsorptionFluids.forEach((mesh, i) => {
      mesh.material.uniforms.time.value = this.elapsed;
      mesh.material.uniforms.speed.value = this.bloodSpeed;
      mesh.material.uniforms.front.value = this.returnFronts[i];
    });
  }
  position(p) {
    if (p.stage === 'blood') return this.paths[p.branch].getPoint(p.distance / this.paths[p.branch].length);
    if (p.stage === 'filtration') return this.transfers[p.branch].getPoint(p.transfer / this.transfers[p.branch].length);
    if (p.stage === 'return-blood') return this.efferents[p.branch].getPoint(p.distance / this.efferentLengths[p.branch]);
    if (p.stage === 'reabsorption') {
      const u = clamp(p.transfer / this.reabsorptions[p.branch].length, 0, 1);
      return this.reabsorptions[p.branch].getPoint(u).addScaledVector(this.proximalOffset(p), 1 - u);
    }
    const point = this.proximal.getPoint(p.distance / this.proximal.length);
    return point.add(this.proximalOffset(p));
  }
  proximalOffset(p) { return new THREE.Vector3(0, .05 * Math.sin(p.id * 2.4), .045 * Math.cos(p.id * 2.4)); }
  draw() {
    this.glucose.count = this.particles.length;
    this.particles.forEach((p, i) => {
      this.dummy.position.copy(this.position(p)); this.dummy.quaternion.identity();
      let radius = p.stage === 'blood'
        ? Math.min(.012, this.paths[p.branch].radiusAt(p.distance / this.paths[p.branch].length) * .75) : .023;
      if (p.stage === 'return-blood') radius = Math.min(.012,
        this.efferents[p.branch].radiusAt(p.distance / this.efferentLengths[p.branch]) * .75);
      if (p.stage === 'reabsorption') {
        const u = p.transfer / this.reabsorptions[p.branch].length;
        const finalRadius = Math.min(.012, this.efferents[p.branch].radiusAt(
          this.returnJoinDistances[p.branch] / this.efferentLengths[p.branch]) * .75);
        radius = THREE.MathUtils.lerp(.023, finalRadius, THREE.MathUtils.smoothstep(u, .6, 1));
      }
      this.dummy.scale.setScalar(radius);
      this.dummy.updateMatrix(); this.glucose.setMatrixAt(i, this.dummy.matrix);
    });
    this.glucose.instanceMatrix.needsUpdate = true;
    let count = 0;
    this.paths.forEach((path, branch) => {
      const travelled = this.elapsed * this.bloodSpeed;
      if (travelled <= 0) return;
      // Each emission advances from its own start time. Wrapping the phase of
      // the entire row would visibly move cells backwards at each new emission.
      const first = Math.max(0, Math.ceil((travelled - path.length) / .13));
      const last = Math.floor(travelled / .13);
      for (let emission = first; emission <= last; emission++) {
        const d = travelled - emission * .13;
        // Shared afferent/efferent paths only get one set of blood cells.
        if ((branch !== this.afferentOwners[branch] && d < this.afferentLengths[branch])
          || (branch !== this.capillaryOwners[branch] && d >= this.afferentLengths[branch]
            && d < this.afferentLengths[branch] + this.capillaryLengths[branch])
          || (branch !== this.efferentOwners[branch] && d >= path.length - this.efferentLengths[branch])) continue;
        this.dummy.position.copy(path.getPoint(d / path.length));
        this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangent(d / path.length));
        this.dummy.scale.setScalar(Math.min(.016, path.radiusAt(d / path.length) * .6)); this.dummy.updateMatrix();
        this.cells.setMatrixAt(count++, this.dummy.matrix);
      }
    });
    this.cells.count = count; this.cells.instanceMatrix.needsUpdate = true;
  }
  get stats() { return { filtered: this.filtered, absorbed: this.absorbed, continued: this.continued,
    unfiltered: this.unfiltered, active: this.particles.length,
    blood: this.particles.filter(p => p.stage === 'blood' || p.stage === 'return-blood').length,
    filtrate: this.particles.filter(p => p.stage !== 'blood' && p.stage !== 'return-blood').length,
    returning: this.particles.filter(p => p.stage === 'reabsorption' || p.stage === 'return-blood').length }; }
}
