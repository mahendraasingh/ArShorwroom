import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const IS_DESKTOP_OVERLAY = new URLSearchParams(window.location.search).has('desktop');
if (IS_DESKTOP_OVERLAY) {
  document.documentElement.classList.add('desktop-overlay');
}

const container = document.getElementById('canvas-container');
const videoEl = document.getElementById('ar-video');
const topbarEl = document.getElementById('topbar');
const controlDockEl = document.getElementById('control-dock');
const restoreUiBtn = document.getElementById('btn-restore-ui');
const desktopBarEl = document.getElementById('desktop-bar');
const desktopTabsEl = document.getElementById('desktop-vehicle-tabs');
const vehicleTabsEl = document.getElementById('vehicle-tabs');
const subtitleEl = document.getElementById('vehicle-subtitle');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingTitle = document.getElementById('loading-title');
const loadingDetail = document.getElementById('loading-detail');
const progressBar = document.getElementById('progress-bar');
const modelStatsEl = document.getElementById('model-stats');
const arBanner = document.getElementById('ar-banner');
const arStatusText = document.getElementById('ar-status-text');
const skySection = document.getElementById('sky-section');

const toggleParallaxBtn = document.getElementById('toggle-parallax');
const toggleRotateBtn = document.getElementById('toggle-rotate');
const toggleTargetBtn = document.getElementById('toggle-target');
const toggleGridBtn = document.getElementById('toggle-grid');
const toggleWireframeBtn = document.getElementById('toggle-wireframe');
const popoutSlider = document.getElementById('popout-slider');
const popoutValueEl = document.getElementById('popout-value');
const scaleSlider = document.getElementById('scale-slider');
const scaleValueEl = document.getElementById('scale-value');
const driveOutBtn = document.getElementById('btn-drive-out');
const resetCameraBtn = document.getElementById('btn-reset-camera');
const fullscreenBtn = document.getElementById('btn-fullscreen');
const desktopOverlayBtn = document.getElementById('btn-desktop-overlay');
const hideUiBtn = document.getElementById('btn-hide-ui');

// Virtual glass plane of the user's real PC monitor:
// The car drives forward PAST MONITOR_PLANE_Z so its nose looms out of the real PC screen!
const MONITOR_PLANE_Z = 0.85;
const SCREEN_CENTER_Y = 0.92;
const SCREEN_CAM_Z = 5.45;

const SKY_PRESETS = {
  day: {
    elevation: 30,
    azimuth: 145,
    turbidity: 3.4,
    rayleigh: 1.3,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.82,
    sunColor: '#fff6e8',
    sunIntensity: 3.3,
    hemiSky: '#d4ebff',
    hemiGround: '#5d6570',
    hemiIntensity: 0.95,
    fogColor: '#c9dcf0',
    fogDensity: 0.0045,
    exposure: 0.98,
    bloomStrength: 0.18,
    lampIntensity: 0,
  },
  sunset: {
    elevation: 5.0,
    azimuth: 168,
    turbidity: 8.2,
    rayleigh: 2.8,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.9,
    sunColor: '#ffb570',
    sunIntensity: 3.1,
    hemiSky: '#ffcba4',
    hemiGround: '#403540',
    hemiIntensity: 0.8,
    fogColor: '#d99672',
    fogDensity: 0.0055,
    exposure: 0.94,
    bloomStrength: 0.26,
    lampIntensity: 1.5,
  },
  night: {
    elevation: -2.5,
    azimuth: 160,
    turbidity: 1.6,
    rayleigh: 0.35,
    mieCoefficient: 0.002,
    mieDirectionalG: 0.75,
    sunColor: '#9dbef5',
    sunIntensity: 0.95,
    hemiSky: '#3b588c',
    hemiGround: '#121826',
    hemiIntensity: 0.6,
    fogColor: '#0e1729',
    fogDensity: 0.0065,
    exposure: 1.06,
    bloomStrength: 0.34,
    lampIntensity: 3.2,
  },
};

const state = {
  vehicles: [],
  activeVehicle: null,
  mode: IS_DESKTOP_OVERLAY ? 'desktop' : 'window',
  sky: 'day',
  paint: 'original',
  parallax: true,
  autoRotate: false,
  showTarget: false,
  showGrid: false,
  wireframe: false,
  uiHidden: false,
  userScale: 1.0,
  popOutZ: 1.35,
  driveAnim: { active: false, startTime: 0, duration: 1300, fromZ: -1.1, toZ: 1.35 },
  mediaStream: null,
  loadToken: 0,
  pointerX: 0,
  pointerY: 0,
  smoothPointerX: 0,
  smoothPointerY: 0,
  isDragging: false,
  userHasOrbited: false,
  paintMaterials: [],
};

// Renderer + Postprocessing
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 5000);
const screenCamPos = new THREE.Vector3(0.0, SCREEN_CENTER_Y + 0.38, SCREEN_CAM_Z);
const screenTargetPos = new THREE.Vector3(0.0, SCREEN_CENTER_Y - 0.1, MONITOR_PLANE_Z);
const studioCamPos = new THREE.Vector3(3.7, 1.55, 4.35);
const studioTargetPos = new THREE.Vector3(0, 0.58, 0);
camera.position.copy(screenCamPos);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.18,
  0.45,
  0.92
);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(outputPass);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 1.6;
controls.maxDistance = 14.0;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.copy(screenTargetPos);
controls.autoRotate = false;
controls.autoRotateSpeed = 0.9;

// Environment map setup
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const roomEnv = new RoomEnvironment();
const studioEnvTex = pmremGenerator.fromScene(roomEnv, 0.04).texture;
roomEnv.dispose();
let outdoorEnvTex = null;

