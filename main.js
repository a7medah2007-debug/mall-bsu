'use strict';

// ═══════════════════════════════════════════════
//  ثوابت الـ VR
// ═══════════════════════════════════════════════
const VR_FIXED_HEIGHT     = (typeof CAMERA !== 'undefined' && CAMERA.vrFixedHeight) || 1.333;
const VR_PITCH_CORRECTION = 0.06;
const VR_ROLL_CORRECTION  = -0.03;

// ═══════════════════════════════════════════════
//  المحرك والمشهد — مضبوط للـ Quest 2
// ═══════════════════════════════════════════════
const canvas = document.getElementById('game-canvas');

const engine = new BABYLON.Engine(canvas, false, {  // antialias=false يوفر 15-20% على Quest
  preserveDrawingBuffer:  false,
  stencil:                false,
  doNotHandleContextLost: true,
  adaptToDeviceRatio:     false,                    // Quest بيتحكم هو في الـ resolution
  xrCompatible:           true,
});

engine.enableOfflineSupport = false;
engine.setHardwareScalingLevel(1.3);                // تخفيف طفيف على الـ GPU

const scene = new BABYLON.Scene(engine);
scene.useRightHandedSystem     = true;
scene.clearColor               = BABYLON.Color4.FromHexString(SCENE.background + 'FF');
scene.autoClear                = true;
scene.autoClearDepthAndStencil = true;
scene.skipPointerMovePicking   = true;
scene.pointerMovePredicate     = () => false;       // إيقاف كامل لـ pointer picking

// ═══════════════════════════════════════════════
//  الإضاءة — مبسطة للـ Quest 2
//  Hemispheric + Directional = كافي تماماً
//  Point lights: 2 بس بدل 5
// ═══════════════════════════════════════════════
const hemiLight = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
hemiLight.diffuse     = BABYLON.Color3.FromHexString(SCENE.ambientLight.color);
hemiLight.groundColor = BABYLON.Color3.FromHexString('#5D4037');
hemiLight.intensity   = SCENE.ambientLight.intensity;
hemiLight.specular    = BABYLON.Color3.Black();     // إيقاف specular يخفف الحسابات

const dirLight = new BABYLON.DirectionalLight(
  'dir',
  new BABYLON.Vector3(...SCENE.directionalLight.position).negate().normalize(),
  scene
);
dirLight.diffuse   = BABYLON.Color3.FromHexString(SCENE.directionalLight.color);
dirLight.intensity = SCENE.directionalLight.intensity;
dirLight.specular  = BABYLON.Color3.Black();

// Shadow: 256 بدل 512 — نص الحجم = ربع الذاكرة
const shadowGen = new BABYLON.ShadowGenerator(256, dirLight);
shadowGen.usePoissonSampling          = false;
shadowGen.useBlurExponentialShadowMap = false;
shadowGen.bias                        = 0.001;
window.shadowGen = shadowGen;

// 2 point lights فقط في أهم المناطق
SCENE.pointLights.slice(0, 2).forEach((pl, i) => {
  const p = new BABYLON.PointLight(`pt_${i}`, new BABYLON.Vector3(...pl.position), scene);
  p.diffuse   = BABYLON.Color3.FromHexString(pl.color);
  p.intensity = pl.intensity;
  p.range     = 15;
  p.specular  = BABYLON.Color3.Black();
});

// ═══════════════════════════════════════════════
//  الأرضية والكاميرا
// ═══════════════════════════════════════════════
const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, scene);
ground.position.y     = 0;
ground.isVisible      = false;
ground.receiveShadows = false;
ground.isPickable     = false;

const [sx, sy, sz] = CAMERA.startPosition;
const camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(sx, sy, sz), scene);
camera.fov  = CAMERA.fov * (Math.PI / 180);
camera.minZ = CAMERA.near;
camera.maxZ = CAMERA.far;
scene.activeCamera = camera;

