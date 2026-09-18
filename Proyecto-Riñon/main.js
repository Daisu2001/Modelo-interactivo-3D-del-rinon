import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ELEMENTOS HTML ---
const canvas = document.querySelector('#webgl-canvas');
const container = document.querySelector('.canvas-container');

// --- ESCENA THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6f4f0);

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 10);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);
const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight1.position.set(5, 10, 7);
scene.add(dirLight1);
const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight2.position.set(-5, -5, -5);
scene.add(dirLight2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- VARIABLES DE MODELOS ---
let kidneyModel = null;
let nephronModel = null;
let currentActiveTab = '1';

function setupModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x = -center.x;
  model.position.y = -center.y;
  model.position.z = -center.z;

  model.traverse((child) => {
    if (child.isMesh) {
      if (child.material) {
        child.material.side = THREE.DoubleSide;
        child.material.transparent = false;
        child.material.opacity = 1.0;
      }
      child.visible = true;
    }
  });
}

// Cargar modelos
const loader = new GLTFLoader();

loader.load(
  './Models/Kidney.glb',
  (gltf) => {
    kidneyModel = gltf.scene;
    setupModel(kidneyModel);
    scene.add(kidneyModel);
    kidneyModel.visible = currentActiveTab === '1';
    if (currentActiveTab === '1') focusCameraOn(kidneyModel);
  },
  undefined,
  (err) => console.error('❌ Error al cargar /Models/Kidney.glb:', err)
);

loader.load(
  './Models/nefrona.glb',
  (gltf) => {
    nephronModel = gltf.scene;
    setupModel(nephronModel);
    scene.add(nephronModel);
    const box = new THREE.Box3().setFromObject(nephronModel);
    const size = box.getSize(new THREE.Vector3());
    console.log('📐 Tamaño de la nefrona cargada:', size);
    nephronModel.visible = currentActiveTab === '2' || currentActiveTab === '3';
    if (currentActiveTab === '2' || currentActiveTab === '3') focusCameraOn(nephronModel);
  },
  undefined,
  (err) => console.error('❌ Error al cargar /Models/nefrona.glb:', err)
);

function focusCameraOn(model) {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim > 0 ? maxDim * 2.2 : 10;
  camera.position.set(0, 0, distance);
  controls.target.set(0, 0, 0);
  controls.update();
}

// --- PIZARRA DE ANOTACIONES ---
const annotationCanvas = document.querySelector('#annotation-canvas');
const annotationContext = annotationCanvas.getContext('2d');
const drawingControls = document.querySelector('#drawing-controls');
const drawButton = document.querySelector('#btn-draw');
const closeDrawButton = document.querySelector('#btn-close-draw');
const colorInput = document.querySelector('#draw-color');
const widthInput = document.querySelector('#draw-width');
const widthOutput = document.querySelector('#draw-width-value');
const eraserButton = document.querySelector('#btn-eraser');
const undoButton = document.querySelector('#btn-undo');
const clearButton = document.querySelector('#btn-clear');

let drawingMode = false;
let eraserMode = false;
let currentStroke = null;
let previousToolButton = document.querySelector('#btn-select');
const strokes = [];

function resizeAnnotationCanvas() {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  annotationCanvas.width = Math.round(width * pixelRatio);
  annotationCanvas.height = Math.round(height * pixelRatio);
  annotationCanvas.style.width = width + 'px';
  annotationCanvas.style.height = height + 'px';
  annotationContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  redrawAnnotations();
}

function redrawAnnotations() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  annotationContext.clearRect(0, 0, width, height);
  strokes.forEach(drawStroke);
}

function drawStroke(stroke) {
  if (!stroke.points.length) return;
  const width = container.clientWidth;
  const height = container.clientHeight;

  annotationContext.save();
  annotationContext.lineCap = 'round';
  annotationContext.lineJoin = 'round';
  annotationContext.lineWidth = stroke.width;
  annotationContext.strokeStyle = stroke.color;
  annotationContext.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';
  annotationContext.beginPath();

  stroke.points.forEach((point, index) => {
    const x = point.x * width;
    const y = point.y * height;
    if (index === 0) annotationContext.moveTo(x, y);
    else annotationContext.lineTo(x, y);
  });

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    annotationContext.lineTo(point.x * width + 0.01, point.y * height + 0.01);
  }
  annotationContext.stroke();
  annotationContext.restore();
}

