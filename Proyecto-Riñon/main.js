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
let isCutViewActive = false;

function setupModel(model) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x = -center.x;
  model.position.y = -center.y;
  model.position.z = -center.z;

  model.traverse((child) => {
    if (child.isMesh) {
      // Los GLB comparten materiales entre meshes con frecuencia. Clonarlos aquí
      // evita que ocultar una pieza cambie accidentalmente otra que usa el mismo material.
      if (child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone();
        splitVertexColorsIntoMaterialGroups(child);
        forEachMaterial(child, (material) => {
          material.side = THREE.DoubleSide;
          material.transparent = false;
          material.opacity = 1.0;
          material.visible = true;
          material.needsUpdate = true;
        });
      }
      child.visible = true;
    }
  });
}

function forEachMaterial(mesh, callback) {
  if (!mesh.material) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach(callback);
}

function getVertexColorKey(colorAttribute, vertexIndex) {
  // Los GLB de vasos se exportaron con identificadores de color por vértice,
  // pero sin slots de materiales. Cuantizar evita separar caras que comparten
  // visualmente el mismo color por pequeñas diferencias de coma flotante.
  const red = Math.round(colorAttribute.getX(vertexIndex) * 255);
  const green = Math.round(colorAttribute.getY(vertexIndex) * 255);
  const blue = Math.round(colorAttribute.getZ(vertexIndex) * 255);
  return `${red},${green},${blue}`;
}

function splitVertexColorsIntoMaterialGroups(mesh) {
  if (Array.isArray(mesh.material)) return;

  const sourceGeometry = mesh.geometry;
  const colorAttribute = sourceGeometry.getAttribute('color');
  const sourceIndex = sourceGeometry.getIndex();
  if (!colorAttribute || !sourceIndex || sourceIndex.count % 3 !== 0) return;

  const trianglesByColor = new Map();
  for (let offset = 0; offset < sourceIndex.count; offset += 3) {
    const vertexIndex = sourceIndex.getX(offset);
    const colorKey = getVertexColorKey(colorAttribute, vertexIndex);
    if (!trianglesByColor.has(colorKey)) trianglesByColor.set(colorKey, []);
    trianglesByColor.get(colorKey).push(
      vertexIndex,
      sourceIndex.getX(offset + 1),
      sourceIndex.getX(offset + 2)
    );
  }

  // Un color implica que ya no hay regiones distinguibles por material.
  if (trianglesByColor.size < 2) return;

  const geometry = sourceGeometry.clone();
  const orderedIndices = new sourceIndex.array.constructor(sourceIndex.count);
  const materials = [];
  let writeOffset = 0;

  geometry.clearGroups();
  for (const [colorKey, triangleIndices] of trianglesByColor) {
    orderedIndices.set(triangleIndices, writeOffset);
    geometry.addGroup(writeOffset, triangleIndices.length, materials.length);

    const material = mesh.material.clone();
    material.name = `Color ${colorKey}`;
    materials.push(material);
    writeOffset += triangleIndices.length;
  }

  geometry.setIndex(new THREE.BufferAttribute(orderedIndices, 1));
  mesh.geometry = geometry;
  mesh.material = materials;
}

const kidneyPartPaths = [
  './Models/Arteria.glb',
  './Models/CALIZ.glb',
  './Models/corte_rinon.glb',
  './Models/Piramides_completas.glb',
  './Models/Piramides_corte.glb',
  './Models/Rinon_completo.glb',
  './Models/Vena.glb'
];

// La anatomía renal es una única unidad de escena, aunque sus piezas se entreguen
// en archivos independientes. Así se rota, enfoca y selecciona como un solo riñón.
Promise.all(kidneyPartPaths.map((path) => loader.loadAsync(path)))
  .then((gltfs) => {
    kidneyModel = new THREE.Group();
    kidneyModel.name = 'Riñón';
    gltfs.forEach((gltf, index) => {
      const part = gltf.scene;
      // Las dos exportaciones de corte sustituyen a las piezas completas.
      part.userData.isCutVariant = /corte_rinon|Piramides_corte/.test(kidneyPartPaths[index]);
      part.userData.isDefaultAnatomyPart = /Arteria|CALIZ|Rinon_completo|Vena/.test(
        kidneyPartPaths[index]
      );
      part.userData.isSupportingAnatomyPart = /Arteria|CALIZ|Vena/.test(
        kidneyPartPaths[index]
      );

      if (kidneyPartPaths[index].endsWith('/Rinon_completo.glb')) {
        // Este GLB fue exportado con un origen diferente al de corte_rinon.
        // Se usa la traslación de su contraparte cortada para que ambas se
        // reemplacen exactamente en la misma referencia espacial.
        part.position.z = -2.8378283977508545;
      }
      kidneyModel.add(part);
    });
    // La rotación debe afectar todo el conjunto (riñón, cáliz, arteria y vena)
    // para preservar la anatomía relativa. Se centra después de rotarlo.
    kidneyModel.rotation.y = Math.PI;
    setupModel(kidneyModel);
    scene.add(kidneyModel);
    setCutView(isCutViewActive);
    kidneyModel.visible = currentActiveTab === '1';
    if (currentActiveTab === '1') focusCameraOn(kidneyModel);
  })
  .catch((err) => console.error('❌ Error al cargar las piezas del riñón:', err));

