import { setControlLabel, hydrateIcons } from './icons.js';
hydrateIcons();
import {AnnotationLayer} from './library-annotations.js';
import {PdfReader} from './library-pdf.js';

const $ = selector => document.querySelector(selector);
const dialog = $('#library-reader');
const media = $('#library-reader-media');
const stage = $('#library-reader-stage');
const annotate = $('#library-reader-annotate');
const status = $('#library-reader-status');
const notePage = $('#library-note-page');
let resource = null, trigger = null, player = null, playerReady = false;
let generation = 0, videoTime = 0, apiPromise = null, catalog = null;
let pdfReader = null;
const pdfControls = $('#library-pdf-controls');
const ink = new AnnotationLayer($('#library-reader-ink'), $('#library-ink-toolbar'), () => {
  status.textContent = 'No se pudieron guardar los trazos en este navegador. Se conservan durante esta sesión.';
});

function selectTab(id, focus = false) {
  for (const tab of document.querySelectorAll('[data-library-tab]')) {
    const selected = tab.dataset.libraryTab === id;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(`library-${tab.dataset.libraryTab}`).hidden = !selected;
    if (selected && focus) tab.focus();
  }
}
const tabs = [...document.querySelectorAll('[data-library-tab]')];
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.libraryTab));
  tab.addEventListener('keydown', event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next !== null) { event.preventDefault(); selectTab(tabs[next].dataset.libraryTab, true); }
  });
});

