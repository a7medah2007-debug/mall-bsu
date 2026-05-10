'use strict';

// ═══════════════════════════════════════════════
//  الصوت
// ═══════════════════════════════════════════════
const _sfx = {};

function _loadSFX(key, path) {
  if (!path || _sfx[key]) return;
  try {
    _sfx[key] = new BABYLON.Sound(key, path, window.scene, null, {
      autoplay: false, spatialSound: false, volume: 0.9,
    });
  } catch (e) {}
}

function _initSFX() {
  if (typeof SOUNDS === 'undefined') return;
  _loadSFX('cash',  SOUNDS.cash);
  _loadSFX('grab',  SOUNDS.space);
  _loadSFX('throw', SOUNDS.loss);
  _loadSFX('loss',  SOUNDS.loss);
  _loadSFX('more',  SOUNDS.much);
}

function playSFX(key) {
  try {
    const s = _sfx[key];
    if (!s) return;
    if (s.isPlaying) s.stop();
    s.play();
  } catch (e) {}
}

if (window.scene?.isReady()) _initSFX();
else window.scene?.onReadyObservable?.addOnce(() => _initSFX());
setTimeout(_initSFX, 800);

// ═══════════════════════════════════════════════
//  مساعدات الكاميرا
// ═══════════════════════════════════════════════
function _camPos() {
  if (window._inVR && window._xrCamera)
    return (window._xrCamera.globalPosition ?? window._xrCamera.position).clone();
  return (window.camera?.globalPosition ?? window.camera?.position ?? BABYLON.Vector3.Zero()).clone();
}

function _camDir() {
  const cam = (window._inVR && window._xrCamera) ? window._xrCamera : window.camera;
  if (!cam) return new BABYLON.Vector3(0, 0, 1);
  const fwd = cam.getDirection(BABYLON.Vector3.Forward()).clone();
  fwd.negateInPlace();
  return fwd;
}

function _getCartPos() {
  if (window.attachedCart) return window.attachedCart.position.clone();
  const cp = _camPos();
  const d  = _camDir();
  d.y = 0;
  if (d.lengthSquared() > 0.0001) d.normalizeToRef(d);
  return new BABYLON.Vector3(cp.x + d.x * 1.5, cp.y, cp.z + d.z * 1.5);
}

// ═══════════════════════════════════════════════
//  تحديث موضع المنتج المحمول (Desktop mode)
// ═══════════════════════════════════════════════
const _hR = new BABYLON.Vector3();

function updateHeldItem() {
  const item = window.heldItem;
  if (!item) return;
  if (window._inVR && item.parent) return;   // في VR الـ grip بيتحكم فيه

  const d  = _camDir();
  const cp = _camPos();
  _hR.set(-d.z * 0.4, 0, d.x * 0.4);
  item.position.set(
    cp.x + d.x * 1.5 + _hR.x,
    cp.y - 0.25,
    cp.z + d.z * 1.5 + _hR.z
  );
  item.rotation.y = Math.atan2(d.x, d.z);
}
window.updateHeldItem = updateHeldItem;

// ═══════════════════════════════════════════════
//  مسافة المسك
// ═══════════════════════════════════════════════
const GRAB_RADIUS_SQ      = 9;    // 3 متر للمنتجات
const GRAB_CART_RADIUS_SQ = 25;   // 5 متر للسلة

// ═══════════════════════════════════════════════
//  مسك منتج
//
//  allProducts دلوقتي بيخزن بيانات وليس meshes
//  كل عنصر فيه:
//    _type: 'thin'
//    _sourceMesh: الـ mesh الأساسي
//    _thinIndex: رقم الـ instance
//    position: موضع المنتج
//    metadata: بيانات المنتج
//
//  لما اللاعب يمسك:
//  ١- نخفي الـ thinInstance (Translation بعيد جداً)
//  ٢- نعمل instance عادي في إيد اللاعب
//  ٣- لو رمى: نرجع الـ thinInstance لمكانه
// ═══════════════════════════════════════════════
let _grabLock = false;  // منع double-grab

