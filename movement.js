'use strict';

// ═══════════════════════════════════════════════
//  Player Input State
// ═══════════════════════════════════════════════
window.playerInput = {
  moveForward:  false,
  moveBackward: false,
  moveLeft:     false,
  moveRight:    false,
  moveUp:       false,
  moveDown:     false,
};

window.playerPos = new BABYLON.Vector3(...CAMERA.startPosition);
window.hasPaid   = false;

// ═══════════════════════════════════════════════
//  ثوابت الحركة
// ═══════════════════════════════════════════════
const _VR_FIXED_HEIGHT = (typeof CAMERA !== 'undefined' && CAMERA.vrFixedHeight) || 1.333;
const COL_DIST = 0.5;
const ACCEL    = 10;
const DECEL    = 16;

let _vx = 0, _vz = 0;
let _lastT = performance.now();

// ═══════════════════════════════════════════════
//  التصادم مع الجدران
//
//  تحسين مهم: predicate صارم يتجاهل كل حاجة
//  مش جدار — المنتجات والشخصيات وكل حاجة
//  isPickable=false مش هتتضرب بالـ ray أصلاً
// ═══════════════════════════════════════════════
const _colRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), COL_DIST);

function _colPredicate(mesh) {
  if (!mesh.isEnabled() || !mesh.isVisible) return false;
  const m = mesh.metadata;
  if (!m) return true;
  // نتجاهل كل حاجة مش جدار
  return !(
    m.isProduct    ||
    m.isWalker     ||
    m.isGuard      ||
    m.isCashier    ||
    m.isPriceBoard ||
    m.isFridge     ||
    m.isCart       ||
    m._isHeldVis   ||
    m.isBanknote   ||
    m.isChangeNote ||
    m.isStaticWalker
  );
}

function _canMove(origin, dir) {
  const len = dir.length();
  if (len < 0.0001) return true;
  _colRay.origin    = origin.clone();
  _colRay.direction = dir.scale(1 / len);
  _colRay.length    = COL_DIST;
  const hits = scene.multiPickWithRay(_colRay, _colPredicate);
  return !hits || hits.length === 0;
}

// ═══════════════════════════════════════════════
//  مساعدات
// ═══════════════════════════════════════════════
function _lookCam() {
  if (window._inVR && window._xrCamera) return window._xrCamera;
  return window.camera;
}

// Vector مُعاد استخدامه عشان نقلل الـ GC
const _fwdVec   = new BABYLON.Vector3();
const _rightVec = new BABYLON.Vector3();
const _tmpMat   = new BABYLON.Matrix();

function _getMoveDirs(cam) {
  if (window._inVR && cam.globalRotationQuaternion) {
    _fwdVec.set(0, 0, 1);
    BABYLON.Matrix.FromQuaternionToRef(cam.globalRotationQuaternion, _tmpMat);
    BABYLON.Vector3.TransformNormalToRef(_fwdVec, _tmpMat, _fwdVec);
  } else {
    cam.getDirectionToRef(BABYLON.Vector3.Forward(), _fwdVec);
  }
  _fwdVec.y = 0;
  if (_fwdVec.lengthSquared() < 0.0001) _fwdVec.set(0, 0, 1);
  _fwdVec.normalizeToRef(_fwdVec);

  BABYLON.Vector3.CrossToRef(BABYLON.Vector3.Up(), _fwdVec, _rightVec);
  _rightVec.normalizeToRef(_rightVec);

  return { fwd: _fwdVec, right: _rightVec };
}

