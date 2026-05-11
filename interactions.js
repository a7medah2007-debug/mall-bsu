// ========== interactions.js — Supermarket VR (Complete Rebuild) ==========

'use strict';

// ── Sounds ────────────────────────────────────────────────────────────────────
const _sfx = {};

function _loadSFX(key, path) {
  if (!path || _sfx[key]) return;
  try {
    _sfx[key] = new BABYLON.Sound(key, path, window.scene, null, {
      autoplay: false, spatialSound: false, volume: 0.9,
    });
  } catch(e) {
    console.warn(`⚠️ صوت: ${path}`);
  }
}

function _initSFX() {
  if (typeof SOUNDS === 'undefined') return;
  _loadSFX('cash',  SOUNDS.cash);
  _loadSFX('grab',  SOUNDS.space);
  _loadSFX('throw', SOUNDS.loss);
  _loadSFX('lose',  SOUNDS.loss);
  _loadSFX('much',  SOUNDS.much);
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
  
  // الاتجاه الأساسي من الكاميرا
  const rawForward = cam.getDirection(BABYLON.Vector3.Forward()).clone();
  
  // ✅ عكس الاتجاه لأن Babylon Right-Handed يعطينا اتجاه الكاميرا الداخلي
  // بينما نريد الاتجاه الذي "يخرج" من الكاميرا (أي أمام اللاعب)
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

// ── Info Panel ────────────────────────────────────────────────────────────────
function _updatePanel() {
  const el = document.getElementById('info-panel');
  if (!el) return;
  const total = (window.cartItems ?? []).reduce((s, i) => s + (i.metadata?.price ?? 0), 0);
  el.textContent = `🛒 ${window.cartItems.length} منتج  |  💰 ${total} جنيه`;
}

function notify(txt, dur = 3000) {
  window.showVRMessage?.(txt, dur);
}

// ── Held Item Update ──────────────────────────────────────────────────────────
const _hR = new BABYLON.Vector3();

function updateHeldItem() {
  const item = window.heldItem;
  if (!item) return;
  // ✅ في VR المنتج مربوط باليد، فلا حاجة لتحديث موقعه يدويًا
  if (window._inVR && item.parent) {
    return;
  }
  // باقي الكود لـ Desktop...
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

// ✅ المسافة القصوى المسموحة بين السلة والمنتج لتفعيل الإضافة التلقائية
const AUTO_CART_MAX_DIST    = 3;                          // 1.5 متر
const AUTO_CART_MAX_DIST_SQ = AUTO_CART_MAX_DIST * AUTO_CART_MAX_DIST;

function grabNearestProduct() {
  if (window.heldItem) { notify('📦 ارمي اللي معاك الأول!'); return; }

  const cp = _camPos();
  let nearest = null, bestSq = GRAB_SQ;

  for (const p of window.allProducts ?? []) {
    if (p.metadata?.inCart) continue;
    const pos = p.position;
    if (!pos) continue;
    const dSq = BABYLON.Vector3.DistanceSquared(cp, pos);
    if (dSq < bestSq) { bestSq = dSq; nearest = p; }
  }

  if (!nearest) { notify('❌ مافيش منتج قريب — اقترب من الرفوف'); return; }

  if (!nearest.metadata) nearest.metadata = {};
  nearest.metadata.originalPosition ??= nearest.position.clone();
  nearest.metadata.originalRotation ??= (nearest.rotation?.clone() ?? BABYLON.Vector3.Zero());

  if (nearest.isThinInstance && nearest.sourceMesh) {
    // Thin Instance: نخفيها ونعمل instance للـ visual
    nearest.sourceMesh.thinInstanceSetMatrixAt(
      nearest.thinIndex,
      BABYLON.Matrix.Zero(),
      true
    );
    const vis = nearest.sourceMesh.createInstance(`held_ti_${nearest.thinIndex}`);
    vis.position.copyFrom(nearest.position);
    // ✅ نطبق الـ scale الصح من الـ metadata عشان المنتج يظهر بحجمه الطبيعي
    const os = nearest.metadata?.originalScale;
    if (os) vis.scaling.copyFrom(os);
    vis.metadata = { ...nearest.metadata, _isThinVis: true, _origRef: nearest };
    window.heldItem = vis;
  } else {
    window.heldItem = nearest;
  }

  // ✅ في VR، ألصق المنتج بقبضة اليد اليمنى
  if (window._inVR && window._rightGrip) {
    const item = window.heldItem;
    // نفصل أي أب قديم (احتياطي)
    if (item.parent) {
      item.computeWorldMatrix(true);
      item.setParent(null);
    }
    // نجعله ابنًا للقبضة
    item.setParent(window._rightGrip);
    // موضع محلي مريح: أمام القبضة بـ 15 سم، وأسفل قليلاً 5 سم
    item.position.set(0, -0.05, 0.15);
    // نضمن دوران محايد
    item.rotation = BABYLON.Vector3.Zero();
    // لا نستخدم setPreTransformMatrix لأن position المباشر يكفي
  } else {
    // في الـ Desktop، نفضل السلوك اليدوي (قدام الكاميرا)
    // لا نفعل شيئًا إضافيًا
  }

  playSFX('grab');
  notify('✅ تم المسك! المنتج في يدك — Trigger → سلة  |  Squeeze → ارمي');
}

// ── Throw / Return ────────────────────────────────────────────────────────────
function throwItem() {
  const item = window.heldItem;
  if (!item) { notify('مش ماسك أي حاجة!'); return; }

  // ✅ فك الارتباط باليد إن كان في VR
  if (item.parent) {
    item.computeWorldMatrix(true);
    // نحفظ الموقع العالمي قبل الفصل
    const worldMatrix = item.getWorldMatrix();
    const worldPos = worldMatrix.getTranslation();
    item.setParent(null);
    item.position = worldPos;
    // ✅ setPreTransformMatrix مش موجودة على instances، فنتحقق قبل الاستدعاء
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
  notify('↩️ رجعنا المنتج لمكانه');
}

// ── Add To Cart ───────────────────────────────────────────────────────────────
// ✅ يستقبل المنتج اختياريًا (للسلوك التلقائي الجديد).
//    لو ما تم تمرير منتج، يرجع للسلوك القديم: يستخدم heldItem.
function addToCart(productArg) {
  const product = productArg ?? window.heldItem;
  if (!product) { notify('اقترب من منتج وامسكه الأول!'); return; }

  const origRef = product.metadata?._origRef ?? product;
  if (origRef.metadata?.inCart) { notify('ده موجود في السلة!'); return; }

  // ✅ فك المنتج من اليد (إن كان مربوطًا) قبل وضعه في السلة
  if (product.parent) {
    product.computeWorldMatrix(true);
    const worldPos = product.getWorldMatrix().getTranslation();
    product.setParent(null);
    product.position = worldPos;
    // ✅ setPreTransformMatrix مش موجودة على instances، فنتحقق قبل الاستدعاء
    if (typeof product.setPreTransformMatrix === 'function') {
      product.setPreTransformMatrix(null);
    }
  }

  const cartPos = _getCartPos();
  const cartBaseY = (window.attachedCart?.position.y ?? 0) + 1.2;

  const halfWidth  = 0.1;
  const halfDepth  = 0.8;

  // ✅ توليد إزاحة عشوائية داخل حدود السلة
  const offsetX = (Math.random() - 0.5) * 2 * halfWidth;
  const offsetZ = (Math.random() - 0.5) * 2 * halfDepth;

  // ✅ محاكاة التكديس: احتمالية وضع المنتج فوق غيره (طبقة عليا)
  const stackLevel = Math.floor(Math.random() * 3); // 0, 1, أو 2 (أقصى تكديس 3 طبقات)
  const productHeight = 0.25; // الارتفاع التقريبي للمنتج وهو نائم
  const offsetY = stackLevel * productHeight + Math.random() * 1.0;

  // ✅ جعل المنتج نائمًا (يدور 90 درجة) لو كان قائمًا
  // معظم النماذج الافتراضية تكون قائمة على المحور Y، فنديرها حول X أو Z.
  product.rotation.x = Math.PI / 2;  // يصبح مستلقيًا أفقيًا
  product.rotation.y = Math.random() * Math.PI * 2; // دوران عشوائي حول المحور الرأسي للتنويع
  product.rotation.z = 0;

  // ✅ تعيين الموضع
  product.position.set(
    cartPos.x + offsetX,
    cartBaseY + offsetY,
    cartPos.z + offsetZ
  );

  // ✅ تخزين الإزاحة في بيانات المنتج الأصلية لاستخدامها لاحقًا
  if (!origRef.metadata) origRef.metadata = {};
  origRef.metadata._cartOffset = { x: offsetX, y: offsetY, z: offsetZ };
  origRef.metadata._cartRotation = {
    x: product.rotation.x,
    y: product.rotation.y,
    z: product.rotation.z
  };

  // تحديث visual المؤقت
  origRef.metadata._cartVisual = product;
  // إزالة السطر المكرر: product.rotation.y = Math.random() * Math.PI * 2;

  if (!origRef.metadata) origRef.metadata = {};
  origRef.metadata.inCart      = true;
  origRef.metadata._cartVisual = product;

  window.cartItems.push(origRef);
  // ✅ امسح heldItem فقط لو كان هو فعلاً المنتج اللي اتضاف
  if (window.heldItem === product) {
    window.heldItem = null;
  }

  _updatePanel();
  playSFX('cash');
  notify(`🛒 اتضاف!  السلة: ${window.cartItems.length} منتج`);
}

// ── Grab & Auto-Add (نسخة تلقائية: تمسك المنتج وتضيفه للسلة فورًا) ───────────
// ✅ هذه الدالة هي البديل عن مزيج (grab → addToCart)
//    تتحقق من:
//      1. وجود سلة متصلة (window.attachedCart)
//      2. أن أقرب منتج للسلة على مسافة ≤ AUTO_CART_MAX_DIST (1.5م)
//    لو الشرط مش متحقق، الضغطة تُتجاهل (مع رسالة توضيحية).
function grabAndAddToCart() {
  // 1️⃣ تأكد إن في سلة متصلة
  const cart = window.attachedCart;
  if (!cart) {
    notify('🛒 لازم تمسك عربة الأول!');
    return;
  }

  // 2️⃣ لو ماسك حاجة في إيدك بالفعل، نضيفها للسلة بالسلوك القديم
  if (window.heldItem) {
    addToCart();
    return;
  }

  // 3️⃣ دور على أقرب منتج للسلة (مش للكاميرا)
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

  // 4️⃣ لو مفيش منتج في النطاق → اتجاهل الضغطة
  if (!nearest) {
    notify(`❌ قرّب السلة من المنتج (أقل من ${AUTO_CART_MAX_DIST} متر)`);
    return;
  }

  // 5️⃣ خزّن البيانات الأصلية للمنتج (للرجوع لاحقًا لو احتجنا)
  if (!nearest.metadata) nearest.metadata = {};
  nearest.metadata.originalPosition ??= nearest.position.clone();
  nearest.metadata.originalRotation ??= (nearest.rotation?.clone() ?? BABYLON.Vector3.Zero());

  // 6️⃣ تعامل مع الـ Thin Instances (لو كان المنتج منهم)
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

  // 7️⃣ شغّل صوت الالتقاط (اختياري — يدّي إحساس باللي حصل)
  playSFX('grab');

  // 8️⃣ ضيف المنتج للسلة مباشرة
  addToCart(productToAdd);
}
window.grabAndAddToCart = grabAndAddToCart;

// ── Cart Items Update ─────────────────────────────────────────────────────────
function updateCartItems() {
  const cart = window.attachedCart;
  if (!cart || !window.cartItems?.length) return;
  const cx = cart.position.x, cy = cart.position.y + 2.0, cz = cart.position.z;
  const n  = window.cartItems.length;
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const v = window.cartItems[i].metadata?._cartVisual;
    if (!v) continue;
    // ✅ كل منتج يحتفظ بموقعه النسبي العشوائي جوه السلة
    // لو المنتج لسه متضاف جديد هنعطيه موقع عشوائي، لو موجود هنحافظ عليه
    const productRef = window.cartItems[i];
    if (!productRef?.metadata) continue;

    // استرجاع الإزاحة والدوران المخزنين من المنتج الأصلي
    const off = productRef.metadata._cartOffset;
    const rot = productRef.metadata._cartRotation;
    if (!off) continue;

    v.position.set(
      cart.position.x + off.x,
      cart.position.y + 1.2 + off.y,   // لاحظ: cartBaseY = cart.position.y + 1.2
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
  if (window.attachedCart) { notify('ممسك بعربة بالفعل!'); return; }
  const cp = _camPos();
  let nearest = null, bestSq = GRAB_CART_SQ;
  for (const c of window.allCarts ?? []) {
    const dSq = BABYLON.Vector3.DistanceSquared(cp, c.position);
    if (dSq < bestSq) { bestSq = dSq; nearest = c; }
  }
  if (!nearest) { notify('مافيش عربة قريبة!'); return; }

  // ✅ انقل العربة قدامك فور الإمساك
  const camDir = _camDir();
  camDir.y = 0;
  camDir.normalizeToRef(camDir);
  
  nearest.position.x = cp.x + camDir.x * 1.5;
  nearest.position.z = cp.z + camDir.z * 1.5;
  nearest.position.y = 0.2;
  nearest.rotation.y = Math.atan2(camDir.x, camDir.z);

  window.attachedCart = nearest;
  playSFX('grab');
  notify('🛒 ماسك العربة — تحرك وهي هتيجي معاك');
}

function dropCart() {
  if (!window.attachedCart) { notify('مش ماسك عربة!'); return; }
  window.attachedCart = null;
  notify('📍 سبت العربة');
}

// ── Pay At Cashier ────────────────────────────────────────────────────────────
let _paying = false;

// إحداثيات ترابيزة الكاشير + الفئات (مشتركة مع main.js)
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

// ── إنشاء ورقة على الترابيزة ──────────────────────────────────────────────────
function _spawnBillPlane(denom) {
  const idx = BILL_DENOMS.findIndex(d => d.value === denom.value);
  if (idx >= 0) window.spawnBillOnTable?.(idx);
}

// ── حذف كل الأوراق ────────────────────────────────────────────────────────────
function _clearBillPlanes() {
  window.clearBillsFromTable?.();
}

// ── إيقاف العداد ──────────────────────────────────────────────────────────────
function _stopPayTimer() {
  if (_payState.timer) { clearInterval(_payState.timer); _payState.timer = null; }
}

// ── بدء عداد الـ 15 ثانية ─────────────────────────────────────────────────────
function _startPayTimer() {
  _payState.countdown = 15;
  _payState.timer = setInterval(() => {
    _payState.countdown--;
    if (_payState.countdown <= 0) _onPayTimeout();
  }, 1000);
}

// ── منطق انتهاء المهلة ────────────────────────────────────────────────────────
function _onPayTimeout() {
  _stopPayTimer();
  _payState.active = false;

  const paid  = _payState.paid;
  const total = _payState.total;
  const diff  = paid - total;

  // ناقص — صوت رفض + ريست + ابدأ من أول
  if (paid < total) {
    playSFX('lose');
    _clearBillPlanes();
    _payState.paid   = 0;
    _payState.active = true;
    _startPayTimer();
    return;
  }

  // مظبوط أو زيادة — نسحب الفلوس
  _clearBillPlanes();

  if (diff === 0) {
    playSFX('cash');
    _finishPayment(total, 0);
  } else {
    playSFX('much');
    _showChange(diff, () => _finishPayment(total, diff));
  }
}

// ── إظهار الباقي (الفكة) على الترابيزة ───────────────────────────────────────
function _showChange(amount, onDone) {
  playSFX('cash');

  let remaining = amount;
  const sorted  = [...BILL_DENOMS].sort((a, b) => b.value - a.value);
  const toSpawn = [];

  for (const d of sorted) {
    while (remaining >= d.value) { toSpawn.push(d); remaining -= d.value; }
  }

  // نظهرهم واحدة واحدة
  toSpawn.forEach((d, i) => {
    setTimeout(() => {
      _spawnBillPlane(d);
      // بعد آخر ورقة نفعّل loop مسك الفكة
      if (i === toSpawn.length - 1) {
        window._changeReady = true;
        window._changeOnDone = onDone;
      }
    }, i * 300);
  });

  if (toSpawn.length === 0) onDone?.();
}

// ── إتمام الدفع ───────────────────────────────────────────────────────────────
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
    window.cartItems = [...items];
    window.hasPaid   = true;
    _paying          = false;
    _payState.paid   = 0;
    _updatePanel();
    playSFX('cash');
  }, items.length * 250 + 500);
}

// ── دالة payAtCashier الرئيسية ────────────────────────────────────────────────
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

  // سحب المنتجات عند الكاشير
  items.forEach((product, idx) => {
    setTimeout(() => {
      const v = product.metadata?._cartVisual ?? product;
      if (product.metadata) product.metadata.inCart = false;
      v.position.set(
        window.cashier.position.x + (Math.random() - 0.5) * 1.5,
        window.cashier.position.y + 0.3,
        window.cashier.position.z + (Math.random() - 0.5) * 1.5
      );
    }, idx * 200);
  });

  setTimeout(() => {
    window.cartItems = [];
    _updatePanel();
    _payState.active = true;
    _payState.paid   = 0;
    _payState.total  = total;
    _payState.items  = items;
    _startPayTimer();
  }, items.length * 200 + 600);
}

