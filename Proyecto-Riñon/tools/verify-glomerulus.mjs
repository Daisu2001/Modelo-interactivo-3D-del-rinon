import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { calculateRenalState } from '../renal-physiology.js';
import { GlomerulusSimulation } from '../glomerulus-simulation.js';

let s = calculateRenalState();
assert.equal(s.pfn, 10); assert.equal(s.tfg, 125);
assert.equal(s.filtered, 125); assert.equal(s.reabsorbed, 125); assert.equal(s.excreted, 0);
s = calculateRenalState({pglu:240});
assert.equal(s.filtered, 300); assert.equal(s.reabsorbed, 205); assert.equal(s.excreted, 95);
assert.equal(s.fractionExcreted, 95 / 300);
s = calculateRenalState({pgc:70});
assert.equal(s.tfg,250); assert.equal(s.filtered,250); assert.equal(s.excreted,45);
s = calculateRenalState({pgc:45,pbs:25,pigc:40});
assert.equal(s.tfg,0);assert.equal(s.filtered,0);assert.equal(s.excreted,0);
s = calculateRenalState({pgc:45,pbs:25,pigc:40,linkStarling:false,tfg:150});
assert.equal(s.tfg,150);assert.equal(s.starlingTfg,0);
for(let pglu=50;pglu<=400;pglu+=10)for(let tfg=0;tfg<=625;tfg+=12.5){
 const state=calculateRenalState({pglu,tfg,linkStarling:false});
 assert.ok(state.reabsorbed<=state.filtered);
 assert.ok(Math.abs(state.filtered-state.reabsorbed-state.excreted)<1e-8);
 assert.ok(state.reabsorptionFraction>=0&&state.reabsorptionFraction<=1);
 assert.ok(Math.abs(state.inletRate*state.filtrationProbability-state.filtered/100)<1e-8);
}
const routes=JSON.parse(fs.readFileSync(new URL('../glomerulus-routes.json',import.meta.url)));
const sim=new GlomerulusSimulation(new THREE.Group(),routes);
const samples=[];
function run(parameters,seconds=120) {
 sim.setState(calculateRenalState(parameters));sim.reset();
 for(let i=0;i<seconds*20;i++){
  sim.update(.05);
  const st=sim.stats;
  assert.equal(sim.serial,st.active+st.absorbed+st.continued+st.unfiltered);
  assert.ok(st.absorbed+st.continued<=st.filtered);
  for(const p of sim.particles){
   assert.ok(sim.position(p).toArray().every(Number.isFinite));
   if(p.stage==='blood'){
    assert.ok(sim.paths[p.branch].radiusAt(p.distance/sim.paths[p.branch].length)>.012);
   }
  }
 }
 return {...sim.stats};
}
const low=run({pgc:55}),normal=run({}),high=run({pgc:70});
assert.ok(low.filtered<normal.filtered&&normal.filtered<high.filtered);
assert.equal(low.continued,0);assert.equal(normal.continued,0);assert.ok(high.continued>0);
const glucosuria=run({pglu:240},180);
const completed=glucosuria.absorbed+glucosuria.continued;
assert.ok(Math.abs(glucosuria.continued/completed-95/300)<.025);
const stopped=run({pgc:45,pbs:25,pigc:40},30);
assert.equal(stopped.filtered,0);assert.equal(stopped.absorbed,0);assert.equal(stopped.continued,0);
assert.ok(sim.cells.count>0,'La perfusión no se confunde con la filtración.');
sim.setState(calculateRenalState({}));sim.update(20);
const before=sim.filtered;
sim.setState(calculateRenalState({pgc:45,pbs:25,pigc:40}));sim.update(10);
assert.equal(sim.filtered,before,'No se filtra glucosa nueva con PFN negativa.');
sim.reset();assert.equal(sim.stats.active,0);assert.equal(sim.cells.count,0);
assert.equal(sim.filtrateFluid.material.uniforms.front.value,0);
samples.push({scenario:'baja',...low},{scenario:'normal',...normal},{scenario:'elevada',...high},{scenario:'glucosuria',...glucosuria},{scenario:'cese',...stopped});
console.log('OK: fórmulas acopladas, conservación de glucosa, rutas vasculares, tasas según TFG, reabsorción según TmG, PFN negativa y reinicio.');
console.table(samples);
