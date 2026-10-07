import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GlucoseModule } from './glucose.js';
import { FiltrationModule } from './filtration.js';
import { calculateRenalState } from './renal-physiology.js';
import { AnatomyBrowser } from './anatomy-browser.js';
import { prepareGlomerulusMesh } from './glomerulus-structures.js';

// --- ELEMENTOS HTML ---
const canvas = document.querySelector('#webgl-canvas');
const container = document.querySelector('.canvas-container');

// --- ESCENA THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6f4f0);

const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.001,
  5000
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
let glomerulusAnatomy = null;
let anatomyKind = 'kidney';
let anatomyBrowser = null;
let currentActiveTab = '1';
let isCutViewActive = false;
let isXrayActive = false;

const HIDDEN_OPACITY = 0.08;
const loader = new GLTFLoader();
const frameClock = new THREE.Clock();
const glucoseModule = new GlucoseModule(scene);
const filtrationModule = new FiltrationModule(scene);

// Completar o corregir este mapa cuando el artista entregue la equivalencia
// semántica de los colores de segmentación. El RGB se obtiene del atributo
// COLOR_0 del GLB y el valor se muestra directamente en el panel informativo.
const structureNameByVertexColor = {
  '255,0,0': 'Corteza renal',
  '25,255,118': 'Pirámides renales',
  '255,37,46': 'Arteria renal',
  '255,0,34': 'Arteria renal',
  '36,51,255': 'Vena renal',
  '3,0,255': 'Vena renal',
  '0,68,255': 'Cálices menores',
  '255,175,0': 'Pelvis renal',
  '255,109,16': 'Uréter'
};

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
          material.depthWrite = true;
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

function getStructureName(colorKey) {
  return structureNameByVertexColor[colorKey] || `Región sin clasificar (${colorKey})`;
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

  // Aunque solo exista una región, conservar su nombre para el raycast.
  if (trianglesByColor.size < 2) {
    const [colorKey] = trianglesByColor.keys();
    mesh.material.name = getStructureName(colorKey);
    mesh.material.userData.vertexColorKey = colorKey;
    return;
  }

  const geometry = sourceGeometry.clone();
  const orderedIndices = new sourceIndex.array.constructor(sourceIndex.count);
  const materials = [];
  let writeOffset = 0;

  geometry.clearGroups();
  for (const [colorKey, triangleIndices] of trianglesByColor) {
    orderedIndices.set(triangleIndices, writeOffset);
    geometry.addGroup(writeOffset, triangleIndices.length, materials.length);

    const material = mesh.material.clone();
    material.name = getStructureName(colorKey);
    material.userData.vertexColorKey = colorKey;
    materials.push(material);
    writeOffset += triangleIndices.length;
  }

  geometry.setIndex(new THREE.BufferAttribute(orderedIndices, 1));
  mesh.geometry = geometry;
  mesh.material = materials;
}

const kidneyModelPairs = [
  { id: 'arteria', completo: './Models/Arteria_Completo.glb', corte: './Models/Arteria_Corte.glb' },
  { id: 'caliz', completo: './Models/Caliz_Completo.glb', corte: './Models/Caliz_Corte.glb' },
  { id: 'piramide', completo: './Models/Piramide_Completo.glb', corte: './Models/Piramide_Corte.glb' },
  { id: 'rinon', completo: './Models/Rinon_completo.glb', corte: './Models/Rinon_Corte.glb' },
  { id: 'vena', completo: './Models/Vena_Completo.glb', corte: './Models/Vena_Corte.glb' }
];

function getFirstMesh(root) {
  let mesh = null;
  root.traverse((child) => {
    if (!mesh && child.isMesh) mesh = child;
  });
  return mesh;
}

function alignCompleteVariant(completePart, cutPart) {
  const completeMesh = getFirstMesh(completePart);
  const cutMesh = getFirstMesh(cutPart);
  if (!completeMesh || !cutMesh) return;

  completePart.updateMatrixWorld(true);
  cutPart.updateMatrixWorld(true);
  const completePosition = completeMesh.getWorldPosition(new THREE.Vector3());
  const cutPosition = cutMesh.getWorldPosition(new THREE.Vector3());

  // Las exportaciones completas conservan un origen distinto de sus pares de
  // corte. Esta corrección hace que cada par ocupe la misma referencia.
  completePart.position.add(cutPosition.sub(completePosition));
}