// ═══════════════════════════════════════════════
//  Global State
// ═══════════════════════════════════════════════
window.scene        = scene;
window.camera       = camera;
window.engine       = engine;
window.shadowGen    = shadowGen;
window.heldItem     = null;
window.attachedCart = null;
window.cartItems    = [];
window.allProducts  = [];    // بيانات المنتجات (مش meshes مباشرة)
window.allCarts     = [];
window.allWalkers   = [];
window.xrHelper     = null;
window.cashier      = null;
window._inVR        = false;
window._xrCamera    = null;
window._xrBaseExp   = null;
window._xrSession   = null;
window._playerHeight  = VR_FIXED_HEIGHT;
window._vrFixedHeight = VR_FIXED_HEIGHT;
window._rightGrip   = null;
window._leftGrip    = null;

// ═══════════════════════════════════════════════
//  تحميل نموذج GLB
// ═══════════════════════════════════════════════
function loadModel(path, position = [0,0,0], rotation = [0,0,0], scale = [1,1,1]) {
  return new Promise((resolve) => {
    if (!path) { resolve(null); return; }
    const folder   = path.substring(0, path.lastIndexOf('/') + 1);
    const filename = path.substring(path.lastIndexOf('/') + 1);

    BABYLON.SceneLoader.LoadAssetContainerAsync(folder, filename, scene)
      .then((container) => {
        container.addAllToScene();
        const root = new BABYLON.TransformNode(
          `root_${filename}_${Math.random().toString(36).slice(2)}`, scene
        );
        container.meshes.forEach((m) => {
          if (!m.parent) m.parent = root;
          m.receiveShadows = true;
          // shadow فقط للـ meshes الكبيرة (المول والشخصيات) مش المنتجات
          if (m.getTotalVertices() > 500) shadowGen.addShadowCaster(m, false);
        });
        root.position = new BABYLON.Vector3(...position);
        root.rotation = new BABYLON.Vector3(...rotation.map(v => typeof v === 'number' ? v : 0));
        root.scaling  = new BABYLON.Vector3(...scale);
        resolve(root);
      })
      .catch(() => resolve(null));
  });
}
window.loadModel = loadModel;

// ═══════════════════════════════════════════════
//  لوحة السعر
// ═══════════════════════════════════════════════
function createPriceBoard(name, price, position, rotation, size) {
  const plane = BABYLON.MeshBuilder.CreatePlane('board_' + name, { width: size[0], height: size[1] }, scene);
  plane.position   = new BABYLON.Vector3(...position);
  plane.rotation   = new BABYLON.Vector3(...rotation);
  plane.isPickable = false;

  const dynTex = new BABYLON.DynamicTexture('pt_' + name, { width: 256, height: 64 }, scene);
  const ctx    = dynTex.getContext();
  ctx.fillStyle    = '#B8860B';
  ctx.fillRect(0, 0, 256, 64);
  ctx.font         = 'bold 18px Arial';
  ctx.fillStyle    = '#FFFFFF';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 20);
  ctx.font      = 'bold 22px Arial';
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`${price} EGP`, 128, 46);
  dynTex.update();

  const mat = new BABYLON.StandardMaterial('bm_' + name, scene);
  mat.diffuseTexture  = dynTex;
  mat.emissiveColor   = BABYLON.Color3.White();
  mat.backFaceCulling = false;
  mat.freeze();      // تجميد المادة بعد الإعداد = أسرع في الـ render
  plane.material = mat;
  plane.metadata = { isPriceBoard: true };
  return plane;
}
window.createPriceBoard = createPriceBoard;

