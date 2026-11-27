// Every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule
// below depends on the screen size. World units are metres.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Aircraft performance: a light island seaplane, forgiving but not free. */
export const PLANE = {
  maxSpeed: 92,
  cruiseSpeed: 62,
  stallSpeed: 34,
  accel: 22,
  drag: 0.12,
  pitchRate: 42,
  rollRate: 95,
  turnRate: 38,
  climbRate: 14,
  maxPitch: 28,
  maxRoll: 62,
  fuelBurn: 0.55,
  fuelBurnThrottle: 0.9,
  startFuel: 100,
  startDamage: 0,
};

/** Runway: a north-south strip on Teluk Biru island, heading 360. */
export const RUNWAY = {
  x: 0,
  z: 0,
  length: 1200,
  width: 46,
  heading: 0,
  elevation: 0,
};

export const MISSIONS = [
  { id: 'rings', name: 'Ring Run', short: '1 Ring Run' },
  { id: 'return', name: 'Runway Return', short: '2 Runway Return' },
  { id: 'rescue', name: 'Mountain Rescue', short: '3 Mountain Rescue' },
];

export const PALETTE = {
  skyTop: '#2f7fc4',
  skyMid: '#7ec0e8',
  skyLow: '#cfe9f5',
  sun: '#fff3b0',
  sea: '#1f7fa8',
  seaDeep: '#14607f',
  sand: '#e8d29a',
  grass: '#5da24a',
  grassDark: '#3f7d38',
  fieldGold: '#d9b45c',
  fieldGreen: '#6faf4e',
  forest: '#2e6b2f',
  town: '#9aa3ad',
  townRoof: '#c65a4a',
  road: '#4a4a52',
  runway: '#3a3f47',
  runwayMark: '#f5f2e8',
  ring: '#ffb020',
  ringGlow: '#ffd76a',
  panel: '#10161d',
  panelEdge: '#2c3a48',
  dialFace: '#0d1a24',
  litAmber: '#ffb020',
  litCyan: '#4fe3e0',
  litGreen: '#7dff8a',
  litRed: '#ff5a4e',
  text: '#f2f7fa',
  muted: '#aebfc9',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const MONO = '"SF Mono", "Cascadia Code", Consolas, monospace';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'teluk-biru-flight.best';