function grabNearestProduct() {
  if (window.heldItem) return;
  if (_grabLock) return;

  _grabLock = true;
  setTimeout(() => { _grabLock = false; }, 150);

  const cp = _camPos();
  let nearest = null;
  let bestSq  = GRAB_RADIUS_SQ;

  for (const p of window.allProducts ?? []) {
    if (p.metadata?.inCart) continue;
    if (p.metadata?._hidden) continue;
    const dSq = BABYLON.Vector3.DistanceSquared(cp, p.position);
    if (dSq < bestSq) { bestSq = dSq; nearest = p; }
  }

  if (!nearest) return;

  // إخفاء الـ thinInstance بنقله بعيد جداً (مش بـ Zero عشان يتجنب GPU artifact)
  nearest._sourceMesh.thinInstanceSetMatrixAt(
    nearest._thinIndex,
    BABYLON.Matrix.Translation(0, -9999, 0),
    true
  );
  nearest.metadata._hidden = true;

  // إنشاء instance مرئي في إيد اللاعب
  const vis = nearest._sourceMesh.createInstance(`held_${nearest._thinIndex}`);
  vis.scaling.copyFrom(nearest._scale);
  vis.position.copyFrom(nearest.position);
  vis.isPickable = false;
  vis.metadata   = {
    _isHeldVis:       true,
    _productRef:      nearest,         // رابط للبيانات الأصلية
    isProduct:        false,           // مش قابل للـ pick تاني
    price:            nearest.metadata.price,
    productName:      nearest.metadata.productName,
    productType:      nearest.metadata.productType,
  };

  window.heldItem = vis;

  // في VR: نربط المنتج بالـ grip بعد إطار واحد
  if (window._inVR && window._rightGrip) {
    setTimeout(() => {
      if (!vis || vis.isDisposed?.()) return;
      if (vis.parent) { vis.computeWorldMatrix(true); vis.setParent(null); }
      vis.setParent(window._rightGrip);
      vis.position.set(0, -0.05, 0.15);
      vis.rotationQuaternion = BABYLON.Quaternion.Identity();
    }, 0);
  }

  playSFX('grab');
}

// ═══════════════════════════════════════════════
//  رمي المنتج — يرجع لمكانه على الرف
// ═══════════════════════════════════════════════
function throwItem() {
  const item = window.heldItem;
  if (!item) return;

  // فصل عن الـ grip لو في VR
  if (item.parent) {
    item.computeWorldMatrix(true);
    item.setParent(null);
  }

  if (item.metadata?._isHeldVis) {
    const ref = item.metadata._productRef;
    // إرجاع الـ thinInstance لمكانه الأصلي
    ref._sourceMesh.thinInstanceSetMatrixAt(
      ref._thinIndex,
      BABYLON.Matrix.Compose(ref._scale, ref._rotQ, ref.metadata.originalPosition),
      true
    );
    ref.metadata._hidden = false;
    item.dispose();
  } else {
    // منتج عادي (مش thin) — نرجعه لمكانه
    const m = item.metadata;
    if (m?.originalPosition) item.position.copyFrom(m.originalPosition);
    if (m?.originalRotation) item.rotation.copyFrom(m.originalRotation);
  }

  window.heldItem        = null;
  window._handMoney      = 0;
  window._handNoteValues = [];

  playSFX('throw');
}