// ═══════════════════════════════════════════════
//  ملء الرف بـ ThinInstances
//
//  الفرق عن clone():
//  - clone: كل منتج = mesh منفصل = draw call منفصل
//  - thinInstance: 30 منتج = mesh واحد = draw call واحد
//  النتيجة: من 220 draw call → 6 draw calls للمنتجات كلها
// ═══════════════════════════════════════════════
function fillShelfThin(productConfig) {
  const { model, price, scale, shelves, name } = productConfig;

  loadModel(model, [0,-9999,0], [0,0,0], [1,1,1]).then((src) => {
    if (!src) return;

    let baseMesh = null;
    src.getChildMeshes().forEach(m => {
      if (!baseMesh && m.getTotalVertices() > 0) baseMesh = m;
    });
    if (!baseMesh) { src.dispose(); return; }

    baseMesh.setParent(null);
    baseMesh.position   = new BABYLON.Vector3(0, -9999, 0);
    baseMesh.isVisible  = true;
    baseMesh.isPickable = false;
    src.dispose();

    const sc       = new BABYLON.Vector3(...scale);
    const matrices  = [];
    const positions = [];

    shelves.forEach((shelf) => {
      const [bx, by, bz] = shelf.position;
      const rot  = shelf.rotation || [0,0,0];
      const rotQ = BABYLON.Quaternion.FromEulerAngles(
        rot[0] * Math.PI / 180,
        rot[1] * Math.PI / 180,
        rot[2] * Math.PI / 180
      );

      for (let j = 0; j < (shelf.countZ || 1); j++) {
        for (let i = 0; i < (shelf.countX || 1); i++) {
          const x   = bx + i * (shelf.spacingX || 1);
          const z   = bz + j * (shelf.spacingZ || 1);
          const pos = new BABYLON.Vector3(x, by, z);
          matrices.push(BABYLON.Matrix.Compose(sc, rotQ, pos));
          positions.push({ pos, rotQ: rotQ.clone() });
        }
      }
    });

    if (matrices.length === 0) return;

    const buf = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
    baseMesh.thinInstanceSetBuffer('matrix', buf, 16);
    baseMesh.thinInstanceCount = matrices.length;

    positions.forEach((p, idx) => {
      window.allProducts.push({
        _type:       'thin',
        _sourceMesh: baseMesh,
        _thinIndex:  idx,
        _scale:      sc.clone(),
        _rotQ:       p.rotQ,
        position:    p.pos.clone(),
        metadata: {
          isProduct:        true,
          price,
          productName:      name || model,
          productType:      model,
          originalPosition: p.pos.clone(),
          originalRotQ:     p.rotQ.clone(),
          originalScale:    sc.clone(),
          inCart:           false,
        }
      });
    });
  });
}

// ═══════════════════════════════════════════════
//  ملء الثلاجة بـ ThinInstances
// ═══════════════════════════════════════════════
function fillFridgeThin(fridgePos, fridgeRot, fridgeScale, drinkConfig) {
  loadModel(FRIDGES.model, fridgePos, fridgeRot, fridgeScale).then((f) => {
    if (f) {
      f.metadata = { isFridge: true };
      f.getChildMeshes().forEach(m => { m.isPickable = false; });
    }
  });

  loadModel(drinkConfig.model, [0,-9999,0], [0,0,0], [1,1,1]).then((src) => {
    if (!src) return;

    let baseMesh = null;
    src.getChildMeshes().forEach(m => {
      if (!baseMesh && m.getTotalVertices() > 0) baseMesh = m;
    });
    if (!baseMesh) { src.dispose(); return; }

    baseMesh.setParent(null);
    baseMesh.position   = new BABYLON.Vector3(0, -9999, 0);
    baseMesh.isVisible  = true;
    baseMesh.isPickable = false;
    src.dispose();

    const sc       = new BABYLON.Vector3(...drinkConfig.scale);
    const rotQ     = BABYLON.Quaternion.Identity();
    const matrices  = [];
    const positions = [];

    drinkConfig.inFridge.forEach((cfg) => {
      const { startX, startY, startZ, shelves: shCnt, bottlesPerShelf, spacingY, spacingZ } = cfg;
      for (let s = 0; s < shCnt; s++) {
        const y = startY - s * spacingY;
        for (let b = 0; b < bottlesPerShelf; b++) {
          const z   = startZ + b * spacingZ;
          const pos = new BABYLON.Vector3(startX, y, z);
          matrices.push(BABYLON.Matrix.Compose(sc, rotQ, pos));
          positions.push({ pos });
        }
      }
    });

    if (matrices.length === 0) return;

    const buf = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
    baseMesh.thinInstanceSetBuffer('matrix', buf, 16);
    baseMesh.thinInstanceCount = matrices.length;

    positions.forEach((p, idx) => {
      window.allProducts.push({
        _type:       'thin',
        _sourceMesh: baseMesh,
        _thinIndex:  idx,
        _scale:      sc.clone(),
        _rotQ:       rotQ.clone(),
        position:    p.pos.clone(),
        metadata: {
          isProduct:        true,
          price:            drinkConfig.price,
          productName:      drinkConfig.name || drinkConfig.model,
          productType:      drinkConfig.model,
          originalPosition: p.pos.clone(),
          originalRotQ:     rotQ.clone(),
          originalScale:    sc.clone(),
          inCart:           false,
        }
      });
    });
  });
}