// ═══════════════════════════════════════════════
//  حركة اللاعب
// ═══════════════════════════════════════════════
function updateMovement() {
  const now = performance.now();
  const dt  = Math.min((now - _lastT) / 1000, 0.05);
  _lastT    = now;

  const inp = window.playerInput;
  const cam = _lookCam();
  if (!cam) return;

  const { fwd, right } = _getMoveDirs(cam);

  let dx = 0, dz = 0;
  if (inp.moveForward)  { dx += fwd.x;   dz += fwd.z;   }
  if (inp.moveBackward) { dx -= fwd.x;   dz -= fwd.z;   }
  if (inp.moveRight)    { dx += right.x; dz += right.z; }
  if (inp.moveLeft)     { dx -= right.x; dz -= right.z; }

  const spd = PLAYER.moveSpeed ?? 1.667;
  const len = Math.sqrt(dx * dx + dz * dz);

  if (len > 0.0001) {
    dx /= len; dz /= len;
    _vx += (dx * spd - _vx) * Math.min(ACCEL * dt, 1);
    _vz += (dz * spd - _vz) * Math.min(ACCEL * dt, 1);
  } else {
    _vx -= _vx * Math.min(DECEL * dt, 1);
    _vz -= _vz * Math.min(DECEL * dt, 1);
  }

  const mx = _vx * dt;
  const mz = _vz * dt;

  if (window._inVR && window._xrCamera) {
    const xrCam = window._xrCamera;
    const origin = xrCam.globalPosition ?? xrCam.position;

    if (Math.abs(mx) > 0.0001) {
      if (_canMove(origin, new BABYLON.Vector3(Math.sign(mx), 0, 0)))
        xrCam.position.x += mx;
      else _vx = 0;
    }
    if (Math.abs(mz) > 0.0001) {
      if (_canMove(origin, new BABYLON.Vector3(0, 0, Math.sign(mz))))
        xrCam.position.z += mz;
      else _vz = 0;
    }

    xrCam.position.y  = _VR_FIXED_HEIGHT;
    window.playerPos.x = xrCam.position.x;
    window.playerPos.y = _VR_FIXED_HEIGHT;
    window.playerPos.z = xrCam.position.z;

  } else {
    const pos = window.camera?.position;
    if (!pos) return;

    if (Math.abs(mx) > 0.0001) {
      if (_canMove(pos, new BABYLON.Vector3(Math.sign(mx), 0, 0))) pos.x += mx;
      else _vx = 0;
    }
    if (Math.abs(mz) > 0.0001) {
      if (_canMove(pos, new BABYLON.Vector3(0, 0, Math.sign(mz)))) pos.z += mz;
      else _vz = 0;
    }

    if (inp.moveUp)   pos.y += PLAYER.verticalSpeed ?? 0.017;
    if (inp.moveDown) pos.y -= PLAYER.verticalSpeed ?? 0.017;
    if (CAMERA.heightLimit) {
      pos.y = Math.max(CAMERA.heightLimit.min, Math.min(CAMERA.heightLimit.max, pos.y));
    }
    window.playerPos.copyFrom(pos);
  }

  // ── فحص الفوز (وصل لنقطة البداية بعد الدفع) ──
  if (window.hasPaid && !window._gameEnded) {
    const gate = WALKERS?.gate;
    const px   = window.playerPos.x;
    const pz   = window.playerPos.z;
    if (gate && Math.abs(px - gate.x) < 1 && pz > gate.zMin && pz < gate.zMax) {
      _triggerWin();
    }
  }

  // ── منع العبور بدون دفع ──
  if (window.cartItems?.length > 0 && !window.hasPaid) {
    const z  = STAFF?.noPassZone;
    const px = window.playerPos.x;
    const pz = window.playerPos.z;
    if (z && px < z.xMax && px > z.xMin && pz < z.zMax && pz > z.zMin) {
      if (window._inVR && window._xrCamera) {
        window._xrCamera.position.x -= mx;
        window._xrCamera.position.z -= mz;
        window._xrCamera.position.y  = _VR_FIXED_HEIGHT;
      } else if (window.camera?.position) {
        window.camera.position.x -= mx;
        window.camera.position.z -= mz;
      }
      _vx = 0; _vz = 0;
    }
  }
}

