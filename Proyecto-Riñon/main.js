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
<<<<<<< Updated upstream
let nephronModel = null;
let currentActiveTab = '1';
=======
let glomerulusAnatomy = null;
let anatomyKind = 'kidney';
let anatomyBrowser = null;
let currentActiveTab = 'home';
>>>>>>> Stashed changes
let isCutViewActive = false;
let isXrayActive = false;
let nephronFlow = null;
const HIDDEN_OPACITY = 0.08;
const loader = new GLTFLoader();
const nephronFlowClock = new THREE.Clock();

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

function createNephronFlow(model) {
  const mesh = getFirstMesh(model);
  if (!mesh) return null;

  const centerline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.017, -0.017, 0.22),
    new THREE.Vector3(-0.017, -0.017, 0.14),
    new THREE.Vector3(-0.017, -0.017, 0.04),
    new THREE.Vector3(-0.017, -0.017, -0.08),
    new THREE.Vector3(-0.017, -0.017, -0.19),
    new THREE.Vector3(-0.015, -0.017, -0.25),
    new THREE.Vector3(-0.008, -0.017, -0.278),
    new THREE.Vector3(0.003, -0.017, -0.28),
    new THREE.Vector3(0.008, -0.017, -0.25),
    new THREE.Vector3(0.008, -0.017, -0.16),
    new THREE.Vector3(0.008, -0.017, -0.04),
    new THREE.Vector3(0.008, -0.017, 0.08),
    new THREE.Vector3(0.008, -0.017, 0.19),
    new THREE.Vector3(0.004, -0.017, 0.235),
    new THREE.Vector3(-0.006, -0.017, 0.25),
    new THREE.Vector3(-0.015, -0.017, 0.235)
  ], true, 'centripetal');
  const flowGroup = new THREE.Group();
  flowGroup.name = 'Flujo tubular';

  const fluidCore = new THREE.Mesh(
    new THREE.TubeGeometry(centerline, 220, 0.0018, 6, true),
    new THREE.MeshBasicMaterial({
      color: 0xc95724,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false
    })
  );
  fluidCore.renderOrder = 5;
  fluidCore.raycast = () => {};
  flowGroup.add(fluidCore);

  const particleGeometry = new THREE.SphereGeometry(0.0032, 12, 8);
  const particleMaterial = new THREE.MeshBasicMaterial({
    color: 0xff922e,
    depthTest: false,
    depthWrite: false
  });
  const particles = Array.from({ length: 18 }, () => {
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.renderOrder = 6;
    particle.raycast = () => {};
    flowGroup.add(particle);
    return particle;
  });

  mesh.add(flowGroup);
  return { centerline, particles, duration: 24 };
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
<<<<<<< Updated upstream
    kidneyModel.visible = currentActiveTab === '1';
    if (currentActiveTab === '1') focusCameraOn(kidneyModel);
=======
    kidneyModel.visible = (currentActiveTab === '1' && anatomyKind === 'kidney') || currentActiveTab === 'home';
    anatomyBrowser.setModel('kidney', kidneyModel);
    if (kidneyModel.visible) focusCameraOn(kidneyModel, currentActiveTab === 'home' ? 'landing' : 'center');
>>>>>>> Stashed changes
  })
  .catch((err) => console.error('❌ Error al cargar las piezas del riñón:', err));

loader.load(
  './Models/nefrona%20(1).glb',
  (gltf) => {
    nephronModel = gltf.scene;
    setupModel(nephronModel);
    nephronFlow = createNephronFlow(nephronModel);
    scene.add(nephronModel);
    setXrayMode(isXrayActive);
    nephronModel.visible = currentActiveTab === '2' || currentActiveTab === '3';
    if (nephronModel.visible) focusCameraOn(nephronModel);
  },
  undefined,
  (err) => console.error('❌ Error al cargar ./Models/nefrona (1).glb:', err)
);

