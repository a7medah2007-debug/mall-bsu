// ========== interactions.js — Supermarket VR (VR-Only, No UI) ==========

'use strict';

// ── Sounds ────────────────────────────────────────────────────────────────────
// ── Sounds ────────────────────────────────────────────────────────────────────
const _sfx = {};
window._sfx = _sfx;

function _loadSFX(key, path, loop = false, volume = 0.9) {
  if (!path || _sfx[key]) return;
  try {
    const audio = new Audio(path);
    audio.loop = loop;
    audio.volume = volume;
    audio.preload = 'auto';
    _sfx[key] = audio;
    console.log(`✅ صوت محمل: ${key}`);
  } catch(e) {
    console.warn(`⚠️ فشل تحميل: ${path}`);
  }
}

function _initSFX() {
  if (typeof SOUNDS === 'undefined') return;
  _loadSFX('lose', SOUNDS.lose, false, 0.9);
  _loadSFX('much', SOUNDS.much, false, 0.9);
  _loadSFX('background', SOUNDS.background, true, 0.4);

  // شغل الباكجروند بعد أول تفاعل من اليوزر
  const _startBG = () => {
    const bg = _sfx['background'];
    if (bg && bg.paused) {
      bg.play().then(() => console.log('✅ background شغال')).catch(e => console.warn('❌ background:', e.message));
    }
    document.removeEventListener('click', _startBG);
    document.removeEventListener('keydown', _startBG);
  };
  document.addEventListener('click', _startBG);
  document.addEventListener('keydown', _startBG);
}

function playSFX(key) {
  try {
    const s = _sfx[key];
    if (!s) return;
    s.currentTime = 0;
    s.play().catch(()=>{});
  } catch(e) {}
}