function getNormalizedPoint(event) {
  const rect = annotationCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  };
}

function setDrawingMode(enabled) {
  drawingMode = enabled;
  if (enabled) {
    previousToolButton =
      document.querySelector('.tool-btn.active:not(#btn-draw)') || previousToolButton;
    document.querySelectorAll('.tool-btn').forEach((button) => button.classList.remove('active'));
  }
  annotationCanvas.classList.toggle('drawing-active', enabled);
  drawingControls.classList.toggle('visible', enabled);
  drawingControls.setAttribute('aria-hidden', String(!enabled));
  drawButton.classList.toggle('active', enabled);
  drawButton.setAttribute('aria-pressed', String(enabled));
  controls.enabled = !enabled;
  if (!enabled && previousToolButton) previousToolButton.classList.add('active');
}

annotationCanvas.addEventListener('pointerdown', (event) => {
  if (!drawingMode) return;
  annotationCanvas.setPointerCapture(event.pointerId);
  currentStroke = {
    color: colorInput.value,
    width: Number(widthInput.value),
    eraser: eraserMode,
    points: [getNormalizedPoint(event)]
  };
  strokes.push(currentStroke);
  drawStroke(currentStroke);
});

annotationCanvas.addEventListener('pointermove', (event) => {
  if (!drawingMode || !currentStroke) return;
  currentStroke.points.push(getNormalizedPoint(event));
  redrawAnnotations();
});

function finishStroke(event) {
  if (currentStroke && annotationCanvas.hasPointerCapture(event.pointerId)) {
    annotationCanvas.releasePointerCapture(event.pointerId);
  }
  currentStroke = null;
}

annotationCanvas.addEventListener('pointerup', finishStroke);
annotationCanvas.addEventListener('pointercancel', finishStroke);

drawButton.addEventListener('click', () => setDrawingMode(!drawingMode));
closeDrawButton.addEventListener('click', () => setDrawingMode(false));

widthInput.addEventListener('input', () => {
  widthOutput.value = widthInput.value + ' px';
});

eraserButton.addEventListener('click', () => {
  eraserMode = !eraserMode;
  eraserButton.classList.toggle('active', eraserMode);
  annotationCanvas.style.cursor = eraserMode ? 'cell' : 'crosshair';
});

undoButton.addEventListener('click', () => {
  strokes.pop();
  redrawAnnotations();
});

clearButton.addEventListener('click', () => {
  strokes.length = 0;
  redrawAnnotations();
});

// --- AJUSTE RESPONSIVE DE AMBOS CANVAS ---
function resizeCanvas() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

  const expectedWidth = Math.round(width * Math.min(window.devicePixelRatio || 1, 2));
  const expectedHeight = Math.round(height * Math.min(window.devicePixelRatio || 1, 2));
  if (annotationCanvas.width !== expectedWidth || annotationCanvas.height !== expectedHeight) {
    resizeAnnotationCanvas();
  }
}

// --- RAYCASTER (SELECCIÓN AL HACER CLIC) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (event) => {
  const activeModel = currentActiveTab === '1' ? kidneyModel : nephronModel;
  if (!activeModel) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(activeModel.children, true);
  if (intersects.length > 0) {
    const selectedObject = intersects[0].object;
    const structureTitle = document.querySelector('#structure-title');
    if (structureTitle) {
      structureTitle.innerText = selectedObject.name || 'Estructura seleccionada';
    }
  }
});