// La anatomía renal es una única unidad de escena, aunque sus piezas se entreguen
// en archivos independientes. Así se rota, enfoca y selecciona como un solo riñón.
Promise.all(
  kidneyModelPairs.flatMap((pair) => [
    loader.loadAsync(pair.completo),
    loader.loadAsync(pair.corte)
  ])
)
  .then((gltfs) => {
    kidneyModel = new THREE.Group();
    kidneyModel.name = 'Riñón';
    kidneyModelPairs.forEach((pair, index) => {
      const completePart = gltfs[index * 2].scene;
      const cutPart = gltfs[index * 2 + 1].scene;
      completePart.userData.variant = 'completo';
      cutPart.userData.variant = 'corte';
      completePart.name = `${pair.id}_completo`;
      cutPart.name = `${pair.id}_corte`;

      alignCompleteVariant(completePart, cutPart);
      kidneyModel.add(completePart, cutPart);
    });
    // Se conserva la orientación común de los modelos entregados.
    kidneyModel.rotation.y = Math.PI;
    setupModel(kidneyModel);
    scene.add(kidneyModel);
    setCutView(isCutViewActive);
    setXrayMode(isXrayActive);
    kidneyModel.visible = currentActiveTab === '1' && anatomyKind === 'kidney';
    anatomyBrowser.setModel('kidney', kidneyModel);
    if (kidneyModel.visible) focusCameraOn(kidneyModel);
  })
  .catch((err) => console.error('❌ Error al cargar las piezas del riñón:', err));

// Anatomía usa su propia instancia: ocultar/aislar aquí no altera Filtración.
async function loadGlomerulusAnatomy() {
  const status = document.querySelector('#anatomy-loading');
  try {
    const gltf = await loader.loadAsync('./Models/Glomerulo.glb');
    glomerulusAnatomy = gltf.scene;
    glomerulusAnatomy.name = 'Glomérulo: anatomía';
    glomerulusAnatomy.scale.setScalar(.18);
    glomerulusAnatomy.traverse(node => {
      if (node.isMesh) prepareGlomerulusMesh(node, [], { anatomy: true });
    });
    setupModel(glomerulusAnatomy);
    scene.add(glomerulusAnatomy);
    glomerulusAnatomy.visible = currentActiveTab === '1' && anatomyKind === 'glomerulus';
    setXrayMode(isXrayActive);
    anatomyBrowser.setModel('glomerulus', glomerulusAnatomy);
    status.hidden = true;
  } catch (error) {
    console.error('Error al cargar el glomérulo de Anatomía:', error);
    status.textContent = 'No se pudo cargar el glomérulo. Recarga la página para reintentar.';
    status.hidden = currentActiveTab !== '1';
    document.querySelector('#alternate-model-name').textContent = 'Glomérulo no disponible';
  }
}

const anatomyStrokes = { kidney: [], glomerulus: [] };
function switchAnatomyModel() {
  if (currentActiveTab !== '1') return;
  const next = anatomyKind === 'kidney' ? 'glomerulus' : 'kidney';
  const model = next === 'kidney' ? kidneyModel : glomerulusAnatomy;
  if (!model) return;
  restoreIsolation(); setDrawingMode(false);
  anatomyStrokes[anatomyKind] = strokes.slice();
  anatomyKind = next;
  strokes.splice(0, strokes.length, ...anatomyStrokes[next]); redrawAnnotations();
  if (kidneyModel) kidneyModel.visible = next === 'kidney';
  glomerulusAnatomy.visible = next === 'glomerulus';
  updateCutOnlyTools();
  if (activeToolId === 'btn-highlight') activateSelectTool();
  anatomyBrowser.setKind(next);
  infoPanel.classList.remove('hidden');
  document.querySelector('#btn-panel').setAttribute('aria-expanded', 'true');
  focusCameraOn(model);
}