// Lighting
const hemiLight = new THREE.HemisphereLight(0xd4ebff, 0x5d6570, 0.95);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff6e8, 3.3);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 65;
sunLight.shadow.camera.left = -7;
sunLight.shadow.camera.right = 7;
sunLight.shadow.camera.top = 7;
sunLight.shadow.camera.bottom = -7;
sunLight.shadow.bias = -0.00035;
sunLight.shadow.normalBias = 0.015;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x9bc4f2, 0.6);
fillLight.position.set(-8, 4, -8);
scene.add(fillLight);

const foregroundLight = new THREE.DirectionalLight(0xf5f9ff, 1.2);
foregroundLight.position.set(1.6, 3.4, 5.8);
scene.add(foregroundLight);

// Outdoor Scene Group (used in Screen 3D mode — NO fake inner wall so your real monitor edges are the window!)
const outdoorGroup = new THREE.Group();
scene.add(outdoorGroup);

const sky = new Sky();
sky.scale.setScalar(4500);
outdoorGroup.add(sky);
const sunVec = new THREE.Vector3();

function createProceduralSurfaceTextures(baseHex, variance, jointStep) {
  const size = 1024;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  const base = new THREE.Color(baseHex);
  const br = Math.round(base.r * 255);
  const bg = Math.round(base.g * 255);
  const bb = Math.round(base.b * 255);

  cCtx.fillStyle = baseHex;
  cCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#9c9c9c';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 65; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rad = 60 + Math.random() * 140;
    const g = rCtx.createRadialGradient(x, y, 5, x, y, rad);
    const dark = Math.random() > 0.5;
    g.addColorStop(0, dark ? 'rgba(85,85,85,0.24)' : 'rgba(200,200,200,0.2)');
    g.addColorStop(1, 'rgba(140,140,140,0)');
    rCtx.fillStyle = g;
    rCtx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  const imgC = cCtx.getImageData(0, 0, size, size);
  const imgB = bCtx.getImageData(0, 0, size, size);
  const cData = imgC.data;
  const bData = imgB.data;
  for (let i = 0; i < cData.length; i += 4) {
    const n = (Math.random() - 0.5) * variance;
    cData[i] = Math.max(0, Math.min(255, br + n));
    cData[i + 1] = Math.max(0, Math.min(255, bg + n));
    cData[i + 2] = Math.max(0, Math.min(255, bb + n));
    const bn = Math.max(0, Math.min(255, 128 + n * 2.2));
    bData[i] = bData[i + 1] = bData[i + 2] = bn;
  }
  cCtx.putImageData(imgC, 0, 0);
  bCtx.putImageData(imgB, 0, 0);

  if (jointStep > 0) {
    cCtx.strokeStyle = 'rgba(20, 24, 30, 0.38)';
    cCtx.lineWidth = 3;
    bCtx.strokeStyle = 'rgb(45, 45, 45)';
    bCtx.lineWidth = 3;
    for (let p = 0; p <= size; p += jointStep) {
      cCtx.beginPath();
      cCtx.moveTo(p, 0);
      cCtx.lineTo(p, size);
      cCtx.stroke();
      cCtx.beginPath();
      cCtx.moveTo(0, p);
      cCtx.lineTo(size, p);
      cCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(p, 0);
      bCtx.lineTo(p, size);
      bCtx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(0, p);
      bCtx.lineTo(size, p);
      bCtx.stroke();
    }
  }

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const setup = (canvas, isColor, rep) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.anisotropy = maxAniso;
    if (isColor) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  return {
    map: setup(colorCanvas, true, 16),
    roughnessMap: setup(roughCanvas, false, 16),
    bumpMap: setup(bumpCanvas, false, 16),
  };
}

const asphaltTex = createProceduralSurfaceTextures('#2d323b', 26, 256);
const stoneTex = createProceduralSurfaceTextures('#a8b0b9', 18, 512);

const courtyardMat = new THREE.MeshStandardMaterial({
  map: asphaltTex.map,
  roughnessMap: asphaltTex.roughnessMap,
  bumpMap: asphaltTex.bumpMap,
  bumpScale: 0.012,
  roughness: 0.72,
  metalness: 0.1,
  envMapIntensity: 0.85,
});

const courtyardFloor = new THREE.Mesh(new THREE.CircleGeometry(56, 96), courtyardMat);
courtyardFloor.rotation.x = -Math.PI / 2;
courtyardFloor.position.y = -0.004;
courtyardFloor.receiveShadow = true;
outdoorGroup.add(courtyardFloor);

// Converging architectural driveway runway strips leading deep into the screen
const runwayCurbMat = new THREE.MeshStandardMaterial({
  map: stoneTex.map,
  bumpMap: stoneTex.bumpMap,
  bumpScale: 0.008,
  color: '#b4bcc6',
  roughness: 0.65,
  metalness: 0.08,
});
for (const side of [-1, 1]) {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 28), runwayCurbMat);
  strip.position.set(side * 2.55, 0.03, -8.5);
  strip.receiveShadow = true;
  strip.castShadow = true;
  outdoorGroup.add(strip);
}

const concreteCurb = new THREE.Mesh(
  new THREE.RingGeometry(10.6, 11.4, 96),
  new THREE.MeshStandardMaterial({
    color: '#9aa3ad',
    roughness: 0.78,
    metalness: 0.05,
    bumpMap: stoneTex.bumpMap,
    bumpScale: 0.006,
  })
);
concreteCurb.rotation.x = -Math.PI / 2;
concreteCurb.position.y = 0.004;
concreteCurb.receiveShadow = true;
outdoorGroup.add(concreteCurb);

const parapetRadius = 12.2;
const glassWall = new THREE.Mesh(
  new THREE.CylinderGeometry(parapetRadius, parapetRadius, 0.95, 72, 1, true),
  new THREE.MeshPhysicalMaterial({
    color: '#9fb7cc',
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.55,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5,
  })
);
glassWall.position.y = 0.48;
outdoorGroup.add(glassWall);