// --- GESTOR DEL MÓDULO DE FÓRMULAS FISIOLÓGICAS ---
function initFormulas() {
  const anatomyView = document.querySelector('#anatomy-view');
  const formulasView = document.querySelector('#formulas-view');
  const structureTitle = document.querySelector('#structure-title');
  const glucoseContent = document.querySelector('#glucose-content');
  const filtrationContent = document.querySelector('#filtration-content');
  const btnSubtabGlucose = document.querySelector('#btn-subtab-glucose');
  const btnSubtabFiltration = document.querySelector('#btn-subtab-filtration');

  function setFormulaSubtab(type) {
    if (type === 'glucose') {
      btnSubtabGlucose?.classList.add('active');
      btnSubtabFiltration?.classList.remove('active');
      if (glucoseContent) glucoseContent.style.display = 'block';
      if (filtrationContent) filtrationContent.style.display = 'none';
      if (structureTitle) structureTitle.innerText = 'Fisiología de la Glucosa';
    } else {
      btnSubtabGlucose?.classList.remove('active');
      btnSubtabFiltration?.classList.add('active');
      if (glucoseContent) glucoseContent.style.display = 'none';
      if (filtrationContent) filtrationContent.style.display = 'block';
      if (structureTitle) structureTitle.innerText = 'Filtración Glomerular (Starling)';
    }
  }

  btnSubtabGlucose?.addEventListener('click', () => setFormulaSubtab('glucose'));
  btnSubtabFiltration?.addEventListener('click', () => setFormulaSubtab('filtration'));

  // 1. CÁLCULOS DE TRANSPORTE TUBULAR DE GLUCOSA
  const sliderPglu = document.querySelector('#slider-pglu');
  const sliderTfg = document.querySelector('#slider-tfg');
  const sliderTmg = document.querySelector('#slider-tmg');
  const valPglu = document.querySelector('#val-pglu');
  const valTfg = document.querySelector('#val-tfg');
  const valTmg = document.querySelector('#val-tmg');
  const resFl = document.querySelector('#res-fl');
  const resReab = document.querySelector('#res-reab');
  const resExc = document.querySelector('#res-exc');
  const resFe = document.querySelector('#res-fe');
  const fillSglt2 = document.querySelector('#fill-sglt2');
  const fillSglt1 = document.querySelector('#fill-sglt1');
  const pctSglt2 = document.querySelector('#pct-sglt2');
  const pctSglt1 = document.querySelector('#pct-sglt1');
  const glucoseClinicalState = document.querySelector('#glucose-clinical-state');
  const glucoseStatusTag = document.querySelector('#glucose-status-tag');
  const glucoseStatusText = document.querySelector('#glucose-status-text');

  function calculateGlucoseFormulas() {
    if (!sliderPglu || !sliderTfg || !sliderTmg) return;

    const pglu = parseFloat(sliderPglu.value);
    const tfg = parseFloat(sliderTfg.value);
    const tmg = parseFloat(sliderTmg.value);

    // Carga Filtrada: FL = (P_glu * TFG) / 100
    const cargaFiltrada = (pglu * tfg) / 100;

    // Umbral renal real con fenómeno de splay (~180 mg/dL a TFG normal)
    const thresholdFraction = 0.72;
    const splayStart = tmg * thresholdFraction;

    let reabsorcion = 0;
    if (cargaFiltrada <= splayStart) {
      reabsorcion = cargaFiltrada;
    } else if (cargaFiltrada < tmg) {
      const delta = cargaFiltrada - splayStart;
      const range = tmg - splayStart;
      const curve = Math.sin((delta / range) * (Math.PI / 2));
      reabsorcion = splayStart + curve * range;
    } else {
      reabsorcion = tmg;
    }

    // Excreción: E = FL - R
    const excrecion = Math.max(0, cargaFiltrada - reabsorcion);
    const fe = cargaFiltrada > 0 ? (excrecion / cargaFiltrada) * 100 : 0;

    // Distribución SGLT2 (~90%) y SGLT1 (~10%)
    const capSglt2 = tmg * 0.90;
    const capSglt1 = tmg * 0.10;
    const reabSglt2 = Math.min(capSglt2, reabsorcion * 0.90);
    const reabSglt1 = Math.min(capSglt1, reabsorcion - reabSglt2);
    const pct2Val = Math.min(100, Math.round((reabSglt2 / capSglt2) * 100));
    const pct1Val = Math.min(100, Math.round((reabSglt1 / capSglt1) * 100));

    if (valPglu) valPglu.innerText = `${Math.round(pglu)} mg/dL`;
    if (valTfg) valTfg.innerText = `${Math.round(tfg)} mL/min`;
    if (valTmg) valTmg.innerText = `${Math.round(tmg)} mg/min`;

    if (resFl) resFl.innerText = `${cargaFiltrada.toFixed(1)} mg/min`;
    if (resReab) resReab.innerText = `${reabsorcion.toFixed(1)} mg/min`;
    if (resExc) resExc.innerText = `${excrecion.toFixed(1)} mg/min`;
    if (resFe) resFe.innerText = `${fe.toFixed(1)} %`;

    if (fillSglt2) fillSglt2.style.width = `${pct2Val}%`;
    if (fillSglt1) fillSglt1.style.width = `${pct1Val}%`;
    if (pctSglt2) pctSglt2.innerText = `${pct2Val}%`;
    if (pctSglt1) pctSglt1.innerText = `${pct1Val}%`;

    if (excrecion <= 0.5) {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Normoglucemia';
        glucoseClinicalState.className = 'formula-badge';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag normal';
        glucoseStatusTag.innerText = 'Reabsorción Completa (100%)';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'La carga filtrada está dentro del rango fisiológico normal. Toda la glucosa se reabsorbe por SGLT2 y SGLT1 sin glucosuria.';
      }
    } else if (excrecion < 80) {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Glucosuria Leve';
        glucoseClinicalState.className = 'formula-badge amber';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag warning';
        glucoseStatusTag.innerText = 'Superación de Umbral Renal';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'Glucemia plasmática supera el umbral de saturación renal (~180 mg/dL). Aparecen trazas de glucosa en la orina final.';
      }
    } else {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Glucosuria Masiva';
        glucoseClinicalState.className = 'formula-badge danger';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag danger';
        glucoseStatusTag.innerText = 'Saturación Completa TmG';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'Saturación total de transportadores SGLT2/SGLT1 (>375 mg/min). Toda glucosa adicional filtrada se excreta, provocando diuresis osmótica.';
      }
    }
  }

  sliderPglu?.addEventListener('input', calculateGlucoseFormulas);
  sliderTfg?.addEventListener('input', calculateGlucoseFormulas);
  sliderTmg?.addEventListener('input', calculateGlucoseFormulas);

  // Presets clínicos de Glucosa
  const presetNormal = document.querySelector('#preset-normal');
  const presetThreshold = document.querySelector('#preset-threshold');
  const presetDiabetes = document.querySelector('#preset-diabetes');
  const presetSglt2i = document.querySelector('#preset-sglt2i');

  presetNormal?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '100';
    if (sliderTfg) sliderTfg.value = '125';
    if (sliderTmg) sliderTmg.value = '375';
    calculateGlucoseFormulas();
  });

  presetThreshold?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '200';
    if (sliderTfg) sliderTfg.value = '125';
    if (sliderTmg) sliderTmg.value = '375';
    calculateGlucoseFormulas();
  });

  presetDiabetes?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '320';
    if (sliderTfg) sliderTfg.value = '125';
    if (sliderTmg) sliderTmg.value = '375';
    calculateGlucoseFormulas();
  });

  presetSglt2i?.addEventListener('click', () => {
    if (sliderPglu) sliderPglu.value = '180';
    if (sliderTfg) sliderTfg.value = '110';
    if (sliderTmg) sliderTmg.value = '120';
    calculateGlucoseFormulas();
  });

  // 2. CÁLCULOS DE FILTRACIÓN GLOMERULAR (FUERZAS DE STARLING)
  const sliderPgc = document.querySelector('#slider-pgc');
  const sliderPbs = document.querySelector('#slider-pbs');
  const sliderPigc = document.querySelector('#slider-pigc');
  const sliderPibs = document.querySelector('#slider-pibs');
  const valPgc = document.querySelector('#val-pgc');
  const valPbs = document.querySelector('#val-pbs');
  const valPigc = document.querySelector('#val-pigc');
  const valPibs = document.querySelector('#val-pibs');
  const resPfn = document.querySelector('#res-pfn');
  const resStarlingTfg = document.querySelector('#res-starling-tfg');
  const starlingStatusTag = document.querySelector('#starling-status-tag');
  const starlingStatusText = document.querySelector('#starling-status-text');

  function calculateStarlingFormulas() {
    if (!sliderPgc || !sliderPbs || !sliderPigc || !sliderPibs) return;

    const pgc = parseFloat(sliderPgc.value);
    const pbs = parseFloat(sliderPbs.value);
    const pigc = parseFloat(sliderPigc.value);
    const pibs = parseFloat(sliderPibs.value);

    // PFN = (P_GC - P_BS) - (pi_GC - pi_BS)
    const pfn = (pgc - pbs) - (pigc - pibs);

    // TFG = Kf * PFN (Kf normal promedio = 12.5 mL/min/mmHg)
    const kf = 12.5;
    const starlingTfg = Math.max(0, kf * pfn);

    if (valPgc) valPgc.innerText = `${Math.round(pgc)} mmHg`;
    if (valPbs) valPbs.innerText = `${Math.round(pbs)} mmHg`;
    if (valPigc) valPigc.innerText = `${Math.round(pigc)} mmHg`;
    if (valPibs) valPibs.innerText = `${Math.round(pibs)} mmHg`;

    if (resPfn) resPfn.innerText = `${pfn >= 0 ? '+' : ''}${pfn.toFixed(1)} mmHg`;
    if (resStarlingTfg) resStarlingTfg.innerText = `${starlingTfg.toFixed(1)} mL/min`;

    if (pfn >= 8 && pfn <= 12) {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag normal';
      if (starlingStatusText) starlingStatusText.innerText = 'Ultrafiltración fisiológica normal (+10 mmHg). Balance óptimo de presiones.';
    } else if (pfn > 12) {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag warning';
      if (starlingStatusText) starlingStatusText.innerText = 'Hiperfiltración glomerular por elevación de presión capilar hidrostática.';
    } else if (pfn > 0) {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag warning';
      if (starlingStatusText) starlingStatusText.innerText = 'Hipofiltración glomerular. Presión neta reducida.';
    } else {
      if (starlingStatusTag) starlingStatusTag.className = 'clinical-status-tag danger';
      if (starlingStatusText) starlingStatusText.innerText = 'Cese de filtración glomerular: presiones opuestas superan la presión capilar.';
    }
  }

  sliderPgc?.addEventListener('input', calculateStarlingFormulas);
  sliderPbs?.addEventListener('input', calculateStarlingFormulas);
  sliderPigc?.addEventListener('input', calculateStarlingFormulas);
  sliderPibs?.addEventListener('input', calculateStarlingFormulas);

  calculateGlucoseFormulas();
  calculateStarlingFormulas();

  return {
    switchFormulaModule(id) {
      if (id === '1') {
        if (anatomyView) anatomyView.style.display = 'block';
        if (formulasView) formulasView.style.display = 'none';
        if (structureTitle) structureTitle.innerText = 'Corteza renal';
      } else if (id === '2') {
        if (anatomyView) anatomyView.style.display = 'none';
        if (formulasView) formulasView.style.display = 'block';
        setFormulaSubtab('glucose');
      } else if (id === '3') {
        if (anatomyView) anatomyView.style.display = 'none';
        if (formulasView) formulasView.style.display = 'block';
        setFormulaSubtab('filtration');
      }
    },
    setFormulaSubtab
  };
}

