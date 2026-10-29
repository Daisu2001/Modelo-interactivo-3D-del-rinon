// Pizarra transparente: mismas herramientas que en el visor 3D.
// Coordenadas normalizadas para conservar los trazos al cambiar de tamaño.
export class AnnotationLayer {
  constructor(canvas, toolbar, onStorageError = () => {}) {
    this.canvas = canvas;
    this.toolbar = toolbar;
    this.context = canvas.getContext('2d');
    this.onStorageError = onStorageError;
    this.strokes = [];
    this.enabled = false;
    this.eraser = false;
    this.key = '';
    this.current = null;
    this.sessionLayers = new Map();
    this.color = toolbar.querySelector('[data-ink-color]');
    this.width = toolbar.querySelector('[data-ink-width]');
    this.width.addEventListener('input', () => {
      toolbar.querySelector('output').textContent = `${this.width.value} px`;
    });
    toolbar.querySelector('[data-ink-eraser]').addEventListener('click', (event) => {
      this.eraser = !this.eraser;
      event.currentTarget.classList.toggle('active', this.eraser);
      event.currentTarget.setAttribute('aria-pressed', String(this.eraser));
      canvas.style.cursor = this.eraser ? 'cell' : 'crosshair';
    });
    toolbar.querySelector('[data-ink-undo]').addEventListener('click', () => {
      this.strokes.pop(); this.redraw(); this.save();
    });
    toolbar.querySelector('[data-ink-clear]').addEventListener('click', () => {
      this.strokes.length = 0; this.redraw(); this.save();
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (!this.enabled || this.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      this.current = {color: this.color.value, width: Number(this.width.value), eraser: this.eraser, points: [this.point(event)]};
      this.strokes.push(this.current);
      this.redraw();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.current || event.pointerId !== this.pointerId) return;
      this.current.points.push(this.point(event)); this.redraw();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (event) => {
        if (event.pointerId === this.pointerId) this.finish();
      });
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas.parentElement);
  }

  point(event) {
    const r = this.canvas.getBoundingClientRect();
    return {x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height))};
  }

  mount(parent) {
    this.finish();
    this.observer.unobserve(this.canvas.parentElement);
    parent.append(this.canvas);
    this.observer.observe(parent);
    this.resize();
  }

  finish() {
    if (!this.current) return;
    this.current = null;
    if (this.canvas.hasPointerCapture(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId);
    this.save();
  }

  setKey(key) {
    this.finish();
    this.key = `atlas-renal:ink:v1:${key}`;
    this.strokes = this.sessionLayers.get(this.key) || [];
    try {
      if (!this.sessionLayers.has(this.key)) {
        const stored = JSON.parse(localStorage.getItem(this.key) || '[]');
        if (Array.isArray(stored)) this.strokes = stored.filter(s => typeof s.color === 'string' && Number.isFinite(s.width) && Array.isArray(s.points) && s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
      }
    } catch { /* Un dato corrupto no impide abrir el recurso. */ }
    this.sessionLayers.set(this.key, this.strokes);
    this.resize();
  }

  setEnabled(enabled) {
    this.finish();
    this.enabled = enabled;
    this.canvas.hidden = !enabled;
    this.toolbar.hidden = !enabled;
    this.canvas.classList.toggle('drawing-active', enabled);
    if (enabled) this.resize();
  }

  save() {
    if (!this.key) return;
    this.sessionLayers.set(this.key, this.strokes);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.strokes));
      window.dispatchEvent(new CustomEvent('library-ink-saved'));
    } catch { this.onStorageError(); }
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.logicalWidth = Math.max(1, r.width);
    this.logicalHeight = Math.max(1, r.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.logicalWidth * dpr);
    this.canvas.height = Math.round(this.logicalHeight * dpr);
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redraw();
  }

  redraw() {
    const ctx = this.context, w = this.logicalWidth || 1, h = this.logicalHeight || 1;
    ctx.clearRect(0, 0, w, h);
    for (const stroke of this.strokes) {
      if (!stroke.points.length) continue;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = stroke.width;
      ctx.strokeStyle = stroke.color;
      ctx.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
      ctx.beginPath();
      stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h));
      if (stroke.points.length === 1) {
        const p = stroke.points[0]; ctx.lineTo(p.x * w + .01, p.y * h + .01);
      }
      ctx.stroke(); ctx.restore();
    }
  }
}
