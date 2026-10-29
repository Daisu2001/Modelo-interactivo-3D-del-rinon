import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three.module.js';
import { GLOMERULUS_STRUCTURES, GLOMERULUS_MODEL_ORIGIN, alignGlomerulusModel, prepareGlomerulusMesh } from '../glomerulus-structures.js';
import { GlomerulusSimulation } from '../glomerulus-simulation.js';

const file=fs.readFileSync(new URL('../Models/Glomerulo.glb',import.meta.url));
const metadata=JSON.parse(fs.readFileSync(new URL('../glomerulus-asset.json',import.meta.url)));
const check=JSON.parse(fs.readFileSync(new URL('./glomerulus-efferent-geometry-validation.json',import.meta.url)));
const routesBytes=fs.readFileSync(new URL('../glomerulus-routes.json',import.meta.url)),routes=JSON.parse(routesBytes);
assert.equal(createHash('sha256').update(file).digest('hex'),metadata.sourceSha256);
assert.equal(check.sourceSha256,metadata.sourceSha256);
assert.equal(check.routeSha256,createHash('sha256').update(routesBytes).digest('hex'));
assert.equal(check.outlets,4);assert.equal(check.outsideCenters,0);assert.equal(check.outsideEnvelope,0);
assert.ok(check.centerSamples>5000&&check.envelopeSamples>130000);
assert.deepEqual(metadata.modelOrigin,GLOMERULUS_MODEL_ORIGIN);
const length=file.readUInt32LE(12),gltf=JSON.parse(file.toString('utf8',20,20+length)),binary=file.subarray(28+length);
assert.equal(gltf.meshes.length,1);assert.equal(gltf.nodes.length,1);assert.equal(gltf.images.length,3);
const primitive=gltf.meshes[0].primitives[0];
function attribute(id){
 const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView];
 const Type={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[a.componentType];
 const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],start=(v.byteOffset??0)+(a.byteOffset??0);
 const b=binary.subarray(start,start+a.count*size*Type.BYTES_PER_ELEMENT);
 return new THREE.BufferAttribute(new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)),size,a.normalized??false);
}
const geometry=new THREE.BufferGeometry();
for(const [label,name] of Object.entries({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color',COLOR_1:'color_1'}))geometry.setAttribute(name,attribute(primitive.attributes[label]));
geometry.setIndex(attribute(primitive.indices));
assert.equal(geometry.index.count/3,10800);assert.equal(geometry.attributes.position.count,6543);
assert.equal(geometry.attributes.color.getX(0),1,'COLOR_0 is the neutral render layer, not the anatomical segmentation.');
const textures=gltf.images.map(image=>{
 const view=gltf.bufferViews[image.bufferView],bytes=binary.subarray(view.byteOffset,view.byteOffset+view.byteLength);
 assert.equal(bytes.subarray(1,4).toString('ascii'),'PNG');
 return new THREE.Texture({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)});
});
const definition=gltf.materials[0];
const texture=index=>textures[gltf.textures[index].source];
const sourceMaterial=new THREE.MeshStandardMaterial({map:texture(definition.pbrMetallicRoughness.baseColorTexture.index),normalMap:texture(definition.normalTexture.index),
 metalnessMap:texture(definition.pbrMetallicRoughness.metallicRoughnessTexture.index),roughnessMap:texture(definition.pbrMetallicRoughness.metallicRoughnessTexture.index)});
const make=()=>{const model=new THREE.Group(),node=new THREE.Mesh(geometry,sourceMaterial);const transform=gltf.nodes[0];node.position.fromArray(transform.translation);node.quaternion.fromArray(transform.rotation);model.add(node);alignGlomerulusModel(model);return {model,node};};
const anatomy=make(),filtration=make();const materials=[];
prepareGlomerulusMesh(anatomy.node,[],{anatomy:true});prepareGlomerulusMesh(filtration.node,materials);
anatomy.model.updateMatrixWorld(true);filtration.model.updateMatrixWorld(true);
assert.deepEqual(anatomy.node.position.toArray(),GLOMERULUS_MODEL_ORIGIN);assert.equal(anatomy.node.quaternion.angleTo(new THREE.Quaternion()),0);
assert.equal(anatomy.node.geometry.groups.length,7);
assert.deepEqual(new Set(anatomy.node.material.map(m=>m.name)),new Set(GLOMERULUS_STRUCTURES.map(p=>p.name)));
assert.deepEqual(anatomy.node.geometry.attributes.uv.array,geometry.attributes.uv.array);
const triangleSet=index=>{const list=[];for(let i=0;i<index.length;i+=3)list.push(index.slice(i,i+3).join(','));return list.sort();};
assert.deepEqual(triangleSet([...geometry.index.array]),triangleSet([...anatomy.node.geometry.index.array]),'Every uploaded triangle survives segmentation.');
for(const material of anatomy.node.material){
 for(const key of ['map','normalMap','metalnessMap','roughnessMap'])assert.equal(material[key],sourceMaterial[key]);
 assert.equal(material.vertexColors,false);assert.equal(material.color.getHex(),0xffffff);
 assert.equal(material.opacity,1);assert.equal(material.transparent,false);
}
materials[0].opacity=.03;assert.equal(anatomy.node.material[0].opacity,1,'Anatomy and Filtration materials are independent.');
const browserSource=fs.readFileSync(new URL('../anatomy-browser.js',import.meta.url),'utf8');
const helpers=browserSource.slice(browserSource.indexOf('function visiblePart('),browserSource.indexOf('export class ModelPreview')).replaceAll('export function','function');
const extractPreview=new Function('THREE',helpers+';return extractPreview;')(THREE);
const raycaster=new THREE.Raycaster(),selected=new Set();
for(const part of GLOMERULUS_STRUCTURES){
 const preview=extractPreview(anatomy.model,part.name);assert.ok(preview.children.length,part.name+' preview');
 let faces=0;preview.traverse(node=>{if(node.isMesh){faces+=node.geometry.attributes.position.count/3;assert.ok(node.material.map);assert.equal(node.material.opacity,1);}});
 assert.ok(faces>0);assert.ok(part.description&&part.function);
 if(part.name==='Cápsula de Bowman'){
  const box=new THREE.Box3().setFromObject(preview);
  assert.ok(box.min.distanceTo(new THREE.Vector3(-.849983,-.836105,-.227452))<.00001,'The unchanged capsule retains the established coordinate frame.');
  assert.ok(box.max.distanceTo(new THREE.Vector3(.912506,.838315,.839076))<.00001);
 }
}
for(const group of anatomy.node.geometry.groups){
 const name=anatomy.node.material[group.materialIndex].name;
 for(let offset=group.start;offset<Math.min(group.start+group.count,group.start+60)&&!selected.has(name);offset+=3){
  const p=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(anatomy.node.geometry.attributes.position,anatomy.node.geometry.index.getX(offset+k)));
  const normal=new THREE.Vector3().subVectors(p[1],p[0]).cross(new THREE.Vector3().subVectors(p[2],p[0])).normalize();if(normal.lengthSq()<.1)continue;
  const center=p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1/3).applyMatrix4(anatomy.node.matrixWorld);
  raycaster.set(center.clone().addScaledVector(normal,.00001),normal.clone().negate());raycaster.far=.0001;
  const hits=raycaster.intersectObject(anatomy.model,true);
  if(hits.some(hit=>anatomy.node.material[hit.face.materialIndex].name===name))selected.add(name);
 }
}
assert.equal(selected.size,6,'All six anatomical parts are selectable on the new mesh.');
const simulation=new GlomerulusSimulation(new THREE.Group(),routes);
assert.equal(simulation.paths.length,4);assert.equal(simulation.transfers.length,4);
assert.deepEqual(simulation.afferentOwners,[0,0,0,0]);
assert.equal(simulation.flowStarted.length,4);assert.equal(simulation.transferFronts.length,4);
simulation.update(35);assert.ok(simulation.filtered>0&&simulation.absorbed>0);
simulation.reset();assert.ok(simulation.flowStarted.every(x=>!x));assert.ok(simulation.transferFronts.every(x=>x===0));
console.log('OK: Glomerulo_fixed_2 exacto, 10.800 triángulos, seis partes seleccionables y sus vistas previas, texturas PBR/UV, alineación, materiales independientes y una entrada aferente y cuatro salidas eferentes.');