function timestamp(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function annotationKey() {
  return `${resource.type}:${resource.id}:${resource.type === 'video' ? videoTime : resource.type === 'pdf' ? Number(notePage.value) : 1}`;
}

function setDrawing(enabled, keepTime = false) {
  if (!resource) return;
  if (enabled && resource.type === 'video') {
    if (!playerReady) return;
    if (!keepTime) videoTime = Math.round(player.getCurrentTime() * 1000) / 1000;
    player.pauseVideo();
    $('#library-video-time').textContent = `Anotación en ${timestamp(videoTime)} · video en pausa`;
  }
  if (enabled) ink.setKey(annotationKey());
  ink.setEnabled(enabled);
  stage.classList.toggle('is-annotating', enabled);
  annotate.setAttribute('aria-pressed', String(enabled));
  annotate.classList.toggle('active', enabled);
  setControlLabel(annotate, enabled ? 'check' : 'pencil', enabled ? 'Terminar anotación' : 'Anotar');
  notePage.disabled = enabled;
  if (resource.type === 'pdf') {
    document.querySelector('[data-pdf-prev]').disabled = enabled || !pdfReader?.document || pdfReader.pageNumber <= 1;
    document.querySelector('[data-pdf-next]').disabled = enabled || !pdfReader?.document || pdfReader.pageNumber >= pdfReader.document.numPages;
  }
  if (!enabled && resource.type === 'video') {
    $('#library-video-time').textContent = 'Usa los controles del reproductor para continuar.';
  }
}
annotate.addEventListener('click', () => setDrawing(!ink.enabled));
$('#library-ink-done').addEventListener('click', () => setDrawing(false));
notePage.addEventListener('change', () => {
  notePage.value = String(Math.max(1, Math.min(10000, Math.round(Number(notePage.value) || 1))));
  if (pdfReader?.document) { setDrawing(false); pdfReader.setPage(notePage.value); }
});

for (const button of document.querySelectorAll('[data-pdf-fit]')) {
  button.addEventListener('click', () => {
    if (!pdfReader) return;
    document.querySelectorAll('[data-pdf-fit]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    pdfReader.setFit(button.dataset.pdfFit);
  });
}
document.querySelector('[data-pdf-prev]').addEventListener('click', () => { setDrawing(false); pdfReader?.setPage(pdfReader.pageNumber - 1); });
document.querySelector('[data-pdf-next]').addEventListener('click', () => { setDrawing(false); pdfReader?.setPage(pdfReader.pageNumber + 1); });
document.querySelector('[data-pdf-zoom="in"]').addEventListener('click', () => pdfReader?.changeZoom(1.2));
document.querySelector('[data-pdf-zoom="out"]').addEventListener('click', () => pdfReader?.changeZoom(1 / 1.2));

function stopPlayer() {
  playerReady = false;
  if (player) { try { player.destroy(); } catch {} }
  player = null;
}

function openReader(item, button) {
  generation++;
  setDrawing(false);
  stopPlayer();
  pdfReader?.destroy(); pdfReader = null;
  ink.mount(stage);
  resource = item;
  trigger = button;
  media.replaceChildren();
  media.classList.remove('pdf-media');
  status.textContent = '';
  notePage.value = '1';
  notePage.max = '10000';
  notePage.disabled = false;
  videoTime = 0;
  stage.className = `library-reader-stage reader-${item.type}`;
  dialog.dataset.kind = item.type;
  $('#library-reader-title').textContent = item.title;
  $('#library-reader-kind').textContent = item.type === 'pdf' ? 'Libros y documentos' : item.type === 'video' ? 'Medizi · Dr. Eduardo Paiva' : 'Ilustraciones y diagramas';
  $('#library-page-label').hidden = item.type !== 'pdf';
  $('#library-video-time').hidden = item.type !== 'video';
  $('#library-video-notes').hidden = item.type !== 'video';
  $('#library-reader-source').href = item.source;
  const download = $('#library-reader-download');
  download.hidden = item.type === 'video';
  download.href = item.download || item.source;
  setControlLabel(download, 'download', item.type === 'pdf' ? 'Descargar PDF' : 'Descargar SVG');
  if (item.type === 'image') download.setAttribute('download', `${item.id}.svg`);
  else download.removeAttribute('download');
  annotate.disabled = item.type === 'video' || item.type === 'pdf';
  pdfControls.hidden = item.type !== 'pdf';
  pdfControls.querySelectorAll('button').forEach(button => button.disabled = true);
  $('#library-pdf-pages').textContent = 'Cargando páginas…';
  $('#library-pdf-zoom').textContent = '';
  document.querySelectorAll('[data-pdf-fit]').forEach(b => { const fit = b.dataset.pdfFit === 'page'; b.classList.toggle('active', fit); b.setAttribute('aria-pressed', String(fit)); });
  if (!dialog.open) dialog.showModal();
  document.documentElement.classList.add('library-reader-open');
  ink.setKey(annotationKey());
  if (item.type === 'pdf') {
    $('#library-page-label').firstChild.textContent = 'Página ';
    notePage.setAttribute('aria-label', 'Ir a una página del PDF');
    $('#library-reader-hint').textContent = 'La página se ajusta a la ventana. Puedes ampliar, cambiar de página y anotar sobre el documento.';
    status.textContent = 'Cargando documento…';
    const token = generation;
    pdfReader = new PdfReader({
      media, stage,
      onSurface(surface) { if (token === generation) ink.mount(surface); },
      onPage(page, pages) {
        if (token !== generation) return;
        annotate.disabled = true;
        notePage.value = String(page); notePage.max = String(pages);
        $('#library-pdf-pages').textContent = `Página ${page} de ${pages}`;
        ink.setKey(annotationKey());
      },
      onStatus(text) { if (token === generation) status.textContent = text; },
      onReady({page, pages, scale}) {
        if (token !== generation) return;
        annotate.disabled = false;
        pdfControls.querySelectorAll('button').forEach(button => button.disabled = false);
        document.querySelector('[data-pdf-prev]').disabled = ink.enabled || page <= 1;
        document.querySelector('[data-pdf-next]').disabled = ink.enabled || page >= pages;
        $('#library-pdf-zoom').textContent = `${Math.round(scale * 100)}%`;
        ink.resize();
      },
      onError() {
        if (token !== generation) return;
        pdfReader?.destroy(); pdfReader = null;
        setDrawing(false); ink.mount(stage); media.replaceChildren(); media.classList.remove('pdf-media');
        pdfControls.hidden = true; annotate.disabled = false;
        $('#library-page-label').firstChild.textContent = 'Página de tus anotaciones ';
        notePage.setAttribute('aria-label', 'Página para guardar las anotaciones');
        const frame = document.createElement('iframe'); frame.title = `Documento PDF: ${item.title}`; frame.src = item.preview; media.append(frame);
        status.textContent = 'Se abrió el visor de respaldo. Si no aparece el documento, usa Abrir original para revisar su acceso.';
        $('#library-reader-hint').textContent = 'Usa los controles del documento para ajustar el zoom. Indica la página antes de anotar.';
      }
    });
    pdfReader.open(item.id);
  } else if (item.type === 'image') {
    $('#library-reader-hint').textContent = 'Abre Anotar para dibujar sobre el esquema. Tus trazos se guardan en este navegador.';
    const image = document.createElement('img'); image.src = item.source; image.alt = item.title;
    media.append(image);
  } else {
    $('#library-reader-hint').textContent = 'Anotar pausa el video y guarda tus trazos en ese momento. Termina la anotación para volver a los controles.';
    $('#library-video-time').textContent = 'Reproductor interno de YouTube';
    loadVideo(item, generation);
    renderVideoNotes();
  }
}

$('#library-reader-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  generation++;
  setDrawing(false);
  stopPlayer();
  pdfReader?.destroy(); pdfReader = null;
  ink.mount(stage);
  media.replaceChildren();
  media.classList.remove('pdf-media');
  document.documentElement.classList.remove('library-reader-open');
  resource = null;
  trigger?.focus(); trigger = null;
});

document.querySelectorAll('.library-view-button').forEach(button => {
  button.disabled = false;
  button.addEventListener('click', () => {
    const file = button.closest('.library-file');
    const id = button.dataset.previewUrl.match(/\/d\/([^/]+)/)[1];
    openReader({type: 'pdf', id, title: file.querySelector('summary strong').textContent.trim(), preview: button.dataset.previewUrl, source: `https://drive.google.com/file/d/${id}/view`, download: file.querySelector('.library-download-button').href}, button);
  });
});

const diagrams = [
  {id: 'anatomia-renal', title: 'Anatomía del riñón', description: 'Corte esquemático: corteza, médula, cálices, pelvis y vasos.'},
  {id: 'recorrido-nefrona', title: 'Recorridos de sangre y filtrado', description: 'Dos rutas separadas y el retorno de sustancias hacia la sangre.'},
  {id: 'glucosa-filtracion', title: 'Filtración y reabsorción de glucosa', description: 'La carga filtrada, la capacidad de transporte y la glucosa que continúa.'}
];
for (const item of diagrams) {
  const card = document.createElement('article'); card.className = 'library-diagram-card';
  const image = document.createElement('img'); image.src = `illustrations/${item.id}.svg`; image.alt = item.title;
  const title = document.createElement('h3'); title.textContent = item.title;
  const copy = document.createElement('p'); copy.textContent = item.description;
  const button = document.createElement('button'); button.className = 'library-view-button'; button.type = 'button'; setControlLabel(button, 'external', 'Abrir esquema y anotar');
  button.addEventListener('click', () => openReader({type: 'image', ...item, source: `illustrations/${item.id}.svg`}, button));
  card.append(image, title, copy, button); $('#library-diagram-list').append(card);
}

function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { apiPromise = null; reject(new Error('timeout')); }, 20000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); previous?.(); resolve(window.YT); };
    const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timer); apiPromise = null; script.remove(); reject(new Error('network')); };
    document.head.append(script);
  });
  return apiPromise;
}