loader.loadAsync('./Models/Nefrona.glb')
  .then((gltf) => {
    nephronModel = gltf.scene;
    setupModel(nephronModel);
    scene.add(nephronModel);
    const box = new THREE.Box3().setFromObject(nephronModel);
    console.log('📐 Tamaño de la nefrona cargada:', box.getSize(new THREE.Vector3()));
    nephronModel.visible = currentActiveTab === '2' || currentActiveTab === '3';
    if (currentActiveTab === '2' || currentActiveTab === '3') focusCameraOn(nephronModel);
  })
  .catch((err) => console.error('❌ Error al cargar /Models/Nefrona.glb:', err));

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
    // Dibujar sustituye la herramienta activa; una pieza aislada no debe quedar
    // oculta cuando el usuario vuelva a la escena.
    restoreIsolation();
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
let isolatedMaterial = null;
let isolatedModel = null;

function getActiveModel() {
  return currentActiveTab === '1' ? kidneyModel : nephronModel;
}

function restoreIsolation() {
  if (!isolatedModel) return;
  isolatedModel.traverse((child) => {
    if (child.isMesh) {
      child.visible = true;
      forEachMaterial(child, (material) => {
        material.visible = true;
        material.needsUpdate = true;
      });
    }
  });
  isolatedMaterial = null;
  isolatedModel = null;
}

function isolateMaterial(model, mesh, materialIndex = 0) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const selectedMaterial = materials[materialIndex];
  if (!selectedMaterial) return;

  if (isolatedMaterial === selectedMaterial && isolatedModel === model) {
    restoreIsolation();
    return;
  }

  // Mientras haya un material aislado, ningún otro clic puede cambiar la
  // selección. La restauración ocurre exclusivamente al repetir el clic
  // sobre ese mismo material (o al cambiar de herramienta).
  if (isolatedModel) return;
  model.traverse((child) => {
    if (child.isMesh) {
      child.visible = true;
      forEachMaterial(child, (material) => {
        material.visible = material === selectedMaterial;
        material.needsUpdate = true;
      });
    }
  });
  isolatedMaterial = selectedMaterial;
  isolatedModel = model;
}

function setCutView(enabled) {
  isCutViewActive = enabled;
  if (!kidneyModel) return;

  kidneyModel.children.forEach((part) => {
    // La vista normal contiene solo el riñón completo, vasos y cáliz. El corte
    // sustituye el riñón por sus versiones cortadas y mantiene sus conexiones.
    part.visible = enabled
      ? part.userData.isCutVariant === true || part.userData.isSupportingAnatomyPart === true
      : part.userData.isDefaultAnatomyPart === true;
  });
}

function toggleMaterialTransparency(mesh, materialIndex = 0) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material = materials[materialIndex];
  if (!material) return;

  const makeTransparent = material.userData.atlasHidden !== true;
  material.transparent = makeTransparent;
  material.opacity = makeTransparent ? 0.25 : 1.0;
  material.userData.atlasHidden = makeTransparent;
  material.needsUpdate = true;
}

canvas.addEventListener('click', (event) => {
  const activeModel = getActiveModel();
  if (!activeModel) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(activeModel.children, true);
  const hit = intersects.find(({ object, face }) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    return materials[face?.materialIndex ?? 0]?.visible !== false;
  });
  if (hit) {
    const selectedObject = hit.object;
    document.querySelector('#structure-title').innerText =
      selectedObject.name || 'Estructura seleccionada';

    const activeToolId = document.querySelector('.tool-btn.active')?.id;
    if (activeToolId === 'btn-isolate') {
      isolateMaterial(activeModel, selectedObject, hit.face?.materialIndex ?? 0);
    }
    if (activeToolId === 'btn-hide') {
      toggleMaterialTransparency(selectedObject, hit.face?.materialIndex ?? 0);
    }
  }
});

// --- CAMBIO DE MÓDULOS EN LA BARRA SUPERIOR ---
const tabBtns = document.querySelectorAll('.tab-btn');

function switchModule(id) {
  restoreIsolation();
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
let activeToolId = 'btn-select';

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.id === 'btn-draw') return;

    if (btn.id !== activeToolId) restoreIsolation();
    setDrawingMode(false);
    toolBtns.forEach((button) => button.classList.remove('active'));
    btn.classList.add('active');
    previousToolButton = btn;
    activeToolId = btn.id;

    if (btn.id === 'btn-highlight') {
      setCutView(!isCutViewActive);
      return;
    }

    const activeModel = getActiveModel();
    if (!activeModel) return;
    const isXray = btn.id === 'btn-xray';
    activeModel.traverse((child) => {
      if (child.isMesh) {
        forEachMaterial(child, (material) => {
          material.wireframe = isXray;
          material.needsUpdate = true;
        });
      }
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
  renderer.render(scene, camera);
}

resizeAnnotationCanvas();
animate();