function focusCameraOn(model, alignment = 'center') {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
<<<<<<< Updated upstream
  const distance = maxDim > 0 ? maxDim * 2.2 : 10;
  camera.position.set(0, 0, distance);
  controls.target.set(0, 0, 0);
=======
  const center = box.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const distance = maxDim > 0 ? maxDim / (2 * Math.tan(Math.min(verticalFov, horizontalFov) / 2)) * 1.22 : 10;
  const horizontalOffset = alignment === 'landing'
    ? Math.min(maxDim * 1.1, distance * Math.tan(horizontalFov / 2) * .34)
    : 0;
  const verticalOffset = alignment === 'landing' && camera.aspect < .75 ? maxDim * .55 : 0;
  const target = center.clone().add(new THREE.Vector3(-horizontalOffset, verticalOffset, 0));
  camera.position.copy(target).add(new THREE.Vector3(0, 0, distance));
  controls.target.copy(target);
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  return currentActiveTab === '1' ? kidneyModel : nephronModel;
=======
  if (currentActiveTab === 'home') return null;
  return currentActiveTab === '1' ? (anatomyKind === 'kidney' ? kidneyModel : glomerulusAnatomy) : currentActiveTab === '2' ? glucoseModule.anatomy : filtrationModule.anatomy;
>>>>>>> Stashed changes
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
        const isSelected = material === selectedMaterial;
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
  ['btn-isolate', 'btn-hide'].forEach((id) => {
    const button = document.querySelector(`#${id}`);
    const locked = !isCutViewActive;
    button.classList.toggle('requires-cut', locked);
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked
      ? 'Activa el corte para usar esta herramienta.'
      : '';
  });
}

function setXrayMode(enabled) {
  isXrayActive = enabled;
  [kidneyModel, nephronModel].forEach((model) => {
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
  material.transparent = makeTransparent;
  material.opacity = makeTransparent ? HIDDEN_OPACITY : 1.0;
  material.depthWrite = !makeTransparent;
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
    return activeToolId !== 'btn-isolate' || !isolatedModel || material === isolatedMaterial;
  });
  if (hit) {
    const selectedObject = hit.object;
    const materialIndex = hit.face?.materialIndex ?? 0;
    const materials = Array.isArray(selectedObject.material)
      ? selectedObject.material
      : [selectedObject.material];
    const selectedMaterial = materials[materialIndex];
    document.querySelector('#structure-title').innerText =
      selectedMaterial?.name || selectedObject.name || 'Estructura seleccionada';

    if (activeToolId === 'btn-isolate') {
      isolateMaterial(activeModel, selectedObject, materialIndex);
    }
    if (activeToolId === 'btn-hide') {
      toggleMaterialTransparency(selectedObject, materialIndex);
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
  const resFl = document.querySelector('#res-fglu');
  const resReab = document.querySelector('#res-rglu');
  const resExc = document.querySelector('#res-eglu');
  const resFe = document.querySelector('#res-feglu');
  const fillSglt2 = document.querySelector('#sglt2-bar');
  const fillSglt1 = document.querySelector('#fill-sglt1');
  const pctSglt2 = document.querySelector('#pct-sglt2');
  const pctSglt1 = document.querySelector('#pct-sglt1');
  const glucoseClinicalState = document.querySelector('#glucose-clinical-state');
  const glucoseStatusTag = document.querySelector('#glucose-status-tag');
  const glucoseStatusText = document.querySelector('#glucose-status-text');
  const thresholdFraction = 0.72;

  function calculateGlucoseFormulas() {
    if (!sliderPglu || !sliderTfg || !sliderTmg) return;

    const pglu = parseFloat(sliderPglu.value);
    const tfg = parseFloat(sliderTfg.value);
    const tmg = parseFloat(sliderTmg.value);

    // Carga Filtrada: FL = (P_glu * TFG) / 100
    const cargaFiltrada = (pglu * tfg) / 100;

    // Umbral renal real con fenómeno de splay (~180 mg/dL a TFG normal)
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
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = `Glucemia plasmática supera el umbral de saturación renal (~${Math.round((splayStart * 100) / tfg)} mg/dL). Aparecen trazas de glucosa en la orina final.`;
      }
    } else {
      if (glucoseClinicalState) {
        glucoseClinicalState.innerText = 'Glucosuria Masiva';
        glucoseClinicalState.className = 'formula-badge danger';
      }
      if (glucoseStatusTag) {
        glucoseStatusTag.className = 'clinical-status-tag danger';
      }
      if (glucoseStatusText) {
        glucoseStatusText.innerText = 'Saturación total de transportadores SGLT2/SGLT1 (>210 mg/min). Toda glucosa adicional filtrada se excreta, provocando diuresis osmótica.';
      }
    }
  }

  function handleGlucoseInput() {
    document.querySelectorAll('.preset-pill').forEach((button) => button.classList.remove('active'));
    calculateGlucoseFormulas();
  }

  sliderPglu?.addEventListener('input', handleGlucoseInput);
  sliderTfg?.addEventListener('input', handleGlucoseInput);
  sliderTmg?.addEventListener('input', handleGlucoseInput);

  // Presets clínicos de Glucosa
  const glucosePresets = {
    normal: { pglu: '90', tfg: '125', tmg: '205' },
    threshold: { pglu: null, tfg: '125', tmg: '205' },
    glucosuria: { pglu: '240', tfg: '125', tmg: '205' },
    tmg: { pglu: '100', tfg: '125', tmg: '210' }
  };

  document.querySelectorAll('.preset-pill[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = glucosePresets[button.dataset.preset];
      if (!preset) return;

      if (sliderTfg) sliderTfg.value = preset.tfg;
      if (sliderTmg) sliderTmg.value = preset.tmg;
      if (sliderPglu) {
        sliderPglu.value = preset.pglu ?? String(
          Math.round((Number(preset.tmg) * thresholdFraction * 100) / Number(preset.tfg))
        );
      }
      document.querySelectorAll('.preset-pill').forEach((presetButton) => {
        presetButton.classList.toggle('active', presetButton === button);
      });
      calculateGlucoseFormulas();
    });
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
  restoreIsolation();
  currentActiveTab = id;