// ═══════════════════════════════════════════════
//  تحريك السلة مع اللاعب
// ═══════════════════════════════════════════════
function updateCart() {
  const cart = window.attachedCart;
  if (!cart) return;
  const cam = _lookCam();
  if (!cam) return;

  const camPos = cam.globalPosition ?? cam.position;

  // نحسب اتجاه الكاميرا يدوياً عشان نتجنب استدعاء getDirection
  let fx = 0, fz = 1;
  if (window._inVR && cam.globalRotationQuaternion) {
    BABYLON.Matrix.FromQuaternionToRef(cam.globalRotationQuaternion, _tmpMat);
    const f = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1), _tmpMat);
    fx = f.x; fz = f.z;
  } else {
    const f = cam.getDirection(BABYLON.Vector3.Forward());
    fx = -f.x; fz = -f.z;
  }

  const fLen = Math.sqrt(fx*fx + fz*fz);
  if (fLen > 0.0001) { fx /= fLen; fz /= fLen; }

  cart.position.x = camPos.x + fx * 0.3;
  cart.position.z = camPos.z + fz * 0.3;
  cart.position.y = 0;
  cart.rotation.y = Math.atan2(fx, fz);
}

// ═══════════════════════════════════════════════
//  تحريك المشاة
// ═══════════════════════════════════════════════
let _wLast = performance.now();

function updateWalkers() {
  const ws = window.allWalkers;
  if (!ws?.length) return;

  const now = performance.now();
  const dt  = Math.min((now - _wLast) / 1000, 0.05);
  _wLast    = now;

  for (const w of ws) {
    if (!w?.metadata?.isRandomWalker) continue;
    const m = w.metadata;

    m.animGroups?.forEach(ag => { if (!ag.isPlaying) ag.play(true); });

    const tgt = m.target;
    const dx  = tgt.x - w.position.x;
    const dz  = tgt.z - w.position.z;
    const d   = Math.sqrt(dx*dx + dz*dz);

    if (d < 0.5) {
      m.target = window._rndPt(m.zone);
      continue;
    }

    const sp = m.speed * dt;
    w.position.x += (dx / d) * sp;
    w.position.z += (dz / d) * sp;
    w.rotation.y  = Math.atan2(dx, dz);
  }
}

// ═══════════════════════════════════════════════
//  تدوير الكاشير ناحية اللاعب
// ═══════════════════════════════════════════════
function updateCashier() {
  const c = window.cashier;
  if (!c) return;
  const cp = (_lookCam()?.globalPosition) ?? (_lookCam()?.position);
  if (!cp) return;
  c.rotation.y = Math.atan2(cp.x - c.position.x, cp.z - c.position.z) + Math.PI;
}

// ═══════════════════════════════════════════════
//  شاشة الفوز
// ═══════════════════════════════════════════════
function _triggerWin() {
  window._gameEnded = true;

  const gui = window._vrGUI;
  if (!gui) return;

  const overlay = new BABYLON.GUI.Rectangle('end');
  overlay.width      = '100%';
  overlay.height     = '100%';
  overlay.background = 'rgba(0,0,0,0.75)';
  overlay.thickness  = 0;
  gui.addControl(overlay);

  const card = new BABYLON.GUI.Rectangle('endCard');
  card.width        = '75%';
  card.height       = '250px';
  card.cornerRadius = 20;
  card.color        = '#FFD700';
  card.thickness    = 3;
  card.background   = '#0d1b2a';
  overlay.addControl(card);

  const stack = new BABYLON.GUI.StackPanel();
  stack.isVertical = true;
  card.addControl(stack);

  const addTxt = (txt, fs, clr) => {
    const t = new BABYLON.GUI.TextBlock();
    t.text       = txt;
    t.fontSize   = fs;
    t.color      = clr;
    t.fontWeight = 'bold';
    t.height     = `${fs + 20}px`;
    stack.addControl(t);
  };

  addTxt('🎉 شكراً لزيارتك!', 36, '#FFD700');
  addTxt(`🛒 اشتريت ${window.cartItems?.length ?? 0} منتج`, 22, '#ffffff');
  addTxt('🚪 إلى اللقاء...', 18, '#aaaaaa');

  setTimeout(() => { try { window.close(); } catch (e) {} }, 7000);
}