// --- GESTOR DEL MÓDULO DE FÓRMULAS ---
const formulasManager = initFormulas();

// --- CAMBIO DE MÓDULOS EN LA BARRA SUPERIOR ---
const tabBtns = document.querySelectorAll('.tab-btn');

function switchModule(id) {
  currentActiveTab = id;
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
  formulasManager.switchFormulaModule(id);

  // Modelos 3D visibles
  if (kidneyModel) {
    kidneyModel.visible = id === '1';
    if (id === '1') focusCameraOn(kidneyModel);
  }
  if (nephronModel) {
    nephronModel.visible = id === '2' || id === '3';
    if (id === '2' || id === '3') focusCameraOn(nephronModel);
  }
}

tabBtns.forEach((btn) => btn.addEventListener('click', () => switchModule(btn.dataset.tab)));

// --- TOOLBAR IZQUIERDA ---
const toolBtns = document.querySelectorAll('.tool-btn');

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.id === 'btn-draw') return;

    setDrawingMode(false);
    toolBtns.forEach((button) => button.classList.remove('active'));
    btn.classList.add('active');
    previousToolButton = btn;

    const activeModel = currentActiveTab === '1' ? kidneyModel : nephronModel;
    if (!activeModel) return;
    const isXray = btn.id === 'btn-xray';
    activeModel.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.wireframe = isXray;
      }
    });
  });
});

// --- PANEL INFORMATIVO DERECHO ---
const closeBtn = document.querySelector('#close-panel');
const infoPanel = document.querySelector('#info-panel');

closeBtn?.addEventListener('click', () => {
  infoPanel.classList.toggle('hidden');
  setTimeout(resizeCanvas, 300);
});

// --- LOOP DE ANIMACIÓN ---
function animate() {
  requestAnimationFrame(animate);
  resizeCanvas();
  controls.update();
  renderer.render(scene, camera);
}

resizeAnnotationCanvas();
animate();
