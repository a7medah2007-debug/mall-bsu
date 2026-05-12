'use strict';

window.playerInput = {
  moveForward:  false,
  moveBackward: false,
  moveLeft:     false,
  moveRight:    false,
  moveUp:       false,
  moveDown:     false,
  rotationSpeed: 2.0,
};

window.playerPos = new BABYLON.Vector3(...CAMERA.startPosition);
window.hasPaid   = false;

const COL_DIST = 0.5;
const ACCEL    = 10;
const DECEL    = 16;
let   _vx = 0, _vz = 0;
let   _lastT = performance.now();

const _VR_FIXED_HEIGHT = (typeof CAMERA !== 'undefined' && CAMERA.vrFixedHeight) || 1.7;

const _colRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Forward(), COL_DIST);

function _colPredicate(mesh) {
  if (!mesh.isEnabled() || !mesh.isVisible) return false;
  const m = mesh.metadata;
  if (!m) return true;
  return !(m.isProduct || m.isWalker || m.isGuard || m.isCashier || m.isPriceBoard || m.isFridge);
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

function _lookCam() {
  if (window._inVR && window._xrCamera) return window._xrCamera;
  return window.camera;
}

function _getMoveDirs(cam) {
  let fwd;
  if (window._inVR && cam.globalRotationQuaternion) {
    fwd = new BABYLON.Vector3(0, 0, 1);
    fwd = BABYLON.Vector3.TransformNormal(fwd, BABYLON.Matrix.FromQuaternionToRef(cam.globalRotationQuaternion, new BABYLON.Matrix()));
  } else {
    fwd = cam.getDirection(BABYLON.Vector3.Forward()).clone();
  }
  fwd.y = 0;
  if (fwd.lengthSquared() < 0.0001) fwd.set(0, 0, 1);
  fwd.normalizeToRef(fwd);

  const right = new BABYLON.Vector3();
  BABYLON.Vector3.CrossToRef(BABYLON.Vector3.Up(), fwd, right);
  right.normalizeToRef(right);

  return { fwd, right };
}

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

  const spd = PLAYER.moveSpeed ?? 3.5;
  const len = Math.sqrt(dx*dx + dz*dz);

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
      if (_canMove(origin, new BABYLON.Vector3(Math.sign(mx), 0, 0))) {
        xrCam.position.x += mx;
      } else { _vx = 0; }
    }
    if (Math.abs(mz) > 0.0001) {
      if (_canMove(origin, new BABYLON.Vector3(0, 0, Math.sign(mz)))) {
        xrCam.position.z += mz;
      } else { _vz = 0; }
    }

    xrCam.position.y = _VR_FIXED_HEIGHT;

    window.playerPos.x = xrCam.position.x;
    window.playerPos.z = xrCam.position.z;
    window.playerPos.y = _VR_FIXED_HEIGHT;

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

    if (inp.moveUp)   pos.y += PLAYER.verticalSpeed ?? 0.05;
    if (inp.moveDown) pos.y -= PLAYER.verticalSpeed ?? 0.05;
    if (CAMERA.heightLimit) {
      pos.y = Math.max(CAMERA.heightLimit.min, Math.min(CAMERA.heightLimit.max, pos.y));
    }
    window.playerPos.copyFrom(pos);
  }

  const px = window.playerPos.x;
  const pz = window.playerPos.z;

  if (window.hasPaid && !window._gameEnded) {
    const gate = WALKERS?.gate;
    if (gate && Math.abs(px - gate.x) < 1 && pz > gate.zMin && pz < gate.zMax) {
      _triggerWin();
    }
  }

  if (window.cartItems?.length > 0 && !window.hasPaid) {
    const z = STAFF?.noPassZone;
    if (z && px < z.xMax && px > z.xMin && pz < z.zMax && pz > z.zMin) {
      if (window._inVR && window._xrCamera) {
        window._xrCamera.position.x -= mx;
        window._xrCamera.position.z -= mz;
        window._xrCamera.position.y = _VR_FIXED_HEIGHT;
      } else if (window.camera?.position) {
        window.camera.position.x -= mx;
        window.camera.position.z -= mz;
      }
      _vx = 0; _vz = 0;
      const t = Date.now();
      if (!window._blockMsgT || t - window._blockMsgT > 3000) {
        window._blockMsgT = t;
        showVRMessage('🛑 ارجع ادفع الحساب الأول عند الكاشير!', 3000);
      }
    }
  }
}