const handrail = new THREE.Mesh(
  new THREE.TorusGeometry(parapetRadius, 0.04, 12, 96),
  new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.88, roughness: 0.2 })
);
handrail.rotation.x = Math.PI / 2;
handrail.position.y = 0.96;
outdoorGroup.add(handrail);

const bollardLights = [];
const bollardBodyMat = new THREE.MeshStandardMaterial({ color: '#1f242c', metalness: 0.75, roughness: 0.3 });
const bollardLensMat = new THREE.MeshStandardMaterial({
  color: '#fff3d6',
  emissive: '#ffbe6b',
  emissiveIntensity: 0,
});

for (let i = 0; i < 8; i += 1) {
  const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
  const r = 11.0;
  const bollard = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.65, 16), bollardBodyMat);
  stem.position.y = 0.325;
  stem.castShadow = true;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 16), bollardLensMat);
  lens.position.y = 0.68;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), bollardBodyMat);
  cap.position.y = 0.76;

  const pt = new THREE.PointLight('#ffcf87', 0, 8, 1.6);
  pt.position.y = 0.72;
  bollardLights.push(pt);
  bollard.add(stem, lens, cap, pt);
  bollard.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
  outdoorGroup.add(bollard);
}

function buildDistantHorizonTerrain() {
  const geo = new THREE.RingGeometry(48, 260, 140, 16);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.hypot(x, z);
    const t = Math.max(0, (dist - 50) / 210);
    const angle = Math.atan2(z, x);
    const ridge =
      Math.sin(angle * 3.0 + 0.5) * 6.5 +
      Math.cos(angle * 7.0 - 1.2) * 3.8 +
      Math.sin(angle * 13.0 + dist * 0.04) * 2.1 +
      Math.cos(dist * 0.05) * 2.5;
    const height = Math.max(-0.5, (ridge + 7.5) * Math.pow(t, 0.85));
    pos.setY(i, height - 0.4);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: '#4c5a66',
    roughness: 0.96,
    metalness: 0.02,
  });
  return new THREE.Mesh(geo, mat);
}
outdoorGroup.add(buildDistantHorizonTerrain());

// Shared showroom elements
const showroomGroup = new THREE.Group();
scene.add(showroomGroup);

function createRadialGlowTexture(innerColor, outerColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 6, 128, 128, 126);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.35, outerColor);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const contactShadowMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({
    map: createRadialGlowTexture('rgba(0,0,0,0.9)', 'rgba(0,0,0,0.45)'),
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
  })
);
contactShadowMesh.rotation.x = -Math.PI / 2;
contactShadowMesh.position.y = 0.002;
contactShadowMesh.visible = false;
showroomGroup.add(contactShadowMesh);

const gridHelper = new THREE.GridHelper(14, 28, 0x38bdf8, 0x1e293b);
gridHelper.position.y = 0.001;
gridHelper.visible = state.showGrid;
showroomGroup.add(gridHelper);

const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(18, 18),
  new THREE.ShadowMaterial({ opacity: 0.5 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.receiveShadow = true;
showroomGroup.add(shadowPlane);

const targetGroup = new THREE.Group();
targetGroup.visible = state.showTarget;
showroomGroup.add(targetGroup);

const carRoot = new THREE.Group();
showroomGroup.add(carRoot);

const headlightTex = createRadialGlowTexture('rgba(255,252,240,0.92)', 'rgba(195,225,255,0.28)');
const headlightGroup = new THREE.Group();
const leftFlare = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: headlightTex,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  })
);
const rightFlare = leftFlare.clone();
leftFlare.scale.set(0.55, 0.38, 1);
rightFlare.scale.set(0.55, 0.38, 1);
headlightGroup.add(leftFlare, rightFlare);
carRoot.add(headlightGroup);

const textureLoader = new THREE.TextureLoader();

function updateOutdoorEnvironment(presetName) {
  const p = SKY_PRESETS[presetName] || SKY_PRESETS.day;
  const uniforms = sky.material.uniforms;
  uniforms.turbidity.value = p.turbidity;
  uniforms.rayleigh.value = p.rayleigh;
  uniforms.mieCoefficient.value = p.mieCoefficient;
  uniforms.mieDirectionalG.value = p.mieDirectionalG;

  const phi = THREE.MathUtils.degToRad(90 - p.elevation);
  const theta = THREE.MathUtils.degToRad(p.azimuth);
  sunVec.setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sunVec);

  sunLight.position.copy(sunVec).multiplyScalar(28);
  sunLight.color.set(p.sunColor);
  sunLight.intensity = p.sunIntensity;

  hemiLight.color.set(p.hemiSky);
  hemiLight.groundColor.set(p.hemiGround);
  hemiLight.intensity = p.hemiIntensity;

  renderer.toneMappingExposure = p.exposure;
  bloomPass.strength = p.bloomStrength;

  bollardLensMat.emissiveIntensity = p.lampIntensity;
  for (const pt of bollardLights) {
    pt.intensity = p.lampIntensity * 1.3;
  }

  const flareOpacity = presetName === 'night' ? 0.85 : presetName === 'sunset' ? 0.65 : 0.4;
  leftFlare.material.opacity = flareOpacity;
  rightFlare.material.opacity = flareOpacity;

  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  const eu = envSky.material.uniforms;
  eu.turbidity.value = p.turbidity;
  eu.rayleigh.value = p.rayleigh;
  eu.mieCoefficient.value = p.mieCoefficient;
  eu.mieDirectionalG.value = p.mieDirectionalG;
  eu.sunPosition.value.copy(sunVec);
  envScene.add(envSky);

  const envGround = new THREE.Mesh(
    new THREE.CircleGeometry(400, 32),
    new THREE.MeshBasicMaterial({ color: p.hemiGround })
  );
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -2;
  envScene.add(envGround);

  const nextEnv = pmremGenerator.fromScene(envScene, 0.02).texture;
  envSky.geometry.dispose();
  envSky.material.dispose();
  envGround.geometry.dispose();
  envGround.material.dispose();

  if (outdoorEnvTex) outdoorEnvTex.dispose();
  outdoorEnvTex = nextEnv;
  if (state.mode === 'window' || state.mode === 'desktop') {
    scene.environment = outdoorEnvTex;
    scene.fog = state.mode === 'window' ? new THREE.FogExp2(p.fogColor, p.fogDensity) : null;
  }
}

