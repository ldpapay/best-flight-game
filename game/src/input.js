// Keyboard and mouse input. Held keys steer pitch and roll; W/S (or the
// mouse wheel) work the throttle; the mouse itself steers too — move it
// left/right to bank, up/down to pitch, and click the menu buttons.
// One-shot presses (start, pause, camera, gear, mission keys) are queued
// as bit flags and taken once by the loop, so a press between two frames
// is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CAMERA = 4;
export const ACTION_GEAR = 8;
export const ACTION_MISSION1 = 16;
export const ACTION_MISSION2 = 32;
export const ACTION_MISSION3 = 64;

const PITCH_UP = new Set(['ArrowUp', 'KeyI']);
const PITCH_DOWN = new Set(['ArrowDown', 'KeyK']);
const ROLL_LEFT = new Set(['ArrowLeft', 'KeyA', 'KeyJ']);
const ROLL_RIGHT = new Set(['ArrowRight', 'KeyD', 'KeyL']);
const THROTTLE_UP = new Set(['KeyW', 'ShiftLeft', 'ShiftRight']);
const THROTTLE_DOWN = new Set(['KeyS', 'ControlLeft', 'ControlRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CAMERA = new Set(['KeyC']);
const GEAR = new Set(['KeyG']);
const BRAKE = new Set(['KeyB']);

export function createInput(canvas) {
  let pitchUp = false;
  let pitchDown = false;
  let rollLeft = false;
  let rollRight = false;
  let throttleUp = false;
  let throttleDown = false;
  let brake = false;
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseActive = false;
  let mouseSteer = false;
  let wheelDelta = 0;
  let clickX = -1;
  let clickY = -1;

  window.addEventListener('keydown', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = true;
    else if (PITCH_DOWN.has(event.code)) pitchDown = true;
    else if (ROLL_LEFT.has(event.code)) rollLeft = true;
    else if (ROLL_RIGHT.has(event.code)) rollRight = true;
    else if (THROTTLE_UP.has(event.code)) throttleUp = true;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = true;
    else if (BRAKE.has(event.code)) brake = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (CAMERA.has(event.code)) { if (!event.repeat) actions |= ACTION_CAMERA; }
    else if (GEAR.has(event.code)) { if (!event.repeat) actions |= ACTION_GEAR; }
    else if (event.code === 'Digit1') { if (!event.repeat) actions |= ACTION_MISSION1; }
    else if (event.code === 'Digit2') { if (!event.repeat) actions |= ACTION_MISSION2; }
    else if (event.code === 'Digit3') { if (!event.repeat) actions |= ACTION_MISSION3; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (PITCH_UP.has(event.code)) pitchUp = false;
    else if (PITCH_DOWN.has(event.code)) pitchDown = false;
    else if (ROLL_LEFT.has(event.code)) rollLeft = false;
    else if (ROLL_RIGHT.has(event.code)) rollRight = false;
    else if (THROTTLE_UP.has(event.code)) throttleUp = false;
    else if (THROTTLE_DOWN.has(event.code)) throttleDown = false;
    else if (BRAKE.has(event.code)) brake = false;
  });
  window.addEventListener('blur', () => {
    pitchUp = pitchDown = rollLeft = rollRight = false;
    throttleUp = throttleDown = brake = false;
    mouseSteer = false;
  });

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / rect.width - 0.5;
    mouseY = (event.clientY - rect.top) / rect.height - 0.5;
    mouseActive = true;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    clickX = (event.clientX - rect.left) / rect.width * 1280;
    clickY = (event.clientY - rect.top) / rect.height * 720;
    mouseSteer = true;
    actions |= ACTION_CONFIRM;
  });
  canvas.addEventListener('pointerup', () => { mouseSteer = false; });
  canvas.addEventListener('wheel', (event) => {
    wheelDelta += event.deltaY < 0 ? 1 : -1;
    event.preventDefault();
  }, { passive: false });

  return {
    /** Steering for this frame: pitch -1..1, roll -1..1, throttle -1..1. */
    steer() {
      let pitch = (pitchUp ? 1 : 0) - (pitchDown ? 1 : 0);
      let roll = (rollRight ? 1 : 0) - (rollLeft ? 1 : 0);
      if (pitch === 0 && roll === 0 && mouseActive && mouseSteer) {
        pitch = Math.max(-1, Math.min(1, -mouseY * 2.4));
        roll = Math.max(-1, Math.min(1, mouseX * 2.4));
      }
      let throttle = (throttleUp ? 1 : 0) - (throttleDown ? 1 : 0);
      if (wheelDelta !== 0) {
        throttle += wheelDelta * 0.4;
        wheelDelta = 0;
      }
      return { pitch, roll, throttle: Math.max(-1, Math.min(1, throttle)), brake };
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeClick() {
      const click = { x: clickX, y: clickY };
      clickX = -1; clickY = -1;
      return click;
    },
    mousePosition() {
      return { x: mouseX, y: mouseY, active: mouseActive };
    },
  };
}
