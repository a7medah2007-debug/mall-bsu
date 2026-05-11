// ========== interactions.js — Supermarket VR (تنظيف كامل لـ VR) ==========

'use strict';

// ── Sounds ────────────────────────────────────────────────────────────────────
const _sfx = {};

function _loadSFX(key, path) {
  if (!path || _sfx[key]) return;
  try {
    _sfx[key] = new BABYLON.Sound(key, path, window.scene, null, {
      autoplay: false, spatialSound: false, volume: 0.9,
    });
  } catch(e) {}
}

function _initSFX() {
  if (typeof SOUNDS === 'undefined') return;
  _loadSFX('cash',  SOUNDS.cash);
  _loadSFX('grab',  SOUNDS.space);
  _loadSFX('throw', SOUNDS.loss);
}

function playSFX(key) {
  try {
    const s = _sfx[key];
    if (!s || s.isPlaying) return;
    s.play();
  } catch(e) {}
}

// Initialize sounds when scene is ready
if (window.scene?.isReady()) _initSFX();
else window.scene?.onReadyObservable?.addOnce(() => _initSFX());
setTimeout(_initSFX, 800);  // fallback

// ── Helpers ───────────────────────────────────────────────────────────────────
function _camPos() {
  if (window._inVR && window._xrCamera) {
    return (window._xrCamera.globalPosition ?? window._xrCamera.position).clone();
  }
  return (window.camera?.globalPosition ?? window.camera?.position ?? BABYLON.Vector3.Zero()).clone();
}

function _camDir() {
  const cam = (window._inVR && window._xrCamera) ? window._xrCamera : window.camera;
  if (!cam) return new BABYLON.Vector3(0, 0, 1);
  
  // الاتجاه الأساسي من الكاميرا مع عكس النظام اليميني
  const rawForward = cam.getDirection(BABYLON.Vector3.Forward()).clone();
  rawForward.negateInPlace();
  return rawForward;
}

function _getCartPos() {
  if (window.attachedCart) return window.attachedCart.position.clone();
  const cp = _camPos();
  const d  = _camDir();
  d.y = 0;
  if (d.lengthSquared() > 0.0001) d.normalizeToRef(d);
  return new BABYLON.Vector3(cp.x + d.x * 1.5, cp.y, cp.z + d.z * 1.5);
}

// ── Held Item Update (VR لا تحتاج تحديث يدوي، اليد تمسك العنصر تلقائياً) ────
// نعرّفها فارغة لتجنب أخطاء الاستدعاء من movement.js
window.updateHeldItem = function() {};

// ── المسافات ──────────────────────────────────────────────────────────────────
const GRAB_CART_SQ = 25;   // 5m²
const AUTO_CART_MAX_DIST    = 1.5;                          // 1.5 متر
const AUTO_CART_MAX_DIST_SQ = AUTO_CART_MAX_DIST * AUTO_CART_MAX_DIST;

// ── Grab Product (VR فقط – يمسك المنتج ويلصقه بقبضة اليد اليمنى) ─────────────
function grabNearestProduct() {
  if (window.heldItem) return;

  const cp = _camPos();
  let nearest = null, bestSq = 9; // 3m²

  for (const p of window.allProducts ?? []) {
    if (p.metadata?.inCart) continue;
    const pos = p.position;
    if (!pos) continue;
    const dSq = BABYLON.Vector3.DistanceSquared(cp, pos);
    if (dSq < bestSq) { bestSq = dSq; nearest = p; }
  }

  if (!nearest) return;

  if (!nearest.metadata) nearest.metadata = {};
  nearest.metadata.originalPosition ??= nearest.position.clone();
  nearest.metadata.originalRotation ??= (nearest.rotation?.clone() ?? BABYLON.Vector3.Zero());

  if (nearest.isThinInstance && nearest.sourceMesh) {
    // Thin Instance: نخفيها ونعمل instance جديد
    nearest.sourceMesh.thinInstanceSetMatrixAt(
      nearest.thinIndex,
      BABYLON.Matrix.Zero(),
      true
    );
    const vis = nearest.sourceMesh.createInstance(`held_ti_${nearest.thinIndex}`);
    vis.position.copyFrom(nearest.position);
    const os = nearest.metadata?.originalScale;
    if (os) vis.scaling.copyFrom(os);
    vis.metadata = { ...nearest.metadata, _isThinVis: true, _origRef: nearest };
    window.heldItem = vis;
  } else {
    window.heldItem = nearest;
  }

  // ألصق المنتج بقبضة اليد اليمنى
  if (window._rightGrip) {
    const item = window.heldItem;
    if (item.parent) {
      item.computeWorldMatrix(true);
      item.setParent(null);
    }
    item.setParent(window._rightGrip);
    item.position.set(0, -0.05, 0.15);
    item.rotation = BABYLON.Vector3.Zero();
  }

  playSFX('grab');
}

