// ========== main.js — Supermarket VR (Professional Rebuild v5) ==========
// ✅ كاميرا VR تبدأ من نفس إحداثيات الديسكتوب تمامًا + بدون ميلان
// ✅ كاميرا VR بطول ثابت 2.5 — تتجاهل الطول الحقيقي للاعب (Meta Quest 2)
// ✅ جويستيك Meta Quest 2/3: دفع للأعلى = مشي للأمام
// ✅ انتظار تحميل المشاة قبل إخفاء شاشة التحميل (لا ظهور متأخر)
// ✅ لا Laser Beam إطلاقًا
// ✅ لا UI / إشعارات / مربعات نصية

'use strict';
// ── تصحيح ميلان الكاميرا في VR ─────────────────────────────────────────
const VR_PITCH_CORRECTION = 0.06;
const VR_ROLL_CORRECTION  = -0.03;

// ── إعدادات الطول الثابت في VR ─────────────────────────────────────────
const VR_FIXED_HEIGHT = (typeof CAMERA !== 'undefined' && CAMERA.vrFixedHeight) || 2.5;

// ── Engine ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game-canvas');
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer:   false,
  stencil:                 true,
  doNotHandleContextLost:  false,
  adaptToDeviceRatio:      true,
  antialias:               true,
  xrCompatible:            true,
});
engine.enableOfflineSupport = false;
engine.setHardwareScalingLevel(1.0);

// ── Scene ────────────────────────────────────────────────────────────────────
const scene = new BABYLON.Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = BABYLON.Color4.FromHexString(SCENE.background + "FF");
scene.autoClear = true;
scene.autoClearDepthAndStencil = true;
scene.skipPointerMovePicking = true;

// ── Lights ───────────────────────────────────────────────────────────────────
const hemiLight = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
hemiLight.diffuse = BABYLON.Color3.FromHexString(SCENE.ambientLight.color);
hemiLight.groundColor = BABYLON.Color3.FromHexString("#5D4037");
hemiLight.intensity = SCENE.ambientLight.intensity;

const dirLight = new BABYLON.DirectionalLight(
  "dir",
  new BABYLON.Vector3(...SCENE.directionalLight.position).negate().normalize(),
  scene
);
dirLight.diffuse = BABYLON.Color3.FromHexString(SCENE.directionalLight.color);
dirLight.intensity = SCENE.directionalLight.intensity;

const shadowGen = new BABYLON.ShadowGenerator(512, dirLight);
shadowGen.usePoissonSampling = true;
shadowGen.useBlurExponentialShadowMap = false;
window.shadowGen = shadowGen;

SCENE.pointLights.forEach((pl, i) => {
  const p = new BABYLON.PointLight(`pt_${i}`, new BABYLON.Vector3(...pl.position), scene);
  p.diffuse = BABYLON.Color3.FromHexString(pl.color);
  p.intensity = pl.intensity;
  p.range = 25;
});

// ── Ground (Invisible) ─────────────────────────────────────────────────────
const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
ground.position.y = 0;
ground.isVisible = false;
ground.receiveShadows = true;

// ── Camera (Desktop) ───────────────────────────────────────────────────────
const [sx, sy, sz] = CAMERA.startPosition;
const camera = new BABYLON.UniversalCamera("cam", new BABYLON.Vector3(sx, sy, sz), scene);
camera.fov = CAMERA.fov * (Math.PI / 180);
camera.minZ = CAMERA.near;
camera.maxZ = CAMERA.far;
scene.activeCamera = camera;

// ── Global State ───────────────────────────────────────────────────────────
window.scene = scene;
window.camera = camera;
window.engine = engine;
window.shadowGen = shadowGen;
window.heldItem = null;
window.attachedCart = null;
window.cartItems = [];
window.allProducts = [];
window.allCarts = [];
window.allWalkers = [];
window.xrHelper = null;
window.cashier = null;
window._inVR = false;
window._xrCamera = null;
window._xrBaseExp = null;
window._xrSession = null;
window._playerHeight = VR_FIXED_HEIGHT;
window._vrFixedHeight = VR_FIXED_HEIGHT;
window._rightGrip = null;
window._leftGrip = null;