function applySkyPreset(presetName) {
  state.sky = presetName;
  for (const btn of document.querySelectorAll('.sky-btn')) {
    btn.classList.toggle('active', btn.dataset.sky === presetName);
  }
  updateOutdoorEnvironment(presetName);
}

function updateCarPlacement() {
  const isPopMode = state.mode === 'window' || state.mode === 'desktop';
  const zPos = isPopMode ? state.popOutZ : 0;
  carRoot.position.z = zPos;
  carRoot.rotation.y = isPopMode ? 0.34 : 0;

  if (carRoot.children.length > 1) {
    const carModel = carRoot.children.find((c) => c !== headlightGroup);
    if (carModel) {
      const box = new THREE.Box3().setFromObject(carModel);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      contactShadowMesh.position.x = center.x;
      contactShadowMesh.position.z = center.z;
      contactShadowMesh.scale.set(size.x * 1.18, size.z * 1.15, 1);
    }
  }
}

function triggerDriveOutAnimation() {
  if (state.mode !== 'window' && state.mode !== 'desktop') return;
  state.driveAnim = {
    active: true,
    startTime: performance.now(),
    duration: 1300,
    fromZ: -1.1,
    toZ: Number(popoutSlider.value),
  };
}

function resetCamera() {
  state.userHasOrbited = false;
  if (state.mode === 'window' || state.mode === 'desktop') {
    camera.position.copy(screenCamPos);
    controls.target.copy(screenTargetPos);
  } else {
    camera.position.copy(studioCamPos);
    controls.target.copy(studioTargetPos);
  }
  camera.updateProjectionMatrix();
  controls.update();
}

function setLoading(visible, title = '', detail = '', percent = 0) {
  loadingOverlay.classList.toggle('hidden', !visible);
  if (visible) {
    loadingTitle.textContent = title;
    loadingDetail.textContent = detail;
    progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  }
}

function disposeObject3D(root) {
  root.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!mat) continue;
        for (const key of Object.keys(mat)) {
          const val = mat[key];
          if (val && val.isTexture) {
            val.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}

function clearCarModel() {
  for (let i = carRoot.children.length - 1; i >= 0; i -= 1) {
    const child = carRoot.children[i];
    if (child === headlightGroup) continue;
    carRoot.remove(child);
    disposeObject3D(child);
  }
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject3D(child);
  }
}

function buildTargetPlate(vehicle) {
  clearGroup(targetGroup);
  const w = vehicle.targetSize?.width || 0.2;
  const h = vehicle.targetSize?.height || 0.3;
  const aspect = h / w;
  const plateWidth = 3.2;
  const plateDepth = plateWidth * aspect;

  textureLoader.load(vehicle.targetImageUrl, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const plateMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.72,
      metalness: 0.05,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(plateWidth, plateDepth), plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.004;
    plate.receiveShadow = true;
    targetGroup.add(plate);

    const frame = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-plateWidth / 2, 0.006, -plateDepth / 2),
        new THREE.Vector3(plateWidth / 2, 0.006, -plateDepth / 2),
        new THREE.Vector3(plateWidth / 2, 0.006, plateDepth / 2),
        new THREE.Vector3(-plateWidth / 2, 0.006, plateDepth / 2),
      ]),
      new THREE.LineBasicMaterial({ color: 0x38bdf8 })
    );
    targetGroup.add(frame);
  });
}

function applyWireframe(wireframe) {
  carRoot.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (mat) {
        mat.wireframe = wireframe;
      }
    }
  });
}

