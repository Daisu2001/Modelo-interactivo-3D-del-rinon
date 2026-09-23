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

// --- GESTIÓN DE MODELOS 3D (.GLB) ---
const loader = new GLTFLoader();
let kidneyModel = null;
let nephronModel = null;
let currentActiveTab = '1';

const flowSlider = document.querySelector('#flow-slider');
const flowValueLabel = document.querySelector('#flow-value');

const maxParticles = 200;
const bloodGeo = new THREE.SphereGeometry(0.05, 8, 8);
const bloodMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.8 });
const bloodParticles = [];

const glucoseGeo = new THREE.SphereGeometry(0.03, 8, 8);
const glucoseMat = new THREE.MeshBasicMaterial({ color: 0x33ff99, transparent: true, opacity: 0.9 });
const glucoseParticles = [];

const flowGroup = new THREE.Group();
scene.add(flowGroup);

// Inicializamos el grupo de partículas y las guardamos en arrays
for (let i = 0; i < maxParticles; i++) {
  const bloodMesh = new THREE.Mesh(bloodGeo, bloodMat);
  bloodMesh.userData = { progress: Math.random(), baseSpeed: 0.005 + Math.random() * 0.005 };
  flowGroup.add(bloodMesh);
  bloodParticles.push(bloodMesh);

  const glucoseMesh = new THREE.Mesh(glucoseGeo, glucoseMat);
  glucoseMesh.userData = { progress: Math.random(), baseSpeed: 0.003 + Math.random() * 0.004 };
  flowGroup.add(glucoseMesh);
  glucoseParticles.push(glucoseMesh);
}

// Actualizar el texto del slider en tiempo real cuando el usuario lo mueva
if (flowSlider) {
  flowSlider.addEventListener('input', (e) => {
    if (flowValueLabel) flowValueLabel.textContent = e.target.value + 'x';
  });
}

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
    document.querySelector('#structure-title').innerText =
      selectedObject.name || 'Estructura seleccionada';
  }
});

// --- CAMBIO DE MÓDULOS EN LA BARRA SUPERIOR ---
const tabBtns = document.querySelectorAll('.tab-btn');

function switchModule(id) {
  currentActiveTab = id;
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
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
      if (child.isMesh) child.material.wireframe = isXray;
    });
  });
});

// --- PANEL INFORMATIVO DERECHO ---
const closeBtn = document.querySelector('#close-panel');
const infoPanel = document.querySelector('#info-panel');

closeBtn.addEventListener('click', () => {
  infoPanel.classList.toggle('hidden');
  setTimeout(resizeCanvas, 300);
});

// --- LOOP DE ANIMACIÓN ---
function animate() {
  requestAnimationFrame(animate);
  resizeCanvas();
  controls.update();

  // --- ANIMAR FLUJO DE SANGRE Y GLUCOSA CON SLIDER ---
  // Solo se ejecutan y se muestran si estamos en la pestaña 2 (Glucosa) o 3 (Filtración)
  if (currentActiveTab === '2' || currentActiveTab === '3') {
    flowGroup.visible = true;

    // Obtenemos el valor actual del slider (si no existe, toma 1.0 por defecto)
    const sliderMultiplier = flowSlider ? parseFloat(flowSlider.value) : 1.0;
    
    // Calculamos cuántas partículas mostrar según la posición del slider (máximo 200)
    const activeCount = Math.floor(maxParticles * (sliderMultiplier / 3.0));

    // Actualizar partículas de sangre (rojas)
    bloodParticles.forEach((p, index) => {
      if (index < activeCount) {
        p.visible = true;
        // La velocidad aumenta o disminuye según el slider
        p.userData.progress += p.userData.baseSpeed * sliderMultiplier;
        if (p.userData.progress > 1) p.userData.progress = 0;

        // El tamaño de las esferas cambia de acuerdo al slider
        p.scale.setScalar(sliderMultiplier);

        // Trayectoria simulada del flujo sanguíneo
        const t = p.userData.progress * Math.PI * 4;
        p.position.x = Math.sin(t) * 0.8;
        p.position.y = (p.userData.progress - 0.5) * 2;
        p.position.z = Math.cos(t) * 0.8;
      } else {
        p.visible = false; // Se ocultan las sobrantes si bajas el slider
      }
    });

    // Actualizar partículas de glucosa (verdes - filtrándose)
    glucoseParticles.forEach((p, index) => {
      if (index < activeCount) {
        p.visible = true;
        // La glucosa tiene una tasa de filtración ligeramente distinta basada en el slider
        p.userData.progress += p.userData.baseSpeed * (sliderMultiplier * 1.2);
        if (p.userData.progress > 1) p.userData.progress = 0;

        p.scale.setScalar(sliderMultiplier);

        // Trayectoria simulada de filtración hacia los túbulos
        const t = p.userData.progress * Math.PI * 4;
        p.position.x = Math.cos(t) * 1.0 + (p.userData.progress * 0.5);
        p.position.y = (p.userData.progress - 0.5) * 1.5;
        p.position.z = Math.sin(t) * 1.0;
      } else {
        p.visible = false;
      }
    });

  } else {
    // Si estás en la pestaña de Anatomía (tab 1), ocultamos las partículas
    flowGroup.visible = false;
  }

  renderer.render(scene, camera);
}