// ── loadModel ─────────────────────────────────────────────────────────────
function loadModel(path, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return new Promise((resolve) => {
    if (!path) { resolve(null); return; }
    const folder = path.substring(0, path.lastIndexOf('/') + 1);
    const filename = path.substring(path.lastIndexOf('/') + 1);
    BABYLON.SceneLoader.LoadAssetContainerAsync(folder, filename, scene)
      .then((container) => {
        container.addAllToScene();
        const root = new BABYLON.TransformNode(`root_${filename}_${Math.random().toString(36).slice(2)}`, scene);
        container.meshes.forEach((m) => {
          if (!m.parent) m.parent = root;
          m.receiveShadows = true;
          if (m.getTotalVertices() > 200) shadowGen.addShadowCaster(m, false);
        });
        root.position = new BABYLON.Vector3(...position);
        root.rotation = new BABYLON.Vector3(...(rotation.map(v => typeof v === 'number' ? v : 0)));
        root.scaling = new BABYLON.Vector3(...scale);
        resolve(root);
      })
      .catch(() => { console.warn(`⚠️ مش موجود: ${path}`); resolve(null); });
  });
}
window.loadModel = loadModel;

// ── Price Board ───────────────────────────────────────────────────────────
function createPriceBoard(name, price, position, rotation, size) {
  const plane = BABYLON.MeshBuilder.CreatePlane("board", { width: size[0], height: size[1] }, scene);
  plane.position = new BABYLON.Vector3(...position);
  plane.rotation = new BABYLON.Vector3(...rotation);

  const dynTex = new BABYLON.DynamicTexture("pt", { width: 512, height: 128 }, scene);
  const ctx = dynTex.getContext();

  ctx.fillStyle = '#B8860B';
  ctx.fillRect(0, 0, 512, 128);

  ctx.font = 'bold 42px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 256, 40);

  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#FFD700';
  ctx.fillText(`${price} EGP`, 256, 90);

  dynTex.update();

  const mat = new BABYLON.StandardMaterial("bm", scene);
  mat.diffuseTexture = dynTex;
  mat.emissiveColor = BABYLON.Color3.White();
  mat.backFaceCulling = false;
  plane.material = mat;
  plane.metadata = { isPriceBoard: true };
  return plane;
}
window.createPriceBoard = createPriceBoard;

// ── fillShelf ─────────────────────────────────────────────────────────────
function fillShelf(productConfig) {
  const { model, price, scale, shelves } = productConfig;
  loadModel(model, [0, -9999, 0], [0, 0, 0], scale).then((src) => {
    if (!src) return;
    src.setEnabled(false);
    shelves.forEach((shelf) => {
      const [sx2, sy2, sz2] = shelf.position;
      for (let j = 0; j < (shelf.countZ || 1); j++) {
        for (let i = 0; i < (shelf.countX || 1); i++) {
          const x = sx2 + i * (shelf.spacingX || 1);
          const z = sz2 + j * (shelf.spacingZ || 1);
          const clone = src.clone(`item_${i}_${j}_${Math.random()}`);
          clone.setEnabled(true);
          clone.position = new BABYLON.Vector3(x, sy2, z);
          clone.rotation = new BABYLON.Vector3(...(shelf.rotation || [0, 0, 0]));
          clone.scaling = new BABYLON.Vector3(...scale);
          clone.metadata = {
            isProduct: true,
            price,
            productType: model,
            originalPosition: new BABYLON.Vector3(x, sy2, z),
            originalRotation: clone.rotation.clone(),
            inCart: false,
          };
          window.allProducts.push(clone);
        }
      }
    });
  });
}

// ── fillFridge ────────────────────────────────────────────────────────────
function fillFridge(fridgePos, fridgeRot, fridgeScale, drinkConfig) {
  loadModel(FRIDGES.model, fridgePos, fridgeRot, fridgeScale).then((f) => {
    if (f) f.metadata = { isFridge: true };
  });
  drinkConfig.inFridge.forEach((cfg) => {
    const { startX, startY, startZ, shelves: shCnt, bottlesPerShelf, spacingY, spacingZ } = cfg;
    loadModel(drinkConfig.model, [0, -9999, 0], [0, 0, 0], drinkConfig.scale).then((src) => {
      if (!src) return;
      src.setEnabled(false);
      for (let s = 0; s < shCnt; s++) {
        const y = startY - s * spacingY;
        for (let b = 0; b < bottlesPerShelf; b++) {
          const z = startZ + b * spacingZ;
          const clone = src.clone(`bottle_${s}_${b}`);
          clone.setEnabled(true);
          clone.position = new BABYLON.Vector3(startX, y, z);
          clone.scaling = new BABYLON.Vector3(...drinkConfig.scale);
          clone.metadata = {
            isProduct: true,
            price: drinkConfig.price,
            productType: drinkConfig.model,
            originalPosition: new BABYLON.Vector3(startX, y, z),
            originalRotation: BABYLON.Vector3.Zero(),
            inCart: false,
          };
          window.allProducts.push(clone);
        }
      }
    });
  });
}