// ═══════════════════════════════════════════════
//  إضافة للسلة
// ═══════════════════════════════════════════════
function addToCart() {
  const item = window.heldItem;
  if (!item) return;

  const ref = item.metadata?._productRef ?? item;
  if (ref.metadata?.inCart) return;

  // فصل عن الـ grip
  if (item.parent) {
    item.computeWorldMatrix(true);
    item.setParent(null);
  }

  const cartPos  = _getCartPos();
  const cartBaseY = (window.attachedCart?.position.y ?? 0) + 0.1;

  const offsetX = (Math.random() - 0.5) * 0.2;
  const offsetZ = (Math.random() - 0.5) * 0.8;
  const offsetY = Math.floor(Math.random() * 3) * 0.1 + Math.random() * 0.1;

  item.rotationQuaternion = null;
  item.rotation.set(Math.PI / 2, Math.random() * Math.PI * 2, 0);
  item.position.set(
    cartPos.x + offsetX,
    cartBaseY + offsetY,
    cartPos.z + offsetZ
  );

  // حفظ بيانات الموضع داخل السلة
  ref.metadata.inCart        = true;
  ref.metadata._cartVisual   = item;
  ref.metadata._cartOffset   = { x: offsetX, y: offsetY, z: offsetZ };
  ref.metadata._cartRotation = {
    x: item.rotation.x,
    y: item.rotation.y,
    z: item.rotation.z,
  };

  window.cartItems.push(ref);
  window.heldItem = null;

  playSFX('cash');
}

// ═══════════════════════════════════════════════
//  تحديث مواضع المنتجات داخل السلة
// ═══════════════════════════════════════════════
function updateCartItems() {
  const cart = window.attachedCart;
  if (!cart || !window.cartItems?.length) return;

  for (const ref of window.cartItems) {
    const vis = ref.metadata?._cartVisual;
    if (!vis) continue;
    const off = ref.metadata._cartOffset;
    const rot = ref.metadata._cartRotation;
    if (!off) continue;

    vis.position.set(
      cart.position.x + off.x,
      cart.position.y + 1.2 + off.y,
      cart.position.z + off.z
    );
    if (rot) {
      vis.rotation.x = rot.x;
      vis.rotation.y = rot.y;
      vis.rotation.z = rot.z;
    }
  }
}
window.updateCartItems = updateCartItems;

// ═══════════════════════════════════════════════
//  مسك السلة وتركها
// ═══════════════════════════════════════════════
let _cartGrabLock = false;

function grabCart() {
  if (window.attachedCart) return;
  if (_cartGrabLock) return;

  _cartGrabLock = true;
  setTimeout(() => { _cartGrabLock = false; }, 150);

  const cp = _camPos();
  let nearest = null;
  let bestSq  = GRAB_CART_RADIUS_SQ;

  for (const c of window.allCarts ?? []) {
    const dSq = BABYLON.Vector3.DistanceSquared(cp, c.position);
    if (dSq < bestSq) { bestSq = dSq; nearest = c; }
  }

  if (!nearest) return;

  const d = _camDir();
  d.y = 0;
  if (d.lengthSquared() > 0.0001) d.normalizeToRef(d);

  nearest.position.set(cp.x + d.x * 1.5, 0.2, cp.z + d.z * 1.5);
  nearest.rotation.y = Math.atan2(d.x, d.z);

  window.attachedCart = nearest;
  playSFX('grab');
}

function dropCart() {
  if (!window.attachedCart) return;
  window.attachedCart = null;
}

// ═══════════════════════════════════════════════
//  الفلوس
// ═══════════════════════════════════════════════
if (typeof window._handMoney === 'undefined') {
  window._handMoney      = 0;
  window._handNoteValues = [];
}

const BANKNOTES = {
  5:  { model: 'assets/models/5.glb',  value: 5  },
  10: { model: 'assets/models/10.glb', value: 10 },
  20: { model: 'assets/models/20.glb', value: 20 },
};