// ═══════════════════════════════════════════════
//  الخضروات بـ ThinInstances
// ═══════════════════════════════════════════════
async function loadVegetablesThin(vegConfig) {
  for (const item of vegConfig.items) {
    const count     = item.count || 20;
    const [cx, cy, cz] = item.position;

    const src = await loadModel(item.model, [0,-9999,0], [0,0,0], [1,1,1]);
    if (!src) continue;

    let baseMesh = null;
    src.getChildMeshes().forEach(m => {
      if (!baseMesh && m.getTotalVertices() > 0) baseMesh = m;
    });
    if (!baseMesh) { src.dispose(); continue; }

    baseMesh.setParent(null);
    baseMesh.position   = new BABYLON.Vector3(0, -9999, 0);
    baseMesh.isVisible  = true;
    baseMesh.isPickable = false;
    src.dispose();

    const sc       = new BABYLON.Vector3(...item.scale);
    const matrices  = [];
    const positions = [];

    for (let i = 0; i < count; i++) {
      const x    = cx + (Math.random() - 0.5) * item.boxSize[0] * 0.8;
      const z    = cz + (Math.random() - 0.5) * item.boxSize[1] * 0.8;
      const y    = cy + Math.random() * 0.3;
      const ry   = Math.random() * Math.PI * 2;
      const pos  = new BABYLON.Vector3(x, y, z);
      const rotQ = BABYLON.Quaternion.FromEulerAngles(0, ry, 0);
      matrices.push(BABYLON.Matrix.Compose(sc, rotQ, pos));
      positions.push({ pos, rotQ });
    }

    if (matrices.length === 0) continue;

    const buf = new Float32Array(matrices.length * 16);
    matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
    baseMesh.thinInstanceSetBuffer('matrix', buf, 16);
    baseMesh.thinInstanceCount = matrices.length;

    positions.forEach((p, idx) => {
      window.allProducts.push({
        _type:       'thin',
        _sourceMesh: baseMesh,
        _thinIndex:  idx,
        _scale:      sc.clone(),
        _rotQ:       p.rotQ.clone(),
        position:    p.pos.clone(),
        metadata: {
          isProduct:        true,
          price:            item.price || 10,
          productName:      item.model,
          productType:      item.model,
          originalPosition: p.pos.clone(),
          originalRotQ:     p.rotQ.clone(),
          originalScale:    sc.clone(),
          inCart:           false,
        }
      });
    });
  }
}