// ── loadVegetables ────────────────────────────────────────────────────────
async function loadVegetables(vegConfig) {
  for (const item of vegConfig.items) {
    const count = item.count || 20;
    const [cx, cy, cz] = item.position;

    const src = await loadModel(item.model, [0, -9999, 0], [0, 0, 0], item.scale);
    if (!src) continue;
    src.setEnabled(false);

    for (let i = 0; i < count; i++) {
      const x  = cx + (Math.random() - 0.5) * item.boxSize[0] * 0.8;
      const z  = cz + (Math.random() - 0.5) * item.boxSize[1] * 0.8;
      const y  = cy + Math.random() * 0.3;
      const ry = Math.random() * Math.PI * 2;

      const clone = src.clone(`veg_${i}_${Math.random().toString(36).slice(2)}`);
      clone.setEnabled(true);
      clone.position = new BABYLON.Vector3(x, y, z);
      clone.rotation = new BABYLON.Vector3(0, ry, 0);
      clone.scaling  = new BABYLON.Vector3(...item.scale);

      clone.metadata = {
        isProduct:        true,
        price:            item.price || 10,
        productType:      item.model,
        originalPosition: new BABYLON.Vector3(x, y, z),
        originalRotation: new BABYLON.Vector3(0, ry, 0),
        inCart:           false,
      };

      window.allProducts.push(clone);
    }
  }
}

