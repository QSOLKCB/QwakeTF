// QuakeWorld-style player movement.
import { v3, angleVectors } from './math.js';
import { CONTENTS } from './world.js';

export const PM = { gravity: 800, stopSpeed: 100, friction: 4, waterFriction: 4, accel: 10, airAccel: 10, waterAccel: 10, jumpVel: 270, stepSize: 18, maxVel: 2000 };

function clipVelocity(vel, normal, overbounce = 1.0) {
  const backoff = v3.dot(vel, normal) * overbounce;
  const out = [vel[0] - normal[0] * backoff, vel[1] - normal[1] * backoff, vel[2] - normal[2] * backoff];
  for (let i = 0; i < 3; i++) if (Math.abs(out[i]) < 0.1) out[i] = 0;
  return out;
}

// pm: {origin, velocity, mins, maxs, onGround, waterLevel, waterType, speed(maxspeed), trace(start,end,mins,maxs)->tr, pointContents(p)}
// cmd: {forward, side, up, jump, angles:[pitch,yaw,roll]}
export function playerMove(pm, cmd, dt) {
  pm.dt = dt;
  categorize(pm);
  if (pm.dead) { pm.velocity[2] -= PM.gravity * dt; if (pm.waterLevel >= 2) { pm.velocity = v3.scale(pm.velocity, Math.max(0, 1 - 2 * dt)); pm.velocity[2] *= 0.5; } slideMove(pm); categorize(pm); return; }
  // jumping
  if (pm.waterLevel >= 2) {
    if (cmd.jump) pm.velocity[2] = Math.max(pm.velocity[2], 100 + (pm.waterLevel === 3 ? 0 : 0));
    pm.jumpHeld = cmd.jump;
    waterMove(pm, cmd);
  } else {
    if (cmd.jump && pm.onGround && !pm.jumpHeld && !pm.noJump) { pm.velocity[2] = PM.jumpVel; pm.onGround = false; pm.jumped = true; }
    pm.jumpHeld = cmd.jump;
    if (pm.onGround) { friction(pm); groundMove(pm, cmd); }
    else airMove(pm, cmd);
  }
  categorize(pm);
}

function categorize(pm) {
  // ground
  const down = [pm.origin[0], pm.origin[1], pm.origin[2] - 2];
  if (pm.velocity[2] > 180) { pm.onGround = false; pm.groundNormal = null; }
  else {
    const tr = pm.trace(pm.origin, down, pm.mins, pm.maxs);
    if (tr.fraction < 1 && tr.normal && tr.normal[2] >= 0.7 && !tr.startsolid) { pm.onGround = true; pm.groundNormal = tr.normal; pm.groundEnt = tr.ent || null; pm.groundMover = tr.mover || null; if (tr.fraction > 0) { pm.origin = v3.copy(tr.endpos); } }
    else { pm.onGround = false; pm.groundNormal = null; pm.groundEnt = null; pm.groundMover = null; }
  }
  // water
  const feet = [pm.origin[0], pm.origin[1], pm.origin[2] + pm.mins[2] + 1];
  let c = pm.pointContents(feet);
  pm.waterLevel = 0; pm.waterType = 0;
  if (c & CONTENTS.WATER) {
    pm.waterType = c; pm.waterLevel = 1;
    const waist = [pm.origin[0], pm.origin[1], pm.origin[2] + (pm.mins[2] + pm.maxs[2]) / 2];
    if (pm.pointContents(waist) & CONTENTS.WATER) { pm.waterLevel = 2; const eye = [pm.origin[0], pm.origin[1], pm.origin[2] + 22]; if (pm.pointContents(eye) & CONTENTS.WATER) pm.waterLevel = 3; }
  }
}

function friction(pm) {
  const v = pm.velocity; const speed = Math.hypot(v[0], v[1]);
  if (speed < 1) { v[0] = 0; v[1] = 0; return; }
  const control = speed < PM.stopSpeed ? PM.stopSpeed : speed;
  const drop = control * PM.friction * pm.dt;
  let newspeed = speed - drop; if (newspeed < 0) newspeed = 0; newspeed /= speed;
  v[0] *= newspeed; v[1] *= newspeed;
}

function accelerate(pm, wishdir, wishspeed, accel) {
  const cur = v3.dot(pm.velocity, wishdir);
  const add = wishspeed - cur; if (add <= 0) return;
  let as = accel * pm.dt * wishspeed; if (as > add) as = add;
  pm.velocity = v3.ma(pm.velocity, as, wishdir);
}
function airAccelerate(pm, wishdir, wishspeed, accel) {
  const wishspd = Math.min(wishspeed, 30);
  const cur = v3.dot(pm.velocity, wishdir);
  const add = wishspd - cur; if (add <= 0) return;
  let as = accel * wishspeed * pm.dt; if (as > add) as = add;
  pm.velocity = v3.ma(pm.velocity, as, wishdir);
}

function wishVelocity(pm, cmd, flat) {
  const { forward, right } = angleVectors([flat ? 0 : cmd.angles[0], cmd.angles[1], 0]);
  if (flat) { forward[2] = 0; right[2] = 0; }
  let wish = [forward[0] * cmd.forward + right[0] * cmd.side, forward[1] * cmd.forward + right[1] * cmd.side, forward[2] * cmd.forward + right[2] * cmd.side];
  if (!flat) wish[2] += cmd.up;
  let speed = v3.len(wish);
  const maxs = pm.speed * (pm.speedScale || 1);
  if (speed > maxs) { wish = v3.scale(wish, maxs / speed); speed = maxs; }
  return { wishdir: speed > 0 ? v3.scale(wish, 1 / speed) : [0, 0, 0], wishspeed: speed };
}