function playSFX(key) {
  try {
    const s = _sfx[key];
    if (!s) return;
    if (s.isPlaying) s.stop();
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

// ── Held Item Update ──────────────────────────────────────────────────────────
const _hR = new BABYLON.Vector3();

function updateHeldItem() {
  const item = window.heldItem;
  if (!item) return;
  if (window._inVR && item.parent) return;
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

// ── Grab Product ──────────────────────────────────────────────────────────────
const GRAB_SQ      = 9;    // 3m²
const GRAB_CART_SQ = 25;   // 5m²

const AUTO_CART_MAX_DIST    = 3;
const AUTO_CART_MAX_DIST_SQ = AUTO_CART_MAX_DIST * AUTO_CART_MAX_DIST;

function grabNearestProduct() {
  if (window.heldItem) return;

  const cp = _camPos();
  let nearest = null, bestSq = GRAB_SQ;

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

  if (window._inVR && window._rightGrip) {
    const item = window.heldItem;
    if (item.parent) {
      item.computeWorldMatrix(true);
      item.setParent(null);
    }
    item.setParent(window._rightGrip);
    item.position.set(0, -0.05, 0.15);
    item.rotation = BABYLON.Vector3.Zero();
  }
}

// ── Throw / Return ────────────────────────────────────────────────────────────
function throwItem() {
  const item = window.heldItem;
  if (!item) return;

  if (item.parent) {
    item.computeWorldMatrix(true);
    const worldMatrix = item.getWorldMatrix();
    const worldPos = worldMatrix.getTranslation();
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
}

// ── Add To Cart ───────────────────────────────────────────────────────────────
function addToCart(productArg) {
  const product = productArg ?? window.heldItem;
  if (!product) return;

  const origRef = product.metadata?._origRef ?? product;
  if (origRef.metadata?.inCart) return;

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
  const cartBaseY = 0.5;
  const halfWidth  = 0.3;
  const halfDepth  = 0.45;

  const offsetX = (Math.random() - 0.5) * 2 * halfWidth;
  const offsetZ = (Math.random() - 0.5) * 2 * halfDepth;

  const offsetY = Math.random() * 0.3;
  
  product.rotation.x = Math.PI / 2;
  product.rotation.y = Math.random() * Math.PI * 2;
  product.rotation.z = 0;

  product.position.set(
    cartPos.x + offsetX,
    cartBaseY + offsetY,
    cartPos.z + offsetZ
  );

  if (!origRef.metadata) origRef.metadata = {};
  origRef.metadata._cartOffset = { x: offsetX, y: offsetY, z: offsetZ };
  origRef.metadata._cartRotation = {
    x: product.rotation.x,
    y: product.rotation.y,
    z: product.rotation.z
  };

  origRef.metadata._cartVisual = product;

  if (!origRef.metadata) origRef.metadata = {};
  origRef.metadata.inCart      = true;
  origRef.metadata._cartVisual = product;

  window.cartItems.push(origRef);
  if (window.heldItem === product) {
    window.heldItem = null;
  }
}

// ── Grab & Auto-Add ───────────────────────────────────────────────────────────
function grabAndAddToCart() {
  const cart = window.attachedCart;
  if (!cart) return;

  if (window.heldItem) {
    addToCart();
    return;
  }

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

  addToCart(productToAdd);
}
window.grabAndAddToCart = grabAndAddToCart;

// ── Cart Items Update ─────────────────────────────────────────────────────────
function updateCartItems() {
  const cart = window.attachedCart;
  if (!cart || !window.cartItems?.length) return;
  const n  = window.cartItems.length;
  for (let i = 0; i < n; i++) {
    const v = window.cartItems[i].metadata?._cartVisual;
    if (!v) continue;
    const productRef = window.cartItems[i];
    if (!productRef?.metadata) continue;

    const off = productRef.metadata._cartOffset;
    const rot = productRef.metadata._cartRotation;
    if (!off) continue;

    const cosY = Math.cos(cart.rotation.y);
const sinY = Math.sin(cart.rotation.y);
v.position.set(
  cart.position.x + off.x * cosY - off.z * sinY,
  cart.position.y + 0.5 + off.y,
  cart.position.z + off.x * sinY + off.z * cosY
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
  nearest.position.y = 0;
  nearest.rotation.y = Math.atan2(camDir.x, camDir.z);

  window.attachedCart = nearest;
}

function dropCart() {
  if (!window.attachedCart) return;
  window.attachedCart = null;
}

// ── Pay At Cashier ────────────────────────────────────────────────────────────
let _paying = false;

const CASHIER_TABLE = { x: -3.95, y: 1.4, z: 12.48 };
window.CASHIER_TABLE_REF = CASHIER_TABLE;

const BILL_DENOMS = [
  { value: 5,  img: 'assets/image/5.jpg'  },
  { value: 10, img: 'assets/image/10.jpg' },
  { value: 20, img: 'assets/image/20.jpg' },
  { value: 50, img: 'assets/image/50.jpg' },
];
window.BILL_DENOMS_REF = BILL_DENOMS;

// حالة نظام الدفع
let _payState = {
  active:    false,
  paid:      0,
  total:     0,
  items:     [],
  timer:     null,
  countdown: 15,
};

function _spawnBillPlane(denom) {
  const idx = BILL_DENOMS.findIndex(d => d.value === denom.value);
  if (idx >= 0) window.spawnBillOnTable?.(idx);
}

function _clearBillPlanes() {
  window.clearBillsFromTable?.();
}

function _stopPayTimer() {
  if (_payState.timer) { clearInterval(_payState.timer); _payState.timer = null; }
}

function _startPayTimer() {
  // Timer محذوف — الإنهاء يدوي عن طريق Squeeze يسار
}

function _onPayTimeout() {
  // غير مستخدم
}

function _showChange(amount, onDone) {
  let remaining = amount;
  const sorted  = [...BILL_DENOMS].sort((a, b) => b.value - a.value);
  const toSpawn = [];

  for (const d of sorted) {
    while (remaining >= d.value) { toSpawn.push(d); remaining -= d.value; }
  }

  toSpawn.forEach((d, i) => {
    setTimeout(() => {
      _spawnBillPlane(d);
      if (i === toSpawn.length - 1) {
        window._changeReady = true;
        window._changeOnDone = onDone;
      }
    }, i * 300);
  });

  if (toSpawn.length === 0) onDone?.();
}

function _finishPayment(total, change) {
  const items = _payState.items;

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

  setTimeout(() => {
    window.cartItems = [];
    window.hasPaid   = true;
    _paying          = false;
    _payState.paid   = 0;
  }, items.length * 250 + 500);
}

function payAtCashier() {
  if (_paying)                   return;
  if (!window.cashier)           return;
  if (!window.cartItems?.length) return;
  if (window.hasPaid)            return;

  const distSq = BABYLON.Vector3.DistanceSquared(_camPos(), window.cashier.position);
  if (distSq > 30) return;

  _paying = true;

  const items = [...window.cartItems];
  const total = items.reduce((s, i) => s + (i.metadata?.price ?? 0), 0);

  _payState.active = true;
  _payState.paid   = 0;
  _payState.total  = total;
  _payState.items  = items;
}

// ── vrPayDenom: A=5 / B=10 / X=20 / Y=50 ────────────────────────────────────
window.vrPayDenom = function(value) {
  if (!_payState.active) return;
  const denom = BILL_DENOMS.find(d => d.value === value);
  if (!denom) return;
  _payState.paid += value;
  _spawnBillPlane(denom);
};

// ── vrFinishPay: Squeeze يسار — احسب الباقي وانهي الدفع ─────────────────────
window.vrFinishPay = function() {
  if (!_payState.active) return;

  const paid  = _payState.paid;
  const total = _payState.total;

  if (paid < total) {
    playSFX('lose');
    return;
  }

  _payState.active = false;
  _clearBillPlanes();

  const items = _payState.items;
  const change = paid - total;

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

  setTimeout(() => {
    window._lastCartCount = items.length;
    window.cartItems = [];
    _paying = false;

    if (change > 0) {
      playSFX('much');
      setTimeout(() => {
        _showChange(change, () => {
          _payState.paid = 0;
          window.hasPaid = true;
        });
      }, 500);
    } else {
      playSFX('much');
      _payState.paid = 0;
      window.hasPaid = true;
    }

  }, items.length * 250 + 500);
};

// Expose globally
window.grabNearestProduct = grabAndAddToCart;
window.addToCart          = addToCart;
window.throwItem          = throwItem;
window.grabCart           = grabCart;
window.dropCart           = dropCart;
window.payAtCashier       = payAtCashier;

console.log('✅ interactions.js جاهز — VR Only, No UI');