// ── loadAssets ───────────────────────────────────────────────────────────
async function loadAssets() {
  console.log('⏳ بدء تحميل...');
  await loadModel(MALL.model, MALL.position, [0, 0, 0], MALL.scale);
  PRICE_BOARDS.forEach((b) => createPriceBoard(b.name, b.price, b.position, b.rotation, b.size));
  fillShelf(PRODUCTS.chips2);
  fillShelf(PRODUCTS.chips3);
  if (FRIDGES?.positions?.length) {
    fillFridge(FRIDGES.positions[0].position, FRIDGES.positions[0].rotation, FRIDGES.scale, JUICES);
    if (FRIDGES.positions.length > 1)
      fillFridge(FRIDGES.positions[1].position, FRIDGES.positions[1].rotation, FRIDGES.scale, WATER);
  }
  await loadVegetables(VEGETABLES);
  for (const pos of CARTS.positions) {
    const cart = await loadModel(CARTS.model, pos, [0, 0, 0], CARTS.scale);
    if (cart) {
      cart.metadata = { isCart: true };
      window.allCarts.push(cart);
    }
  }
  const cas = await loadModel(STAFF.cashier.model, STAFF.cashier.position, [0, 0, 0], STAFF.cashier.scale);
  if (cas) {
    cas.metadata = { isCashier: true };
    window.cashier = cas;
  }
  for (let idx = 0; idx < STAFF.guards.length; idx++) {
    const g = STAFF.guards[idx];
    const m = await loadModel(g.model, g.position, [0, 0, 0], g.scale);
    if (m) {
      m.metadata = { isGuard: true, guardIndex: idx };
      if (idx === STAFF.noPassZone?.guardIndex) window.noPassGuard = m;
    }
  }

  const walkerPromises = [];
  const wz = [WALKERS.zone1, WALKERS.zone2];
  const modelDefs = WALKERS.models;
  for (let i = 0; i < WALKERS.count; i++) {
    const zone = wz[i % 2];
    const def = modelDefs[i % modelDefs.length];
    const modelPath = def.path;
    const s = def.scaleMin + Math.random() * (def.scaleMax - def.scaleMin);
    const startX = zone.xMin + Math.random() * (zone.xMax - zone.xMin);
    const startZ = zone.zMin + Math.random() * (zone.zMax - zone.zMin);
    const folder = modelPath.substring(0, modelPath.lastIndexOf('/') + 1);
    const filename = modelPath.substring(modelPath.lastIndexOf('/') + 1);

    const promise = BABYLON.SceneLoader.LoadAssetContainerAsync(folder, filename, scene)
      .then((container) => {
        container.addAllToScene();
        const root = new BABYLON.TransformNode(`walker_${i}`, scene);
        container.meshes.forEach((m) => {
          if (!m.parent) m.parent = root;
          m.receiveShadows = true;
          if (m.getTotalVertices() > 200 && window.shadowGen) {
            window.shadowGen.addShadowCaster(m, false);
          }
        });
        root.position = new BABYLON.Vector3(startX, 0, startZ);
        root.scaling = new BABYLON.Vector3(s, s, s);
        root.metadata = {
          isRandomWalker: true,
          zone,
          speed: WALKERS.speed * (0.8 + Math.random() * 0.4),
          target: _rndPt(zone),
          animGroups: container.animationGroups || []
        };
        root.metadata.animGroups.forEach(ag => ag.play(true));
        window.allWalkers.push(root);
      })
      .catch(() => { console.warn(`⚠️ مش موجود: ${modelPath}`); });
    walkerPromises.push(promise);
  }
  await Promise.all(walkerPromises);

  const frozenModelPath = WALKERS.models[0].path;
  const frozenScale = 0.6;
  const frozenX = -3.8;
  const frozenZPositions = [16, 14.5, 13.2];

  const frozenRotations = [
    { y: Math.PI },
    { y: Math.PI },
    { y: -Math.PI }
  ];

  const frozenPromises = frozenZPositions.map(async (zPos, index) => {
    const folder = frozenModelPath.substring(0, frozenModelPath.lastIndexOf('/') + 1);
    const filename = frozenModelPath.substring(frozenModelPath.lastIndexOf('/') + 1);
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', folder, filename, scene);
      const mesh = result.meshes[0];
      if (!mesh) return null;

      if (result.animationGroups?.length) {
        result.animationGroups.forEach(ag => {
          ag.stop();
          ag.reset();
          ag.goToFrame(0);
          ag.pause();
        });
      }

      mesh.position.set(frozenX, 0, zPos);
      mesh.scaling.setAll(frozenScale);
      mesh.rotation = new BABYLON.Vector3(
        frozenRotations[index].x || 0,
        frozenRotations[index].y || 0,
        frozenRotations[index].z || 0
      );
      mesh.receiveShadows = true;
      if (mesh.getTotalVertices() > 200 && window.shadowGen) {
        window.shadowGen.addShadowCaster(mesh, false);
      }
      mesh.metadata = { isStaticWalker: true };
      if (!window.allStaticWalkers) window.allStaticWalkers = [];
      window.allStaticWalkers.push(mesh);
      return mesh;
    } catch (err) {
      console.warn(`⚠️ فشل تحميل شخصية متجمدة ${index}:`, err);
      return null;
    }
  });
  await Promise.all(frozenPromises);
  setTimeout(() => { if (typeof initFrozenQueue === 'function') initFrozenQueue(); }, 500);
  SIGNS.forEach((s) => loadModel(s.model, s.position, s.rotation || [0, 0, 0], s.scale));

  const ls = document.getElementById('loading-screen');
  if (ls) { ls.style.opacity = '0'; setTimeout(() => ls.remove(), 600); }
  console.log('✅ تحميل اكتمل');
  console.log(`📦 منتجات: ${window.allProducts.length} | 🛒 عربات: ${window.allCarts.length} | 🚶 مشاة: ${window.allWalkers.length}`);
}

function _rndPt(zone) {
  return {
    x: zone.xMin + Math.random() * (zone.xMax - zone.xMin),
    z: zone.zMin + Math.random() * (zone.zMax - zone.zMin)
  };
}
window._rndPt = _rndPt;

// ════════════════════════════════════════════════════════════════════════════
// ── XR Setup ────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

