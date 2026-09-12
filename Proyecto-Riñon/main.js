import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ELEMENTOS HTML ---
const canvas = document.querySelector('#webgl-canvas');
const container = document.querySelector('.canvas-container');

// --- ESCENA THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6f4f0);

// Cámara
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 10);

// Renderizador
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Iluminación
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight1.position.set(5, 10, 7);
scene.add(dirLight1);

const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
dirLight2.position.set(-5, -5, -5);
scene.add(dirLight2);

// Controles de Órbita
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- GESTIÓN DE MODELOS 3D (.GLB) ---
const loader = new GLTFLoader();

let kidneyModel = null;
let nephronModel = null;
let currentActiveTab = '1';

// Función para centrar y ajustar materiales de cualquier modelo
function setupModel(model) {
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());

  // Centrar geometría respecto al origen
  model.position.x = -center.x;
  model.position.y = -center.y;
  model.position.z = -center.z;

  // Garantizar visibilidad de mallas y caras dobles
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

// 1. Cargar Riñón
loader.load(
  './Models/Kidney.glb',
  (gltf) => {
    kidneyModel = gltf.scene;
    setupModel(kidneyModel);
    scene.add(kidneyModel);
    kidneyModel.visible = (currentActiveTab === '1');

    if (currentActiveTab === '1') focusCameraOn(kidneyModel);
  },
  undefined,
  (err) => console.error('❌ Error al cargar /Models/Kidney.glb:', err)
);

// 2. Cargar Nefrona
loader.load(
  './Models/nefrona.glb',
  (gltf) => {
    nephronModel = gltf.scene;
    setupModel(nephronModel);
    scene.add(nephronModel);

    // Diagnóstico en consola para verificar dimensiones
    const box = new THREE.Box3().setFromObject(nephronModel);
    const size = box.getSize(new THREE.Vector3());
    console.log('📐 Tamaño de la nefrona cargada:', size);

    nephronModel.visible = (currentActiveTab === '2' || currentActiveTab === '3');

    if (currentActiveTab === '2' || currentActiveTab === '3') {
      focusCameraOn(nephronModel);
    }
  },
  undefined,
  (err) => console.error('❌ Error al cargar /Models/nefrona.glb:', err)
);

// Ajusta la distancia de la cámara automáticamente según el tamaño del modelo
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

// Ajuste responsive del canvas
function resizeCanvas() {
  const width = container.clientWidth;
  const height = container.clientHeight;

  if (canvas.width !== width || canvas.height !== height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
}

// --- RAYCASTER (SELECCIÓN AL HACER CLIC) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

canvas.addEventListener('click', (event) => {
  const activeModel = currentActiveTab === '1' ? kidneyModel : nephronModel;
  if (!activeModel) return;

  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(activeModel.children, true);

  if (intersects.length > 0) {
    const selectedObject = intersects[0].object;
    document.querySelector('#structure-title').innerText = selectedObject.name || 'Estructura seleccionada';
  }
});

// --- CAMBIO DE MÓDULOS EN LA BARRA SUPERIOR ---
const tabBtns = document.querySelectorAll('.tab-btn');

function switchModule(id) {
  currentActiveTab = id;

  tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));

  // Visibilidad alternada de los modelos
  if (kidneyModel) {
    kidneyModel.visible = (id === '1');
    if (id === '1') focusCameraOn(kidneyModel);
  }

  if (nephronModel) {
    nephronModel.visible = (id === '2' || id === '3');
    if (id === '2' || id === '3') focusCameraOn(nephronModel);
  }
}

tabBtns.forEach(btn => btn.addEventListener('click', () => switchModule(btn.dataset.tab)));

// Toolbar Izquierda (Rayos X)
const toolBtns = document.querySelectorAll('.tool-btn');
toolBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    toolBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const activeModel = currentActiveTab === '1' ? kidneyModel : nephronModel;
    if (!activeModel) return;

    const isXray = (btn.id === 'btn-xray');
    activeModel.traverse((child) => {
      if (child.isMesh) child.material.wireframe = isXray;
    });
  });
});

// Panel Informativo Derecho
const closeBtn = document.querySelector('#close-panel');
const infoPanel = document.querySelector('#info-panel');

closeBtn.addEventListener('click', () => {
  infoPanel.classList.toggle('hidden');
  setTimeout(resizeCanvas, 300);
});

// Loop de Animación
function animate() {
  requestAnimationFrame(animate);
  resizeCanvas();
  controls.update();
  renderer.render(scene, camera);
}

animate();