import html2canvas from './vendor/html2canvas.esm.js';

export function captureFilename(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `Atlas-renal_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.png`;
}

export function freezeScrollPositions(root) {
  // Al convertir el clon a SVG, scrollTop/scrollLeft no se serializan.
  // Desplazar sus hijos en el clon conserva la tarjeta y el panel que se veían.
  for (const element of root.querySelectorAll('*')) {
    const left = element.scrollLeft, top = element.scrollTop;
    if ((!left && !top) || !element.children.length) continue;
    element.style.scrollBehavior = 'auto';
    element.style.scrollSnapType = 'none';
    element.style.overflow = 'hidden';
    element.scrollLeft = 0;
    element.scrollTop = 0;
    for (const child of element.children) {
      const transform = child.style.transform;
      child.style.transition = 'none';
      child.style.transform = `translate(${-left}px, ${-top}px) ${transform && transform !== 'none' ? transform : ''}`;
    }
  }
}

export async function downloadPng(canvas, filename = captureFilename()) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo generar el PNG.')), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  try { link.click(); } finally {
    link.remove();
    // El navegador debe poder iniciar la descarga antes de liberar la imagen.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

export function installScreenshotButton({
  button = document.querySelector('#btn-save'),
  status = document.querySelector('#capture-status'),
  beforeCapture = () => {},
  rasterize = html2canvas,
  download = downloadPng
} = {}) {
  let busy = false;
  let statusTimer;
  const notify = message => {
    if (!status) return;
    clearTimeout(statusTimer);
    status.textContent = message;
    status.hidden = !message;
    if (message) statusTimer = setTimeout(() => { status.hidden = true; }, 5000);
  };

  async function capture() {
    if (busy) return;
    busy = true;
    const wasDisabled = button.disabled;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    notify('');
    try {
      await document.fonts?.ready;
      // Debe ser síncrono: WebGL descarta su búfer después de cada fotograma.
      // html2canvas copia los canvas al clonar el DOM, antes de su primera espera.
      beforeCapture();
      const image = await rasterize(document.body, {
        backgroundColor: '#f2eee9',
        foreignObjectRendering: true,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        allowTaint: false,
        logging: false,
        ignoreElements(element) {
          // Omitir recursos de las secciones cerradas también evita recargarlos.
          return element.hidden === true || (element.matches?.('.home-intro, .library-page, dialog:not([open])')
            && window.getComputedStyle(element).display === 'none');
        },
        onclone(clone) {
          freezeScrollPositions(clone.body);
          // Mostrar el botón con su aspecto habitual en la captura.
          const save = clone.querySelector('#btn-save');
          if (save) { save.disabled = wasDisabled; save.removeAttribute('aria-busy'); }
        }
      });
      await download(image);
      notify('Captura descargada.');
    } catch (error) {
      console.error('No se pudo guardar la captura del Atlas renal.', error);
      notify('No se pudo guardar la captura. Vuelve a intentarlo.');
    } finally {
      button.disabled = wasDisabled;
      button.removeAttribute('aria-busy');
      busy = false;
    }
  }
  button.addEventListener('click', capture);
  return capture;
}