// ═══════════════════════════════════════════════
//  تحميل الأصول — بترتيب أولوية صح للـ Quest
// ═══════════════════════════════════════════════
async function loadAssets() {
  // ١- المول أولاً
  await loadModel(MALL.model, MALL.position, [0,0,0], MALL.scale);

  // ٢- لوحات الأسعار
  PRICE_BOARDS.forEach((b) => createPriceBoard(b.name, b.price, b.position, b.rotation, b.size));

  // ٣- المنتجات بـ thinInstances (مش clones)
  fillShelfThin(PRODUCTS.chips2);
  fillShelfThin(PRODUCTS.chips3);

  if (FRIDGES?.positions?.length) {
    fillFridgeThin(FRIDGES.positions[0].position, FRIDGES.positions[0].rotation, FRIDGES.scale, JUICES);
    if (FRIDGES.positions.length > 1)
      fillFridgeThin(FRIDGES.positions[1].position, FRIDGES.positions[1].rotation, FRIDGES.scale, WATER);
  }

  await loadVegetablesThin(VEGETABLES);

  // ٤- العربيات
  for (const pos of CARTS.positions) {
    const cart = await loadModel(CARTS.model, pos, [0,0,0], CARTS.scale);
    if (cart) {
      cart.metadata = { isCart: true };
      cart.getChildMeshes().forEach(m => { m.isPickable = false; });
      window.allCarts.push(cart);
    }
  }

  // ٥- الكاشير
  const cas = await loadModel(STAFF.cashier.model, STAFF.cashier.position, [0,0,0], STAFF.cashier.scale);
  if (cas) {
    cas.metadata = { isCashier: true };
    cas.getChildMeshes().forEach(m => { m.isPickable = false; });
    window.cashier = cas;
  }

  // ٦- الحراس
  for (let idx = 0; idx < STAFF.guards.length; idx++) {
    const g = STAFF.guards[idx];
    const m = await loadModel(g.model, g.position, [0,0,0], g.scale);
    if (m) {
      m.metadata = { isGuard: true, guardIndex: idx };
      m.getChildMeshes().forEach(ch => { ch.isPickable = false; });
      if (idx === STAFF.noPassZone?.guardIndex) window.noPassGuard = m;
    }
  }

  // ٧- إخفاء شاشة التحميل بعد المحتوى الأساسي
  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.opacity = '0'; setTimeout(() => ls.remove(), 600); }

  // ٨- الموسيقى
  const bgMusic = document.getElementById('bg-music');
  if (bgMusic) {
    bgMusic.volume = 0.3;
    bgMusic.play().catch(() => {
      document.addEventListener('click', () => bgMusic.play().catch(() => {}), { once: true });
    });
  }

  // ٩- المشاة في الخلفية بعد ما المشهد يظهر
  setTimeout(() => _loadWalkersBackground(), 1000);
}

// ═══════════════════════════════════════════════
//  المشاة — في الخلفية بعد التحميل
// ═══════════════════════════════════════════════
async function _loadWalkersBackground() {
  const wz        = [WALKERS.zone1, WALKERS.zone2];
  const modelDefs = WALKERS.models;

  for (let i = 0; i < WALKERS.count; i++) {
    const zone      = wz[i % 2];
    const def       = modelDefs[i % modelDefs.length];
    const modelPath = def.path;
    const s         = def.scaleMin + Math.random() * (def.scaleMax - def.scaleMin);
    const startX    = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
    const startZ    = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
    const folder    = modelPath.substring(0, modelPath.lastIndexOf('/') + 1);
    const filename  = modelPath.substring(modelPath.lastIndexOf('/') + 1);

    try {
      const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(folder, filename, scene);
      container.addAllToScene();
      const root = new BABYLON.TransformNode(`walker_${i}`, scene);
      container.meshes.forEach((m) => {
        if (!m.parent) m.parent = root;
        m.receiveShadows = false;
        m.isPickable     = false;
      });
      root.position = new BABYLON.Vector3(startX, 0, startZ);
      root.scaling  = new BABYLON.Vector3(s, s, s);
      root.metadata = {
        isRandomWalker: true,
        zone,
        speed:      WALKERS.speed * (0.8 + Math.random() * 0.4),
        target:     _rndPt(zone),
        animGroups: container.animationGroups || [],
      };
      root.metadata.animGroups.forEach(ag => ag.play(true));
      window.allWalkers.push(root);
    } catch (e) {}

    // استنى بين كل walker وتاني عشان مانضغطش على الـ GPU مرة واحدة
    await new Promise(r => setTimeout(r, 200));
  }

  await _loadFrozenQueuePeople();
}