function updateCart() {
  const cart = window.attachedCart;
  if (!cart) return;
  const cam = _lookCam();
  if (!cam) return;

  // ============================================================
  // مهم: نستخدم الدالة العالمية window._camDir() (المعرفة في main.js)
  // بدلاً من cam.getDirection - هذا يضمن أن العربة تسير في نفس الاتجاه
  // الذي يتوقعه interactions.js (forward معكوس بسبب useRightHandedSystem)
  // كان السبب في تحرك العربة بالاتجاه الخاطئ هو عدم توحيد هذه الدالة
  // ============================================================
  const fwd = (typeof window._camDir === 'function')
    ? window._camDir()
    : cam.getDirection(BABYLON.Vector3.Forward()).negate();
  fwd.y = 0;
  if (fwd.lengthSquared() > 0.0001) fwd.normalizeToRef(fwd);

  const camPos = cam.globalPosition ?? cam.position;
  cart.position.x = camPos.x + fwd.x * 0.5;
  cart.position.z = camPos.z + fwd.z * 0.5;
  cart.position.y = 0;
  cart.rotation.y = Math.atan2(fwd.x, fwd.z);
}

let _wLast = performance.now();
const LOD_SQ = 40 * 40;

function updateWalkers() {
  const ws = window.allWalkers;
  if (!ws?.length) return;
  const now = performance.now();
  const dt  = Math.min((now - _wLast) / 1000, 0.05);
  _wLast    = now;

  const camPos = (_lookCam()?.globalPosition) ?? (_lookCam()?.position);
  if (!camPos) return;

  for (const w of ws) {
    if (!w?.metadata) continue;
    const m = w.metadata;
    if (!m.isRandomWalker) continue;

    // ضمان أن المشاة يتحركون دائمًا (بغض النظر عن بعدهم)
    m.animGroups?.forEach(ag => { if (!ag.isPlaying) ag.play(true); });

    const tgt = m.target;
    const dx3 = tgt.x - w.position.x;
    const dz3 = tgt.z - w.position.z;
    const d = Math.sqrt(dx3 * dx3 + dz3 * dz3);
    if (d < 0.5) {
      m.target = window._rndPt(m.zone);
      continue;
    }
    const sp = m.speed * dt;
    w.position.x += (dx3 / d) * sp;
    w.position.z += (dz3 / d) * sp;
    w.rotation.y = Math.atan2(dx3, dz3);
  }
}

function updateCashier() {
  const c = window.cashier;
  if (!c) return;
  const cp = (_lookCam()?.globalPosition) ?? (_lookCam()?.position);
  if (!cp) return;
  c.rotation.y = Math.atan2(cp.x - c.position.x, cp.z - c.position.z) + Math.PI;
}

