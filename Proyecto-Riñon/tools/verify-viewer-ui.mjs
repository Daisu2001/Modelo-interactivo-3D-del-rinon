import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three.module.js';
import { GLOMERULUS_STRUCTURES } from '../glomerulus-structures.js';
import { NEPHRON_STRUCTURES } from '../nephron-structures.js';
import { NEPHRON85_STRUCTURES } from '../nephron85-structures.js';

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset; this.hidden = false; this.value = ''; this.attributes = {}; this.children = [];
    this.style = {}; this.listeners = {}; this.textContent = ''; this.classes = new Set(); this.queries = new Map();
    this.classList = { add: (...names) => names.forEach(n => this.classes.add(n)), remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: name => this.classes.has(name), toggle: (name, value = !this.classes.has(name)) => { value ? this.classes.add(name) : this.classes.delete(name); return value; } };
  }
  append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click?.({ target: this }); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  querySelector(selector) { if (!this.queries.has(selector)) this.queries.set(selector, new Element()); return this.queries.get(selector); }
}
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length);
const nodes = new Map(ids.map(id => { const el = new Element(); el.id = id; return ['#' + id, el]; }));
const tools = ['btn-select', 'btn-isolate', 'btn-highlight', 'btn-hide', 'btn-draw'].map(id => nodes.get('#' + id));
tools[0].classList.add('active');
const modelButtons = [...html.matchAll(/data-anatomy-model="([^"]+)"/g)].map(m => new Element({ anatomyModel: m[1] }));
nodes.get('#anatomy-model-picker').querySelectorAll = () => modelButtons;
const allChildren = parent => parent.children.flatMap(child => [child, ...allChildren(child)]);
const doc = { body: new Element(),
  querySelector(selector) {
    if (nodes.has(selector)) return nodes.get(selector);
    if (selector === '.tool-btn.active:not(#btn-draw)') return tools.find(b => b.id !== 'btn-draw' && b.classList.contains('active'));
    if (selector === '.tool-btn.requires-cut.active') return tools.find(b => b.classList.contains('requires-cut') && b.classList.contains('active')) ?? null;
    throw new Error('Unexpected selector ' + selector);
  },
  querySelectorAll(selector) { return selector === '.tool-btn' ? tools : selector === '[data-structure]'
    ? allChildren(nodes.get('#structure-list')).filter(el => el.dataset.structure) : []; },
  createElement: () => new Element(), createTextNode: text => Object.assign(new Element(), { textContent: text }) };

const browserSource = fs.readFileSync(new URL('../anatomy-browser.js', import.meta.url), 'utf8');
const prefix = browserSource.slice(browserSource.indexOf('const KIDNEY_STRUCTURES'), browserSource.indexOf('export class ModelPreview')).replaceAll('export function', 'function');
const args = ['THREE', 'GLOMERULUS_STRUCTURES', 'NEPHRON_STRUCTURES', 'NEPHRON85_STRUCTURES'];
const values = [THREE, GLOMERULUS_STRUCTURES, NEPHRON_STRUCTURES, NEPHRON85_STRUCTURES];
const { extractPreview } = new Function(...args, prefix + ';return {extractPreview};')(...values);
class Preview {
  constructor(canvas) { this.canvas = canvas; }
  setModel(model, name) { this.model = extractPreview(model, name); return this.model.children.length > 0; }
  update() {}
}
const Browser = new Function(...args, 'ModelPreview', 'document', prefix + browserSource.slice(browserSource.indexOf('export class AnatomyBrowser')).replace('export class', 'class') + ';return AnatomyBrowser;')(...values, Preview, doc);
const browser = new Browser(() => {}, () => {});
browser.refresh(); assert.equal(browser.parts.length, 0); assert.equal(nodes.get('#anatomy-details').hidden, true);
const makePart = (name, variant) => {
  const group = new THREE.Group(); group.userData.variant = variant;
  const material = new THREE.MeshStandardMaterial(); material.name = name;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .1), material)); return group;
};
const kidney = new THREE.Group(), complete = makePart('Corteza renal', 'completo'), cut = makePart('Cálices mayores', 'corte');
kidney.add(complete, cut); cut.visible = false; browser.setModel('kidney', kidney);
assert.deepEqual(browser.parts.map(p => p.name), ['Corteza renal']);
assert.equal(browser.canSelect('Médula renal'), false, 'A catalog entry without a preview is not offered.');
assert.equal(browser.select('Médula renal'), false); assert.equal(browser.selected, 'Corteza renal');
assert.equal(nodes.get('#structure-title').textContent, 'Corteza renal');

