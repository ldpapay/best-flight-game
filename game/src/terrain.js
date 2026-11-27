// Teluk Biru island: the recognisable terrain under the flight. A flat
// valley holds the runway, a lake sits to the west, a small town to the
// east, the sea and a beach lie further west, and mountains ring the
// north and the far east and west. Height is pure trigonometry, so the
// same (x, z) always gives the same height, with no table to ship.

import { RUNWAY } from './config.js';

export const SEA_X = -2600;
export const LAKE = { x: -1750, z: -750, rx: 720, rz: 480 };
export const TOWN = { x: 1250, z: 420 };
export const MOUNTAIN_NORTH_Z = -3200;

/** Ground height in metres at world (x, z). Runway strip is flat. */
export function terrainHeight(x, z) {
  if (Math.abs(x - RUNWAY.x) < RUNWAY.width && Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 80) return 0;
  const corridor = Math.max(0, 1 - Math.abs(x) / 2600);
  const hills = 16 * Math.sin(x * 0.0011 + 1.7) * Math.cos(z * 0.0009 + 0.4)
    + 10 * Math.sin(x * 0.0023) * Math.sin(z * 0.0016 + 2.1);
  let height = hills * (1 - corridor * 0.85);
  const west = Math.max(0, (-x - 2200) / 800);
  const east = Math.max(0, (x - 2200) / 800);
  const north = Math.max(0, (-z - 2600) / 700);
  const ridge = Math.max(west, east, north);
  height += ridge * ridge * 260;
  height += Math.max(0, (-z - 3000) / 400) * 120;
  const lakeDx = (x - LAKE.x) / LAKE.rx;
  const lakeDz = (z - LAKE.z) / LAKE.rz;
  if (lakeDx * lakeDx + lakeDz * lakeDz < 1) height = Math.min(height, -6);
  if (x < SEA_X) height = -12;
  return height;
}

export function isWater(x, z) {
  if (x < SEA_X) return true;
  const dx = (x - LAKE.x) / LAKE.rx;
  const dz = (z - LAKE.z) / LAKE.rz;
  return dx * dx + dz * dz < 1;
}

/** A field patch: a coloured rectangle of farmland in the valley. */
export function buildFields(random) {
  const colours = ['#6faf4e', '#d9b45c', '#5da24a', '#8fbf5a', '#c9a44e', '#4f8f43'];
  const fields = [];
  for (let i = 0; i < 90; i += 1) {
    const x = -2400 + random() * 4800;
    const z = -3000 + random() * 5600;
    if (Math.abs(x) < 90 && Math.abs(z) < 750) continue;
    if (isWater(x, z)) continue;
    const w = 180 + random() * 320;
    const h = 140 + random() * 260;
    fields.push({ x: x - w / 2, z: z - h / 2, w, h, colour: colours[i % colours.length], y: terrainHeight(x, z) });
  }
  return fields;
}

/** Forest patches: dark green blobs on the hillsides. */
export function buildForests(random) {
  const forests = [];
  for (let i = 0; i < 46; i += 1) {
    const x = -2800 + random() * 5600;
    const z = -3200 + random() * 5800;
    if (Math.abs(x) < 220 && Math.abs(z) < 900) continue;
    if (isWater(x, z)) continue;
    forests.push({ x, z, r: 90 + random() * 190, y: terrainHeight(x, z) });
  }
  return forests;
}

/** Town blocks: a small grid of houses east of the runway. */
export function buildTown() {
  const blocks = [];
  for (let gx = 0; gx < 6; gx += 1) {
    for (let gz = 0; gz < 5; gz += 1) {
      blocks.push({
        x: TOWN.x - 260 + gx * 100,
        z: TOWN.z - 200 + gz * 100,
        w: 62,
        h: 62,
        y: terrainHeight(TOWN.x, TOWN.z),
        roof: gx % 3 === 0,
      });
    }
  }
  return blocks;
}

/** Clouds: fixed puffs the renderer projects as soft white ellipses. */
export function buildClouds(random) {
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: -4200 + random() * 8400,
      z: -4200 + random() * 8400,
      y: 620 + random() * 320,
      r: 160 + random() * 260,
    });
  }
  return clouds;
}

/** Mountain ridge points for the distant silhouette, north and sides. */
export function buildRidge() {
  const points = [];
  for (let x = -5200; x <= 5200; x += 260) {
    const peak = 420 + 260 * Math.abs(Math.sin(x * 0.0009 + 0.7)) + 120 * Math.sin(x * 0.0021);
    points.push({ x, z: -5200, top: peak });
  }
  return points;
}