// ═══════════════════════════════════════════════
//  طابور الكاشير
// ═══════════════════════════════════════════════
async function _loadFrozenQueuePeople() {
  const frozenModelPath = WALKERS.models?.[0]?.path || 'assets/models/walker1.glb';

  const FQ = window.FROZEN_QUEUE || {
    positions:  [{ x: -3.8, z: 13.2 }, { x: -3.8, z: 14.5 }, { x: -3.8, z: 16.0 }],
    serviceX:   -4.55,
    exitZ:      -2.7,
    vanishX:    -6.02,
    interval:   60000,
    walkSpeed:  1.5,
  };
  FQ.modelPath        = frozenModelPath;
  window.FROZEN_QUEUE = FQ;

  const folder   = frozenModelPath.substring(0, frozenModelPath.lastIndexOf('/') + 1);
  const filename = frozenModelPath.substring(frozenModelPath.lastIndexOf('/') + 1);
  if (!window.allStaticWalkers) window.allStaticWalkers = [];

  for (let i = 0; i < 3; i++) {
    const pos = FQ.positions[i];
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', folder, filename, scene);
      const mesh   = result.meshes[0];
      if (!mesh) continue;

      result.animationGroups?.forEach(ag => { ag.stop(); ag.reset(); ag.goToFrame(0); ag.pause(); });

      mesh.position.set(pos.x, 0, pos.z);
      mesh.scaling.setAll(0.6);
      mesh.rotation.y     = Math.PI;
      mesh.receiveShadows = false;
      mesh.isPickable     = false;
      mesh.metadata       = { isStaticWalker: true, isFrozenQueue: true };
      window.allStaticWalkers.push(mesh);
    } catch (e) {}
  }

  setTimeout(() => { if (typeof initFrozenQueue === 'function') initFrozenQueue(); }, 500);
}

function _rndPt(zone) {
  return {
    x: zone.xMin + Math.random() * (zone.xMax - zone.xMin),
    z: zone.zMin + Math.random() * (zone.zMax - zone.zMin),
  };
}
window._rndPt = _rndPt;

// ═══════════════════════════════════════════════
//  XR Setup
// ═══════════════════════════════════════════════
async function setupXR() {
  try {
    if (!navigator.xr) return;
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) return;

    const xr = await scene.createDefaultXRExperienceAsync({
      floorMeshes:          [ground],
      disableTeleportation: true,
      optionalFeatures:     true,
      pointerSelectionOptions: { disablePointerSelection: true },
    });

    window.xrHelper   = xr;
    window._xrBaseExp = xr.baseExperience;

    xr.baseExperience.onStateChangedObservable.add(async (state) => {
      if (state === BABYLON.WebXRState.IN_XR) {
        window._inVR      = true;
        window._xrCamera  = xr.baseExperience.camera;
        window._xrSession = xr.baseExperience.sessionManager?.session;
        await _setXRStartPosition(xr);
        _installHeightLock(xr);
      } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
        window._inVR      = false;
        window._xrCamera  = null;
        window._xrSession = null;
        _uninstallHeightLock();
        const pp = window.playerPos;
        if (pp) camera.position.copyFrom(pp);
      }
    });

    _setupControllers(xr);
  } catch (e) {}
}