function upgradeToPhysicalMaterial(srcMat, meshName, fallbackTexture) {
  const matName = (srcMat?.name || '').toLowerCase();
  const objName = (meshName || '').toLowerCase();
  const tag = `${matName} ${objName}`;

  if (fallbackTexture) {
    const mat = new THREE.MeshPhysicalMaterial({
      map: fallbackTexture,
      roughness: 0.34,
      metalness: 0.25,
      clearcoat: 0.65,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.35,
      wireframe: state.wireframe,
    });
    mat.userData.originalColor = mat.color.clone();
    mat.userData.isPaint = true;
    return mat;
  }

  const baseColor = srcMat?.color ? srcMat.color.clone() : new THREE.Color('#c8cdd4');
  if (srcMat?.map) {
    srcMat.map.colorSpace = THREE.SRGBColorSpace;
  }

  const isGlass =
    /glass|window|windshield|windscreen|visor/.test(tag) ||
    (srcMat?.transparent && !srcMat?.map);
  const isDecal = Boolean(srcMat?.transparent && srcMat?.map && !isGlass);
  const isTire = /tire|tyre|rubber|tread|weel_r|wheel1a/.test(tag);
  const isChrome = /chrome|silver|steel|alloy|rim|exhaust|mirror|outterior_metal|metal_ring|calliper/.test(tag);
  const isLight = /light|emis|digital_meeter/.test(tag);
  const isInteriorOrTrim =
    /interior|seat|dash|carpet|clock|switch|steering|stearing|brake|carbon|engine|grille|grill|badge|logo|plate|under|bottom|base/.test(tag);
  const isExplicitBody = /paint|coloured|car_body|body/.test(tag);

  let params;
  let isPaint = false;

  if (isGlass) {
    const isRedGlass = /red_glass/.test(tag);
    params = {
      color: isRedGlass ? new THREE.Color('#880a0a') : new THREE.Color('#0c141d'),
      emissive: isRedGlass ? new THREE.Color('#450000') : new THREE.Color('#000000'),
      roughness: 0.05,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      transparent: true,
      opacity: isRedGlass ? 0.85 : Math.min(srcMat?.opacity ?? 0.62, 0.7),
      envMapIntensity: 2.3,
    };
  } else if (isDecal) {
    params = {
      color: baseColor,
      map: srcMat.map,
      roughness: 0.35,
      metalness: 0.25,
      transparent: true,
      alphaTest: 0.08,
      envMapIntensity: 1.2,
    };
  } else if (isLight) {
    params = {
      color: baseColor,
      map: srcMat?.map || null,
      emissive: new THREE.Color('#fff5e0'),
      emissiveMap: srcMat?.map || null,
      emissiveIntensity: 0.55,
      roughness: 0.18,
      metalness: 0.2,
      clearcoat: 0.9,
      envMapIntensity: 1.6,
    };
  } else if (isTire) {
    params = {
      color: baseColor,
      map: srcMat?.map || null,
      roughness: 0.86,
      metalness: 0.04,
      clearcoat: 0.0,
      envMapIntensity: 0.65,
    };
  } else if (isChrome) {
    params = {
      color: baseColor,
      map: srcMat?.map || null,
      roughness: 0.14,
      metalness: 0.94,
      clearcoat: 0.45,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.9,
    };
  } else if (isInteriorOrTrim && !isExplicitBody) {
    params = {
      color: baseColor,
      map: srcMat?.map || null,
      roughness: /carbon/.test(tag) ? 0.32 : 0.68,
      metalness: /carbon|engine/.test(tag) ? 0.35 : 0.12,
      clearcoat: /carbon/.test(tag) ? 0.65 : 0.08,
      envMapIntensity: 1.0,
    };
  } else {
    isPaint = true;
    params = {
      color: baseColor,
      map: srcMat?.map || null,
      normalMap: srcMat?.normalMap || null,
      bumpMap: srcMat?.bumpMap || null,
      roughness: 0.18,
      metalness: srcMat?.map ? 0.36 : 0.62,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      reflectivity: 0.96,
      envMapIntensity: 1.75,
    };
  }

  const phys = new THREE.MeshPhysicalMaterial({
    ...params,
    side: srcMat?.side ?? THREE.FrontSide,
    wireframe: state.wireframe,
  });
  phys.userData.originalColor = phys.color.clone();
  phys.userData.isPaint = isPaint;
  return phys;
}

function applyPaintFinish(paintValue) {
  state.paint = paintValue;
  for (const btn of document.querySelectorAll('.paint-btn')) {
    btn.classList.toggle('active', btn.dataset.paint === paintValue);
  }
  for (const mat of state.paintMaterials) {
    if (paintValue === 'original') {
      mat.color.copy(mat.userData.originalColor);
    } else {
      mat.color.set(paintValue);
    }
    mat.needsUpdate = true;
  }
}

function stripScanGroundSkirt(model, texture) {
  let pixelData = null;
  const imgSize = 1024;
  if (texture?.image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgSize;
      canvas.height = imgSize;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(texture.image, 0, 0, imgSize, imgSize);
      pixelData = ctx.getImageData(0, 0, imgSize, imgSize).data;
    } catch {
      pixelData = null;
    }
  }

  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    let geo = child.geometry;
    if (geo.index) {
      geo = geo.toNonIndexed();
    }
    const pos = geo.getAttribute('position');
    if (!pos) return;
    const norm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');

    const count = pos.count;
    const keptPos = new Float32Array(count * 3);
    const keptNorm = norm ? new Float32Array(count * 3) : null;
    const keptUv = uv ? new Float32Array(count * 2) : null;

    let outVerts = 0;
    for (let i = 0; i + 2 < count; i += 3) {
      const x0 = pos.getX(i), y0 = pos.getY(i), z0 = pos.getZ(i);
      const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
      const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
      const avgZ = (z0 + z1 + z2) / 3;

      const ax = x1 - x0, ay = y1 - y0, az = z1 - z0;
      const bx = x2 - x0, by = y2 - y0, bz = z2 - z0;
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      const nLen = Math.hypot(nx, ny, nz) || 1;
      const nzAbs = Math.abs(nz / nLen);

      let isBrightSnow = false;
      if (pixelData && uv) {
        const u = Math.max(0, Math.min(imgSize - 1, Math.floor(uv.getX(i) * (imgSize - 1))));
        const v = Math.max(0, Math.min(imgSize - 1, Math.floor((1 - uv.getY(i)) * (imgSize - 1))));
        const idx = (v * imgSize + u) * 4;
        const r = pixelData[idx];
        const g = pixelData[idx + 1];
        const b = pixelData[idx + 2];
        const lum = (r + g + b) / 3;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        isBrightSnow =
          (avgZ < 1.05 && lum > 115 && sat < 36) ||
          (avgZ < 1.35 && lum > 155 && sat < 24 && nzAbs > 0.55);
      }

      const drop =
        avgZ < 0.58 ||
        (avgZ < 1.05 && nzAbs > 0.45) ||
        isBrightSnow;
      if (drop) continue;

      for (let k = 0; k < 3; k += 1) {
        const srcIdx = i + k;
        const dstIdx = outVerts + k;
        keptPos[dstIdx * 3] = pos.getX(srcIdx);
        keptPos[dstIdx * 3 + 1] = pos.getY(srcIdx);
        keptPos[dstIdx * 3 + 2] = pos.getZ(srcIdx);
        if (keptNorm && norm) {
          keptNorm[dstIdx * 3] = norm.getX(srcIdx);
          keptNorm[dstIdx * 3 + 1] = norm.getY(srcIdx);
          keptNorm[dstIdx * 3 + 2] = norm.getZ(srcIdx);
        }
        if (keptUv && uv) {
          keptUv[dstIdx * 2] = uv.getX(srcIdx);
          keptUv[dstIdx * 2 + 1] = uv.getY(srcIdx);
        }
      }
      outVerts += 3;
    }

    const nextGeo = new THREE.BufferGeometry();
    nextGeo.setAttribute('position', new THREE.BufferAttribute(keptPos.subarray(0, outVerts * 3), 3));
    if (keptNorm) {
      nextGeo.setAttribute('normal', new THREE.BufferAttribute(keptNorm.subarray(0, outVerts * 3), 3));
    } else {
      nextGeo.computeVertexNormals();
    }
    if (keptUv) {
      nextGeo.setAttribute('uv', new THREE.BufferAttribute(keptUv.subarray(0, outVerts * 2), 2));
    }
    nextGeo.computeBoundingBox();
    nextGeo.computeBoundingSphere();

    geo.dispose();
    if (child.geometry !== geo) child.geometry.dispose();
    child.geometry = nextGeo;
  });
}

