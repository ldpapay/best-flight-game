// The screenshot scenes behind ?shot=start|play|land|end. Each one plays
// the real flight rules forward from a fresh flight for a fixed number
// of steps, steered by a simple autopilot (climb, turn toward the next
// ring, level off for the runway), so the frame is what a short flight
// really looks like and the same seed always gives the same frame.
// Land and end are staged on final approach from the south, heading
// north onto Runway 36, so the runway is ahead in the frame.

import { STEP } from './config.js';
import { EVENT_LANDED } from './flight.js';
import { nextRing } from './missions.js';
import { SCREEN_DONE, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 2;
const PLAY_SECONDS = 38;
const LAND_SECONDS = 45;
const END_SECONDS = 58;

/** Throttle as a change: ease toward the target throttle. */
function throttleToward(flight, target) {
  return Math.max(-1, Math.min(1, (target - flight.throttle) * 2.5));
}

/** Steer toward a target point: pitch for its height, roll for its bearing. */
function steerToward(flight, tx, ty, tz, throttleTarget) {
  const dx = tx - flight.x;
  const dz = tz - flight.z;
  const bearing = Math.atan2(dx, -dz) * 180 / Math.PI;
  const diff = ((bearing - flight.heading + 540) % 360) - 180;
  const roll = Math.max(-1, Math.min(1, diff / 35));
  const pitch = Math.max(-1, Math.min(1, (ty - flight.alt) / 90));
  return { pitch, roll, throttle: throttleToward(flight, throttleTarget), brake: false };
}

function autopilot(flight, mission, mode) {
  if (mode === 'land') {
    flight.gearDown = true;
    // Descend on a gentle slope to a touchdown near the south threshold:
    // steer at the runway centre, north of the touchdown, so the bearing
    // never flips while the altitude follows the distance to touchdown.
    // Low and close: hold the nose down a little so it actually touches.
    if (flight.alt < 12 && flight.z < 500) {
      return { pitch: -0.3, roll: 0, throttle: throttleToward(flight, 0.3), brake: false };
    }
    const wantAlt = Math.max(0, Math.min(130, (flight.z - 650) * 0.08));
    return steerToward(flight, 0, wantAlt, 0, 0.42);
  }
  const ring = nextRing(mission);
  if (!ring) return { pitch: 0, roll: 0, throttle: throttleToward(flight, 0.3), brake: false };
  return steerToward(flight, ring.x, ring.y, ring.z, 0.72);
}

/**
 * Set `flight` and `mission` to the named scene and return the screen to
 * draw over them and the best score to show. Names: start, play, land,
 * end; any other name is start.
 */
export function stageShot(name, flight, mission) {
  flight.reset();
  for (const ring of mission.rings) ring.hit = false;
  if (name !== 'play' && name !== 'land' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      flight.step(STEP, { pitch: 0, roll: 0, throttle: 0, brake: false }, mission.rings);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'land' || name === 'end') {
    // Stage on final approach: south of the runway, heading north.
    flight.state.x = 0;
    flight.state.z = 1900;
    flight.state.alt = 130;
    flight.state.heading = 0;
    flight.state.speed = 58;
    flight.state.throttle = 0.42;
    flight.state.onGround = false;
    flight.state.airborne = true;
    flight.state.gearDown = true;
  } else {
    flight.state.throttle = 0.7;
  }
  const limit = name === 'end' ? END_SECONDS : name === 'land' ? LAND_SECONDS : PLAY_SECONDS;
  const mode = name === 'land' || name === 'end' ? 'land' : 'play';
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = flight.step(STEP, autopilot(flight.state, mission, mode), mission.rings);
    if (events & EVENT_LANDED) break;
    if (flight.state.crashed) break;
    if (name === 'play' && flight.state.ringsHit >= 2) break;
  }
  if (name === 'end' && flight.state.landed) return { screen: SCREEN_DONE, best: flight.state.score };
  if (flight.state.crashed) return { screen: SCREEN_OVER, best: flight.state.score };
  return { screen: SCREEN_PLAY, best: flight.state.score };
}