async function spawnBanknote(value) {
  const noteConfig = BANKNOTES[value];
  if (!noteConfig) return;

  // لو في منتج في الإيد نرميه الأول
  if (window.heldItem) throwItem();

  const note = await window.loadModel(noteConfig.model, [0,0,0], [0,0,0], [0.5,0.5,0.5]);
  if (!note) return;

  note.metadata = { isBanknote: true, value: noteConfig.value, isHeld: true };
  note.getChildMeshes().forEach(m => { m.isPickable = false; });

  if (window._inVR && window._rightGrip) {
    note.parent = window._rightGrip;
    note.position.set(0, -0.05, 0.15);
    note.rotationQuaternion = BABYLON.Quaternion.Identity();
  }

  window.heldItem        = note;
  window._handMoney      = value;
  window._handNoteValues = [value];

  playSFX('cash');
}

// ═══════════════════════════════════════════════
//  الدفع
// ═══════════════════════════════════════════════
function payWithNotes() {
  const total = (window.cartItems ?? []).reduce((s, i) => s + (i.metadata?.price ?? 0), 0);

  if (total === 0)              return;
  if (!window.cashier)          return;
  if (window.hasPaid)           return;
  if (window._handMoney <= 0)   return;

  const held = window.heldItem;
  if (!held?.metadata?.isBanknote) return;

  const value = window._handMoney;

  if (value < total) {
    playSFX('loss');
    return;
  }

  if (value === total) {
    _completePayment(value, total, 0);
    return;
  }

  // المبلغ أكبر من الإجمالي
  const change = value - total;
  playSFX('more');
  setTimeout(() => {
    _spawnChangeModels(change);
    _completePayment(value, total, change);
  }, 5000);
}

function _completePayment(paid, total, change) {
  // تنظيف المنتجات من السلة
  for (const ref of window.cartItems ?? []) {
    const vis = ref.metadata?._cartVisual;
    if (vis && !vis.isDisposed?.()) vis.dispose();
    ref.metadata.inCart      = false;
    ref.metadata._cartVisual = null;
  }
  window.cartItems = [];
  window.hasPaid   = true;

  // تنظيف الورقة المالية
  const held = window.heldItem;
  if (held) {
    if (held.parent) held.setParent(null);
    held.dispose();
    window.heldItem = null;
  }

  window._handMoney      = 0;
  window._handNoteValues = [];

  playSFX('cash');
}

async function _spawnChangeModels(change) {
  if (!window.cashier || change <= 0) return;

  const cashierPos = window.cashier.position.clone();
  const spawnBase  = new BABYLON.Vector3(cashierPos.x, cashierPos.y + 0.2, cashierPos.z + 0.3);

  let remaining    = change;
  const notes      = [];
  while (remaining >= 20) { notes.push(20); remaining -= 20; }
  while (remaining >= 10) { notes.push(10); remaining -= 10; }
  while (remaining >= 5)  { notes.push(5);  remaining -= 5;  }

  for (let i = 0; i < notes.length; i++) {
    try {
      const note = await window.loadModel(`assets/models/${notes[i]}.glb`, [0,0,0], [0,0,0], [1,1,1]);
      if (!note) continue;
      note.position.set(
        spawnBase.x + (i % 3 - 1) * 0.3,
        spawnBase.y + Math.floor(i / 3) * 0.1,
        spawnBase.z + Math.floor(i / 3) * 0.2
      );
      note.rotation.set(Math.PI / 2, 0, 0);
      note.metadata = { isChangeNote: true, value: notes[i] };
      note.getChildMeshes().forEach(m => { m.isPickable = false; });
    } catch (e) {}
  }
}

// ═══════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════
function spawn5Note()  { spawnBanknote(5);  }
function spawn10Note() { spawnBanknote(10); }
function spawn20Note() { spawnBanknote(20); }

window.grabNearestProduct = grabNearestProduct;
window.addToCart          = addToCart;
window.throwItem          = throwItem;
window.grabCart           = grabCart;
window.dropCart           = dropCart;
window.payAtCashier       = payWithNotes;
window.payWithNotes       = payWithNotes;
window.spawnBanknote      = spawnBanknote;
window.spawn5Note         = spawn5Note;
window.spawn10Note        = spawn10Note;
window.spawn20Note        = spawn20Note;
