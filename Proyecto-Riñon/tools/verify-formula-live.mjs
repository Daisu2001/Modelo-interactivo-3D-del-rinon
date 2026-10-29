import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { calculateRenalState } from '../renal-physiology.js';
const source=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
class Element {
  constructor(){this.value='';this.checked=false;this.style={};this.listeners={};this.classes=new Set();this.classList={toggle:(n,v)=>v?this.classes.add(n):this.classes.delete(n),remove:n=>this.classes.delete(n)};}
  addEventListener(type,fn){this.listeners[type]=fn;}input(value){this.value=value;this.listeners.input?.({target:this});}click(){this.listeners.click?.({target:this});}
}
const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>['#'+m[1],new Element()]));
for(const [tag] of html.matchAll(/<input\b[^>]*>/g)){
  const attrs=Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  if(!attrs.id)continue;const node=nodes.get('#'+attrs.id);Object.assign(node,attrs);node.checked=/\bchecked\b/.test(tag);
}
const presets=['normal','threshold','glucosuria','tmg'].map(preset=>Object.assign(new Element(),{dataset:{preset}}));
const doc={querySelector(selector){if(nodes.has(selector))return nodes.get(selector);const match=selector.match(/data-preset="([^"]+)"/);if(match)return presets.find(p=>p.dataset.preset===match[1]);throw Error(selector)},querySelectorAll:()=>presets};
const filtration={setState(state){this.state=state}},carousel={setGroup(kind){this.kind=kind}};
const code=source.slice(source.indexOf('function initFormulas('),source.indexOf('// --- GESTOR DEL MÓDULO DE FÓRMULAS ---'));
const manager=new Function('document','calculateRenalState','filtrationModule','formulaCarousel',code+';return initFormulas();')(doc,calculateRenalState,filtration,carousel);
assert.equal(nodes.get('#res-fglu').textContent,'125.0 mg/min');
manager.switchFormulaModule('3');assert.equal(carousel.kind,'glucose');
nodes.get('#slider-pglu').input('240');assert.equal(nodes.get('#res-fglu').textContent,'300.0 mg/min');assert.equal(nodes.get('#res-rglu').textContent,'205.0 mg/min');assert.equal(nodes.get('#res-eglu').textContent,'95.0 mg/min');
manager.setFormulaSubtab('filtration');assert.equal(carousel.kind,'filtration');
nodes.get('#slider-pgc').input('70');assert.equal(nodes.get('#res-pfn').textContent,'+20.0 mmHg');assert.equal(nodes.get('#res-starling-tfg').textContent,'250.0 mL/min');assert.equal(filtration.state.tfg,250);
nodes.get('#slider-tfg').input('150');assert.equal(nodes.get('#link-starling').checked,false);assert.equal(filtration.state.tfg,150);assert.equal(nodes.get('#res-fglu').textContent,'360.0 mg/min');assert.equal(nodes.get('#res-eglu').textContent,'155.0 mg/min');
manager.setFormulaSubtab('glucose');assert.equal(nodes.get('#slider-pglu').value,'240');assert.equal(carousel.kind,'glucose');
nodes.get('#slider-tfg').input('0');assert.equal(nodes.get('#res-feglu').textContent,'0.0 %');assert.equal(nodes.get('#res-eglu').textContent,'0.0 mg/min');
const focusCode=source.slice(source.indexOf('function focusCameraOn('),source.indexOf('// --- PIZARRA DE ANOTACIONES ---'));
const camera=new THREE.PerspectiveCamera(45,1,.001,5000),controls={target:new THREE.Vector3(),update(){}};
const viewport={clientWidth:800,clientHeight:400};
const focus=new Function('THREE','camera','controls','container',focusCode+';return focusCameraOn;')(THREE,camera,controls,viewport);
const model=new THREE.Mesh(new THREE.BoxGeometry(1,.7,.2),new THREE.MeshBasicMaterial());model.position.set(.1,.3,0);focus(model);
assert.equal(camera.aspect,2);assert.ok(controls.target.distanceTo(model.position)<1e-8);assert.ok(camera.position.z>1);
viewport.clientWidth=viewport.clientHeight=0;focus(model);assert.ok(camera.position.toArray().every(Number.isFinite));
console.log('OK: siete parámetros actualizan las seis fórmulas y la simulación, TFG de Starling/manual, valores conservados entre grupos, TFG cero y encuadre con el espacio superior del visor.');
