// The flight model: one seaplane, arcade physics with real trade-offs.
// Throttle sets the target speed, pitch trades speed for altitude, bank
// turns the nose, and a slow plane stalls. Fuel burns with throttle, and
// damage comes from hard touchdowns, terrain hits and overspeed dives.
// No drawing and no browser in here: step() takes steering and returns
// what happened as bit flags, so the caller can react.

import { PLANE, RUNWAY, STEP } from './config.js';
import { terrainHeight } from './terrain.js';

export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_FUEL_EMPTY = 8;
export const EVENT_STALL = 16;
export const EVENT_HARD = 32;

const DEG = Math.PI / 180;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function wrapAngle(deg) {
  let v = deg % 360;
  if (v > 180) v -= 360;
  if (v < -180) v += 360;
  return v;
}

export function headingVector(headingDeg) {
  const h = headingDeg * DEG;
  return { x: Math.sin(h), z: -Math.cos(h) };
}

export function createFlight() {
  const state = {
    x: 0, z: 520, alt: 0,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, throttle: 0,
    fuel: PLANE.startFuel, damage: 0,
    gearDown: true, flaps: false,
    verticalSpeed: 0, onGround: true,
    airborne: false, landed: false, crashed: false,
    time: 0, ringsHit: 0, score: 0,
    message: '', messageTimer: 0,
  };

  function reset() {
    state.x = 0; state.z = 520; state.alt = 0;
    state.heading = 0; state.pitch = 0; state.roll = 0;
    state.speed = 0; state.throttle = 0;
    state.fuel = PLANE.startFuel; state.damage = 0;
    state.gearDown = true; state.flaps = false;
    state.verticalSpeed = 0; state.onGround = true;
    state.airborne = false; state.landed = false; state.crashed = false;
    state.time = 0; state.ringsHit = 0; state.score = 0;
    state.message = ''; state.messageTimer = 0;
  }

  function setMessage(text, seconds = 3) {
    state.message = text;
    state.messageTimer = seconds;
  }

  /**
   * One fixed step. steer: { pitch: -1..1 (up positive), roll: -1..1,
   * throttle: -1..1 change, brake: bool }. rings: mission ring list,
   * each {x, y, z, r, hit}. Returns event flags.
   */
  function step(dt, steer, rings) {
    let events = 0;
    state.time += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    // Throttle: W/S or wheel; on the ground it is the only way to move.
    state.throttle = clamp(state.throttle + steer.throttle * dt * 0.9, 0, 1);
    if (state.fuel <= 0) {
      if (state.throttle > 0) events |= EVENT_FUEL_EMPTY;
      state.throttle = 0;
    }

    // Pitch and roll ease toward the pilot's target, never snap.
    const targetPitch = clamp(steer.pitch * PLANE.maxPitch, -PLANE.maxPitch, PLANE.maxPitch);
    const targetRoll = clamp(steer.roll * PLANE.maxRoll, -PLANE.maxRoll, PLANE.maxRoll);
    state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 3.2);
    state.roll += (targetRoll - state.roll) * Math.min(1, dt * 3.6);

    // Bank turns the heading; a level plane flies straight. On the ground
    // the plane can only steer slowly, it does not bank-turn away.
    const turnFactor = state.onGround ? 0.12 : 1;
    // Positive roll is a right bank, which turns the nose right (heading up).
    state.heading = wrapAngle(state.heading + (state.roll / PLANE.maxRoll) * PLANE.turnRate * dt * (0.35 + 0.65 * (state.speed / PLANE.cruiseSpeed)) * turnFactor);

    // Speed chases the throttle target, with climb and drag penalties.
    // Pitch only bleeds speed once airborne — on the runway the nose
    // is up but the plane is not climbing yet.
    const targetSpeed = state.throttle * PLANE.maxSpeed;
    const climbPenalty = state.onGround ? 0 : Math.max(0, state.pitch) * 0.28;
    const drag = PLANE.drag * state.speed * state.speed * 0.008;
    state.speed += ((targetSpeed - state.speed) * 0.55 - climbPenalty - drag * 0.4) * dt * 2;
    if (steer.brake) state.speed = Math.max(0, state.speed - 30 * dt);
    state.speed = clamp(state.speed, 0, PLANE.maxSpeed + 12);

    // Stall: too slow and the nose drops on its own.
    if (!state.onGround && state.speed < PLANE.stallSpeed) {
      state.pitch -= 18 * dt;
      if (state.speed < PLANE.stallSpeed - 6) events |= EVENT_STALL;
    }
    if (state.speed > PLANE.maxSpeed + 6 && state.pitch < -18) {
      state.damage = Math.min(100, state.damage + 4 * dt);
    }

    const forward = headingVector(state.heading);
    const groundSpeed = state.onGround ? state.speed : state.speed * Math.cos(state.pitch * DEG);
    state.x += forward.x * groundSpeed * dt;
    state.z += forward.z * groundSpeed * dt;

    // Altitude: on the ground stay put until rotation speed, then fly.
    const prevAlt = state.alt;
    if (state.onGround) {
      if (state.speed > 42 && state.pitch > 6) {
        state.onGround = false;
        state.airborne = true;
        state.alt = 4;
        state.verticalSpeed = 0;
        setMessage('Airborne — gear up with G when clear');
      }
    } else {
      const climb = Math.sin(state.pitch * DEG) * state.speed;
      state.alt += climb * dt;
      // Smooth the vertical speed so the takeoff step does not spike it.
      state.verticalSpeed = state.verticalSpeed * 0.85 + ((state.alt - prevAlt) / dt) * 0.15;
      if (state.alt < 0) state.alt = 0;
    }
    if (state.onGround) state.verticalSpeed = 0;

    // Fuel: throttle burns it; gliding on idle sips it.
    state.fuel = Math.max(0, state.fuel - (PLANE.fuelBurn + state.throttle * PLANE.fuelBurnThrottle) * dt * (state.onGround ? 0.4 : 1));
    if (state.fuel <= 0 && !state.onGround) setMessage('FUEL EMPTY — glide to the runway!');

    // Rings: fly through the glowing hoop, centre within its radius.
    if (rings) {
      for (const ring of rings) {
        if (ring.hit) continue;
        const dx = state.x - ring.x;
        const dy = state.alt - ring.y;
        const dz = state.z - ring.z;
        if (dx * dx + dy * dy + dz * dz < ring.r * ring.r) {
          ring.hit = true;
          state.ringsHit += 1;
          state.score += 250;
          events |= EVENT_RING;
          setMessage(`Ring ${state.ringsHit} — +250`);
        }
      }
    }

    // Ground contact: runway landing, water ditch, or a crash.
    const ground = terrainHeight(state.x, state.z);
    if (!state.onGround && state.alt <= ground + 0.2) {
      const onRunway = Math.abs(state.x - RUNWAY.x) < RUNWAY.width / 2 + 6
        && Math.abs(state.z - RUNWAY.z) < RUNWAY.length / 2 + 20;
      const descent = -state.verticalSpeed;
      const aligned = Math.abs(wrapAngle(state.heading)) < 28 || Math.abs(wrapAngle(state.heading - 180)) < 28;
      if (onRunway && state.speed < 58 && descent < 9 && aligned && state.gearDown) {
        state.onGround = true;
        state.landed = true;
        state.alt = 0;
        state.pitch = 0;
        state.roll = 0;
        state.score += 500;
        events |= EVENT_LANDED;
        setMessage('Touchdown! Beautiful landing — +500');
      } else if (onRunway && state.speed < 70 && descent < 13 && state.gearDown) {
        state.onGround = true;
        state.landed = true;
        state.alt = 0;
        state.damage = Math.min(100, state.damage + 22);
        state.score += 200;
        events |= EVENT_LANDED | EVENT_HARD;
        setMessage('Hard landing — the airframe felt that. +200');
      } else {
        state.crashed = true;
        state.damage = 100;
        events |= EVENT_CRASHED;
      }
    }
    if (state.damage >= 100 && !state.crashed) {
      state.crashed = true;
      events |= EVENT_CRASHED;
    }
    // Soft world edge: turn the pilot back toward the island.
    if (Math.abs(state.x) > 5600 || Math.abs(state.z) > 5600) {
      setMessage('Turn back — you are leaving Teluk Biru');
      state.heading = wrapAngle(state.heading + 120 * dt);
    }
    return events;
  }

  reset();
  return { state, reset, step, setMessage };
}

// Re-export STEP so callers import the loop rate from one place.
export { STEP };