async function setupXR() {
  try {
    if (!navigator.xr) {
      console.warn('⚠️ WebXR غير مدعوم في هذا المتصفح');
      return;
    }
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) {
      console.warn('⚠️ immersive-vr غير مدعوم');
      return;
    }

    const xr = await scene.createDefaultXRExperienceAsync({
      floorMeshes: [ground],
      disableTeleportation: true,
      optionalFeatures: true,
      pointerSelectionOptions: {
        disablePointerSelection: true,
      },
    });

    window.xrHelper = xr;
    window._xrBaseExp = xr.baseExperience;

    xr.baseExperience.onStateChangedObservable.add(async (state) => {
      if (state === BABYLON.WebXRState.IN_XR) {
        console.log('🥽 دخلنا VR');
        window._inVR = true;
        window._xrCamera = xr.baseExperience.camera;
        window._xrSession = xr.baseExperience.sessionManager?.session;

        await _setXRStartPositionCorrectly(xr);
        _installFixedHeightLock(xr);

      } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
        console.log('👤 خرجنا من VR');
        window._inVR = false;
        _uninstallFixedHeightLock();
        window._xrCamera = null;
        window._xrSession = null;
        const pp = window.playerPos;
        if (pp) camera.position.copyFrom(pp);
      }
    });

    setupControllers(xr);
    console.log('✅ XR جاهز');

  } catch (err) {
    console.warn('⚠️ WebXR مش متاح:', err.message);
  }
}

async function _setXRStartPositionCorrectly(xr) {
  const sm = xr.baseExperience.sessionManager;
  if (!sm) {
    _forceCameraPosition(xr);
    return;
  }

  let maxWait = 50;
  while (!sm.referenceSpace && maxWait > 0) {
    await new Promise(r => setTimeout(r, 100));
    maxWait--;
  }

  const [tx, ty, tz] = CAMERA.startPosition;

  if (!sm.referenceSpace) {
    _forceCameraPosition(xr);
    return;
  }

  try {
    const pitchQ = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.X, VR_PITCH_CORRECTION);
    const rollQ  = BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Z, VR_ROLL_CORRECTION);
    const correctionQ = pitchQ.multiply(rollQ);

    const offsetTransform = new XRRigidTransform(
      { x: tx, y: ty, z: tz, w: 1 },
      { x: correctionQ.x, y: correctionQ.y, z: correctionQ.z, w: correctionQ.w }
    );
    const offsetSpace = sm.referenceSpace.getOffsetReferenceSpace(offsetTransform);

    if (typeof sm.setReferenceSpace === 'function') {
      sm.setReferenceSpace(offsetSpace);
    } else {
      sm.referenceSpace = offsetSpace;
    }

    setTimeout(() => {
      const cam = xr.baseExperience.camera;
      if (!cam) return;
      const actualX = cam.position.x;
      const actualZ = cam.position.z;
      if (Math.abs(actualX - tx) > 1.0 || Math.abs(actualZ - tz) > 1.0) {
        cam.position.set(tx, VR_FIXED_HEIGHT, tz);
      } else {
        cam.position.y = VR_FIXED_HEIGHT;
      }
    }, 600);

  } catch (err) {
    console.warn('⚠️ فشل إنشاء offsetSpace:', err.message);
    _forceCameraPosition(xr);
  }
}

function _forceCameraPosition(xr) {
  const cam = xr.baseExperience.camera;
  if (!cam) return;
  const [tx, ty, tz] = CAMERA.startPosition;
  cam.position.set(tx, VR_FIXED_HEIGHT, tz);
  cam.rotationQuaternion = BABYLON.Quaternion.Identity();
}

// ── قفل الطول الثابت في VR ──────────────────────────────────────────────────
let _heightLockObserver = null;

function _installFixedHeightLock(xr) {
  _uninstallFixedHeightLock();
  const xrCam = xr.baseExperience.camera;
  if (!xrCam) return;

  if (xrCam.onAfterCameraUpdateObservable) {
    _heightLockObserver = xrCam.onAfterCameraUpdateObservable.add(() => {
      if (!window._inVR) return;
      xrCam.position.y = VR_FIXED_HEIGHT;
    });
  } else {
    _heightLockObserver = scene.onBeforeRenderObservable.add(() => {
      if (!window._inVR || !window._xrCamera) return;
      window._xrCamera.position.y = VR_FIXED_HEIGHT;
    });
  }
}

