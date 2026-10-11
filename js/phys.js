// 物理層：包裝 Jolt Physics（單位：分米 dm、公斤 kg、秒 s）
// 呢個檔案唔依賴 three.js，可以喺 Node 直接測試。

export const LAYER = { STATIC: 0, PRIZE: 1, CLAW: 2, GHOST: 3 };
export const GRAVITY = -98.1; // dm/s²

// ---------- 細數學工具（四元數 [x,y,z,w]） ----------
export const Q = {
  id: () => [0, 0, 0, 1],
  axisAngle(ax, ay, az, a) {
    const l = Math.hypot(ax, ay, az) || 1, s = Math.sin(a / 2);
    return [ax / l * s, ay / l * s, az / l * s, Math.cos(a / 2)];
  },
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },
  rot(q, v) { // 用四元數轉向量
    const [x, y, z, w] = q, [vx, vy, vz] = v;
    const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz,
      iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
  },
  euler(x, y, z) { // XYZ 次序
    return Q.mul(Q.mul(Q.axisAngle(1, 0, 0, x), Q.axisAngle(0, 1, 0, y)), Q.axisAngle(0, 0, 1, z));
  },
  // 令本地 +Y 指向 dir
  fromUp(dx, dy, dz) {
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const d = dy;
    if (d > 0.99999) return [0, 0, 0, 1];
    if (d < -0.99999) return [1, 0, 0, 0];
    const ax = dz, ay = 0, az = -dx; // up × dir
    return Q.axisAngle(ax, ay, az, Math.acos(d));
  },
};

export class Phys {
  static async create(initJolt) {
    const J = await initJolt();
    return new Phys(J);
  }

  constructor(J) {
    this.J = J;
    const settings = new J.JoltSettings();
    settings.mMaxBodies = 4096;
    settings.mMaxBodyPairs = 16384;
    settings.mMaxContactConstraints = 8192;
    settings.mMaxWorkerThreads = 0;

    const N = 4;
    const of = new J.ObjectLayerPairFilterTable(N);
    of.EnableCollision(LAYER.STATIC, LAYER.PRIZE);
    of.EnableCollision(LAYER.PRIZE, LAYER.PRIZE);
    of.EnableCollision(LAYER.PRIZE, LAYER.CLAW);
    of.EnableCollision(LAYER.STATIC, LAYER.CLAW);
    const BP_STATIC = new J.BroadPhaseLayer(0), BP_MOVING = new J.BroadPhaseLayer(1);
    const bpi = new J.BroadPhaseLayerInterfaceTable(N, 2);
    bpi.MapObjectToBroadPhaseLayer(LAYER.STATIC, BP_STATIC);
    bpi.MapObjectToBroadPhaseLayer(LAYER.PRIZE, BP_MOVING);
    bpi.MapObjectToBroadPhaseLayer(LAYER.CLAW, BP_MOVING);
    bpi.MapObjectToBroadPhaseLayer(LAYER.GHOST, BP_MOVING);
    settings.mObjectLayerPairFilter = of;
    settings.mBroadPhaseLayerInterface = bpi;
    settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(bpi, 2, of, N);

    this.jolt = new J.JoltInterface(settings);
    J.destroy(settings);
    this.system = this.jolt.GetPhysicsSystem();
    this.bi = this.system.GetBodyInterface();

    const ps = new J.PhysicsSettings();
    ps.mNumVelocitySteps = 12;
    ps.mNumPositionSteps = 3;
    ps.mSpeculativeContactDistance = 0.03;
    ps.mPenetrationSlop = 0.01;
    ps.mMaxPenetrationDistance = 0.3;
    ps.mTimeBeforeSleep = 0.5;
    ps.mPointVelocitySleepThreshold = 0.3;
    this.system.SetPhysicsSettings(ps);
    J.destroy(ps);

    this._v = [new J.Vec3(), new J.Vec3(), new J.Vec3(), new J.Vec3()];
    this._r = [new J.RVec3(), new J.RVec3()];
    this._q = [new J.Quat(), new J.Quat()];
    this.setGravity(GRAVITY);

    // 同一件獎品嘅零件唔會互撞
    this.groupFilter = new J.GroupFilterTable(8);
    this.groupFilter.AddRef(); // 永遠保留，唔好俾佢自動釋放
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) this.groupFilter.DisableCollision(a, b);
    this.nextGroup = 1;