// ── Throw / Return ────────────────────────────────────────────────────────────
function throwItem() {
  const item = window.heldItem;
  if (!item) return;

  // فك الربط باليد
  if (item.parent) {
    item.computeWorldMatrix(true);
    const worldPos = item.getWorldMatrix().getTranslation();
    item.setParent(null);
    item.position = worldPos;
    if (typeof item.setPreTransformMatrix === 'function') {
      item.setPreTransformMatrix(null);
    }
  }

  if (item.metadata?._isThinVis) {
    const orig = item.metadata._origRef;
    const os   = orig.metadata.originalScale ?? new BABYLON.Vector3(1,1,1);
    const op   = orig.metadata.originalPosition;
    orig.sourceMesh.thinInstanceSetMatrixAt(
      orig.thinIndex,
      BABYLON.Matrix.Compose(os, BABYLON.Quaternion.Identity(), op),
      true
    );
    item.dispose();
  } else {
    const m = item.metadata;
    if (m?.originalPosition) item.position.copyFrom(m.originalPosition);
    if (m?.originalRotation) item.rotation.copyFrom(m.originalRotation);
  }

  window.heldItem = null;
  playSFX('throw');
}

// ── Add To Cart ───────────────────────────────────────────────────────────────
function addToCart(productArg) {
  const product = productArg ?? window.heldItem;
  if (!product) return;

  const origRef = product.metadata?._origRef ?? product;
  if (origRef.metadata?.inCart) return;

  // فك المنتج من اليد
  if (product.parent) {
    product.computeWorldMatrix(true);
    const worldPos = product.getWorldMatrix().getTranslation();
    product.setParent(null);
    product.position = worldPos;
    if (typeof product.setPreTransformMatrix === 'function') {
      product.setPreTransformMatrix(null);
    }
  }

  const cartPos = _getCartPos();
  const cartBaseY = (window.attachedCart?.position.y ?? 0) + 1.2;

  const halfWidth  = 0.1;
  const halfDepth  = 0.8;

  // إزاحة عشوائية داخل السلة
  const offsetX = (Math.random() - 0.5) * 2 * halfWidth;
  const offsetZ = (Math.random() - 0.5) * 2 * halfDepth;
  const stackLevel = Math.floor(Math.random() * 3);
  const productHeight = 0.25;
  const offsetY = stackLevel * productHeight + Math.random() * 1.0;

  // المنتج يصبح مستلقياً مع دوران عشوائي
  product.rotation.x = Math.PI / 2;
  product.rotation.y = Math.random() * Math.PI * 2;
  product.rotation.z = 0;

  product.position.set(
    cartPos.x + offsetX,
    cartBaseY + offsetY,
    cartPos.z + offsetZ
  );

  // تخزين الإزاحة والدوران للاستخدام في تحديث موضع السلة
  if (!origRef.metadata) origRef.metadata = {};
  origRef.metadata._cartOffset = { x: offsetX, y: offsetY, z: offsetZ };
  origRef.metadata._cartRotation = {
    x: product.rotation.x,
    y: product.rotation.y,
    z: product.rotation.z
  };
  origRef.metadata._cartVisual = product;
  origRef.metadata.inCart      = true;

  window.cartItems.push(origRef);

  if (window.heldItem === product) {
    window.heldItem = null;
  }

  playSFX('cash');
}

