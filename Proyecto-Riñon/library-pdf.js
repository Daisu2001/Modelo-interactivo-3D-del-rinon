// Lector PDF local: ajusta cada página usando sus dimensiones reales.
export class PdfReader {
  constructor({media, stage, onSurface, onPage, onStatus, onReady, onError}) {
    Object.assign(this, {media, stage, onSurface, onPage, onStatus, onReady, onError});
    this.pageNumber = 1;
    this.fit = 'page';
    this.zoom = 1;
    this.serial = 0;
    this.closed = false;
    this.ready = false;
    this.observer = new ResizeObserver(() => {
      const size = `${stage.clientWidth}:${stage.clientHeight}`;
      if (size === this.size) return;
      this.size = size;
      if (this.document) this.render();
    });
    this.observer.observe(stage);
  }

  async open(id) {
    try {
      const pdfjs = await import('./vendor/pdfjs/build/pdf.mjs');
      if (this.closed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/build/pdf.worker.mjs', import.meta.url).href;
      const options = {
        cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href,
        wasmUrl: new URL('./vendor/pdfjs/wasm/', import.meta.url).href,
        iccUrl: new URL('./vendor/pdfjs/iccs/', import.meta.url).href,
        disableAutoFetch: false,
        disableStream: false,
        rangeChunkSize: 1_048_576
      };
      const sources = [`./api/library-pdf/${encodeURIComponent(id)}`, `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`];
      for (let i = 0; i < sources.length; i++) {
        this.loading = pdfjs.getDocument({...options, url: sources[i]});
        this.loading.onProgress = ({loaded, total}) => {
          if (!this.closed && !this.ready) this.onStatus(total ? `Cargando documento… ${Math.min(100, Math.round(loaded / total * 100))}%` : 'Cargando documento…');
        };
        try { this.document = await this.loading.promise; break; }
        catch (error) {
          await this.loading.destroy();
          if (this.closed) return;
          if (i === sources.length - 1) throw error;
        }
      }
      if (this.closed) return;
      this.media.classList.add('pdf-media');
      this.surface = document.createElement('div');
      this.surface.className = 'library-pdf-page';
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-label', 'Página del documento PDF');
      this.surface.append(this.canvas);
      this.media.append(this.surface);
      this.onSurface(this.surface);
      this.onPage(1, this.document.numPages);
      await this.render();
    } catch (error) {
      if (!this.closed && error.name !== 'RenderingCancelledException') this.onError(error);
    }
  }

  async render() {
    if (!this.document || this.closed) return;
    const serial = ++this.serial;
    const pageNumber = this.pageNumber;
    this.renderTask?.cancel();
    try {
      // Cancelled renders must finish before reusing the same canvas.
      if (this.renderTask) { try { await this.renderTask.promise; } catch {} }
      const page = await this.document.getPage(pageNumber);
      if (serial !== this.serial || this.closed) return;
      const original = page.getViewport({scale: 1});
      const width = Math.max(1, this.stage.clientWidth - 32);
      const height = Math.max(1, this.stage.clientHeight - 32);
      const fitted = this.fit === 'width' ? width / original.width : Math.min(width / original.width, height / original.height);
      const viewport = page.getViewport({scale: fitted * this.zoom});
      const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)));
      this.surface.style.width = `${viewport.width}px`;
      this.surface.style.height = `${viewport.height}px`;
      this.canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      this.canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      this.canvas.style.width = `${viewport.width}px`;
      this.canvas.style.height = `${viewport.height}px`;
      this.canvas.setAttribute('aria-label', `Página ${pageNumber} de ${this.document.numPages}`);
      this.renderTask = page.render({canvasContext: this.canvas.getContext('2d'), viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0]});
      await this.renderTask.promise;
      if (serial !== this.serial || this.closed) return;
      this.ready = true;
      this.onStatus('');
      this.onReady({page: pageNumber, pages: this.document.numPages, scale: viewport.scale});
    } catch (error) {
      if (serial === this.serial && !this.closed && error.name !== 'RenderingCancelledException') this.onError(error);
    }
  }

  setPage(number) {
    if (!this.document) return;
    this.pageNumber = Math.max(1, Math.min(this.document.numPages, Math.round(Number(number) || 1)));
    this.onPage(this.pageNumber, this.document.numPages);
    this.media.scrollTo(0, 0);
    this.render();
  }

  setFit(mode) {
    this.fit = mode;
    this.zoom = 1;
    this.media.scrollTo(0, 0);
    this.render();
  }

  changeZoom(multiplier) {
    this.zoom = Math.max(.5, Math.min(4, this.zoom * multiplier));
    this.render();
  }

  destroy() {
    this.closed = true;
    this.serial++;
    this.observer.disconnect();
    this.renderTask?.cancel();
    this.loading?.destroy().catch(() => {});
  }
}
