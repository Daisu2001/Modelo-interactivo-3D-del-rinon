import assert from 'node:assert/strict';
import { captureFilename, downloadPng, installScreenshotButton, freezeScrollPositions } from '../screenshot.js';

assert.equal(captureFilename(new Date(2026, 9, 29, 7, 3, 5)), 'Atlas-renal_2026-10-29_07-03-05.png');
const originals = { document: globalThis.document, window: globalThis.window,
  setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
  create: URL.createObjectURL, revoke: URL.revokeObjectURL, error: console.error };
const timers = [];
globalThis.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
globalThis.clearTimeout = () => {};
const button = { disabled: false, attributes: {}, addEventListener(type, callback) { this[type] = callback; },
  setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; } };
const status = { hidden: true, textContent: '' };
let fontsReady;
const body = {};
globalThis.document = { body, fonts: { ready: new Promise(resolve => { fontsReady = resolve; }) } };
globalThis.window = { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 3, scrollX: 0, scrollY: 0 };
try {
  const events = [];
  const image = {};
  let release;
  let attempts = 0;
  const capture = installScreenshotButton({ button, status,
    beforeCapture() { events.push('fresh-webgl'); },
    rasterize(root, options) {
      events.push('clone-screen');
      assert.equal(root, body);
      assert.equal(options.width, 1440); assert.equal(options.height, 900);
      assert.equal(options.scale, 2); assert.equal(options.allowTaint, false);
      assert.equal(options.useCORS, true);
      const cloneButton = { ...button, attributes: { ...button.attributes } };
      options.onclone({ querySelector: () => cloneButton, body: { querySelectorAll: () => [] } });
      assert.equal(cloneButton.disabled, false); assert.equal(cloneButton.attributes['aria-busy'], undefined);
      assert.equal(button.disabled, true); assert.equal(button.attributes['aria-busy'], 'true');
      return new Promise(resolve => { release = () => resolve(image); });
    },
    download(canvas) { attempts++; assert.equal(canvas, image); events.push('download'); }
  });
  assert.equal(button.click, capture);
  const first = capture();
  assert.equal(button.disabled, true);
  assert.deepEqual(events, []); // Espera fuentes antes de copiar la vista.
  await capture(); // Doble clic durante el trabajo: una sola imagen.
  fontsReady(); await Promise.resolve();
  assert.deepEqual(events, ['fresh-webgl', 'clone-screen']);
  release(); await first;
  assert.equal(attempts, 1); assert.equal(button.disabled, false);
  assert.equal(button.attributes['aria-busy'], undefined);
  assert.equal(status.textContent, 'Captura descargada.');

  const card = { style: { transform: 'none' } }, rotated = { style: { transform: 'rotate(5deg)' } };
  const scroller = { scrollLeft: 0, scrollTop: 156, style: {}, children: [card, rotated] };
  freezeScrollPositions({ querySelectorAll: () => [scroller] });
  assert.equal(scroller.scrollTop, 0); assert.equal(scroller.style.overflow, 'hidden');
  assert.match(card.style.transform, /^translate\(0px, -156px\)/);
  assert.ok(rotated.style.transform.endsWith('rotate(5deg)'));

  // Un fallo libera el control y permite reintentar.
  console.error = () => {};
  let fail = true;
  const retry = installScreenshotButton({ button, status, rasterize: async () => {
    if (fail) throw new Error('render failed'); return image;
  }, download: () => { attempts++; } });
  await retry(); assert.equal(button.disabled, false);
  assert.match(status.textContent, /No se pudo/);
  fail = false; await retry(); assert.equal(attempts, 2);

  // PNG real como Blob, nombre, clic de descarga y liberación diferida del recurso.
  const blob = new Blob(['PNG'], { type: 'image/png' });
  const link = { click() { this.clicked = true; }, remove() { this.removed = true; } };
  body.append = element => { assert.equal(element, link); };
  document.createElement = tag => { assert.equal(tag, 'a'); return link; };
  URL.createObjectURL = value => { assert.equal(value, blob); return 'blob:test-png'; };
  const revoked = []; URL.revokeObjectURL = value => revoked.push(value);
  await downloadPng({ toBlob(callback, type) { assert.equal(type, 'image/png'); callback(blob); } }, 'captura.png');
  assert.equal(link.download, 'captura.png'); assert.equal(link.href, 'blob:test-png');
  assert.ok(link.clicked && link.removed); assert.deepEqual(revoked, []);
  timers.find(timer => timer.delay === 30000).callback(); assert.deepEqual(revoked, ['blob:test-png']);
  await assert.rejects(downloadPng({ toBlob(callback) { callback(null); } }), /PNG/);
  console.log('OK: captura del viewport tras refrescar WebGL, espera de fuentes, PNG descargable, doble clic, recuperación ante errores, estado accesible y limpieza de recursos.');
} finally {
  globalThis.document = originals.document; globalThis.window = originals.window;
  globalThis.setTimeout = originals.setTimeout; globalThis.clearTimeout = originals.clearTimeout;
  URL.createObjectURL = originals.create; URL.revokeObjectURL = originals.revoke; console.error = originals.error;
}