async function _setXRStartPosition(xr) {
  const sm = xr.baseExperience.sessionManager;
  if (!sm) { _forceCamPos(xr); return; }

  let wait = 50;
  while (!sm.referenceSpace && wait-- > 0) await new Promise(r => setTimeout(r, 100));
  if (!sm.referenceSpace) { _forceCamPos(xr); return; }

  try {
    const [tx, ty, tz] = CAMERA.startPosition;
    const pitchQ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, VR_PITCH_CORRECTION);
    const rollQ  = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, VR_ROLL_CORRECTION);
    const corrQ  = pitchQ.multiply(rollQ);

    const offsetSpace = sm.referenceSpace.getOffsetReferenceSpace(
      new XRRigidTransform(
        { x: tx, y: ty, z: tz, w: 1 },
        { x: corrQ.x, y: corrQ.y, z: corrQ.z, w: corrQ.w }
      )
    );

    if (typeof sm.setReferenceSpace === 'function') sm.setReferenceSpace(offsetSpace);
    else sm.referenceSpace = offsetSpace;

    setTimeout(() => {
      const cam = xr.baseExperience.camera;
      if (!cam) return;
      if (Math.abs(cam.position.x - tx) > 1 || Math.abs(cam.position.z - tz) > 1)
        cam.position.set(tx, VR_FIXED_HEIGHT, tz);
      else
        cam.position.y = VR_FIXED_HEIGHT;
    }, 600);
  } catch (e) { _forceCamPos(xr); }
}

function _forceCamPos(xr) {
  const cam = xr.baseExperience.camera;
  if (!cam) return;
  const [tx, , tz] = CAMERA.startPosition;
  cam.position.set(tx, VR_FIXED_HEIGHT, tz);
  cam.rotationQuaternion = BABYLON.Quaternion.Identity();
}

// ═══════════════════════════════════════════════
//  Height Lock
// ═══════════════════════════════════════════════
let _heightObs = null;

function _installHeightLock(xr) {
  _uninstallHeightLock();
  const xrCam = xr.baseExperience.camera;
  if (!xrCam) return;

  if (xrCam.onAfterCameraUpdateObservable) {
    _heightObs = xrCam.onAfterCameraUpdateObservable.add(() => {
      if (window._inVR) xrCam.position.y = VR_FIXED_HEIGHT;
    });
  } else {
    _heightObs = scene.onBeforeRenderObservable.add(() => {
      if (window._inVR && window._xrCamera) window._xrCamera.position.y = VR_FIXED_HEIGHT;
    });
  }
}

function _uninstallHeightLock() {
  if (!_heightObs) return;
  try {
    window._xrCamera?.onAfterCameraUpdateObservable?.remove(_heightObs);
    scene.onBeforeRenderObservable?.remove(_heightObs);
  } catch (e) {}
  _heightObs = null;
}

// ═══════════════════════════════════════════════
//  Controllers
//  القاعدة: مصدر واحد فقط لكل أمر
//  - setupRightMC / setupLeftMC = grab + cart + pay
//  - _pollMovementOnly = حركة + snap turn فقط
// ═══════════════════════════════════════════════
function _setupControllers(xr) {
  xr.input.onControllerAddedObservable.add((controller) => {
    controller.onMotionControllerInitObservable.add((mc) => {
      const ray = controller.pointer;
      if (ray) ray.isVisible = false;
      if (mc.handedness === 'right') _setupRightMC(mc, controller);
      if (mc.handedness === 'left')  _setupLeftMC(mc, controller);
    });

    if (controller.motionController) {
      const mc = controller.motionController;
      if (mc.handedness === 'right') _setupRightMC(mc, controller);
      if (mc.handedness === 'left')  _setupLeftMC(mc, controller);
    }
  });

  scene.registerBeforeRender(() => {
    if (!window._inVR) return;
    _pollMovementOnly(xr);
  });
}

function _setupRightMC(mc, controller) {
  window._rightMC         = mc;
  window._rightController = controller;
  window._rightGrip       = controller.grip;

  const trigger = mc.getComponent('xr-standard-trigger');
  if (trigger) {
    trigger.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes.pressed) return;
      if (comp.pressed) window.grabNearestProduct?.();
      else if (window.heldItem) window.addToCart?.();
    });
  }

  const squeeze = mc.getComponent('xr-standard-squeeze');
  if (squeeze) {
    squeeze.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes.pressed) return;
      if (comp.pressed) window.grabNearestProduct?.();
      else if (window.heldItem) window.throwItem?.();
    });
  }

  const bBtn = mc.getComponent('b-button');
  if (bBtn) {
    bBtn.onButtonStateChangedObservable.add((comp) => {
      if (comp.pressed && comp.changes?.pressed) window.spawnBanknote?.(5);
    });
  }

  const aBtn = mc.getComponent('a-button') || mc.getComponent('xr-standard-button');
  if (aBtn) {
    aBtn.onButtonStateChangedObservable.add((comp) => {
      if (comp.pressed && comp.changes?.pressed) window.payAtCashier?.();
    });
  }
}