function normalizeAndMountModel(model, vehicle, fallbackTexture) {
  if (vehicle.stripGroundSkirt) {
    stripScanGroundSkirt(model, fallbackTexture);
  }

  state.paintMaterials = [];
  let meshCount = 0;

  model.traverse((child) => {
    if (!child.isMesh) return;
    meshCount += 1;
    child.castShadow = true;
    child.receiveShadow = true;

    if (fallbackTexture) {
      const mat = upgradeToPhysicalMaterial(null, child.name, fallbackTexture);
      child.material = mat;
      state.paintMaterials.push(mat);
    } else if (child.material) {
      if (Array.isArray(child.material)) {
        child.material = child.material.map((m) => {
          const phys = upgradeToPhysicalMaterial(m, child.name, null);
          if (phys.userData.isPaint) state.paintMaterials.push(phys);
          m?.dispose();
          return phys;
        });
      } else {
        const old = child.material;
        const phys = upgradeToPhysicalMaterial(old, child.name, null);
        if (phys.userData.isPaint) state.paintMaterials.push(phys);
        old?.dispose();
        child.material = phys;
      }
    }
  });

  if (state.paint !== 'original') {
    applyPaintFinish(state.paint);
  }

  model.rotation.order = 'YXZ';
  model.rotation.x = vehicle.defaultRotationX || 0;
  model.rotation.y = vehicle.defaultRotationY || 0;

  model.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);

  const maxHorizontal = Math.max(rawSize.x, rawSize.z, 0.001);
  const targetLength = 4.15;
  const normScale = targetLength / maxHorizontal;
  model.scale.setScalar(normScale);

  model.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  const scaledSize = new THREE.Vector3();
  scaledBox.getCenter(center);
  scaledBox.getSize(scaledSize);

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
  model.position.y += 0.006;

  leftFlare.position.set(-scaledSize.x * 0.34, scaledSize.y * 0.44, scaledSize.z * 0.48);
  rightFlare.position.set(scaledSize.x * 0.34, scaledSize.y * 0.44, scaledSize.z * 0.48);

  carRoot.scale.setScalar(state.userScale);
  carRoot.add(model);
  contactShadowMesh.visible = true;

  updateCarPlacement();
  triggerDriveOutAnimation();

  modelStatsEl.textContent = `${vehicle.name} · ${meshCount} meshes · Target ${vehicle.targetSize.width.toFixed(2)}m × ${vehicle.targetSize.height.toFixed(2)}m`;
}