function _uninstallFixedHeightLock() {
  if (!_heightLockObserver) return;
  try {
    const xrCam = window._xrCamera;
    if (xrCam?.onAfterCameraUpdateObservable) {
      xrCam.onAfterCameraUpdateObservable.remove(_heightLockObserver);
    }
    if (scene.onBeforeRenderObservable) {
      scene.onBeforeRenderObservable.remove(_heightLockObserver);
    }
  } catch (e) {}
  _heightLockObserver = null;
}

// ── Controllers Setup ──────────────────────────────────────────────────────
function setupControllers(xr) {
  xr.input.onControllerAddedObservable.add((controller) => {
    controller.onMotionControllerInitObservable.add((mc) => {
      console.log(`🎮 Controller متصل: ${mc.handedness}`);
      const ray = controller.pointer;
      if (ray) ray.isVisible = false;

      if (mc.handedness === 'right') setupRightMC(mc, controller);
      if (mc.handedness === 'left') setupLeftMC(mc, controller);
    });

    if (controller.motionController) {
      const mc = controller.motionController;
      if (mc.handedness === 'right') setupRightMC(mc, controller);
      if (mc.handedness === 'left') setupLeftMC(mc, controller);
    }
  });

  scene.registerBeforeRender(() => {
    if (!window._inVR) return;
    pollXRControllersUnified(xr);
  });
}

function setupRightMC(mc, controller) {
  window._rightMC = mc;
  window._rightController = controller;
  window._rightGrip = controller.grip;

  // ✅ Trigger يمين: addToCart
  const trigger = mc.getComponent('xr-standard-trigger');
  if (trigger) {
    trigger.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      window.addToCart?.();
    });
  }

  // ✅ Squeeze يمين: payAtCashier
  const squeeze = mc.getComponent('xr-standard-squeeze');
  if (squeeze) {
    squeeze.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      window.payAtCashier?.();
    });
  }

  // ✅ زر A: دفع 5 جنيه
  const aButton = mc.getComponent('a-button');
  if (aButton) {
    aButton.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      window.vrPayDenom?.(5);
    });
  }

  // ✅ زر B: دفع 10 جنيه
  const bButton = mc.getComponent('b-button');
  if (bButton) {
    bButton.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      window.vrPayDenom?.(10);
    });
  }
}

function setupLeftMC(mc, controller) {
  window._leftMC = mc;
  window._leftController = controller;
  window._leftGrip = controller.grip;

  // ✅ Trigger يسار: مسك عربة أو سبها
  const trigger = mc.getComponent('xr-standard-trigger');
  if (trigger) {
    trigger.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      if (!window.attachedCart) window.grabCart?.();
      else window.dropCart?.();
    });
  }

  // ✅ زر X: دفع 20 جنيه
  const xButton = mc.getComponent('x-button');
  if (xButton) {
    xButton.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      window.vrPayDenom?.(20);
    });
  }

  // ✅ زر Y: دفع 50 جنيه
  const yButton = mc.getComponent('y-button');
  if (yButton) {
    yButton.onButtonStateChangedObservable.add((comp) => {
      if (!comp.changes?.pressed || !comp.pressed) return;
      window.vrPayDenom?.(50);
    });
  }
}

// ── التحديث الموحد للجويستيك ─────────────────────────────────────────────
let _snapCd = false;
let _prevButtons = {};

function pollXRControllersUnified(xr) {
  const controllers = xr.input.controllers;
  if (!controllers?.length) return;

  for (const ctrl of controllers) {
    const gp = ctrl.inputSource?.gamepad;
    if (!gp) continue;

    const axes = gp.axes;
    const hand = ctrl.inputSource?.handedness;
    if (!axes || axes.length < 4) continue;

    const stickX = axes[2] ?? axes[0] ?? 0;
    const stickY = axes[3] ?? axes[1] ?? 0;
    const DEAD = 0.18;

    if (hand === 'right') {
      const forwardVal = -stickY;
      if (window.playerInput) {
        window.playerInput.moveForward  = forwardVal < -DEAD;
        window.playerInput.moveBackward = forwardVal >  DEAD;
        window.playerInput.moveRight    = stickX     >  DEAD;
        window.playerInput.moveLeft     = stickX     < -DEAD;
      }
    }

    if (hand === 'left') {
      if (!_snapCd && Math.abs(stickX) > 0.6) {
        const angle = stickX > 0 ? -Math.PI / 4 : Math.PI / 4;
        _applySnapTurn(angle);
        _snapCd = true;
        setTimeout(() => { _snapCd = false; }, PLAYER.snapCooldown ?? 300);
      }
    }
  }
}