let glucoseLoading = null;
async function loadGlucose() {
  if (glucoseLoading) return glucoseLoading;
  const status = document.querySelector('#glucose-loading');
  status.hidden = currentActiveTab !== '2';
  glucoseLoading = glucoseModule.load(loader).then(model => {
    status.hidden = true;
    setXrayMode(isXrayActive);
    if (currentActiveTab === '2') focusCameraOn(model);
    return model;
  }).catch(error => {
    console.error('Error al cargar el recorrido de glucosa:', error);
    status.textContent = 'No se pudo cargar la simulación. Vuelve a abrir Glucosa para reintentar.';
    status.hidden = currentActiveTab !== '2';
    glucoseLoading = null;
    throw error;
  });
  return glucoseLoading;
}

let filtrationLoading = null;
async function loadFiltration() {
  if (filtrationLoading) return filtrationLoading;
  const status = document.querySelector('#filtration-loading');
  status.hidden = currentActiveTab !== '3';
  filtrationLoading = filtrationModule.load(loader).then(model => {
    status.hidden = true;
    setXrayMode(isXrayActive);
    if (currentActiveTab === '3') focusCameraOn(model);
    return model;
  }).catch(error => {
    console.error('Error al cargar el glomérulo:', error);
    status.textContent = 'No se pudo cargar el glomérulo. Vuelve a abrir Filtración para reintentar.';
    status.hidden = currentActiveTab !== '3';
    filtrationLoading = null;
    throw error;
  });
  return filtrationLoading;
}

function focusCameraOn(model) {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const center = box.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distance = maxDim > 0 ? maxDim / (2 * Math.tan(Math.min(verticalFov, horizontalFov) / 2)) * 1.22 : 10;
  camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
  controls.target.copy(center);
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
  const expectedWidth = Math.round(width * renderer.getPixelRatio());
  const expectedHeight = Math.round(height * renderer.getPixelRatio());
  if (canvas.width !== expectedWidth || canvas.height !== expectedHeight) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }

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
  return currentActiveTab === '1' ? (anatomyKind === 'kidney' ? kidneyModel : glomerulusAnatomy) : currentActiveTab === '2' ? glucoseModule.anatomy : filtrationModule.anatomy;
}

function isVisibleInHierarchy(object) {
  let current = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function restoreIsolation() {
  if (!isolatedModel) return;
  isolatedModel.traverse((child) => {
    if (child.isMesh) {
      child.visible = true;
      forEachMaterial(child, (material) => {
        material.visible = true;
        const isManuallyHidden = material.userData.atlasHidden === true;
        material.transparent = isManuallyHidden;
        material.opacity = isManuallyHidden ? HIDDEN_OPACITY : 1.0;
        material.depthWrite = !isManuallyHidden;
        material.userData.isolationDimmed = false;
        material.needsUpdate = true;
      });
    }
  });
  isolatedMaterial = null;
  isolatedModel = null;
}

function sameAnatomicalRegion(material, selected) {
  return material === selected || (anatomyKind === 'glomerulus' && material.name === selected?.name);
}

function isolateMaterial(model, mesh, materialIndex = 0) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const selectedMaterial = materials[materialIndex];
  if (!selectedMaterial) return;

  if (sameAnatomicalRegion(selectedMaterial, isolatedMaterial) && isolatedModel === model) {
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
        const isSelected = sameAnatomicalRegion(material, selectedMaterial);
        // Aislar conserva el contexto anatómico: la región elegida queda opaca
        // y el resto se atenúa, en vez de desaparecer físicamente.
        material.visible = true;
        material.transparent = !isSelected;
        material.opacity = isSelected ? 1.0 : HIDDEN_OPACITY;
        material.depthWrite = isSelected;
        material.userData.isolationDimmed = !isSelected;
        material.needsUpdate = true;
      });
    }
  });
  isolatedMaterial = selectedMaterial;
  isolatedModel = model;
}