<<<<<<< Updated upstream
=======
  document.querySelector('#app').classList.remove('landing-active');
  document.querySelector('#app').dataset.page = 'module';
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
>>>>>>> Stashed changes
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

function showLandingPage(page = 'home') {
  if (!['home', 'credits', 'library'].includes(page)) return;
  restoreIsolation();
  setDrawingMode(false);
  currentActiveTab = 'home';
  document.querySelector('#app').classList.add('landing-active');
  document.querySelector('#app').dataset.page = page;
  document.querySelector('#home-page').hidden = page !== 'home';
  document.querySelector('#credits-page').hidden = page !== 'credits';
  document.querySelector('#library-page').hidden = page !== 'library';
  tabBtns.forEach((button) => button.classList.remove('active'));
  glucoseModule.setActive(false);
  filtrationModule.setActive(false);
  document.querySelector('#glucose-loading').hidden = true;
  document.querySelector('#filtration-loading').hidden = true;
  document.querySelector('#filtration-pause-notice').hidden = true;
  document.querySelector('#filtration-legend').hidden = true;
  document.querySelector('#pause-notice').hidden = true;
  infoPanel.classList.add('hidden');
  document.querySelector('#btn-panel').setAttribute('aria-expanded', 'false');
  formulasManager.switchFormulaModule('home');
  anatomyBrowser.setActive(false);
  if (kidneyModel) {
    kidneyModel.visible = true;
    focusCameraOn(kidneyModel, 'landing');
  }
  if (glomerulusAnatomy) glomerulusAnatomy.visible = false;
}

document.querySelector('#btn-home').addEventListener('click', () => showLandingPage());
document.querySelectorAll('[data-module]').forEach((button) => {
  button.addEventListener('click', () => switchModule(button.dataset.module));
});
document.querySelectorAll('[data-page]').forEach((button) => {
  button.addEventListener('click', () => showLandingPage(button.dataset.page));
});

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
      return;
    }
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
  if (nephronFlow) {
    const progress = (nephronFlowClock.getElapsedTime() / nephronFlow.duration) % 1;
    nephronFlow.particles.forEach((particle, index) => {
      const position = (progress + index / nephronFlow.particles.length) % 1;
      particle.position.copy(nephronFlow.centerline.getPointAt(position));
    });
  }
  renderer.render(scene, camera);
}

<<<<<<< Updated upstream
=======
anatomyBrowser = new AnatomyBrowser(selectAnatomyPart, switchAnatomyModel);
showLandingPage();
anatomyBrowser.refresh();
loadGlomerulusAnatomy();

// Read-only handles used to inspect integration without changing the simulation.
window.atlasRenal = { glucoseModule, filtrationModule, scene, camera, controls,
  get activeTab() { return currentActiveTab; },
  get anatomyKind() { return anatomyKind; },
  get anatomyModel() { return getActiveModel(); } };
>>>>>>> Stashed changes
resizeAnnotationCanvas();
animate();