    this.bodies = new Set();
    this.constraints = new Set();
    this.shapeCache = new Map();
  }

  setGravity(g) { this.system.SetGravity(this.v(0, g, 0)); }
  v(x, y, z, i = 0) { const o = this._v[i]; o.Set(x, y, z); return o; }
  r(x, y, z, i = 0) { const o = this._r[i]; o.Set(x, y, z); return o; }
  q(a, i = 0) { const o = this._q[i]; o.Set(a[0], a[1], a[2], a[3]); return o; }

  // ---------- 形狀 ----------
  // desc: {t:'sphere',r} {t:'box',h:[x,y,z],cr} {t:'capsule',hh,r} {t:'cyl',hh,r,cr}
  //       {t:'taper',hh,rt,rb} {t:'hull',pts,cr} {t:'compound',parts:[{s,p,q}]}
  // 可選 density
  shapeSettings(d) {
    const J = this.J;
    let s;
    switch (d.t) {
      case 'sphere': s = new J.SphereShapeSettings(d.r); break;
      case 'box': s = new J.BoxShapeSettings(new J.Vec3(d.h[0], d.h[1], d.h[2]), d.cr ?? Math.min(0.05, Math.min(...d.h) * 0.4)); break;
      case 'capsule': s = new J.CapsuleShapeSettings(d.hh, d.r); break;
      case 'cyl': s = new J.CylinderShapeSettings(d.hh, d.r, d.cr ?? Math.min(0.05, d.r * 0.3, d.hh * 0.3)); break;
      case 'taper': s = new J.TaperedCapsuleShapeSettings(d.hh, d.rt, d.rb); break;
      case 'hull': {
        s = new J.ConvexHullShapeSettings();
        for (const p of d.pts) s.mPoints.push_back(new J.Vec3(p[0], p[1], p[2]));
        s.mMaxConvexRadius = d.cr ?? 0.03;
        break;
      }
      case 'compound': {
        s = new J.StaticCompoundShapeSettings();
        for (const part of d.parts) {
          const child = this.shapeSettings(part.s);
          const p = part.p || [0, 0, 0], q = part.q || [0, 0, 0, 1];
          s.AddShape(new J.Vec3(p[0], p[1], p[2]), new J.Quat(q[0], q[1], q[2], q[3]), child, 0);
        }
        break;
      }
      default: throw new Error('unknown shape ' + d.t);
    }
    if (d.density != null && s.mDensity !== undefined) s.mDensity = d.density;
    if (d.t !== 'compound' && d.p && d.t !== 'compound') {
      // 位移/旋轉包裝
      const q = d.q || [0, 0, 0, 1];
      s = new J.RotatedTranslatedShapeSettings(new J.Vec3(d.p[0], d.p[1], d.p[2]), new J.Quat(q[0], q[1], q[2], q[3]), s);
    }
    return s;
  }

  shape(d) {
    const key = JSON.stringify(d);
    let sh = this.shapeCache.get(key);
    if (!sh) {
      const res = this.shapeSettings(d).Create();
      if (res.HasError()) throw new Error('shape error: ' + res.GetError().c_str());
      sh = res.Get();
      sh.AddRef();
      this.shapeCache.set(key, sh);
    }
    return sh;
  }

  // ---------- 剛體 ----------
  // o: {shape(desc), pos, rot, motion:'static'|'dynamic'|'kinematic', layer, friction, restitution,
  //     linDamp, angDamp, mass, ccd, group:[gid,sub], sleep, gravity, maxAngVel}
  body(o) {
    const J = this.J;
    const motion = o.motion || 'dynamic';
    const mt = motion === 'static' ? J.EMotionType_Static : motion === 'kinematic' ? J.EMotionType_Kinematic : J.EMotionType_Dynamic;
    const layer = o.layer ?? (motion === 'static' ? LAYER.STATIC : LAYER.PRIZE);
    const p = o.pos || [0, 0, 0], q = o.rot || [0, 0, 0, 1];
    const bcs = new J.BodyCreationSettings(this.shape(o.shape), this.r(p[0], p[1], p[2]), this.q(q), mt, layer);
    bcs.mFriction = o.friction ?? 0.6;
    bcs.mRestitution = o.restitution ?? 0.05;
    bcs.mLinearDamping = o.linDamp ?? 0.08;
    bcs.mAngularDamping = o.angDamp ?? 0.15;
    if (o.ccd) bcs.mMotionQuality = J.EMotionQuality_LinearCast;
    if (o.sleep === false) bcs.mAllowSleeping = false;
    if (o.gravity != null) bcs.mGravityFactor = o.gravity;
    if (o.maxAngVel) bcs.mMaxAngularVelocity = o.maxAngVel;
    if (o.mass && motion !== 'static') {
      bcs.mOverrideMassProperties = J.EOverrideMassProperties_CalculateInertia;
      bcs.mMassPropertiesOverride.mMass = o.mass;
      if (o.inertiaMul) bcs.mInertiaMultiplier = o.inertiaMul;
    }
    if (o.group) {
      bcs.mCollisionGroup.SetGroupFilter(this.groupFilter);
      bcs.mCollisionGroup.SetGroupID(o.group[0]);
      bcs.mCollisionGroup.SetSubGroupID(o.group[1]);
    }
    const body = this.bi.CreateBody(bcs);
    J.destroy(bcs);
    this.bi.AddBody(body.GetID(), motion === 'static' ? J.EActivation_DontActivate : J.EActivation_Activate);
    this.bodies.add(body);
    return body;
  }

  newGroup() { return this.nextGroup++; }

  removeBody(body) {
    if (!this.bodies.has(body)) return;
    const id = body.GetID();
    this.bi.RemoveBody(id);
    this.bi.DestroyBody(id);
    this.bodies.delete(body);
  }

  // ---------- 約束 ----------
  _add(settings, b1, b2, castTo) {
    const c = settings.Create(b1, b2);
    this.system.AddConstraint(c);
    this.J.destroy(settings);
    const typed = this.J.castObject(c, castTo);
    typed._raw = c; typed._b1 = b1; typed._b2 = b2;
    this.constraints.add(typed);
    return typed;
  }

  hinge(b1, b2, o) {
    const J = this.J, s = new J.HingeConstraintSettings();
    s.mPoint1.Set(...o.point); s.mPoint2.Set(...o.point);
    s.mHingeAxis1.Set(...o.axis); s.mHingeAxis2.Set(...o.axis);
    s.mNormalAxis1.Set(...o.normal); s.mNormalAxis2.Set(...o.normal);
    if (o.min != null) { s.mLimitsMin = o.min; s.mLimitsMax = o.max; }
    if (o.friction) s.mMaxFrictionTorque = o.friction;
    if (o.motor) {
      const m = s.mMotorSettings;
      m.mSpringSettings.mFrequency = o.motor.freq ?? 6;
      m.mSpringSettings.mDamping = o.motor.damping ?? 1;
      m.mMaxTorqueLimit = o.motor.maxTorque ?? 10;
      m.mMinTorqueLimit = -(o.motor.maxTorque ?? 10);
    }
    return this._add(s, b1, b2, J.HingeConstraint);
  }

  slider(b1, b2, o) {
    const J = this.J, s = new J.SliderConstraintSettings();
    s.mAutoDetectPoint = false;
    s.mPoint1.Set(...o.point1); s.mPoint2.Set(...(o.point2 || o.point1));
    s.mSliderAxis1.Set(...o.axis); s.mSliderAxis2.Set(...o.axis);
    s.mNormalAxis1.Set(...o.normal); s.mNormalAxis2.Set(...o.normal);
    if (o.min != null) { s.mLimitsMin = o.min; s.mLimitsMax = o.max; }
    if (o.friction) s.mMaxFrictionForce = o.friction;
    if (o.motor) {
      const m = s.mMotorSettings;
      m.mSpringSettings.mFrequency = o.motor.freq ?? 4;
      m.mSpringSettings.mDamping = o.motor.damping ?? 1;
      m.mMaxForceLimit = o.motor.maxForce ?? 1e6;
      m.mMinForceLimit = -(o.motor.maxForce ?? 1e6);
    }
    return this._add(s, b1, b2, J.SliderConstraint);
  }

  distance(b1, b2, o) {
    const J = this.J, s = new J.DistanceConstraintSettings();
    s.mPoint1.Set(...o.p1); s.mPoint2.Set(...o.p2);
    s.mMinDistance = o.min ?? 0; s.mMaxDistance = o.max;
    return this._add(s, b1, b2, J.DistanceConstraint);
  }

  swingTwist(b1, b2, o) {
    const J = this.J, s = new J.SwingTwistConstraintSettings();
    s.mPosition1.Set(...o.pos); s.mPosition2.Set(...o.pos);
    s.mTwistAxis1.Set(...o.twist); s.mTwistAxis2.Set(...o.twist);
    s.mPlaneAxis1.Set(...o.plane); s.mPlaneAxis2.Set(...o.plane);
    s.mNormalHalfConeAngle = o.cone ?? 0.5;
    s.mPlaneHalfConeAngle = o.cone2 ?? o.cone ?? 0.5;
    s.mTwistMinAngle = o.twistMin ?? -0.3;
    s.mTwistMaxAngle = o.twistMax ?? 0.3;
    s.mMaxFrictionTorque = o.friction ?? 0;
    return this._add(s, b1, b2, J.SwingTwistConstraint);
  }

  point(b1, b2, o) {
    const J = this.J, s = new J.PointConstraintSettings();
    s.mPoint1.Set(...o.pos); s.mPoint2.Set(...o.pos);
    return this._add(s, b1, b2, J.PointConstraint);
  }

  fixed(b1, b2) {
    const J = this.J, s = new J.FixedConstraintSettings();
    s.mAutoDetectPoint = true;
    return this._add(s, b1, b2, J.FixedConstraint);
  }

  removeConstraint(c) {
    if (!this.constraints.has(c)) return;
    this.system.RemoveConstraint(c._raw);
    this.constraints.delete(c);
  }

  // ---------- 讀寫 ----------
  pos(body) { const p = body.GetPosition(); return [p.GetX(), p.GetY(), p.GetZ()]; }
  rot(body) { const q = body.GetRotation(); return [q.GetX(), q.GetY(), q.GetZ(), q.GetW()]; }
  vel(body) { const v = body.GetLinearVelocity(); return [v.GetX(), v.GetY(), v.GetZ()]; }
  com(body) { const p = body.GetCenterOfMassPosition(); return [p.GetX(), p.GetY(), p.GetZ()]; }
  moveKinematic(body, p, q, dt) { this.bi.MoveKinematic(body.GetID(), this.r(p[0], p[1], p[2]), this.q(q || [0, 0, 0, 1]), dt); }
  setPose(body, p, q) { this.bi.SetPositionAndRotation(body.GetID(), this.r(p[0], p[1], p[2]), this.q(q || [0, 0, 0, 1]), this.J.EActivation_Activate); }
  setVel(body, v) { this.bi.SetLinearVelocity(body.GetID(), this.v(v[0], v[1], v[2])); }
  setAngVel(body, v) { body.SetAngularVelocity(this.v(v[0], v[1], v[2])); }
  impulse(body, v) { this.bi.AddImpulse(body.GetID(), this.v(v[0], v[1], v[2])); }
  wake(body) { this.bi.ActivateBody(body.GetID()); }
  isActive(body) { return body.IsActive(); }
  setFriction(body, f) { this.bi.SetFriction(body.GetID(), f); }
  mass(body) { const inv = body.GetMotionProperties().GetInverseMass(); return inv > 0 ? 1 / inv : Infinity; }

  step(dt, sub = 2) { this.jolt.Step(dt, sub); }

  clear() {
    for (const c of [...this.constraints]) this.removeConstraint(c);
    for (const b of [...this.bodies]) this.removeBody(b);
    this.nextGroup = 1;
  }
}