// ═══════════════════════════════════════════════
//  طابور الكاشير (Frozen Queue)
// ═══════════════════════════════════════════════
const FQ = window.FROZEN_QUEUE || {
  positions:  [{ x: -3.8, z: 13.2 }, { x: -3.8, z: 14.5 }, { x: -3.8, z: 16.0 }],
  serviceX:   -4.55,
  exitZ:      -2.7,
  vanishX:    -6.02,
  interval:   60000,
  walkSpeed:  1.5,
  modelPath:  null,
};

let _fqPeople     = [];
let _fqActive     = false;
let _fqNextTime   = 0;
let _fqLastUpdate = performance.now();

function initFrozenQueue() {
  const sw = window.allStaticWalkers;
  if (!sw || sw.length < 3) return;

  sw.sort((a, b) => a.position.z - b.position.z);

  _fqPeople = sw.slice(0, 3).map((mesh, i) => {
    _stopAllAnimations(mesh);
    mesh.position.set(FQ.positions[i].x, 0, FQ.positions[i].z);
    mesh.metadata = { ...(mesh.metadata || {}), isFrozenQueue: true, queueIndex: i };
    return { mesh, state: 'waiting', phase: 0, startX: 0, startZ: 0, targetX: 0, targetZ: 0, queueIndex: i };
  });

  // نتخلص من الزيادة
  for (let i = 3; i < sw.length; i++) sw[i].dispose();
  window.allStaticWalkers = sw.slice(0, 3);

  _fqActive   = true;
  _fqNextTime = performance.now() + 3000;
}

function updateFrozenQueue() {
  if (!_fqActive || !_fqPeople.length) return;

  const now = performance.now();
  const dt  = Math.min((now - _fqLastUpdate) / 1000, 0.05);
  _fqLastUpdate = now;

  if (now >= _fqNextTime) {
    const first = _fqPeople.find(p => p.state === 'waiting');
    if (first) {
      _startPersonMovement(first);
      _fqNextTime = now + FQ.interval;
    }
  }

  for (const p of _fqPeople) {
    if (p.state === 'moving') _movePersonStep(p, dt);
  }

  _shiftQueue();
}

function _startPersonMovement(person) {
  person.state   = 'moving';
  person.phase   = 1;
  person.startX  = person.mesh.position.x;
  person.startZ  = person.mesh.position.z;
  person.targetX = FQ.serviceX;
  person.targetZ = person.mesh.position.z;
  _playAnim(person.mesh, true);
}

function _movePersonStep(person, dt) {
  const mesh  = person.mesh;
  const step  = FQ.walkSpeed * dt;

  if (person.phase === 1) {
    const dx = person.targetX - mesh.position.x;
    mesh.rotation.y = -Math.PI / 2;
    if (Math.abs(dx) < step) {
      mesh.position.x = person.targetX;
      person.phase   = 2;
      person.targetZ = FQ.exitZ;
    } else {
      mesh.position.x += Math.sign(dx) * step;
    }

  } else if (person.phase === 2) {
    const dz = person.targetZ - mesh.position.z;
    mesh.rotation.y = Math.PI;
    if (Math.abs(dz) < step) {
      mesh.position.z = person.targetZ;
      person.phase   = 3;
      person.targetX = FQ.vanishX;
    } else {
      mesh.position.z += Math.sign(dz) * step;
    }

  } else if (person.phase === 3) {
    const dx = person.targetX - mesh.position.x;
    mesh.rotation.y = -Math.PI / 2;
    if (Math.abs(dx) < step) {
      mesh.setEnabled(false);
      mesh.position.set(0, -9999, 0);
      _playAnim(mesh, false);
      person.state = 'done';
      person.phase = 0;
    } else {
      mesh.position.x += Math.sign(dx) * step;
    }
  }
}

