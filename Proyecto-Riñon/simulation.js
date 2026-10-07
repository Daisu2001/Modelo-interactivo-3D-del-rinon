import * as THREE from './vendor/three.module.js';

// All route points are in ORIGINAL MESH-LOCAL coordinates, before glTF node transforms.
// Use the same transform for anatomy and routes. No hand-drawn screen-space paths.
export const localToDisplay = p => new THREE.Vector3(p[0]*1000, -p[2]*1000, (p[1]+0.01693821)*1000);
export const CONFIG = Object.freeze({bloodSpeed:22, tubularSpeed:12,
  glucoseRadius:1.6, glucoseOffset:0.65,
  maxParticles:512, bloodCellSpacing:12, bloodCellRadius:0.72});
// Visual scenarios, not clinical filtration rates or diagnostic thresholds.
export const MODES = Object.freeze({
  low:Object.freeze({label:'Filtración baja',description:'Pocas partículas · velocidad lenta',
    spawnInterval:2.2,bloodSpeed:22,tubularSpeed:12,filtrationSeconds:2.6,reabsorptionFraction:1}),
  normal:Object.freeze({label:'Estado normal',description:'Flujo uniforme · velocidad constante',
    spawnInterval:.8,bloodSpeed:32,tubularSpeed:20,filtrationSeconds:1.8,reabsorptionFraction:1}),
  glucosuria:Object.freeze({label:'Glucosuria',description:'Flujo igual al normal · recorrido completo',
    spawnInterval:.8,bloodSpeed:32,tubularSpeed:20,filtrationSeconds:1.8,reabsorptionFraction:.45})
});
const clamp = THREE.MathUtils.clamp;

// Piecewise linear, distance-based motion preserves the extracted centerline. Catmull-Rom
// can overshoot a tight bend and put particles through the wall of this particular GLB.
export class MeasuredPath extends THREE.Curve {
  constructor(points,radii=[]) {
    super();this.points=points.map(localToDisplay);this.radii=radii.map(x=>x*1000);
    this.distances=[0];for(let i=1;i<this.points.length;i++)
      this.distances.push(this.distances[i-1]+this.points[i].distanceTo(this.points[i-1]));
    this.length=this.distances.at(-1);
    if(!(this.length>0))throw new Error('Ruta vacía o sin longitud.');
  }
  segmentAt(t) {
    const d=clamp(t,0,1)*this.length;let lo=0,hi=this.points.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(this.distances[mid]<=d)lo=mid;else hi=mid;}
    const span=this.distances[lo+1]-this.distances[lo];
    return [lo,span>0?(d-this.distances[lo])/span:0];
  }
  getPoint(t,target=new THREE.Vector3()) {
    const [i,f]=this.segmentAt(t);return target.copy(this.points[i]).lerp(this.points[i+1],f);
  }
  getPointAt(t,target=new THREE.Vector3()){return this.getPoint(t,target);}
  getUtoTmapping(u){return u;}
  getTangent(t,target=new THREE.Vector3()) {
    const a=this.getPoint(Math.max(0,t-.00015)),b=this.getPoint(Math.min(1,t+.00015));
    return target.subVectors(b,a).normalize();
  }
  getTangentAt(t,target=new THREE.Vector3()){return this.getTangent(t,target);}
  radiusAt(t){const [i,f]=this.segmentAt(t);return this.radii.length?
    THREE.MathUtils.lerp(this.radii[i],this.radii[i+1],f):2;}
}