function _applySnapTurn(angle) {
  if (window._inVR && window._xrCamera) {
    if (window._xrCamera.rotationQuaternion) {
      const q = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), angle);
      window._xrCamera.rotationQuaternion.multiplyInPlace(q);
    } else {
      window._xrCamera.rotation.y += angle;
    }
  } else {
    camera.rotation.y += angle;
  }
}
window._applySnapTurn = _applySnapTurn;

// ── Render Loop ──────────────────────────────────────────────────────────
engine.runRenderLoop(() => {
  window.updateLoop?.();
  scene.render();
});
window.addEventListener('resize', () => engine.resize());

// ── Start ────────────────────────────────────────────────────────────────
setupXR();
loadAssets();

// ══════════════════════════════════════════════════════════════════════════
// ── نظام العملات على ترابيزة الكاشير ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

const BILL_W = 0.165;
const BILL_H = 0.070;

window._billPlanes  = [];
window._changeReady = false;
window._changeOnDone = null;

const _billTexCache = {};
function _getBillTex(img) {
  if (!_billTexCache[img]) _billTexCache[img] = new BABYLON.Texture(img, scene);
  return _billTexCache[img];
}

// ── إضافة ورقة على الكومة ────────────────────────────────────────────────
function spawnBillOnTable(denomIndex) {
  const denoms = window.BILL_DENOMS_REF;
  const denom  = denoms?.[denomIndex];
  if (!denom || !window.CASHIER_TABLE_REF) return;

  const tbl    = window.CASHIER_TABLE_REF;
  const count  = window._billPlanes.length;
  const rx     = (Math.random() - 0.5) * 0.03;
  const rz     = (Math.random() - 0.5) * 0.03;
  const ry     = (Math.random() - 0.5) * 0.25;
  const stackY = tbl.y + 0.001 + count * 0.0025;

  const plane = BABYLON.MeshBuilder.CreatePlane(
    `bill_${denom.value}_${count}`, { width: BILL_W, height: BILL_H }, scene
  );
  plane.position.set(tbl.x + rx, stackY, tbl.z + rz);
  plane.rotation.set(-Math.PI / 2, ry, 0);

  const mat = new BABYLON.StandardMaterial(`billMat_${count}`, scene);
  mat.diffuseTexture  = _getBillTex(denom.img);
  mat.emissiveColor   = new BABYLON.Color3(1, 1, 1);
  mat.backFaceCulling = false;
  plane.material      = mat;
  plane.metadata      = { isBill: true, value: denom.value };

  window._billPlanes.push(plane);
}
window.spawnBillOnTable = spawnBillOnTable;

// ── حذف كل الأوراق من الترابيزة ──────────────────────────────────────────
function clearBillsFromTable() {
  for (const p of window._billPlanes) { try { p.dispose(); } catch(e) {} }
  window._billPlanes  = [];
  window._changeReady = false;
  window._changeOnDone = null;
}
window.clearBillsFromTable = clearBillsFromTable;

// ── loop مسك الفكة — 0.5 متر ─────────────────────────────────────────────
// distSq < 0.25  →  √0.25 = 0.5m
scene.registerBeforeRender(() => {
  if (!window._changeReady || !window._billPlanes.length) return;

  const cp = window._xrCamera
    ? (window._xrCamera.globalPosition ?? window._xrCamera.position)
    : window.camera?.position;
  if (!cp) return;

  const firstBill = window._billPlanes[0];
  if (!firstBill) return;

  const dSq = BABYLON.Vector3.DistanceSquared(cp, firstBill.position);
  if (dSq < 0.25) {   // 0.5 متر
    const done = window._changeOnDone;
    clearBillsFromTable();
    done?.();
  }
});

console.log('✅ main.js جاهز — VR Only, No UI, أزرار ABXY مضبوطة، مسك الفكة 0.5م');