// ── Grab & Auto-Add (السلوك التلقائي لزر الإمساك) ──────────────────────────
function grabAndAddToCart() {
  const cart = window.attachedCart;
  if (!cart) return;

  if (window.heldItem) {
    addToCart();
    return;
  }

  // البحث عن أقرب منتج للسلة
  const cartPos = cart.position;
  let nearest = null;
  let bestSq  = AUTO_CART_MAX_DIST_SQ;

  for (const p of window.allProducts ?? []) {
    if (p.metadata?.inCart) continue;
    const pos = p.position;
    if (!pos) continue;
    const dSq = BABYLON.Vector3.DistanceSquared(cartPos, pos);
    if (dSq < bestSq) {
      bestSq  = dSq;
      nearest = p;
    }
  }

  if (!nearest) return;

  // تخزين البيانات الأصلية
  if (!nearest.metadata) nearest.metadata = {};
  nearest.metadata.originalPosition ??= nearest.position.clone();
  nearest.metadata.originalRotation ??= (nearest.rotation?.clone() ?? BABYLON.Vector3.Zero());

  let productToAdd;
  if (nearest.isThinInstance && nearest.sourceMesh) {
    nearest.sourceMesh.thinInstanceSetMatrixAt(
      nearest.thinIndex,
      BABYLON.Matrix.Zero(),
      true
    );
    const vis = nearest.sourceMesh.createInstance(`auto_ti_${nearest.thinIndex}`);
    vis.position.copyFrom(nearest.position);
    const os = nearest.metadata?.originalScale;
    if (os) vis.scaling.copyFrom(os);
    vis.metadata = { ...nearest.metadata, _isThinVis: true, _origRef: nearest };
    productToAdd = vis;
  } else {
    productToAdd = nearest;
  }

  playSFX('grab');
  addToCart(productToAdd);
}

// ── Cart Items Update (تحديث مواضع المنتجات داخل السلة) ──────────────────────
function updateCartItems() {
  const cart = window.attachedCart;
  if (!cart || !window.cartItems?.length) return;
  for (let i = 0; i < window.cartItems.length; i++) {
    const productRef = window.cartItems[i];
    const off = productRef?.metadata?._cartOffset;
    const rot = productRef?.metadata?._cartRotation;
    const v = productRef?.metadata?._cartVisual;
    if (!v || !off) continue;

    v.position.set(
      cart.position.x + off.x,
      cart.position.y + 1.2 + off.y,
      cart.position.z + off.z
    );

    if (rot) {
      v.rotation.x = rot.x;
      v.rotation.y = rot.y;
      v.rotation.z = rot.z;
    }
  }
}
window.updateCartItems = updateCartItems;

// ── Grab/Drop Cart ────────────────────────────────────────────────────────────
function grabCart() {
  if (window.attachedCart) return;
  const cp = _camPos();
  let nearest = null, bestSq = GRAB_CART_SQ;
  for (const c of window.allCarts ?? []) {
    const dSq = BABYLON.Vector3.DistanceSquared(cp, c.position);
    if (dSq < bestSq) { bestSq = dSq; nearest = c; }
  }
  if (!nearest) return;

  const camDir = _camDir();
  camDir.y = 0;
  camDir.normalizeToRef(camDir);
  
  nearest.position.x = cp.x + camDir.x * 1.5;
  nearest.position.z = cp.z + camDir.z * 1.5;
  nearest.position.y = 0.2;
  nearest.rotation.y = Math.atan2(camDir.x, camDir.z);

  window.attachedCart = nearest;
  playSFX('grab');
}

function dropCart() {
  if (!window.attachedCart) return;
  window.attachedCart = null;
}

// ── Pay At Cashier (دفع الحساب بدون واجهة نصية) ──────────────────────────────
let _paying = false;

function payAtCashier() {
  if (_paying) return;
  if (!window.cashier) return;
  if (!window.cartItems?.length) return;
  if (window.hasPaid) return;

  const distSq = BABYLON.Vector3.DistanceSquared(_camPos(), window.cashier.position);
  if (distSq > 30) return;

  _paying = true;
  playSFX('cash');

  const items = [...window.cartItems];
  window.cartItems = [];

  // نرمي المنتجات عند الكاشير
  items.forEach((product, idx) => {
    setTimeout(() => {
      const v = product.metadata?._cartVisual ?? product;
      if (product.metadata) product.metadata.inCart = false;
      v.position.set(
        window.cashier.position.x + (Math.random() - 0.5) * 1.5,
        window.cashier.position.y + 0.3,
        window.cashier.position.z + (Math.random() - 0.5) * 1.5
      );
    }, idx * 250);
  });

  // بعد الانتهاء من وضع المنتجات، يتم الدفع ويصبح الخروج متاحاً
  setTimeout(() => {
    window.hasPaid = true;
    _paying = false;
  }, items.length * 250 + 800);
}

// ── تصدير الدوال العامة (للاستخدام من main.js وأزرار التحكم) ─────────────────
window.grabNearestProduct = grabAndAddToCart;  // الزر الرئيسي يشغّل السلوك التلقائي
window.addToCart          = addToCart;
window.throwItem          = throwItem;
window.grabCart           = grabCart;
window.dropCart           = dropCart;
window.payAtCashier       = payAtCashier;