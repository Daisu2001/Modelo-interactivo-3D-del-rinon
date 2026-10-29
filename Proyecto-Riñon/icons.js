// Local outline icons: one stroke weight and the control's current color.
const paths = {
  select: '<path d="m4 3 6 17 3-7 7-3Z"/>',
  isolate: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  cut: '<path d="M4 4h6v16H4zM14 4h6v16h-6M14 2v20"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="m15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-4-4L5 15Z"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9"/>',
  save: '<path d="M4 3h13l4 4v14H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M6 8h5M6 12h5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
  eraser: '<path d="m4 13 9-10 8 7-10 11H6l-4-4Z"/><path d="m8 9 8 7M11 21h10"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  restart: '<path d="M3 10a9 9 0 1 1 1 8M3 3v7h7"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m12 5-7 7 7 7M5 12h15"/>',
  right: '<path d="m12 5 7 7-7 7M4 12h15"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  book: '<path d="M12 6C8 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-6-1-10 2ZM12 6v15"/>',
  file: '<path d="M14 2H4v20h16V8ZM14 2v6h6M8 12h8M8 16h8"/>',
  spark: '<path d="m12 2 2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6Z"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h8"/>',
  kidney: '<path d="M13 5C7 0 2 6 3 13s7 10 11 6c3-3-2-4-2-7s4-4 1-7ZM12 12h5l4 4"/>',
};
export const ICON_NAMES = Object.freeze(Object.keys(paths));
export function iconMarkup(name) {
  if (!Object.hasOwn(paths, name)) throw new Error('Icono desconocido: ' + name);
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
export function setControlLabel(element, name, label = '') {
  element.innerHTML = iconMarkup(name);
  if (label) element.append(document.createTextNode(label));
  element.classList.add('icon-label-control');
}
export function hydrateIcons(root = document) {
  for (const element of root.querySelectorAll('[data-icon]')) element.innerHTML = iconMarkup(element.dataset.icon);
}