function _setupLeftMC(mc, controller) {
  window._leftMC         = mc;
  window._leftController = controller;
  window._leftGrip       = controller.grip;

  const trigger = mc.getComponent('xr-standard-trigger');
  if (trigger) {
    trigger.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes.pressed || !comp.pressed) return;
      if (!window.attachedCart) window.grabCart?.();
      else window.dropCart?.();
    });
  }

  const xBtn = mc.getComponent('x-button');
  if (xBtn) {
    xBtn.onButtonStateChangedObservable.add((comp) => {
      if (comp.pressed && comp.changes?.pressed) window.spawnBanknote?.(10);
    });
  }

  const yBtn = mc.getComponent('y-button');
  if (yBtn) {
    yBtn.onButtonStateChangedObservable.add((comp) => {
      if (comp.pressed && comp.changes?.pressed) window.spawnBanknote?.(20);
    });
  }

  const squeeze = mc.getComponent('xr-standard-squeeze');
  if (squeeze) {
    squeeze.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes.pressed || !comp.pressed) return;
      window.payAtCashier?.();
    });
  }
}

// حركة وsnapTurn فقط — بدون أي grab أو cart
let _snapCd = false;

function _pollMovementOnly(xr) {
  const controllers = xr.input.controllers;
  if (!controllers?.length) return;

  for (const ctrl of controllers) {
    const gp   = ctrl.inputSource?.gamepad;
    if (!gp) continue;
    const axes = gp.axes;
    const hand = ctrl.inputSource?.handedness;
    if (!axes || axes.length < 4) continue;

    const stickX = axes[2] ?? axes[0] ?? 0;
    const stickY = axes[3] ?? axes[1] ?? 0;
    const DEAD   = 0.18;

    if (hand === 'right' && window.playerInput) {
      const fwd = -stickY;
      window.playerInput.moveForward  = fwd    < -DEAD;
      window.playerInput.moveBackward = fwd    >  DEAD;
      window.playerInput.moveRight    = stickX >  DEAD;
      window.playerInput.moveLeft     = stickX < -DEAD;
    }

    if (hand === 'left' && !_snapCd && Math.abs(stickX) > 0.6) {
      _applySnapTurn(stickX > 0 ? -Math.PI / 4 : Math.PI / 4);
      _snapCd = true;
      setTimeout(() => { _snapCd = false; }, PLAYER.snapCooldown ?? 300);
    }
  }
}

function _applySnapTurn(angle) {
  if (window._inVR && window._xrCamera) {
    if (window._xrCamera.rotationQuaternion) {
      window._xrCamera.rotationQuaternion.multiplyInPlace(
        BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), angle)
      );
    } else {
      window._xrCamera.rotation.y += angle;
    }
  } else {
    camera.rotation.y += angle;
  }
}
window._applySnapTurn = _applySnapTurn;

// ═══════════════════════════════════════════════
//  GUI
// ═══════════════════════════════════════════════
let _gui = null;
function _initGUI() {
  if (_gui) return;
  _gui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene);
  window._vrGUI = _gui;
}
_initGUI();

// ═══════════════════════════════════════════════
//  Render Loop
// ═══════════════════════════════════════════════
engine.runRenderLoop(() => {
  window.updateLoop?.();
  scene.render();
});
window.addEventListener('resize', () => engine.resize());

// ═══════════════════════════════════════════════
//  Start
// ═══════════════════════════════════════════════
setupXR();
loadAssets();