function setCutView(enabled) {
  if (anatomyKind !== 'kidney') return;
  isCutViewActive = enabled;
  updateCutOnlyTools();
  if (!kidneyModel) return;

  kidneyModel.children.forEach((part) => {
    // Cada modelo nuevo tiene una variante _Completo y una _Corte. El corte
    // reemplaza todas las variantes completas por su par correspondiente.
    part.visible = part.userData.variant === (enabled ? 'corte' : 'completo');
  });
  if (!enabled) {
    restoreIsolation();
    if (activeToolId === 'btn-isolate' || activeToolId === 'btn-hide') {
      document.querySelectorAll('.tool-btn').forEach((button) => button.classList.remove('active'));
      const selectButton = document.querySelector('#btn-select');
      selectButton.classList.add('active');
      previousToolButton = selectButton;
      activeToolId = 'btn-select';
    }
  }
}

function updateCutOnlyTools() {
  const glomerulusActive = currentActiveTab === '1' && anatomyKind === 'glomerulus';
  document.querySelector('#btn-highlight').hidden = glomerulusActive;
  ['btn-isolate', 'btn-hide', 'btn-highlight'].forEach((id) => {
    const button = document.querySelector(`#${id}`);
    const locked = currentActiveTab !== '1' || (!glomerulusActive && id !== 'btn-highlight' && !isCutViewActive);
    button.classList.toggle('requires-cut', locked);
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked
      ? (currentActiveTab !== '1' ? 'Herramienta disponible en Anatomía.' : 'Activa el corte para usar esta herramienta.')
      : '';
  });
}

function setXrayMode(enabled) {
  isXrayActive = enabled;
  [kidneyModel, glomerulusAnatomy, filtrationModule.anatomy, glucoseModule.anatomy].forEach((model) => {
    if (model) {
      model.traverse((child) => {
        if (child.isMesh) {
          forEachMaterial(child, (material) => {
            material.wireframe = enabled;
            material.needsUpdate = true;
          });
        }
      });
    }
  });
  const xrayButton = document.querySelector('#btn-xray');
  xrayButton.classList.toggle('xray-enabled', enabled);
  xrayButton.setAttribute('aria-pressed', String(enabled));
}

function toggleMaterialTransparency(mesh, materialIndex = 0) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material = materials[materialIndex];
  if (!material) return;

  const makeTransparent = material.userData.atlasHidden !== true;
  const targets = [];
  if (currentActiveTab === '1' && anatomyKind === 'glomerulus') {
    glomerulusAnatomy.traverse(node => {
      if (node.isMesh) forEachMaterial(node, candidate => {
        if (sameAnatomicalRegion(candidate, material)) targets.push(candidate);
      });
    });
  } else targets.push(material);
  targets.forEach(candidate => {
    candidate.transparent = makeTransparent;
    candidate.opacity = makeTransparent ? HIDDEN_OPACITY : 1.0;
    candidate.depthWrite = !makeTransparent;
    candidate.userData.atlasHidden = makeTransparent;
    candidate.needsUpdate = true;
  });
}

let pointerStart = null;
canvas.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; });
canvas.addEventListener('click', (event) => {
  if (drawingMode || (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5)) return;
  const activeModel = getActiveModel();
  if (!activeModel) return;
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(activeModel.children, true);
  const activeToolId = document.querySelector('.tool-btn.active')?.id;
  const hit = intersects.find(({ object, face }) => {
    // Raycaster puede devolver geometría de una variante _Completo aunque su
    // padre esté oculto por la vista de corte. Esos impactos no son interactivos.
    if (!isVisibleInHierarchy(object)) return false;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const material = materials[face?.materialIndex ?? 0];
    if (!material || material.visible === false) return false;
    // Durante el aislamiento ignoramos las regiones atenuadas para que un
    // segundo clic alcance siempre la región que debe restaurar la vista.
    return activeToolId !== 'btn-isolate' || !isolatedModel || sameAnatomicalRegion(material, isolatedMaterial);
  });
  if (hit) {
    const selectedObject = hit.object;
    const materialIndex = hit.face?.materialIndex ?? 0;
    if (currentActiveTab === '1') {
      applyAnatomySelection(activeModel, selectedObject, materialIndex, activeToolId);
    }
  }
});