const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const section = (start, end) => main.slice(main.indexOf(start), main.indexOf(end, main.indexOf(start)));
const drawing = section('function setDrawingMode(', "annotationCanvas.addEventListener('pointerdown'");
const cutCode = section('function setCutView(', 'function updateCutOnlyTools(');
const layout = section('function updateModuleLayout(', 'function switchModule(');
// switchModule contains a tabBtns.forEach call, so take its external binding boundary.
const switchCode = main.slice(main.indexOf('function switchModule('), main.indexOf("tabBtns.forEach((btn) => btn.addEventListener"));
const home = section('function showHome(', "document.querySelector('#btn-home').addEventListener");
const ctx = { document: doc, drawingMode: false, currentActiveTab: '1', anatomyKind: 'kidney', isCutViewActive: false,
  annotationCanvas: nodes.get('#annotation-canvas'), drawingControls: nodes.get('#drawing-controls'), drawButton: nodes.get('#btn-draw'),
  glucoseDrawButton: nodes.get('#btn-glucose-draw'), controls: { enabled: true }, previousToolButton: tools[0], activeToolId: 'btn-select',
  kidneyModel: kidney, glomerulusAnatomy: null, nephronAnatomy: null, nephron85Anatomy: null,
  anatomyBrowser: browser, infoPanel: nodes.get('#info-panel'), tabBtns: ['1', '2', '3'].map(tab => new Element({ tab })),
  glucoseModule: { ready: true, root: new THREE.Group(), setActive(value) { this.active = value; } },
  filtrationModule: { simulation: {}, root: new THREE.Group(), setActive(value) { this.active = value; } },
  formulaCarousel: { setActive(value) { this.active = value; } },
  formulasManager: { switchFormulaModule(id) { this.active = id; } }, strokes: [], notes: { '1': [], '2': [], '3': [] },
  getAnnotationLayer() { return ctx.notes[ctx.currentActiveTab]; }, restoreIsolation() {}, updateCutOnlyTools() {},
  redrawAnnotations() {}, focusCameraOn() {}, getActiveModel: () => kidney };
const ui = new Function('context', `with(context){${drawing}\n${cutCode}\n${layout}\n${switchCode}\n${home}\n
glucoseDrawButton.addEventListener('click',()=>setDrawingMode(!drawingMode));
return {setDrawingMode,setCutView,switchModule,showHome};}`)(ctx);
ui.setCutView(true); assert.deepEqual(browser.parts.map(p => p.name), ['Cálices mayores']);
assert.equal(browser.selected, 'Cálices mayores'); assert.equal(browser.partPreview.model.children.length, 1);
ui.setCutView(false); assert.deepEqual(browser.parts.map(p => p.name), ['Corteza renal']);

ui.switchModule('2'); assert.equal(doc.body.classList.contains('glucose-screen-active'), true);
assert.equal(nodes.get('#glucose-controls-panel').hidden, false); assert.equal(nodes.get('#glucose-note-tool').hidden, false);
assert.equal(ctx.glucoseModule.active, true); assert.equal(kidney.visible, false);
nodes.get('#btn-glucose-draw').click(); assert.equal(ctx.drawingMode, true); assert.equal(ctx.controls.enabled, false);
assert.equal(nodes.get('#btn-glucose-draw').attributes['aria-expanded'], 'true');
assert.equal(nodes.get('#drawing-controls').attributes['aria-hidden'], 'false');
assert.equal(nodes.get('#annotation-canvas').classList.contains('drawing-active'), true);
ctx.notes['2'].push({ points: [{ x: .2, y: .3 }] });
ui.switchModule('3'); assert.equal(ctx.drawingMode, false); assert.equal(ctx.controls.enabled, true);
assert.equal(nodes.get('#glucose-controls-panel').hidden, true); assert.equal(nodes.get('#glucose-note-tool').hidden, false);
assert.equal(nodes.get('#filtration-controls-panel').hidden, false);
assert.equal(ctx.formulaCarousel.active, true);
assert.equal(ctx.notes['2'].length, 1, 'Switching modules preserves the annotations.');
ui.switchModule('2'); assert.equal(ctx.notes['2'].length, 1);
ui.showHome(); assert.equal(doc.body.classList.contains('glucose-screen-active'), false);
assert.equal(nodes.get('#glucose-controls-panel').hidden, true); assert.equal(nodes.get('#glucose-note-tool').hidden, true);
assert.equal(nodes.get('#btn-glucose-draw').attributes['aria-expanded'], 'false');
console.log('OK: lista anatómica sin fichas vacías, cambio completo/corte con selección válida, paneles de Glucosa, anotación flotante, cierre al cambiar de módulo y conservación de trazos.');