export function createFluid(path,color,radius,speed=CONFIG.tubularSpeed,blood=false) {
  const segments=Math.max(80,Math.ceil(path.length/1.6));
  const geometry=new THREE.TubeGeometry(path,segments,1,10,false);
  const pos=geometry.attributes.position;const c=new THREE.Vector3(),v=new THREE.Vector3();
  for(let i=0;i<=segments;i++) {
    const u=i/segments;path.getPoint(u,c);const r=radius??path.radiusAt(u)*0.63;
    for(let k=0;k<=10;k++){const index=i*11+k;v.fromBufferAttribute(pos,index).sub(c).multiplyScalar(r).add(c);pos.setXYZ(index,v.x,v.y,v.z);}
  }
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,
    side:THREE.DoubleSide,uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(color)},uLength:{value:path.length},uSpeed:{value:speed},uBlood:{value:blood?1:0},uFront:{value:1e9}},
    vertexShader:`varying vec2 vUv; varying vec3 vNormal; void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float uTime; uniform float uLength; uniform float uSpeed; uniform float uBlood; uniform float uFront; uniform vec3 uColor;varying vec2 vUv;varying vec3 vNormal;
    void main(){if(vUv.x*uLength>uFront)discard;float wave=.5+.5*sin(vUv.x*uLength*.16-uTime*uSpeed*.16);
      float ripple=.5+.5*sin(vUv.x*uLength*.31-uTime*uSpeed*.31+sin(vUv.y*6.283)*.7);
      float sheen=pow(abs(vNormal.z),3.);vec3 color=uColor*(.60+.30*wave)+vec3(.25)*sheen;
      if(uBlood>.5){
        float pulse=.76+.24*wave;vec3 crimson=uColor*pulse+vec3(.10,.025,.018)*sheen;
        float edge=1.-smoothstep(uFront-1.2,uFront,vUv.x*uLength);
        gl_FragColor=vec4(crimson,(.77+.14*ripple)*edge);
      }else gl_FragColor=vec4(color,.18+.15*wave+.10*ripple+.14*sheen);}`});
  const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=2;return mesh;
}
// Vascular volume and red blood cells have their OWN path and lifetime. They never
// enter the glucose/filtration state machine or the yellow tubular centerline.
export class BloodStream {
  constructor(path){
    this.path=path;this.group=new THREE.Group();this.group.name='Sangre: circuito vascular';
    this.fluid=createFluid(path,'#970c20',undefined,CONFIG.bloodSpeed,true);
    this.fluid.name='Estela roja continua';this.fluid.renderOrder=3;this.group.add(this.fluid);
    const geometry=new THREE.SphereGeometry(1,14,10),pos=geometry.attributes.position;
    // Procedural biconcave discs: a thin center and a thicker rounded rim.
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),r2=x*x+y*y;
      pos.setZ(i,z*(.12+.62*r2));
    }geometry.computeVertexNormals();
    this.capacity=Math.ceil(path.length/CONFIG.bloodCellSpacing)+1;
    this.cells=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({
      color:'#b81227',roughness:.38,metalness:0,transparent:true,depthWrite:false,
      emissive:'#51030b',emissiveIntensity:.25}),this.capacity);
    this.cells.name='Glóbulos rojos: solo vasos';this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cells.frustumCulled=false;this.cells.renderOrder=4;this.group.add(this.cells);
    this.dummy=new THREE.Object3D();this.cellPositions=[];this.elapsed=0;this.update(0);
  }
  update(elapsed,speed=CONFIG.bloodSpeed){
    this.elapsed=elapsed;this.frontDistance=elapsed*speed;
    this.fluid.material.uniforms.uSpeed.value=speed;
    this.fluid.material.uniforms.uFront.value=Math.min(this.frontDistance,this.path.length+2);
    this.fluid.material.uniforms.uTime.value=elapsed;
    const visibleLength=Math.min(this.frontDistance,this.path.length);
    const phase=(elapsed*speed)%CONFIG.bloodCellSpacing;
    let count=0;this.cellPositions.length=0;
    for(let d=phase;visibleLength>0&&d<=visibleLength;d+=CONFIG.bloodCellSpacing){
      const u=d/this.path.length,tangent=this.path.getTangent(u);
      const side=new THREE.Vector3().crossVectors(tangent,new THREE.Vector3(0,0,1)).normalize();
      if(side.lengthSq()<.1)side.set(1,0,0);
      const center=this.path.getPoint(u);center.addScaledVector(side,.28*Math.sin(count*2.4+elapsed*.4));
      this.dummy.position.copy(center);this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent);
      this.dummy.rotateZ(count*1.73+elapsed*.2);this.dummy.scale.setScalar(CONFIG.bloodCellRadius);
      this.dummy.updateMatrix();this.cells.setMatrixAt(count,this.dummy.matrix);
      this.cellPositions.push({distance:d,point:center.clone()});count++;
    }
    this.cells.count=count;this.cells.instanceMatrix.needsUpdate=true;
  }
}

