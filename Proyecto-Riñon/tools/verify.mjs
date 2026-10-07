import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import {NormalSimulation,MeasuredPath,CONFIG,MODES} from '../simulation.js';
const data=JSON.parse(fs.readFileSync(new URL('../routes.json',import.meta.url)));
const sim=new NormalSimulation(new THREE.Scene(),data);
assert.equal(data.tubule.points.length,data.tubule.radii.length);
assert.ok(sim.reabsorptionEnd<sim.proximalEnd*.21);
assert.ok(sim.reabsorptionStart<sim.reabsorptionEnd);
assert.equal(sim.bloodStream.path,sim.bloodCircuit);
assert.notEqual(sim.bloodStream.path,sim.tubule);
assert.deepEqual(data.bloodCircuit.points[0],data.blood.points[0]);
assert.ok(data.bloodOutlet.points.some(p=>p[0]>0),'La sangre sale por la otra rama roja');
assert.ok(Math.abs(data.bloodCircuit.points.at(-1)[0]+.1100137755)<1e-7);
for(let i=0;i<=1000;i++){
 assert.ok(sim.tubule.getPoint(i/1000).toArray().every(Number.isFinite));
 assert.ok(CONFIG.glucoseRadius+Math.hypot(CONFIG.glucoseOffset,.24)<sim.tubule.radiusAt(i/1000));
}
const mid=(sim.reabsorptionStart+sim.reabsorptionEnd)/2;
assert.equal(sim.particleScale({stage:'reabsorbing',distance:sim.reabsorptionStart}),1);
assert.ok(Math.abs(sim.particleScale({stage:'reabsorbing',distance:mid})-.5)<1e-10);
assert.equal(sim.particleScale({stage:'reabsorbing',distance:sim.reabsorptionEnd}),0);
assert.equal(new MeasuredPath([[0,0,0],[.1,0,0]]).getPoint(.5).x,50);
const report=[];
for(const mode of Object.keys(MODES)){
 sim.setMode(mode);assert.equal(sim.stats.mode,mode);
 const initial=sim.particles.length;let maxActive=initial,removedAbsorbed=0,removedExcreted=0;
 const initiallyFiltered=sim.filtered;let lastStage=0;const seenStages=new Set([0]);
 assert.equal(sim.stats.processStage,0);
 assert.equal(sim.absorbed,0);assert.equal(sim.excreted,0);
 assert.equal(sim.bloodStream.frontDistance,0);
 assert.equal(sim.bloodStream.cells.count,0);
 assert.equal(sim.bloodStream.fluid.material.uniforms.uFront.value,0);
 assert.equal(sim.fluids[0].material.uniforms.uFront.value,0);
 assert.equal(sim.filtered,0);assert.equal(sim.collectorGlucose,0);
 assert.equal(initial,1);assert.equal(sim.particles[0].stage,'blood');
 assert.equal(sim.particles[0].distance,0);
 assert.ok(sim.position(sim.particles[0]).distanceTo(sim.blood.getPoint(0))<1e-9);
 if(mode!=='glucosuria'){assert.equal(sim.collectorGlucose,0);assert.equal(sim.stats.laterTubule,0);}
 else{assert.equal(sim.stats.collectorActive,0);assert.equal(sim.stats.laterTubule,0);}
 // 150 seconds includes progressive filling and full transit at Normal speed.
 for(let i=0;i<4500;i++){
  const previous=new Map(sim.particles.map(p=>[p.id,{...p}]));sim.update(1/30);
  const ids=new Set(sim.particles.map(p=>p.id));
  for(const [id,p] of previous)if(!ids.has(id)){
   if(p.willReabsorb){
    assert.equal(p.stage,'reabsorbing');assert.ok(p.distance>=sim.reabsorptionStart);
    assert.ok(sim.reabsorptionEnd-p.distance<=sim.profile.tubularSpeed/30+1e-6);removedAbsorbed++;
   }else{
    assert.equal(mode,'glucosuria');assert.equal(p.stage,'tubule');
    assert.ok(sim.tubule.length-p.distance<=sim.profile.tubularSpeed/30+1e-6);removedExcreted++;
   }
  }
  for(const p of sim.particles){
   assert.ok(sim.position(p).toArray().every(Number.isFinite));
   assert.ok(['blood','filtration','tubule','reabsorbing'].includes(p.stage));
   if(p.stage==='blood')assert.ok(p.distance<=sim.bloodStream.frontDistance+1e-8,'La glucosa no adelanta al frente sanguíneo');
   if(p.stage==='tubule'||p.stage==='reabsorbing')assert.ok(p.distance<=sim.fluids[0].material.uniforms.uFront.value+1e-8,'La glucosa no adelanta al frente del filtrado');
   if(p.willReabsorb&&(p.stage==='tubule'||p.stage==='reabsorbing'))assert.ok(p.distance<sim.reabsorptionEnd);
   const before=previous.get(p.id);
   if(before&&before.stage==='tubule'&&p.stage==='tubule')assert.ok(Math.abs(p.distance-before.distance-sim.profile.tubularSpeed/30)<1e-9,'Velocidad tubular constante');
   if(!before){assert.equal(p.stage,'blood');assert.ok(Math.abs(sim.position(p).x-data.blood.points[0][0]*1000)<1e-4,'Entrada central exclusiva');}
  }
  if(mode!=='glucosuria'){assert.equal(sim.stats.laterTubule,0);assert.equal(sim.collectorGlucose,0);assert.ok(sim.particles.every(p=>p.willReabsorb));}
  assert.ok(sim.stats.processStage>=lastStage,'La etapa no debe retroceder');
  lastStage=sim.stats.processStage;seenStages.add(lastStage);
  if(sim.absorbed===0)assert.equal(lastStage,0);
  if(sim.absorbed>0&&sim.continuingGlucose===0)assert.equal(lastStage,1);
  assert.ok(sim.absorbed<=sim.filtered);assert.ok(sim.excreted<=sim.collectorGlucose);
  assert.ok(sim.particles.length<=CONFIG.maxParticles);maxActive=Math.max(maxActive,sim.particles.length);
  if(i%90===0)for(const cell of sim.bloodStream.cellPositions){
   assert.ok(cell.distance>=0&&cell.distance<=Math.min(sim.bloodStream.frontDistance,sim.bloodCircuit.length)+1e-8);
   assert.ok(cell.point.toArray().every(Number.isFinite));
   assert.ok(cell.point.distanceTo(sim.bloodCircuit.getPoint(cell.distance/sim.bloodCircuit.length))<=.281);
  }
 }
 assert.deepEqual([...seenStages],mode==='glucosuria'?[0,1,2]:[0,1]);
 assert.ok(sim.filtered>initiallyFiltered);assert.equal(sim.absorbed,removedAbsorbed);assert.equal(sim.excreted,removedExcreted);
 assert.ok(sim.absorbed>0);
 if(mode==='glucosuria'){assert.ok(sim.collectorGlucose>0);assert.ok(sim.excreted>0);assert.ok(sim.stats.laterTubule>0);}
 report.push({mode,initial,maxActive,absorbed:sim.absorbed,collector:sim.collectorGlucose,excreted:sim.excreted});
}
assert.ok(report[0].maxActive<report[1].maxActive&&report[1].maxActive<report[2].maxActive);
assert.ok(MODES.low.tubularSpeed<MODES.normal.tubularSpeed);
// Regular emission and distance-based motion are independent of rendering rate.
const a=new NormalSimulation(new THREE.Scene(),data),b=new NormalSimulation(new THREE.Scene(),data);
for(const mode of Object.keys(MODES)){
 a.setMode(mode);b.setMode(mode);
 function run(s,step){const n=Math.floor(37.123/step);for(let i=0;i<n;i++)s.update(step);s.update(37.123-n*step);}
 run(a,1/30);run(b,1/60);
 assert.deepEqual(a.stats,b.stats);
 assert.deepEqual(a.particles.map(p=>p.id),b.particles.map(p=>p.id));
 a.particles.forEach((p,i)=>assert.ok(Math.abs(p.lifeAge-b.particles[i].lifeAge)<1e-8));
}
// Normal and glucosuria share actual birth cadence, vascular and filtration timing.
a.setMode('normal');b.setMode('glucosuria');
for(let i=0;i<3600;i++){
 a.update(1/30);b.update(1/30);
 assert.equal(a.serial,b.serial,'Mismo número de esferas emitidas');
 assert.equal(a.filtered,b.filtered,'Mismo ritmo de llegada al filtrado');
 assert.equal(a.bloodStream.frontDistance,b.bloodStream.frontDistance,'Misma velocidad sanguínea');
 assert.equal(a.fluids[0].material.uniforms.uFront.value,b.fluids[0].material.uniforms.uFront.value,'Misma velocidad tubular');
 if(i<300){
  assert.equal(a.particles.length,b.particles.length);
  for(let k=0;k<a.particles.length;k++){
   assert.equal(a.particles[k].stage,b.particles[k].stage);
   assert.equal(a.particles[k].distance,b.particles[k].distance);
   assert.equal(a.particles[k].lifeAge,b.particles[k].lifeAge);
  }
 }
}
assert.ok(a.absorbed>b.absorbed);assert.equal(a.collectorGlucose,0);assert.ok(b.collectorGlucose>0);
// Regression: step 3 activates shortly after reabsorption, before the collector.
sim.setMode('glucosuria');sim.update(13);
assert.equal(sim.stats.processStage,1);assert.ok(sim.absorbed>0);assert.equal(sim.continuingGlucose,0);
sim.update(1.4);assert.equal(sim.stats.processStage,2);assert.ok(sim.continuingGlucose>0);
assert.equal(sim.collectorGlucose,0);assert.equal(sim.excreted,0);
sim.update(20);assert.equal(sim.stats.processStage,2);
sim.reset();assert.equal(sim.stats.processStage,0);assert.equal(sim.continuingGlucose,0);
// Switching from glucosuria clears continuing particles and cumulative collector events.
sim.setMode('normal');assert.equal(sim.stats.processStage,0);assert.equal(sim.bloodStream.frontDistance,0);assert.equal(sim.fluids[0].material.uniforms.uFront.value,0);assert.equal(sim.particles.length,1);assert.equal(sim.filtered,0);assert.equal(sim.collectorGlucose,0);assert.equal(sim.excreted,0);assert.equal(sim.stats.laterTubule,0);assert.ok(sim.particles.every(p=>p.willReabsorb));
assert.throws(()=>sim.setMode('unknown'));assert.throws(()=>sim.update(-1));
console.log('OK: tres estados desde la entrada central, sin sangre ni filtrado prellenados; glucosuria con la misma cadencia y velocidad de Normal; emisión uniforme a 30/60 FPS; velocidades constantes; entrada central; sangre solo por el circuito rojo; reabsorción en la zona marcada; glucosuria hasta el colector; etapas 1→2→3 sin retrocesos; cambio de estado limpio.');
console.table(report);
