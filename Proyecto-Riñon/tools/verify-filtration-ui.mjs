import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FormulaCarousel } from '../formula-carousel.js';
import { ICON_NAMES, iconMarkup, setControlLabel, hydrateIcons } from '../icons.js';
class Element {
  constructor(){this.listeners={};this.attributes={};this.children=[];this.scrollTop=0;this.classes=new Set();this.classList={add:n=>this.classes.add(n)};}
  addEventListener(type,fn){this.listeners[type]=fn;} setAttribute(k,v){this.attributes[k]=v;} removeAttribute(k){delete this.attributes[k];}
  append(node){this.children.push(node);} click(){this.listeners.click?.({target:this});}
  scrollTo(options){this.lastScroll=options;this.scrollTop=options.top;this.listeners.scroll?.();}
}
const group=(kind,count)=>{const node=new Element();node.dataset={formulaGroup:kind};node.children=Array.from({length:count},(_,i)=>Object.assign(new Element(),{offsetTop:i*160}));return node;};
const glucose=group('glucose',4),filtration=group('filtration',2),deck=new Element(),previous=new Element(),next=new Element(),position=new Element();
deck.querySelectorAll=()=>[glucose,filtration];
const elements={'#formula-deck':deck,'#formula-previous':previous,'#formula-next':next,'#formula-position':position};
const carousel=new FormulaCarousel({querySelector:s=>elements[s]});
assert.equal(position.textContent,'1 / 4');assert.equal(previous.disabled,true);assert.equal(filtration.hidden,true);
next.click();assert.equal(carousel.index,1);assert.equal(position.textContent,'2 / 4');
glucose.scrollTop=480;glucose.listeners.scroll();assert.equal(carousel.index,3);assert.equal(next.disabled,true);
previous.click();assert.equal(carousel.index,2);
let prevented=false;glucose.listeners.keydown({key:'Home',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(carousel.index,0);
carousel.setGroup('filtration');assert.equal(glucose.hidden,true);assert.equal(filtration.hidden,false);assert.equal(position.textContent,'1 / 2');
next.click();assert.equal(position.textContent,'2 / 2');assert.equal(next.disabled,true);
carousel.setActive(false);assert.equal(deck.hidden,true);carousel.setActive(true);assert.equal(deck.hidden,false);
const card=glucose.children[1];card.result='205 mg/min';carousel.setGroup('glucose');next.click();assert.equal(carousel.cards[1],card);assert.equal(carousel.cards[1].result,'205 mg/min');
globalThis.matchMedia=()=>({matches:true});carousel.go(3);assert.equal(glucose.lastScroll.behavior,'auto');delete globalThis.matchMedia;
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const icons=[...html.matchAll(/data-icon="([^"]+)"/g)].map(m=>m[1]);assert.ok(icons.length>40);
for(const name of icons){assert.ok(ICON_NAMES.includes(name),name);assert.ok(iconMarkup(name).includes('stroke="currentColor"'));}
assert.throws(()=>iconMarkup('unknown'));
const documentBefore=globalThis.document;globalThis.document={createTextNode:text=>({textContent:text})};
const button=new Element();setControlLabel(button,'pencil','Anotar');assert.ok(button.innerHTML.includes('<svg'));assert.equal(button.children[0].textContent,'Anotar');
const placeholder=new Element();placeholder.dataset={icon:'home'};hydrateIcons({querySelectorAll:()=>[placeholder]});assert.ok(placeholder.innerHTML.includes('viewBox="0 0 24 24"'));
globalThis.document=documentBefore;
console.log('OK: carrusel vertical de cuatro fórmulas de glucosa y dos de Starling, botones, scroll, teclado, valores persistentes, movimiento reducido e iconos SVG locales consistentes.');