export class NormalSimulation {
  constructor(scene,data) {
    this.scene=scene;this.data=data;this.tubule=new MeasuredPath(data.tubule.points,data.tubule.radii);
    this.blood=new MeasuredPath(data.blood.points);this.bloodCircuit=new MeasuredPath(data.bloodCircuit.points,data.bloodCircuit.radii);this.filtration=new MeasuredPath(data.filtration.points);
    this.proximalEnd=data.tubule.segments.find(x=>x.name==='proximal').end*1000;
    this.reabsorptionStart=data.reabsorption.startDistance*1000;
    this.reabsorptionEnd=data.reabsorption.endDistance*1000;
    this.collectorStart=data.tubule.segments.find(x=>x.name==='colector').start*1000;
    this.mode='low';this.profile=MODES.low;
    this.group=new THREE.Group();scene.add(this.group);this.vascularGroup=new THREE.Group();this.group.add(this.vascularGroup);
    this.fluids=[createFluid(this.tubule,'#60dace')];this.group.add(this.fluids[0]);
    this.bloodStream=new BloodStream(this.bloodCircuit);
    this.vascularGroup.add(this.bloodStream.group);
    const material=new THREE.MeshStandardMaterial({color:'#ffae3c',emissive:'#ef6d09',emissiveIntensity:.8,roughness:.28,metalness:.1,transparent:true,depthWrite:false});
    this.glucose=new THREE.InstancedMesh(new THREE.SphereGeometry(CONFIG.glucoseRadius,16,12),material,CONFIG.maxParticles);
    this.glucose.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.glucose.frustumCulled=false;
    this.glucose.renderOrder=4;this.group.add(this.glucose);this.dummy=new THREE.Object3D();this.reset();
  }
  makeParticle(lifeAge=0) {
    const id=this.serial++;
    // Interleave reabsorbed and continuing spheres; this is a visual 45% allocation,
    // not a clinical capacity or an inferred percentage for actual glucosuria.
    const willReabsorb=this.profile.reabsorptionFraction===1 || (id*7)%20<9;
    return {id,lifeAge,stage:'blood',distance:0,transferAge:0,willReabsorb,
      countedFiltered:false,countedContinuing:false,countedCollector:false};
  }
  setMode(mode) {
    if(!Object.hasOwn(MODES,mode))throw new Error('Estado de simulación desconocido: '+mode);
    this.mode=mode;this.profile=MODES[mode];this.reset();
  }
  reset() {
    this.elapsed=0;this.spawnClock=0;this.serial=0;this.filtered=0;this.absorbed=0;
    this.collectorGlucose=0;this.excreted=0;this.continuingGlucose=0;this.particles=[];
    this.bloodDuration=this.blood.length/this.profile.bloodSpeed;
    this.transferDuration=this.profile.filtrationSeconds;
    // One sphere at the inlet, no historical emissions or prefilled route.
    // Subsequent spheres enter at a regular cadence as the blood front advances.
    this.particles.push(this.makeParticle());
    this.fluids[0].material.uniforms.uSpeed.value=this.profile.tubularSpeed;
    this.updateFluids();this.draw();
  }
  updateFluids() {
    const tubularFront=Math.max(0,(this.elapsed-this.bloodDuration-this.transferDuration)*this.profile.tubularSpeed);
    const material=this.fluids[0].material;
    material.uniforms.uTime.value=this.elapsed;
    material.uniforms.uFront.value=Math.min(tubularFront,this.tubule.length+2);
    this.bloodStream.update(this.elapsed,this.profile.bloodSpeed);
  }

