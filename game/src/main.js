// Boot and the one loop: input is read every frame, the flight advances
// in fixed 1/60 s steps (several in a slow frame, none in a fast one),
// and the renderer paints what is there. The game moves between five
// screens: title, play, paused, mission complete and crashed.
//
// ?seed=N fixes the mission layout. ?shot=start|play|land|end (with
// &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildClouds, buildFields, buildForests, buildRidge, buildTown } from './terrain.js';
import { createFlight, EVENT_CRASHED, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_RING, EVENT_STALL } from './flight.js';
import { createMission, missionComplete, missionScore, nextRing } from './missions.js';
import { ACTION_CAMERA, ACTION_CONFIRM, ACTION_GEAR, ACTION_MISSION1, ACTION_MISSION2, ACTION_MISSION3, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_DONE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);
const missionParam = params.get('mission') ?? 'rings';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = {
  fields: buildFields(random),
  forests: buildForests(random),
  town: buildTown(),
  clouds: buildClouds(random),
  ridge: buildRidge(),
};
const flight = createFlight();
const renderer = createRenderer(canvas, world);
const audio = createAudio();
let mission = createMission(missionParam === 'return' || missionParam === 'rescue' ? missionParam : 'rings');
let cameraMode = 'chase';

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score lasts this visit only.
  }
}

function runShot(name) {
  const shotMission = name === 'land' || name === 'end' ? createMission('return') : createMission('rings');
  mission = shotMission;
  const scene = stageShot(name, flight, shotMission);
  let painted = 0;
  function paint() {
    renderer.draw(flight.state, shotMission, scene.screen, scene.best, 'chase');
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let stallWarned = false;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    flight.reset();
    for (const ring of mission.rings) ring.hit = false;
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.click();
    announce(`Flying ${mission.name}. ${mission.goal}`);
  }

  function finishGame(over) {
    screen = over ? SCREEN_OVER : SCREEN_DONE;
    const finalScore = missionScore(mission, flight.state);
    flight.state.score = finalScore;
    if (finalScore > best) {
      best = finalScore;
      saveBest(best);
    }
    announce(over ? `Crashed. Score ${finalScore}. Best ${best}.` : `Mission complete. Score ${finalScore}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions & ACTION_CAMERA) {
      cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
      announce(cameraMode === 'chase' ? 'Chase view.' : 'Cockpit view.');
    }
    if (actions & ACTION_GEAR) {
      flight.state.gearDown = !flight.state.gearDown;
      announce(flight.state.gearDown ? 'Gear down.' : 'Gear up.');
    }
    if (actions & ACTION_MISSION1) mission = createMission('rings');
    if (actions & ACTION_MISSION2) mission = createMission('return');
    if (actions & ACTION_MISSION3) mission = createMission('rescue');
    if (screen === SCREEN_TITLE && click.x >= 0) {
      if (click.y >= 196 && click.y < 242) mission = createMission('rings');
      else if (click.y >= 252 && click.y < 298) mission = createMission('return');
      else if (click.y >= 308 && click.y < 354) mission = createMission('rescue');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_DONE)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return;
    const steer = input.steer();
    const events = flight.step(STEP, steer, mission.rings);
    audio.engine(flight.state.throttle, flight.state.speed, !flight.state.onGround);
    if (events & EVENT_RING) {
      audio.ring();
      announce(`Ring ${flight.state.ringsHit} of ${mission.rings.length}.`);
    }
    if (events & EVENT_LANDED) {
      audio.land();
      if (missionComplete(mission, flight.state)) finishGame(false);
      else announce('Landed — but rings remain. Take off again!');
    }
    if (events & EVENT_CRASHED) {
      audio.crash();
      finishGame(true);
    }
    if (events & EVENT_STALL && !stallWarned) {
      audio.stall();
      stallWarned = true;
    }
    if (!(events & EVENT_STALL)) stallWarned = false;
    if (events & EVENT_FUEL_EMPTY) announce('Fuel empty.');
    if (!flight.state.crashed && missionComplete(mission, flight.state)) finishGame(false);
    const target = nextRing(mission);
    if (target && flight.state.ringsHit > 0) {
      const dx = target.x - flight.state.x;
      const dz = target.z - flight.state.z;
      void dx; void dz;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(flight.state, mission, screen, best, cameraMode);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Teluk Biru Flight. Press Space or click to fly. Choose a mission with 1, 2 or 3.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