async function loadVideo(item, token) {
  status.textContent = 'Conectando con YouTube…';
  try {
    const YT = await loadYouTubeAPI();
    if (token !== generation || !dialog.open) return;
    const host = document.createElement('div'); media.append(host);
    player = new YT.Player(host, {
      host: 'https://www.youtube-nocookie.com',
      width: '100%', height: '100%', videoId: item.id,
      playerVars: {playsinline: 1, rel: 0, origin: location.origin},
      events: {
        onReady(event) {
          if (token !== generation) { event.target.destroy(); return; }
          playerReady = true; annotate.disabled = false;
          status.textContent = '';
        },
        onStateChange(event) {
          if (token !== generation) return;
          if (event.data === YT.PlayerState.PLAYING && ink.enabled) event.target.pauseVideo();
        },
        onError(event) {
          if (token !== generation) return;
          playerReady = false; annotate.disabled = true; setDrawing(false);
          status.textContent = event.data === 101 || event.data === 150 ? 'Este video no permite reproducción dentro de la aplicación. Usa Abrir original para verlo en YouTube.' : 'YouTube no pudo reproducir esta clase. Usa Abrir original para verla en YouTube.';
        }
      }
    });
  } catch {
    if (token === generation) status.textContent = 'No se pudo conectar con el reproductor. Revisa tu conexión o usa Abrir original para ver el video en YouTube.';
  }
}