  position(p) {
    if(p.stage==='blood')return this.blood.getPoint(p.distance/this.blood.length);
    if(p.stage==='filtration')return this.filtration.getPoint(clamp(p.transferAge/this.transferDuration,0,1));
    // Reabsorbed spheres stay in the short marked yellow region. Non-reabsorbed
    // spheres stay inside the SAME measured centerline all the way to the collector.
    const point=this.tubule.getPoint(p.distance/this.tubule.length);
    const offset=new THREE.Vector3(0,0,CONFIG.glucoseOffset);
    if(this.mode==='glucosuria')offset.x=.24*Math.sin(p.id*2.4); // contained small dispersion
    return point.add(offset);
  }
  particleScale(p) {
    return p.stage==='reabsorbing'?1-THREE.MathUtils.smoothstep(
      p.distance,this.reabsorptionStart,this.reabsorptionEnd):1;
  }
  advanceParticle(p,dt) {
    p.lifeAge+=dt;
    if(p.lifeAge<this.bloodDuration){
      p.stage='blood';p.distance=p.lifeAge*this.profile.bloodSpeed;return;
    }
    const afterBlood=p.lifeAge-this.bloodDuration;
    if(afterBlood<this.transferDuration){p.stage='filtration';p.transferAge=afterBlood;return;}
    if(!p.countedFiltered){p.countedFiltered=true;this.filtered++;}
    p.distance=(afterBlood-this.transferDuration)*this.profile.tubularSpeed;
    if(p.willReabsorb){
      if(p.distance>=this.reabsorptionEnd){p.distance=this.reabsorptionEnd;p.stage='absorbed';this.absorbed++;return;}
      p.stage=p.distance>=this.reabsorptionStart?'reabsorbing':'tubule';
    }else{
      // Activate the full route as soon as glucose escapes the marked absorption zone.
      if(p.distance>=this.reabsorptionEnd&&!p.countedContinuing){
        p.countedContinuing=true;this.continuingGlucose++;
      }
      if(p.distance>=this.collectorStart&&!p.countedCollector){
        p.countedCollector=true;this.collectorGlucose++;
      }
      if(p.distance>=this.tubule.length){p.distance=this.tubule.length;p.stage='excreted';this.excreted++;return;}
      p.stage='tubule';
    }
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<0)throw new Error('Delta time debe ser finito y no negativo.');
    this.elapsed+=dt;
    for(const p of this.particles)this.advanceParticle(p,dt);
    this.particles=this.particles.filter(p=>p.stage!=='absorbed'&&p.stage!=='excreted');
    this.spawnClock+=dt;
    while(this.spawnClock>=this.profile.spawnInterval){
      this.spawnClock-=this.profile.spawnInterval;
      if(this.particles.length>=CONFIG.maxParticles)continue;
      const p=this.makeParticle();this.advanceParticle(p,this.spawnClock);
      if(p.stage!=='absorbed'&&p.stage!=='excreted')this.particles.push(p);
    }
    this.updateFluids();this.draw();
  }
  draw() {
    this.glucose.count=this.particles.length;
    this.particles.forEach((p,i)=>{
      this.dummy.position.copy(this.position(p));
      // A sphere shrinks in the short marked region and is removed at its end.
      this.dummy.scale.setScalar(this.particleScale(p));
      this.dummy.updateMatrix();this.glucose.setMatrixAt(i,this.dummy.matrix);
    });this.glucose.instanceMatrix.needsUpdate=true;
  }
  // Cumulative events keep the highlighted process moving forward until reset.
  get processStage(){return this.mode==='glucosuria'&&this.absorbed>0&&this.continuingGlucose>0?2:this.absorbed>0?1:0;}
  get stats(){return {mode:this.mode,processStage:this.processStage,filtered:this.filtered,absorbed:this.absorbed,
    collectorGlucose:this.collectorGlucose,excreted:this.excreted,continuingGlucose:this.continuingGlucose,
    active:this.particles.length,reabsorbing:this.particles.filter(x=>x.stage==='reabsorbing').length,
    laterTubule:this.particles.filter(x=>x.stage==='tubule'&&x.distance>this.proximalEnd).length,
    collectorActive:this.particles.filter(x=>x.stage==='tubule'&&x.distance>=this.collectorStart).length};}
}