function loadTextureAsync(url) {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    textureLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

async function loadVehicle(vehicle) {
  const token = ++state.loadToken;
  state.activeVehicle = vehicle;
  subtitleEl.textContent = vehicle.subtitle;

  for (const btn of document.querySelectorAll('.vehicle-tab')) {
    btn.classList.toggle('active', btn.dataset.id === vehicle.id);
  }

  document.getElementById('target-preview-img').src = vehicle.targetImageUrl;
  document.getElementById('target-preview-meta').textContent =
    `Target "${vehicle.targetName}" (${vehicle.targetSize.width.toFixed(3)} m × ${vehicle.targetSize.height.toFixed(3)} m) from Assets/StreamingAssets/Vuforia/ARCarTargets.xml`;

  buildTargetPlate(vehicle);
  clearCarModel();
  contactShadowMesh.visible = false;

  setLoading(true, `Loading ${vehicle.name}…`, 'Downloading 3D geometry…', 5);

  try {
    const fallbackTex = await loadTextureAsync(vehicle.textureUrl);
    if (token !== state.loadToken) return;

    const manager = new THREE.LoadingManager();
    const loader = vehicle.format === 'obj' ? new OBJLoader(manager) : new FBXLoader(manager);
    if (vehicle.resourcePath && typeof loader.setResourcePath === 'function') {
      loader.setResourcePath(vehicle.resourcePath);
    }

    const model = await new Promise((resolve, reject) => {
      loader.load(
        vehicle.modelUrl,
        resolve,
        (xhr) => {
          if (token !== state.loadToken) return;
          if (xhr.lengthComputable && xhr.total > 0) {
            const pct = Math.round((xhr.loaded / xhr.total) * 100);
            const mbLoaded = (xhr.loaded / (1024 * 1024)).toFixed(1);
            const mbTotal = (xhr.total / (1024 * 1024)).toFixed(1);
            setLoading(true, `Loading ${vehicle.name}…`, `${mbLoaded} MB / ${mbTotal} MB`, pct);
          }
        },
        reject
      );
    });

    if (token !== state.loadToken) {
      disposeObject3D(model);
      return;
    }

    normalizeAndMountModel(model, vehicle, fallbackTex);
    setLoading(false);
  } catch (err) {
    if (token !== state.loadToken) return;
    console.error('Failed to load vehicle:', err);
    setLoading(true, `Could not load ${vehicle.name}`, err?.message || 'Unknown loader error', 0);
    setTimeout(() => {
      if (token === state.loadToken) setLoading(false);
    }, 2500);
  }
}

async function stopWebcam() {
  videoEl.classList.remove('active');
  if (state.mediaStream) {
    for (const track of state.mediaStream.getTracks()) {
      track.stop();
    }
    state.mediaStream = null;
    videoEl.srcObject = null;
  }
}

function toggleUiVisibility(force) {
  state.uiHidden = typeof force === 'boolean' ? force : !state.uiHidden;
  topbarEl.classList.toggle('hidden', state.uiHidden || IS_DESKTOP_OVERLAY);
  controlDockEl.classList.toggle('hidden', state.uiHidden || IS_DESKTOP_OVERLAY);
  restoreUiBtn.classList.toggle('hidden', !state.uiHidden || IS_DESKTOP_OVERLAY);
}

async function setMode(mode) {
  state.mode = mode;
  for (const btn of document.querySelectorAll('.mode-btn')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }

  const isWindow = mode === 'window';
  const isDesktop = mode === 'desktop';
  const isAR = mode === 'ar';

  outdoorGroup.visible = isWindow;
  skySection.classList.toggle('hidden', !isWindow);
  topbarEl.classList.toggle('hidden', isDesktop || state.uiHidden);
  controlDockEl.classList.toggle('hidden', isDesktop || state.uiHidden);
  desktopBarEl.classList.toggle('hidden', !isDesktop);

  if (isDesktop) {
    gridHelper.visible = false;
    scene.fog = null;
    applySkyPreset(state.sky);
    resetCamera();
    triggerDriveOutAnimation();
    return;
  }

  if (isWindow) {
    await stopWebcam();
    arBanner.classList.add('hidden');
    applySkyPreset(state.sky);
    resetCamera();
    triggerDriveOutAnimation();
  } else if (mode === 'showroom') {
    await stopWebcam();
    arBanner.classList.add('hidden');
    scene.fog = null;
    scene.environment = studioEnvTex;
    hemiLight.color.set('#dbeafe');
    hemiLight.groundColor.set('#1e293b');
    hemiLight.intensity = 0.75;
    sunLight.color.set('#fff7ed');
    sunLight.intensity = 2.2;
    sunLight.position.set(5, 8, 5);
    renderer.toneMappingExposure = 1.05;
    bloomPass.strength = 0.14;
    resetCamera();
  } else if (isAR) {
    scene.fog = null;
    scene.environment = outdoorEnvTex || studioEnvTex;
    renderer.toneMappingExposure = 1.05;
    arBanner.classList.remove('hidden');
    arStatusText.textContent = 'Requesting webcam access for AR overlay…';
    resetCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      arStatusText.textContent = 'Webcam API unavailable in this browser — showing transparent AR overlay.';
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      state.mediaStream = stream;
      videoEl.srcObject = stream;
      videoEl.classList.add('active');
      arStatusText.textContent = 'AR Camera Active — point your webcam out the window or at a surface.';
    } catch {
      arStatusText.textContent = 'Camera permission denied or no webcam found — drag to inspect in AR overlay.';
    }
  }
}

window.addEventListener('pointermove', (e) => {
  state.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
  state.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
});
controls.addEventListener('start', () => {
  state.isDragging = true;
  if (!state.userHasOrbited) {
    state.userHasOrbited = true;
    camera.updateProjectionMatrix();
  }
});
controls.addEventListener('end', () => {
  state.isDragging = false;
});

for (const btn of document.querySelectorAll('.sky-btn')) {
  btn.addEventListener('click', () => applySkyPreset(btn.dataset.sky));
}

for (const btn of document.querySelectorAll('.paint-btn')) {
  btn.addEventListener('click', () => applyPaintFinish(btn.dataset.paint));
}

toggleParallaxBtn.addEventListener('click', () => {
  state.parallax = !state.parallax;
  toggleParallaxBtn.classList.toggle('active', state.parallax);
  if (!state.parallax) {
    camera.updateProjectionMatrix();
  }
});

toggleRotateBtn.addEventListener('click', () => {
  state.autoRotate = !state.autoRotate;
  controls.autoRotate = state.autoRotate;
  toggleRotateBtn.classList.toggle('active', state.autoRotate);
});

toggleTargetBtn.addEventListener('click', () => {
  state.showTarget = !state.showTarget;
  targetGroup.visible = state.showTarget;
  toggleTargetBtn.classList.toggle('active', state.showTarget);
});

toggleGridBtn.addEventListener('click', () => {
  state.showGrid = !state.showGrid;
  gridHelper.visible = state.showGrid;
  toggleGridBtn.classList.toggle('active', state.showGrid);
});

toggleWireframeBtn.addEventListener('click', () => {
  state.wireframe = !state.wireframe;
  applyWireframe(state.wireframe);
  toggleWireframeBtn.classList.toggle('active', state.wireframe);
});

popoutSlider.addEventListener('input', (e) => {
  state.driveAnim.active = false;
  state.popOutZ = Number(e.target.value);
  popoutValueEl.textContent = `${state.popOutZ.toFixed(2)}m`;
  updateCarPlacement();
});

scaleSlider.addEventListener('input', (e) => {
  state.userScale = Number(e.target.value);
  scaleValueEl.textContent = `${state.userScale.toFixed(2)}×`;
  carRoot.scale.setScalar(state.userScale);
  updateCarPlacement();
});

driveOutBtn.addEventListener('click', triggerDriveOutAnimation);
resetCameraBtn.addEventListener('click', resetCamera);

fullscreenBtn.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      fullscreenBtn.textContent = 'Exit Fullscreen';
    } else {
      await document.exitFullscreen();
      fullscreenBtn.textContent = 'Fullscreen';
    }
  } catch (err) {
    console.warn('Fullscreen request failed:', err);
  }
});

document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
});