function _triggerWin() {
  if (window._gameEnded) return;
  window._gameEnded = true;

  try {
    const bg = window._sfx?.background;
    if (bg && !bg.paused) bg.pause();
  } catch(e) {}

  const div = document.createElement('div');
  div.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:rgba(0,0,0,0.85);
    display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    font-family:'Cairo',sans-serif;
  `;
  div.innerHTML = `
    <div style="background:#0d1b2a; border:3px solid #FFD700; border-radius:20px; padding:40px 60px; text-align:center;">
      <div style="font-size:52px;">🎉</div>
      <div style="font-size:32px; font-weight:900; color:#FFD700; margin:10px 0;">شكراً لزيارتك!</div>
      <div style="font-size:20px; color:#fff; margin-bottom:8px;">🛒 اشتريت ${window._lastCartCount ?? 0} منتج</div>
      <div style="font-size:16px; color:#aaa;">🚪 إلى اللقاء...</div>
    </div>
  `;
  document.body.appendChild(div);
}

window.updateLoop = function () {
  updateMovement();
  updateCart();
  updateWalkers();
  updateCashier();
  updateFrozenQueue();
  window.updateHeldItem?.();
  window.updateCartItems?.();
};


// ═══════════════════════════════════════════════
//  طابور الكاشير (Frozen Queue)
// ═══════════════════════════════════════════════

const FQ = window.FROZEN_QUEUE || {
  positions: [
    { x: -3.8, z: 13.2 },
    { x: -3.8, z: 14.5 },
    { x: -3.8, z: 16.0 },
  ],
  serviceX:  -4.55,
  exitZ:     -2.7,
  vanishX:  -6.02,
  interval:  60000,
  walkSpeed: 1.5,
};

let _fqPeople   = [];
let _fqActive   = false;
let _fqNextTime = 0;
let _fqLastUpdate = performance.now();

function initFrozenQueue() {
  const sw = window.allStaticWalkers;
  if (!sw || sw.length < 3) {
    console.warn('⚠️ Frozen Queue: مفيش 3 شخصيات');
    return;
  }
  sw.sort((a, b) => a.position.z - b.position.z);
  _fqPeople = sw.slice(0, 3).map((mesh, i) => {
    _stopAnim(mesh);
    mesh.position.set(FQ.positions[i].x, 0, FQ.positions[i].z);
    mesh.metadata = mesh.metadata || {};
    mesh.metadata.isFrozenQueue = true;
    mesh.metadata.queueIndex = i;
    return { mesh, state: 'waiting', phase: 0, startX: 0, startZ: 0, targetX: 0, targetZ: 0, queueIndex: i };
  });
  if (sw.length > 3) for (let i = 3; i < sw.length; i++) sw[i].dispose();
  window.allStaticWalkers = sw.slice(0, 3);
  _fqActive = true;
  _fqNextTime = performance.now() + 3000;
  console.log('✅ Frozen Queue جاهز');
}

function updateFrozenQueue() {
  if (!_fqActive || _fqPeople.length === 0) return;
  const now = performance.now();
  if (now >= _fqNextTime) {
    const first = _fqPeople.find(p => p.state === 'waiting');
    if (first) { _startPerson(first); _fqNextTime = now + FQ.interval; }
  }
  const dt = Math.min((now - _fqLastUpdate) / 1000, 0.05);
  _fqLastUpdate = now;
  for (const p of _fqPeople) { if (p.state === 'moving') _movePerson(p, dt); }
  _shiftQueue();
}

function _startPerson(person) {
  person.state = 'moving'; person.phase = 1;
  person.startX = person.mesh.position.x;
  person.startZ = person.mesh.position.z;
  person.targetX = FQ.serviceX;
  person.targetZ = person.startZ;
  _playAnim(person.mesh, true);
}

function _movePerson(person, dt) {
  const mesh = person.mesh;
  const step = FQ.walkSpeed * dt;
  if (person.phase === 1) {
    const dx = person.targetX - mesh.position.x;
    mesh.rotation.y = -Math.PI / 2;
    if (Math.abs(dx) < step) { mesh.position.x = person.targetX; person.phase = 2; person.targetZ = FQ.exitZ; }
    else mesh.position.x += Math.sign(dx) * step;
  } else if (person.phase === 2) {
    const dz = person.targetZ - mesh.position.z;
    mesh.rotation.y = Math.PI;
    if (Math.abs(dz) < step) { mesh.position.z = person.targetZ; person.phase = 3; person.targetX = FQ.vanishX; }
    else mesh.position.z += Math.sign(dz) * step;
  } else if (person.phase === 3) {
    const dx = person.targetX - mesh.position.x;
    mesh.rotation.y = -Math.PI / 2;
    if (Math.abs(dx) < step) {
      mesh.setEnabled(false); mesh.position.set(0, -9999, 0);
      _stopAnim(mesh); person.state = 'done'; person.phase = 0;
    } else mesh.position.x += Math.sign(dx) * step;
  }
}

function _shiftQueue() {
  const remaining = _fqPeople.filter(p => p.state !== 'done');
  if (remaining.length === 0) {
    _fqPeople = []; _fqActive = false;
    setTimeout(() => _spawnQueue(), 20000);
    return;
  }
  remaining.sort((a, b) => (a.mesh.position?.z ?? 9999) - (b.mesh.position?.z ?? 9999));
  for (let i = 0; i < remaining.length; i++) {
    const person = remaining[i];
    const tp = FQ.positions[i];
    if (!tp || person.state !== 'waiting') continue;
    const dx = tp.x - person.mesh.position.x;
    const dz = tp.z - person.mesh.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist > 0.05) { person.mesh.position.x += dx * 0.15; person.mesh.position.z += dz * 0.15; }
    else { person.mesh.position.x = tp.x; person.mesh.position.z = tp.z; }
  }
  _fqPeople = remaining;
}

function _spawnQueue() {
  if (typeof WALKERS === 'undefined') return;
  const modelDef = WALKERS.models?.[0];
  if (!modelDef?.path) return;
  const folder   = modelDef.path.substring(0, modelDef.path.lastIndexOf('/') + 1);
  const filename = modelDef.path.substring(modelDef.path.lastIndexOf('/') + 1);
  const promises = [];
  for (let i = 0; i < 3; i++) {
    const scale = (modelDef.scaleMin ?? 0.6) + Math.random() * ((modelDef.scaleMax ?? 0.8) - (modelDef.scaleMin ?? 0.6));
    const sp = FQ.positions[i];
    promises.push(
      BABYLON.SceneLoader.ImportMeshAsync('', folder, filename, window.scene).then((result) => {
        const mesh = result.meshes[0];
        if (!mesh) return null;
        mesh.position.set(sp.x, 0, sp.z);
        mesh.scaling.setAll(scale);
        mesh.rotation.y = Math.PI;
        mesh.receiveShadows = false;
        mesh.isPickable = false;
        mesh.metadata = { isStaticWalker: true, isFrozenQueue: true, queueIndex: i };
        result.animationGroups?.forEach(ag => { ag.stop(); ag.reset(); ag.goToFrame(0); ag.pause(); });
        return { mesh, state: 'waiting', phase: 0, startX: 0, startZ: 0, targetX: 0, targetZ: 0, queueIndex: i };
      })
    );
  }
  Promise.all(promises).then((people) => {
    if (window.allStaticWalkers) for (const old of window.allStaticWalkers) { if (old?.metadata?.isFrozenQueue) old.dispose(); }
    _fqPeople = people.filter(p => p !== null);
    window.allStaticWalkers = _fqPeople.map(p => p.mesh);
    _fqActive = true;
    _fqNextTime = performance.now() + 3000;
    _fqLastUpdate = performance.now();
  });
}

function _playAnim(mesh, play) {
  const ags = window.scene?.animationGroups || [];
  for (const ag of ags) {
    if (!ag.targetedAnimations) continue;
    if (ag.targetedAnimations.some(ta => _isDesc(ta.target, mesh))) {
      if (play) { ag.reset(); ag.play(true); } else { ag.stop(); ag.pause(); }
      return;
    }
  }
}

function _stopAnim(mesh) { _playAnim(mesh, false); }

function _isDesc(node, parent) {
  let cur = node;
  while (cur) { if (cur === parent) return true; cur = cur.parent; }
  return false;
}

window.initFrozenQueue  = initFrozenQueue;
window.FROZEN_QUEUE     = FQ;

document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  switch (k) {
    case 'w': case 'arrowup':    window.playerInput.moveForward  = true; break;
    case 's': case 'arrowdown':  window.playerInput.moveBackward = true; break;
    case 'a': case 'arrowleft':  window.playerInput.moveLeft     = true; break;
    case 'd': case 'arrowright': window.playerInput.moveRight    = true; break;
    case 'q':                    window.playerInput.moveUp       = true; break;
    case 'e':                    window.playerInput.moveDown     = true; break;
  }
});
document.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  switch (k) {
    case 'w': case 'arrowup':    window.playerInput.moveForward  = false; break;
    case 's': case 'arrowdown':  window.playerInput.moveBackward = false; break;
    case 'a': case 'arrowleft':  window.playerInput.moveLeft     = false; break;
    case 'd': case 'arrowright': window.playerInput.moveRight    = false; break;
    case 'q':                    window.playerInput.moveUp       = false; break;
    case 'e':                    window.playerInput.moveDown     = false; break;
  }
});

let _tSX = 0, _tSY = 0;
document.addEventListener('touchstart', (e) => {
  if (e.target.closest('.ui-btn, #ui-overlay, #action-panel, .dpad-btn, #dpad, #height-btns')) return;
  _tSX = e.touches[0]?.clientX ?? 0;
  _tSY = e.touches[0]?.clientY ?? 0;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.ui-btn, #ui-overlay, #action-panel, .dpad-btn, #dpad, #height-btns')) return;
  if (window._inVR || e.touches.length !== 1) return;
  e.preventDefault();
  const cam = window.camera;
  if (!cam) return;
  const dx = e.touches[0].clientX - _tSX;
  const dy = e.touches[0].clientY - _tSY;
  cam.rotation.y += dx * 0.005;
  cam.rotation.x  = Math.max(-Math.PI/3, Math.min(Math.PI/3, cam.rotation.x + dy * 0.005));
  _tSX = e.touches[0].clientX;
  _tSY = e.touches[0].clientY;
}, { passive: false });

let _mDown = false, _mX = 0, _mY = 0;
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('.ui-btn, #ui-overlay, #action-panel, button, .dpad-btn')) return;
  _mDown = true; _mX = e.clientX; _mY = e.clientY;
});
document.addEventListener('mousemove', (e) => {
  if (!_mDown || window._inVR) return;
  const cam = window.camera;
  if (!cam) return;
  cam.rotation.y += (e.clientX - _mX) * 0.002;
  cam.rotation.x  = Math.max(-Math.PI/3, Math.min(Math.PI/3, cam.rotation.x + (e.clientY - _mY) * 0.002));
  _mX = e.clientX; _mY = e.clientY;
});
document.addEventListener('mouseup', () => { _mDown = false; });

window._keyboardForward = false; window._keyboardBackward = false;
window._keyboardLeft = false; window._keyboardRight = false;
window._keyboardUp = false; window._keyboardDown = false;
window._snapTurnCooldown = false;

function _updateVRJoysticks() {
    if (!window._inVR) return;

    const session = navigator.xr?.session;
    if (!session?.inputSources) return;

    let leftX = 0, leftY = 0;
    let rightX = 0, rightY = 0;

    for (const source of session.inputSources) {
        if (!source.gamepad) continue;
        const axes = source.gamepad.axes;
        if (axes.length >= 4) {
            if (source.handedness === 'left') {
                leftX = axes[2] || 0;
                leftY = axes[3] || 0;
            } else if (source.handedness === 'right') {
                rightX = axes[2] || 0;
                rightY = axes[3] || 0;
            }
        }
    }

    const deadzone = 0.2;

    const leftXActive = Math.abs(leftX) > deadzone;

    window.playerInput.moveUp   = false;
    window.playerInput.moveDown = false;

    if (leftXActive && !window._snapTurnCooldown) {
        const angle = leftX > 0 ? -Math.PI / 4 : Math.PI / 4;
        window._applySnapTurn?.(angle);
        window._snapTurnCooldown = true;
        setTimeout(() => { window._snapTurnCooldown = false; }, PLAYER.snapCooldown || 300);
    }

    const rightYActive = Math.abs(rightY) > deadzone;
    const rightXActive = Math.abs(rightX) > deadzone;

    window.playerInput.moveForward  = rightYActive && rightY < -deadzone;
    window.playerInput.moveBackward = rightYActive && rightY > deadzone;
    window.playerInput.moveRight    = rightXActive && rightX > deadzone;
    window.playerInput.moveLeft     = rightXActive && rightX < -deadzone;

    if (!rightYActive && !window._keyboardForward && !window._keyboardBackward) {
        window.playerInput.moveForward = false;
        window.playerInput.moveBackward = false;
    }
    if (!rightXActive && !window._keyboardLeft && !window._keyboardRight) {
        window.playerInput.moveLeft = false;
        window.playerInput.moveRight = false;
    }
}

window._originalUpdateMovement = window.updateMovement;
window.updateMovement = function() {
    _updateVRJoysticks();
    if (window._originalUpdateMovement) window._originalUpdateMovement();
};