function applyAnatomySelection(model, mesh, materialIndex, tool) {
  const material = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])[materialIndex];
  if (!material) return;
  anatomyBrowser.select(material.name || mesh.name || 'Estructura seleccionada');
  infoPanel.classList.remove('hidden');
  document.querySelector('#btn-panel').setAttribute('aria-expanded', 'true');
  if (tool === 'btn-isolate') isolateMaterial(model, mesh, materialIndex);
  if (tool === 'btn-hide') toggleMaterialTransparency(mesh, materialIndex);
}

function selectAnatomyPart(name) {
  const model = getActiveModel();
  if (!model || currentActiveTab !== '1') return;
  let match = null;
  model.traverse(mesh => {
    if (!mesh.isMesh || !isVisibleInHierarchy(mesh)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const index = materials.findIndex(material => material.name === name);
    if (index >= 0 && !match) match = { mesh, index };
  });
  if (!match) { anatomyBrowser.select(name); return; }
  // La lista también permite escoger otra pieza durante un aislamiento.
  const material = (Array.isArray(match.mesh.material) ? match.mesh.material : [match.mesh.material])[match.index];
  if (isolatedModel && !sameAnatomicalRegion(material, isolatedMaterial)) restoreIsolation();
  applyAnatomySelection(model, match.mesh, match.index, activeToolId);
}

function activateSelectTool() {
  document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
  previousToolButton = document.querySelector('#btn-select');
  previousToolButton.classList.add('active'); activeToolId = 'btn-select';
}

// --- GESTOR DEL MÓDULO DE FÓRMULAS FISIOLÓGICAS ---
function initFormulas() {
  const $ = selector => document.querySelector(selector);
  const anatomyView = $('#anatomy-view'), glucoseView = $('#glucose-view'), formulasView = $('#formulas-view');
  const structureTitle = $('#structure-title');
  let selectedFormula = 'glucose';
  function setFormulaSubtab(type) {
    selectedFormula = type;
    $('#btn-subtab-glucose').classList.toggle('active', type === 'glucose');
    $('#btn-subtab-filtration').classList.toggle('active', type !== 'glucose');
    $('#glucose-content').style.display = type === 'glucose' ? 'block' : 'none';
    $('#filtration-content').style.display = type === 'glucose' ? 'none' : 'block';
    structureTitle.textContent = type === 'glucose' ? 'Fisiología de la Glucosa' : 'Filtración Glomerular (Starling)';
  }
  $('#btn-subtab-glucose').addEventListener('click', () => setFormulaSubtab('glucose'));
  $('#btn-subtab-filtration').addEventListener('click', () => setFormulaSubtab('filtration'));
  function readParameters() {
    const p = { linkStarling: $('#link-starling').checked };
    for (const key of ['pglu', 'tfg', 'tmg', 'pgc', 'pbs', 'pigc', 'pibs']) p[key] = Number($('#slider-' + key).value);
    return p;
  }
  function refreshFormulas() {
    const state = calculateRenalState(readParameters());
    if (state.linkStarling) $('#slider-tfg').value = state.tfg;
    $('#val-pglu').textContent = state.pglu.toFixed(0) + ' mg/dL';
    $('#val-tfg').textContent = state.tfg.toFixed(1) + ' mL/min';
    $('#val-tmg').textContent = state.tmg.toFixed(0) + ' mg/min';
    $('#res-fglu').textContent = state.filtered.toFixed(1) + ' mg/min';
    $('#res-rglu').textContent = state.reabsorbed.toFixed(1) + ' mg/min';
    $('#res-eglu').textContent = state.excreted.toFixed(1) + ' mg/min';
    $('#res-feglu').textContent = (state.fractionExcreted * 100).toFixed(1) + ' %';
    $('#sglt2-bar').style.width = (state.tmg > 0 ? Math.min(100, state.reabsorbed / state.tmg * 100) : 0) + '%';
    $('#glucose-clinical-state').textContent = state.glucoseState;
    $('#glucose-clinical-state').className = state.excreted > 0 ? 'formula-badge amber' : 'formula-badge';
    $('#glucose-status-tag').className = state.excreted > 0 ? 'clinical-status-tag warning' : 'clinical-status-tag normal';
    $('#glucose-status-text').textContent = state.filtered === 0
      ? 'La TFG activa es cero: no pasa glucosa al filtrado.'
      : state.excreted > 0
        ? 'La carga filtrada supera TmG. El ' + (state.fractionExcreted * 100).toFixed(1) + '% de la glucosa no se reabsorbe y continúa por el túbulo.'
        : 'La carga filtrada está dentro de TmG: la glucosa se reabsorbe en el túbulo proximal.';
    for (const key of ['pgc', 'pbs', 'pigc', 'pibs']) $('#val-' + key).textContent = state[key].toFixed(0) + ' mmHg';
    $('#res-pfn').textContent = (state.pfn >= 0 ? '+' : '') + state.pfn.toFixed(1) + ' mmHg';
    $('#res-starling-tfg').textContent = state.starlingTfg.toFixed(1) + ' mL/min';
    $('#starling-status-tag').className = state.pfn <= 0 ? 'clinical-status-tag danger'
      : state.pfn < 8 || state.pfn > 12 ? 'clinical-status-tag warning' : 'clinical-status-tag normal';
    $('#starling-status-text').textContent = state.pressureState + '. ' + (state.linkStarling
      ? 'Esta TFG controla la animación y las cuatro fórmulas de glucosa.'
      : 'La simulación usa TFG manual. Activa la vinculación para usar estas presiones.');
    const threshold = state.tfg > 0 ? Math.ceil(state.tmg * 100 / state.tfg) : Infinity;
    const thresholdButton = $('[data-preset="threshold"]');
    thresholdButton.disabled = threshold < Number($('#slider-pglu').min) || threshold > Number($('#slider-pglu').max);
    thresholdButton.title = thresholdButton.disabled ? 'El umbral calculado queda fuera del rango del slider de glucemia.'
      : 'Glucemia para que la carga filtrada alcance TmG con la TFG activa.';
    filtrationModule.setState(state);
  }
  function clearPresets() { document.querySelectorAll('.preset-pill').forEach(button => button.classList.remove('active')); }
  for (const key of ['pglu', 'tfg', 'tmg', 'pgc', 'pbs', 'pigc', 'pibs']) {
    $('#slider-' + key).addEventListener('input', () => {
      if (key === 'tfg') $('#link-starling').checked = false;
      clearPresets(); refreshFormulas();
    });
  }
  $('#link-starling').addEventListener('change', () => { clearPresets(); refreshFormulas(); });
  document.querySelectorAll('.preset-pill[data-preset]').forEach(button => button.addEventListener('click', () => {
    const preset = button.dataset.preset;
    const tmg = preset === 'tmg' ? 210 : 205;
    $('#slider-tmg').value = tmg;
    const state = calculateRenalState(readParameters());
    const pglu = preset === 'normal' ? 90 : preset === 'glucosuria' ? 240
      : preset === 'tmg' ? 100 : state.tfg > 0 ? Math.ceil(tmg * 100 / state.tfg) : 100;
    $('#slider-pglu').value = pglu;
    clearPresets(); button.classList.add('active'); refreshFormulas();
  }));
  refreshFormulas();
  return {
    switchFormulaModule(id) {
      anatomyView.style.display = id === '1' ? 'block' : 'none';
      glucoseView.style.display = id === '2' ? 'block' : 'none';
      formulasView.style.display = id === '3' ? 'block' : 'none';
      if (id === '3') setFormulaSubtab(selectedFormula);
      else if (id === '2') structureTitle.textContent = 'Recorrido de la glucosa';
    },
    setFormulaSubtab
  };
}

// --- GESTOR DEL MÓDULO DE FÓRMULAS ---
const formulasManager = initFormulas();

// --- CAMBIO DE MÓDULOS EN LA BARRA SUPERIOR ---
const tabBtns = document.querySelectorAll('.tab-btn');

function switchModule(id) {
  restoreIsolation();
  setDrawingMode(false);
  currentActiveTab = id;
  updateCutOnlyTools();
  if (document.querySelector('.tool-btn.requires-cut.active')) {
    document.querySelectorAll('.tool-btn').forEach(button => button.classList.remove('active'));
    previousToolButton = document.querySelector('#btn-select');
    previousToolButton.classList.add('active');
    activeToolId = 'btn-select';
  }
  glucoseModule.setActive(id === '2');
  filtrationModule.setActive(id === '3');
  document.querySelector('#filtration-loading').hidden = id !== '3' || !!filtrationModule.simulation;
  document.querySelector('#glucose-loading').hidden = id !== '2' || !!glucoseModule.simulation;
  infoPanel.classList.remove('hidden');
  document.querySelector('#btn-panel').setAttribute('aria-expanded', 'true');
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === id));
  formulasManager.switchFormulaModule(id);
  anatomyBrowser.setActive(id === '1');

  // Modelos 3D visibles
  if (kidneyModel) {
    kidneyModel.visible = id === '1' && anatomyKind === 'kidney';
  }
  if (glomerulusAnatomy) glomerulusAnatomy.visible = id === '1' && anatomyKind === 'glomerulus';
  if (id === '1') focusCameraOn(getActiveModel());
  if (id === '2') {
    if (glucoseModule.simulation) focusCameraOn(glucoseModule.root);
    else loadGlucose().catch(() => {});
  }
  if (id === '3') {
    if (filtrationModule.simulation) focusCameraOn(filtrationModule.root);
    else loadFiltration().catch(() => {});
  }
}