desktopOverlayBtn.addEventListener('click', async () => {
  desktopOverlayBtn.disabled = true;
  desktopOverlayBtn.textContent = 'Launching…';
  try {
    const res = await fetch('/api/launch-desktop', { method: 'POST' });
    const data = await res.json();
    desktopOverlayBtn.textContent = data.ok ? 'Overlay Running' : 'Launch Failed';
  } catch {
    desktopOverlayBtn.textContent = 'Launch Failed';
  } finally {
    setTimeout(() => {
      desktopOverlayBtn.disabled = false;
      desktopOverlayBtn.textContent = 'Desktop Overlay';
    }, 2200);
  }
});

hideUiBtn.addEventListener('click', () => toggleUiVisibility(true));
restoreUiBtn.addEventListener('click', () => toggleUiVisibility(false));

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'h' || e.key === 'H') {
    toggleUiVisibility();
  } else if (e.key === 'f' || e.key === 'F') {
    fullscreenBtn.click();
  }
});

// Desktop overlay pill bar actions
document.getElementById('desktop-drive-out').addEventListener('click', triggerDriveOutAnimation);
document.getElementById('desktop-rotate').addEventListener('click', () => {
  state.autoRotate = !state.autoRotate;
  controls.autoRotate = state.autoRotate;
});
document.getElementById('desktop-scale-down').addEventListener('click', () => {
  state.userScale = Math.max(0.4, +(state.userScale - 0.1).toFixed(2));
  carRoot.scale.setScalar(state.userScale);
  updateCarPlacement();
});
document.getElementById('desktop-scale-up').addEventListener('click', () => {
  state.userScale = Math.min(1.6, +(state.userScale + 0.1).toFixed(2));
  carRoot.scale.setScalar(state.userScale);
  updateCarPlacement();
});
document.getElementById('desktop-clickthrough').addEventListener('click', () => {
  window.desktopOverlay?.setClickThrough(true);
});
document.getElementById('desktop-exit').addEventListener('click', () => {
  window.desktopOverlay?.exit();
});
window.desktopOverlay?.onClickThroughChanged((ignored) => {
  const btn = document.getElementById('desktop-clickthrough');
  btn.textContent = ignored ? 'Click-Through ON (Ctrl+Shift+C)' : 'Click-Through';
});

for (const btn of document.querySelectorAll('.mode-btn')) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
}

document.getElementById('btn-target-modal').addEventListener('click', () => {
  document.getElementById('modal-target').classList.remove('hidden');
});

document.getElementById('btn-demo-modal').addEventListener('click', () => {
  document.getElementById('modal-demo').classList.remove('hidden');
});

for (const el of document.querySelectorAll('[data-close-modal]')) {
  el.addEventListener('click', () => {
    const id = el.dataset.closeModal;
    document.getElementById(id).classList.add('hidden');
    if (id === 'modal-demo') {
      document.getElementById('demo-video-player').pause();
    }
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

function applyTrueOffAxisMonitorProjection(eyeX, eyeY) {
  const camZ = camera.position.z;
  const dist = Math.max(1.5, camZ - MONITOR_PLANE_Z);
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  const halfW = halfH * camera.aspect;
  const near = camera.near;

  const left = (-halfW - eyeX) * (near / dist);
  const right = (halfW - eyeX) * (near / dist);
  const top = (halfH - eyeY) * (near / dist);
  const bottom = (-halfH - eyeY) * (near / dist);

  camera.projectionMatrix.makePerspective(left, right, top, bottom, near, camera.far, camera.coordinateSystem);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

function animate() {
  requestAnimationFrame(animate);

  if (state.driveAnim.active) {
    const t = Math.min(1, (performance.now() - state.driveAnim.startTime) / state.driveAnim.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    state.popOutZ = THREE.MathUtils.lerp(state.driveAnim.fromZ, state.driveAnim.toZ, eased);
    popoutSlider.value = state.popOutZ.toFixed(2);
    popoutValueEl.textContent = `${state.popOutZ.toFixed(2)}m`;
    updateCarPlacement();
    if (t >= 1) {
      state.driveAnim.active = false;
    }
  }

  // Off-axis virtual-window frustum anchored on the user's real monitor plane
  if ((state.mode === 'window' || state.mode === 'desktop') && state.parallax && !state.userHasOrbited) {
    state.smoothPointerX += (state.pointerX - state.smoothPointerX) * 0.08;
    state.smoothPointerY += (state.pointerY - state.smoothPointerY) * 0.08;

    const eyeX = state.smoothPointerX * 0.92;
    const eyeY = -state.smoothPointerY * 0.4;
    camera.position.set(eyeX, SCREEN_CENTER_Y + 0.38 + eyeY, SCREEN_CAM_Z);
    controls.target.set(eyeX, SCREEN_CENTER_Y + 0.38 + eyeY, MONITOR_PLANE_Z);
    controls.update();
    applyTrueOffAxisMonitorProjection(eyeX, eyeY);
  } else {
    controls.update();
  }

  if (state.mode === 'ar' || state.mode === 'desktop') {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
}

async function init() {
  setMode(IS_DESKTOP_OVERLAY ? 'desktop' : 'window');
  animate();
  const res = await fetch('/api/vehicles');
  const data = await res.json();
  state.vehicles = data.vehicles || [];

  vehicleTabsEl.innerHTML = '';
  desktopTabsEl.innerHTML = '';
  for (const vehicle of state.vehicles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vehicle-tab';
    btn.dataset.id = vehicle.id;
    btn.textContent = vehicle.name;
    btn.addEventListener('click', () => loadVehicle(vehicle));
    vehicleTabsEl.appendChild(btn);

    const dBtn = btn.cloneNode(true);
    dBtn.addEventListener('click', () => loadVehicle(vehicle));
    desktopTabsEl.appendChild(dBtn);
  }

  if (state.vehicles.length > 0) {
    await loadVehicle(state.vehicles[0]);
  }
}

init();