// ── vrPayDenom: بيتنادى من أزرار A/B/X/Y ─────────────────────────────────────
window.vrPayDenom = function(value) {
  if (!_payState.active) return;
  const denom = BILL_DENOMS.find(d => d.value === value);
  if (!denom) return;
  _payState.paid += value;
  _spawnBillPlane(denom);
  playSFX('cash');
};

// ── Button Bindings ───────────────────────────────────────────────────────────
// ✅ زرار "امسك" دلوقتي بيعمل المسك + الإضافة للسلة في خطوة واحدة (لو ينفع)
const _actionBtns = [
  ['btn-grab-item',   grabAndAddToCart],
  ['btn-throw-item',  throwItem],
  ['btn-add-to-cart', addToCart],
  ['btn-grab-cart',   grabCart],
  ['btn-drop-cart',   dropCart],
  ['btn-pay',         payAtCashier],
];
_actionBtns.forEach(([id, fn]) => {
  document.getElementById(id)?.addEventListener('click', fn);
});

// Expose globally (for XR controller event handlers)
// ✅ grabNearestProduct بقت Alias لـ grabAndAddToCart عشان نداءات main.js
//    (للـ VR controllers) تشتغل بالسلوك التلقائي الجديد من غير ما نعدل main.js
window.grabNearestProduct = grabAndAddToCart;
window.addToCart          = addToCart;
window.throwItem          = throwItem;
window.grabCart           = grabCart;
window.dropCart           = dropCart;
window.payAtCashier       = payAtCashier;

console.log('✅ interactions.js جاهز (وضع تلقائي: مسافة 1.5م من السلة)');
