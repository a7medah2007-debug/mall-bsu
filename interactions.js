'use strict';

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
  _loadSFX('loss',  SOUNDS.loss);
  _loadSFX('more',  SOUNDS.much);
}

function playSFX(key) {
  try {
    const s = _sfx[key];
    if (!s) return;
    if (s.isPlaying) s.stop();
    s.play();
  } catch(e) {}
}

if (window.scene?.isReady()) _initSFX();
else window.scene?.onReadyObservable?.addOnce(() => _initSFX());
setTimeout(_initSFX, 800);

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

const _hR = new BABYLON.Vector3();

function updateHeldItem() {
  const item = window.heldItem;
  if (!item) return;
  if (window._inVR && item.parent) {
    return;
  }
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

const GRAB_SQ      = 9;
const GRAB_CART_SQ = 25;

let _grabLock = false;

function grabNearestProduct() {
  if (window.heldItem) return;
  if (_grabLock) return;
  _grabLock = true;
  setTimeout(() => { _grabLock = false; }, 150);

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

  playSFX('grab');
}

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
  window._handMoney = 0;
  window._handNoteValues = [];

  playSFX('throw');
}

function addToCart() {
  const product = window.heldItem;
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
  const cartBaseY = (window.attachedCart?.position.y ?? 0) + 0.1;

  const halfWidth  = 0.1;
  const halfDepth  = 0.4;

  const offsetX = (Math.random() - 0.5) * 2 * halfWidth;
  const offsetZ = (Math.random() - 0.5) * 2 * halfDepth;

  const stackLevel = Math.floor(Math.random() * 3);
  const productHeight = 0.1;
  const offsetY = stackLevel * productHeight + Math.random() * .1;

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

  origRef.metadata.inCart      = true;
  origRef.metadata._cartVisual = product;

  window.cartItems.push(origRef);
  window.heldItem = null;

  playSFX('cash');
}

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

let _cartLock = false;

function grabCart() {
  if (window.attachedCart) return;
  if (_cartLock) return;
  _cartLock = true;
  setTimeout(() => { _cartLock = false; }, 150);
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

if (typeof window._handMoney === 'undefined') {
    window._handMoney = 0;
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

    if (window.heldItem) {
        throwItem();
    }

    const note = await window.loadModel(
        noteConfig.model,
        [0, 0, 0],
        [0, 0, 0],
        [0.5, 0.5, 0.5]
    );

    if (!note) return;

    note.metadata = {
        isBanknote: true,
        value: noteConfig.value,
        isHeld: true
    };

    if (window._inVR && window._rightGrip) {
        note.parent = window._rightGrip;
        note.position.set(0, -0.05, 0.15);
        note.rotation = BABYLON.Vector3.Zero();
    }

    window.heldItem = note;
    window._handMoney = value;
    window._handNoteValues = [value];

    playSFX('cash');
}

function payWithNotes() {
    const total = (window.cartItems ?? []).reduce((s, i) => s + (i.metadata?.price ?? 0), 0);

    if (total === 0) return;
    if (!window.cashier) return;
    if (window.hasPaid) return;
    if (window._handMoney <= 0) return;

    const held = window.heldItem;
    if (!held?.metadata?.isBanknote) return;

    const value = window._handMoney;

    if (value < total) {
        playSFX('loss');
        return;
    }

    if (value === total) {
        completePayment(value, total, 0);
        return;
    }

    if (value > total) {
        const change = value - total;
        playSFX('more');
        setTimeout(() => {
            spawnChangeModels(change);
            completePayment(value, total, change);
        }, 5000);
    }
}

function completePayment(paid, total, change) {
    window.cartItems = [];
    window.hasPaid = true;

    const held = window.heldItem;
    if (held) {
        if (held.parent) {
            held.setParent(null);
        }
        held.dispose();
        window.heldItem = null;
    }

    window._handMoney = 0;
    window._handNoteValues = [];

    playSFX('cash');
}

async function spawnChangeModels(change) {
    if (!window.cashier || change <= 0) return;

    const cashierPos = window.cashier.position.clone();
    const spawnBase = new BABYLON.Vector3(
        cashierPos.x,
        cashierPos.y + 0.2,
        cashierPos.z + 0.3
    );

    let remaining = change;
    const notesToSpawn = [];

    while (remaining >= 20) { notesToSpawn.push(20); remaining -= 20; }
    while (remaining >= 10) { notesToSpawn.push(10); remaining -= 10; }
    while (remaining >= 5)  { notesToSpawn.push(5);  remaining -= 5;  }

    for (let i = 0; i < notesToSpawn.length; i++) {
        const value = notesToSpawn[i];
        const modelPath = `assets/models/${value}.glb`;

        try {
            const note = await window.loadModel(modelPath, [0, 0, 0], [0, 0, 0], [1, 1, 1]);
            if (!note) continue;

            const offsetX = (i % 3 - 1) * 0.3;
            const offsetZ = Math.floor(i / 3) * 0.2;
            const offsetY = Math.floor(i / 3) * 0.1;

            note.position = new BABYLON.Vector3(
                spawnBase.x + offsetX,
                spawnBase.y + offsetY,
                spawnBase.z + offsetZ
            );
            note.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);
            note.metadata = { isChangeNote: true, value: value };
        } catch (err) {}
    }
}

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