function _shiftQueue() {
  const remaining = _fqPeople.filter(p => p.state !== 'done');

  if (remaining.length === 0) {
    _fqPeople = [];
    _fqActive = false;
    setTimeout(() => _spawnEntireQueue(), 2000);
    return;
  }

  remaining.sort((a, b) => (a.mesh.position?.z ?? 9999) - (b.mesh.position?.z ?? 9999));

  for (let i = 0; i < remaining.length; i++) {
    const person    = remaining[i];
    const targetPos = FQ.positions[i];
    if (!targetPos || person.state !== 'waiting') continue;

    const dx   = targetPos.x - person.mesh.position.x;
    const dz   = targetPos.z - person.mesh.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    if (dist > 0.05) {
      person.mesh.position.x += dx * 0.15;
      person.mesh.position.z += dz * 0.15;
    } else {
      person.mesh.position.x = targetPos.x;
      person.mesh.position.z = targetPos.z;
    }
  }

  _fqPeople = remaining;
}

async function _spawnEntireQueue() {
  if (typeof WALKERS === 'undefined') return;
  const modelDef = WALKERS.models?.[0];
  if (!modelDef?.path) return;

  const folder   = modelDef.path.substring(0, modelDef.path.lastIndexOf('/') + 1);
  const filename = modelDef.path.substring(modelDef.path.lastIndexOf('/') + 1);

  // تنظيف القديم
  if (window.allStaticWalkers) {
    for (const old of window.allStaticWalkers) {
      if (old?.metadata?.isFrozenQueue) old.dispose();
    }
  }
  window.allStaticWalkers = [];
  _fqPeople = [];

  for (let i = 0; i < 3; i++) {
    const scale    = (modelDef.scaleMin ?? 0.6) + Math.random() * ((modelDef.scaleMax ?? 0.8) - (modelDef.scaleMin ?? 0.6));
    const spawnPos = FQ.positions[i];
    try {
      const result = await BABYLON.SceneLoader.ImportMeshAsync('', folder, filename, window.scene);
      const mesh   = result.meshes[0];
      if (!mesh) continue;

      mesh.position.set(spawnPos.x, 0, spawnPos.z);
      mesh.scaling.setAll(scale);
      mesh.rotation.y     = Math.PI;
      mesh.receiveShadows = false;
      mesh.isPickable     = false;
      mesh.metadata       = { isStaticWalker: true, isFrozenQueue: true, queueIndex: i };

      result.animationGroups?.forEach(ag => { ag.stop(); ag.reset(); ag.goToFrame(0); ag.pause(); });

      window.allStaticWalkers.push(mesh);
      _fqPeople.push({
        mesh, state: 'waiting', phase: 0,
        startX: 0, startZ: 0, targetX: 0, targetZ: 0, queueIndex: i,
      });
    } catch (e) {}
  }

  _fqActive     = true;
  _fqNextTime   = performance.now() + 3000;
  _fqLastUpdate = performance.now();
}

window.spawnEntireQueue = _spawnEntireQueue;

// ═══════════════════════════════════════════════
//  Animation Helpers
// ═══════════════════════════════════════════════
function _playAnim(mesh, play) {
  const ags = window.scene?.animationGroups;
  if (!ags) return;
  for (const ag of ags) {
    if (!ag.targetedAnimations) continue;
    if (ag.targetedAnimations.some(ta => _isDescendant(ta.target, mesh))) {
      if (play) { ag.reset(); ag.play(true); }
      else      { ag.stop();  ag.pause();    }
      return;
    }
  }
}

function _isDescendant(node, parent) {
  let cur = node;
  while (cur) {
    if (cur === parent) return true;
    cur = cur.parent;
  }
  return false;
}

function _stopAllAnimations(mesh) {
  _playAnim(mesh, false);
}

// ═══════════════════════════════════════════════
//  updateLoop — الـ loop الرئيسي كل إطار
// ═══════════════════════════════════════════════
window.updateLoop = function () {
  updateMovement();
  updateCart();
  updateWalkers();
  updateFrozenQueue();
  updateCashier();
  window.updateHeldItem?.();
  window.updateCartItems?.();
};

// ═══════════════════════════════════════════════
//  Exports
// ═══════════════════════════════════════════════
window.initFrozenQueue   = initFrozenQueue;
window.updateFrozenQueue = updateFrozenQueue;
window.FROZEN_QUEUE      = FQ;
