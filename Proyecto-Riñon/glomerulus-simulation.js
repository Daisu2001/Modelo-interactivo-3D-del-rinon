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
    this.paths = routes.capillaries.map(cap => joinRoutes(routes.afferent, cap, routes.efferent));
    this.afferentLength = new GlomerularPath(routes.afferent.points).length;
    this.proximal = new GlomerularPath(routes.proximal.points, routes.proximal.radii);
    this.filterDistances = routes.capillaries.map((cap, i) =>
      this.afferentLength + new GlomerularPath(cap.points).length * .53);
    this.transfers = this.paths.map((path, i) => {
      const point = path.getPoint(this.filterDistances[i] / path.length);
      const surface = point.clone().add(new THREE.Vector3(path.radiusAt(this.filterDistances[i] / path.length), 0, 0));
      return new GlomerularPath([point.toArray(), surface.toArray(),
        [.72, point.y * .48, .035], routes.proximal.points[0]]);
    });
    this.bloodFluids = this.paths.map(path => glomerularFluid(path, '#a51129', .50, true));
    this.bloodFluids.forEach(mesh => this.group.add(mesh));
    this.filtrateFluid = glomerularFluid(this.proximal, '#43bcb0', .42);
    this.group.add(this.filtrateFluid);
    this.transferFluids = this.transfers.map(path => {
      path.radii = path.points.map(() => .037);
      const mesh = glomerularFluid(path, '#43bcb0', .65); this.group.add(mesh); return mesh;
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
    this.serial = 0; this.flowStarted = [false, false, false]; this.particles = []; this.filtered = 0; this.absorbed = 0; this.continued = 0; this.unfiltered = 0;
    this.filtrateFront = 0; this.transferFronts = [0, 0, 0]; this.updateFluids(); this.draw();
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
      if (p.reabsorb && u >= .38) { p.stage = 'removed'; this.absorbed++; }
      else if (u >= 1) { p.stage = 'removed'; this.continued++; }
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
    }
    this.updateFluids(); this.draw();
  }
  updateFluids() {
    this.bloodFluids.forEach(mesh => {
      mesh.material.uniforms.time.value = this.elapsed;
      mesh.material.uniforms.front.value = this.elapsed * this.bloodSpeed;
    });
    this.filtrateFluid.material.uniforms.time.value = this.elapsed;
    this.filtrateFluid.material.uniforms.front.value = this.filtrateFront;
    this.transferFluids.forEach((mesh, i) => {
      mesh.material.uniforms.time.value = this.elapsed;
      mesh.material.uniforms.front.value = this.transferFronts[i];
    });
  }
  position(p) {
    if (p.stage === 'blood') return this.paths[p.branch].getPoint(p.distance / this.paths[p.branch].length);
    if (p.stage === 'filtration') return this.transfers[p.branch].getPoint(p.transfer / this.transfers[p.branch].length);
    const point = this.proximal.getPoint(p.distance / this.proximal.length);
    return point.add(new THREE.Vector3(0, .05 * Math.sin(p.id * 2.4), .045 * Math.cos(p.id * 2.4)));
  }
  draw() {
    this.glucose.count = this.particles.length;
    this.particles.forEach((p, i) => {
      this.dummy.position.copy(this.position(p)); this.dummy.quaternion.identity();
      const u = p.distance / this.proximal.length;
      const fade = p.stage === 'proximal' && p.reabsorb ? 1 - THREE.MathUtils.smoothstep(u, .18, .38) : 1;
      this.dummy.scale.setScalar((p.stage === 'blood' ? .012 : .023) * fade);
      this.dummy.updateMatrix(); this.glucose.setMatrixAt(i, this.dummy.matrix);
    });
    this.glucose.instanceMatrix.needsUpdate = true;
    let count = 0;
    this.paths.forEach((path, branch) => {
      const end = Math.min(path.length, this.elapsed * this.bloodSpeed);
      const phase = (this.elapsed * this.bloodSpeed) % .13;
      for (let d = phase; d < end; d += .13) {
        // Shared afferent/efferent paths only get one set of blood cells.
        if (branch > 0 && (d < this.afferentLength || d > path.length - 1.10)) continue;
        this.dummy.position.copy(path.getPoint(d / path.length));
        this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path.getTangent(d / path.length));
        this.dummy.scale.setScalar(.016); this.dummy.updateMatrix();
        this.cells.setMatrixAt(count++, this.dummy.matrix);
      }
    });
    this.cells.count = count; this.cells.instanceMatrix.needsUpdate = true;
  }
  get stats() { return { filtered: this.filtered, absorbed: this.absorbed, continued: this.continued,
    unfiltered: this.unfiltered, active: this.particles.length, blood: this.particles.filter(p => p.stage === 'blood').length,
    filtrate: this.particles.filter(p => p.stage !== 'blood').length }; }
}