tabBtns.forEach((btn) => btn.addEventListener('click', () => switchModule(btn.dataset.tab)));

// --- TOOLBAR IZQUIERDA ---
const toolBtns = document.querySelectorAll('.tool-btn');
let activeToolId = 'btn-select';
updateCutOnlyTools();

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.id === 'btn-draw') return;
    if (btn.classList.contains('requires-cut')) return;

    if (btn.id === 'btn-xray') {
      setXrayMode(!isXrayActive);
      return;
    }

    if (btn.id !== activeToolId) restoreIsolation();
    setDrawingMode(false);
    toolBtns.forEach((button) => button.classList.remove('active'));
    btn.classList.add('active');
    previousToolButton = btn;
    activeToolId = btn.id;

    if (btn.id === 'btn-highlight') {
      setCutView(!isCutViewActive);
      anatomyBrowser.refresh();
      return;
    }
  });
});

// --- PANEL INFORMATIVO DERECHO ---
const closeBtn = document.querySelector('#close-panel');
const infoPanel = document.querySelector('#info-panel');

function toggleInfoPanel() {
  infoPanel.classList.toggle('hidden');
  document.querySelector('#btn-panel').setAttribute('aria-expanded', String(!infoPanel.classList.contains('hidden')));
}
closeBtn?.addEventListener('click', toggleInfoPanel);
document.querySelector('#btn-panel').addEventListener('click', toggleInfoPanel);

// --- LOOP DE ANIMACIÓN ---
function animate() {
  requestAnimationFrame(animate);
  resizeCanvas();
  controls.update();
  const dt = Math.min(frameClock.getDelta(), .05);
  glucoseModule.update(dt);
  filtrationModule.update(dt);
  renderer.render(scene, camera);
  anatomyBrowser.update();
}

anatomyBrowser = new AnatomyBrowser(selectAnatomyPart, switchAnatomyModel);
anatomyBrowser.refresh();
loadGlomerulusAnatomy();

// Read-only handles used to inspect integration without changing the simulation.
window.atlasRenal = { glucoseModule, filtrationModule, scene, camera, controls,
  get activeTab() { return currentActiveTab; },
  get anatomyKind() { return anatomyKind; },
  get anatomyModel() { return getActiveModel(); } };
resizeAnnotationCanvas();
animate();