function renderVideoNotes() {
  if (resource?.type !== 'video') return;
  const list = $('#library-video-note-list'); list.replaceChildren();
  const prefix = `atlas-renal:ink:v1:video:${resource.id}:`;
  const moments = [];
  try {
    const keys = new Set(ink.sessionLayers.keys());
    for (let i = 0; i < localStorage.length; i++) {
      keys.add(localStorage.key(i));
    }
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const strokes = ink.sessionLayers.get(key) || JSON.parse(localStorage.getItem(key));
      const time = Number(key.slice(prefix.length));
      if (Array.isArray(strokes) && strokes.length && Number.isFinite(time)) moments.push(time);
    }
  } catch { /* La pizarra continúa funcionando sin almacenamiento persistente. */ }
  moments.sort((a, b) => a - b);
  if (!moments.length) { const text = document.createElement('p'); text.textContent = 'Todavía no tienes anotaciones en esta clase.'; list.append(text); }
  for (const time of moments) {
    const button = document.createElement('button'); button.type = 'button'; setControlLabel(button, 'pencil', timestamp(time));
    button.addEventListener('click', () => {
      if (!playerReady) return;
      setDrawing(false); videoTime = time;
      player.seekTo(time, true); player.pauseVideo(); setDrawing(true, true);
    });
    list.append(button);
  }
}
window.addEventListener('library-ink-saved', renderVideoNotes);

const topicSelect = $('#library-video-topic');
const search = $('#library-video-search');
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
function renderVideos() {
  if (!catalog) return;
  const topic = catalog.topics.find(t => t.id === topicSelect.value);
  const query = normalize(search.value.trim());
  const visible = topic.videos.filter(v => normalize(`${v.title} ${v.section}`).includes(query));
  const list = $('#library-video-list'); list.replaceChildren();
  $('#library-video-count').textContent = `${visible.length} de ${topic.videos.length} clases · ${catalog.topics.reduce((n, t) => n + t.videos.length, 0)} clases en la biblioteca`;
  $('#library-video-empty').hidden = visible.length > 0;
  let section = '';
  for (const video of visible) {
    if (section !== video.section) {
      section = video.section;
      const heading = document.createElement('h3'); heading.className = 'library-video-section'; heading.textContent = section;
      list.append(heading);
    }
    const button = document.createElement('button'); button.type = 'button'; button.className = 'library-video-card'; button.setAttribute('aria-haspopup', 'dialog');
    const number = document.createElement('span'); number.className = 'library-video-order'; number.textContent = String(video.order).padStart(2, '0');
    const thumb = document.createElement('img'); thumb.src = `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`; thumb.alt = ''; thumb.loading = 'lazy';
    thumb.addEventListener('error', () => { thumb.src = 'illustrations/video-placeholder.svg'; }, {once: true});
    const text = document.createElement('span'); text.className = 'library-video-copy';
    const title = document.createElement('strong'); title.textContent = video.title;
    const small = document.createElement('small'); small.textContent = `${video.duration || 'Clase en video'} · Medizi`;
    text.append(title, small);
    const play = document.createElement('span'); play.className = 'library-play-icon'; setControlLabel(play, 'play'); play.setAttribute('aria-hidden', 'true');
    button.append(number, thumb, text, play);
    button.addEventListener('click', () => openReader({type: 'video', ...video, source: video.watchUrl}, button));
    list.append(button);
  }
}
topicSelect.addEventListener('change', () => { search.value = ''; renderVideos(); });
search.addEventListener('input', renderVideos);
fetch('./library-videos.json').then(response => {
  if (!response.ok) throw new Error('catalog'); return response.json();
}).then(data => {
  catalog = data;
  for (const topic of catalog.topics) {
    const option = document.createElement('option'); option.value = topic.id; option.textContent = `${topic.title} (${topic.videos.length})`; topicSelect.append(option);
  }
  topicSelect.value = 'renal'; renderVideos();
}).catch(() => { $('#library-video-count').textContent = 'No se pudo cargar la lista de clases. Vuelve a abrir la aplicación desde npm start.'; });