function groundMove(pm, cmd) {
  const { wishdir, wishspeed } = wishVelocity(pm, cmd, true);
  accelerate(pm, wishdir, wishspeed, PM.accel);
  pm.velocity[2] = 0;
  stepSlideMove(pm);
}
function airMove(pm, cmd) {
  const { wishdir, wishspeed } = wishVelocity(pm, cmd, true);
  airAccelerate(pm, wishdir, wishspeed, PM.airAccel);
  pm.velocity[2] -= PM.gravity * pm.dt;
  stepSlideMove(pm);
}
function waterMove(pm, cmd) {
  let { wishdir, wishspeed } = wishVelocity(pm, cmd, false);
  if (cmd.forward === 0 && cmd.side === 0 && cmd.up === 0 && !cmd.jump) { wishdir = [0, 0, -1]; wishspeed = 60; }
  else wishspeed *= 0.7;
  if (cmd.jump) { wishdir = v3.norm(v3.add(wishdir, [0, 0, 0.7])); }
  // friction
  const v = pm.velocity; const speed = v3.len(v);
  if (speed > 0) { let ns = speed - pm.dt * speed * PM.waterFriction; if (ns < 0) ns = 0; pm.velocity = v3.scale(v, ns / speed); }
  accelerate(pm, wishdir, wishspeed, PM.waterAccel);
  // water jump: swimming forward against an obstacle with air above -> hop out
  if (pm.waterLevel === 2 && cmd.forward > 0) {
    const { forward } = angleVectors([0, cmd.angles[1], 0]);
    const ahead = v3.ma(pm.origin, 24, forward);
    const tr = pm.trace(pm.origin, ahead, pm.mins, pm.maxs);
    if (tr.fraction < 1) { const above = [ahead[0], ahead[1], pm.origin[2] + 8 + pm.maxs[2]]; if (!(pm.pointContents(above) & (CONTENTS.WATER | CONTENTS.SOLID))) { pm.velocity[2] = Math.max(pm.velocity[2], 250); pm.velocity = v3.ma(pm.velocity, 50, forward); } }
  }
  slideMove(pm);
}

function slideMove(pm) {
  let timeLeft = pm.dt; const planes = []; const original = v3.copy(pm.velocity); let blocked = 0;
  for (let bump = 0; bump < 4; bump++) {
    if (v3.len2(pm.velocity) === 0) break;
    const end = v3.ma(pm.origin, timeLeft, pm.velocity);
    const tr = pm.trace(pm.origin, end, pm.mins, pm.maxs);
    if (tr.allsolid || tr.startsolid) { pm.velocity[2] = 0; return 3; }
    if (tr.fraction > 0) { pm.origin = v3.copy(tr.endpos); planes.length = 0; }
    if (tr.fraction === 1) break;
    if (tr.ent) pm.touched = pm.touched || []; if (tr.ent) pm.touched.push(tr.ent);
    if (tr.normal[2] > 0.7) blocked |= 1; else if (tr.normal[2] === 0) blocked |= 2;
    timeLeft -= timeLeft * tr.fraction;
    planes.push(tr.normal);
    let i;
    for (i = 0; i < planes.length; i++) {
      pm.velocity = clipVelocity(original, planes[i], 1.0);
      let j; for (j = 0; j < planes.length; j++) if (j !== i && v3.dot(pm.velocity, planes[j]) < 0) break;
      if (j === planes.length) break;
    }
    if (i === planes.length) {
      if (planes.length !== 2) { pm.velocity = [0, 0, 0]; break; }
      const dir = v3.cross(planes[0], planes[1]); const d = v3.dot(dir, pm.velocity); pm.velocity = v3.scale(dir, d);
    }
    if (v3.dot(pm.velocity, original) <= 0) { pm.velocity = [0, 0, 0]; break; }
  }
  return blocked;
}

function stepSlideMove(pm) {
  const startO = v3.copy(pm.origin), startV = v3.copy(pm.velocity);
  const blocked = slideMove(pm);
  if (!(blocked & 2) && pm.onGround === false && startV[2] > 0) return; // airborne going up: no step
  const downO = v3.copy(pm.origin), downV = v3.copy(pm.velocity);
  // try stepping up
  pm.origin = v3.copy(startO); pm.velocity = v3.copy(startV);
  const up = [startO[0], startO[1], startO[2] + PM.stepSize];
  let tr = pm.trace(startO, up, pm.mins, pm.maxs);
  if (tr.startsolid) { pm.origin = downO; pm.velocity = downV; return; }
  pm.origin = v3.copy(tr.endpos);
  slideMove(pm);
  const down = [pm.origin[0], pm.origin[1], pm.origin[2] - PM.stepSize - 2];
  tr = pm.trace(pm.origin, down, pm.mins, pm.maxs);
  if (tr.fraction < 1 && tr.normal && tr.normal[2] < 0.7) { pm.origin = downO; pm.velocity = downV; return; } // landed on a steep slope: use the slide result
  if (!tr.startsolid) pm.origin = v3.copy(tr.endpos);
  const upO = pm.origin;
  const d1 = (downO[0] - startO[0]) ** 2 + (downO[1] - startO[1]) ** 2, d2 = (upO[0] - startO[0]) ** 2 + (upO[1] - startO[1]) ** 2;
  if (d1 > d2 || tr.startsolid) { pm.origin = downO; pm.velocity = downV; return; }
  pm.velocity[2] = downV[2];
}
