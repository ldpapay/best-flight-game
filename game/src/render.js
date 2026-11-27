// Drawing only: the flight state and the current screen in, pixels out.
// The 1280x720 playfield is scaled to fit the window and centred. The
// world is drawn with a small perspective projector: sky, sun, clouds,
// distant mountains, sea, fields, forests, town, roads, the runway and
// the glowing rings, then the aircraft (chase view) or the nose
// (cockpit view), then the lit instrument panel and the HUD.

import { FIELD, FONT, MONO, PALETTE, RUNWAY } from './config.js';
import { isWater, terrainHeight } from './terrain.js';
import { nextRing, ringsLeft } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_DONE = 'done';

const DEG = Math.PI / 180;
const FOCAL = 620;

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.x = (canvas.width - FIELD.width * view.scale) / 2;
    view.y = (canvas.height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', mono = false) {
    const key = size + (mono ? 'm' : '');
    if (!fonts.has(key)) fonts.set(key, `${size}px ${mono ? MONO : FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function cameraFor(flight, mode) {
    const h = flight.heading * DEG;
    const p = flight.pitch * DEG;
    const fx = Math.sin(h) * Math.cos(p);
    const fy = Math.sin(p);
    const fz = -Math.cos(h) * Math.cos(p);
    const px = flight.x;
    const py = flight.alt;
    const pz = flight.z;
    let cam;
    let look;
    let rollDeg;
    if (mode === 'cockpit') {
      cam = { x: px + fx * 2, y: py + 3.1, z: pz + fz * 2 };
      look = { x: px + fx * 220, y: py + fy * 220 + 2, z: pz + fz * 220 };
      rollDeg = flight.roll;
    } else {
      cam = { x: px - fx * 38, y: py + 11 - fy * 20, z: pz - fz * 38 };
      look = { x: px + fx * 110, y: py + fy * 60 + 1, z: pz + fz * 110 };
      rollDeg = flight.roll * 0.45;
    }
    const fwd = norm({ x: look.x - cam.x, y: look.y - cam.y, z: look.z - cam.z });
    let right = norm(cross(fwd, { x: 0, y: 1, z: 0 }));
    let up = cross(right, fwd);
    const roll = rollDeg * DEG;
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    const r2 = {
      x: right.x * cosR + up.x * sinR,
      y: right.y * cosR + up.y * sinR,
      z: right.z * cosR + up.z * sinR,
    };
    const u2 = {
      x: up.x * cosR - right.x * sinR,
      y: up.y * cosR - right.y * sinR,
      z: up.z * cosR - right.z * sinR,
    };
    return { pos: cam, fwd, right: r2, up: u2 };
  }

  function norm(v) {
    const len = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }

  function project(cam, x, y, z) {
    const dx = x - cam.pos.x;
    const dy = y - cam.pos.y;
    const dz = z - cam.pos.z;
    const depth = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (depth < 2) return null;
    const sx = FIELD.width / 2 + (dx * cam.right.x + dy * cam.right.y + dz * cam.right.z) / depth * FOCAL;
    const sy = FIELD.height / 2 - (dx * cam.up.x + dy * cam.up.y + dz * cam.up.z) / depth * FOCAL;
    return { x: sx, y: sy, depth, scale: FOCAL / depth };
  }

  function poly(points, fill) {
    context.fillStyle = fill;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    context.fill();
  }

  // Project with depth clamped: a ground quad that straddles the camera
  // stretches to the screen edge instead of vanishing whole.
  function projectClamped(cam, x, y, z) {
    const dx = x - cam.pos.x;
    const dy = y - cam.pos.y;
    const dz = z - cam.pos.z;
    let depth = dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z;
    if (depth < 2) depth = 2;
    const sx = FIELD.width / 2 + (dx * cam.right.x + dy * cam.right.y + dz * cam.right.z) / depth * FOCAL;
    const sy = FIELD.height / 2 - (dx * cam.up.x + dy * cam.up.y + dz * cam.up.z) / depth * FOCAL;
    return { x: sx, y: sy, depth, scale: FOCAL / depth };
  }

  function quad(cam, x1, z1, x2, z2, y, fill) {
    const a = projectClamped(cam, x1, y, z1);
    const b = projectClamped(cam, x2, y, z1);
    const c = projectClamped(cam, x2, y, z2);
    const d = projectClamped(cam, x1, y, z2);
    poly([a, b, c, d], fill);
  }

  function drawSky(flight, cam) {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height * 0.62);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(0.55, PALETTE.skyMid);
    grad.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Sun, fixed in the west sky.
    const sun = project(cam, flight.x - 3800, 900, flight.z - 2600);
    if (sun) {
      context.fillStyle = PALETTE.sun;
      context.beginPath();
      context.arc(sun.x, sun.y, 34 * sun.scale * 0.4 + 18, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,243,176,0.25)';
      context.beginPath();
      context.arc(sun.x, sun.y, 60, 0, Math.PI * 2);
      context.fill();
    }
    // Clouds as soft white puffs, far ones only — a near cloud would fill the sky.
    for (const cloud of world.clouds) {
      const p = project(cam, cloud.x, cloud.y, cloud.z);
      if (!p || p.depth < 400) continue;
      const r = Math.min(220, cloud.r * p.scale);
      if (r < 4) continue;
      context.fillStyle = 'rgba(255,255,255,0.85)';
      context.beginPath();
      context.ellipse(p.x, p.y, r, r * 0.36, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.6)';
      context.beginPath();
      context.ellipse(p.x - r * 0.4, p.y + r * 0.08, r * 0.55, r * 0.3, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawMountains(cam) {
    const pts = [];
    for (const ridge of world.ridge) {
      const p = project(cam, ridge.x, ridge.top, ridge.z);
      if (p) pts.push(p);
    }
    if (pts.length < 3) return;
    const base = pts.map((p) => ({ x: p.x, y: FIELD.height * 0.62 }));
    context.fillStyle = '#5b7fa0';
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) context.lineTo(p.x, p.y);
    context.lineTo(pts[pts.length - 1].x, FIELD.height * 0.62);
    context.lineTo(pts[0].x, FIELD.height * 0.62);
    context.closePath();
    context.fill();
    // Snow caps on the tallest peaks.
    context.fillStyle = 'rgba(255,255,255,0.85)';
    for (const p of pts) {
      if (p.y < 180) {
        context.beginPath();
        context.moveTo(p.x - 14, p.y + 18);
        context.lineTo(p.x, p.y);
        context.lineTo(p.x + 14, p.y + 18);
        context.closePath();
        context.fill();
      }
    }
    void base;
  }

  function drawGround(cam, flight) {
    // Ground always fills below the horizon, even where no patch reaches.
    const horizon = project(cam, cam.pos.x + cam.fwd.x * 1000, cam.pos.y, cam.pos.z + cam.fwd.z * 1000);
    const horizonY = horizon ? horizon.y : FIELD.height * 0.45;
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, Math.max(0, horizonY), FIELD.width, FIELD.height - Math.max(0, horizonY));
    // Base grass, then sea to the west, then the valley patches.
    quad(cam, -5600, -5600, 5600, 5600, 0, PALETTE.grass);
    quad(cam, -5600, -5600, -2600, 5600, -11, PALETTE.sea);
    quad(cam, -2680, -5600, -2560, 5600, -1, PALETTE.sand);
    // Lake.
    const lake = project(cam, -1750, -5, -750);
    if (lake && lake.depth > 200) {
      const rx = Math.min(700, 720 * lake.scale);
      const rz = 480 * lake.scale;
      if (rx > 3) {
        context.fillStyle = PALETTE.sea;
        context.beginPath();
        context.ellipse(lake.x, lake.y, rx, rz * 0.7, 0, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Fields, forests and town, far first.
    const items = [];
    for (const f of world.fields) items.push({ d: Math.hypot(f.x - flight.x, f.z - flight.z), kind: 'field', f });
    for (const f of world.forests) items.push({ d: Math.hypot(f.x - flight.x, f.z - flight.z), kind: 'forest', f });
    for (const b of world.town) items.push({ d: Math.hypot(b.x - flight.x, b.z - flight.z), kind: 'town', f: b });
    items.sort((a, b) => b.d - a.d);
    for (const item of items) {
      if (item.d > 5200) continue;
      if (item.kind === 'field') {
        const f = item.f;
        quad(cam, f.x, f.z, f.x + f.w, f.z + f.h, f.y + 0.6, f.colour);
      } else if (item.kind === 'forest') {
        const f = item.f;
        const p = project(cam, f.x, f.y + 4, f.z);
        if (!p || p.depth < 120) continue;
        const r = Math.min(240, f.r * p.scale);
        if (r < 2) continue;
        context.fillStyle = PALETTE.forest;
        context.beginPath();
        context.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
        context.fill();
      } else {
        const b = item.f;
        quad(cam, b.x, b.z, b.x + b.w, b.z + b.h, b.y + 8, b.roof ? PALETTE.townRoof : PALETTE.town);
      }
    }
    // Main road east of the runway and the town grid road.
    quad(cam, 78, -3200, 92, 3200, 1, PALETTE.road);
    quad(cam, 900, 400, 1600, 414, 1, PALETTE.road);
  }

  function drawRunway(cam) {
    const x1 = RUNWAY.x - RUNWAY.width / 2;
    const x2 = RUNWAY.x + RUNWAY.width / 2;
    const z1 = RUNWAY.z - RUNWAY.length / 2;
    const z2 = RUNWAY.z + RUNWAY.length / 2;
    quad(cam, x1, z1, x2, z2, 0.8, PALETTE.runway);
    // Centre dashes, far ones only: a dash under the camera would
    // project to a screen-filling polygon, so skip the near ones.
    for (let z = z1 + 60; z < z2 - 40; z += 120) {
      const centre = project(cam, 0, 1.2, z + 27);
      if (!centre || centre.depth < 60) continue;
      quad(cam, -3, z, 3, z + 55, 1.2, PALETTE.runwayMark);
    }
    // Threshold bar and the big 36 at the south end, far ones only.
    const thresh = project(cam, 0, 1.2, z2 - 24);
    if (thresh && thresh.depth > 60) quad(cam, -20, z2 - 30, 20, z2 - 18, 1.2, PALETTE.runwayMark);
    const num = project(cam, 0, 1.5, z2 - 90);
    if (num && num.scale > 0.02 && num.scale < 0.6) {
      text('36', num.x, num.y, Math.max(10, Math.min(48, 90 * num.scale)), PALETTE.runwayMark, 'center', true);
    }
    // Amber edge lights, capped so a near light never becomes a blob.
    context.fillStyle = PALETTE.litAmber;
    for (let z = z1; z <= z2; z += 150) {
      for (const x of [x1 - 4, x2 + 4]) {
        const p = project(cam, x, 2, z);
        if (p && p.scale > 0.01 && p.depth > 25) {
          context.beginPath();
          context.arc(p.x, p.y, Math.max(1.5, Math.min(6, 5 * p.scale)), 0, Math.PI * 2);
          context.fill();
        }
      }
    }
  }

  function drawRings(cam, mission) {
    const target = nextRing(mission);
    for (const ring of mission.rings) {
      if (ring.hit) continue;
      const p = project(cam, ring.x, ring.y, ring.z);
      if (!p || p.depth < 30) continue;
      const r = Math.min(320, ring.r * p.scale);
      if (r < 3) continue;
      const isNext = target === ring;
      context.lineWidth = isNext ? 7 : 4;
      context.strokeStyle = ring.hit ? PALETTE.litGreen : (isNext ? PALETTE.ringGlow : PALETTE.ring);
      context.shadowColor = isNext ? PALETTE.ringGlow : 'transparent';
      context.shadowBlur = isNext ? 18 : 0;
      context.beginPath();
      context.arc(p.x, p.y, r, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
      context.lineWidth = 1;
      if (!ring.hit) {
        text(ring.label, p.x, p.y - r - 10, Math.max(12, Math.min(26, r * 0.35)), isNext ? '#fff' : PALETTE.ring, 'center', true);
        // Guide line down to the ground so the pilot can judge height.
        const ground = project(cam, ring.x, terrainHeight(ring.x, ring.z), ring.z);
        if (ground) {
          context.strokeStyle = 'rgba(255,176,32,0.45)';
          context.setLineDash([6, 8]);
          context.beginPath();
          context.moveTo(p.x, p.y + r);
          context.lineTo(ground.x, ground.y);
          context.stroke();
          context.setLineDash([]);
        }
      }
    }
  }

  function drawPlaneChase(flight) {
    const cx = FIELD.width / 2;
    const cy = FIELD.height * 0.60;
    const scale = 1.15;
    context.save();
    context.translate(cx, cy);
    context.rotate(flight.roll * DEG * 0.9);
    context.scale(scale, scale);
    // Wings.
    context.fillStyle = '#e8f2f7';
    context.beginPath();
    context.moveTo(-150, 6); context.lineTo(-28, -6); context.lineTo(-28, 14); context.lineTo(-150, 26); context.closePath(); context.fill();
    context.beginPath();
    context.moveTo(150, 6); context.lineTo(28, -6); context.lineTo(28, 14); context.lineTo(150, 26); context.closePath(); context.fill();
    // Tailplane and fin.
    context.fillStyle = '#c94f3d';
    context.beginPath();
    context.moveTo(-52, -42); context.lineTo(-14, -46); context.lineTo(-14, -30); context.lineTo(-52, -28); context.closePath(); context.fill();
    context.beginPath();
    context.moveTo(52, -42); context.lineTo(14, -46); context.lineTo(14, -30); context.lineTo(52, -28); context.closePath(); context.fill();
    context.beginPath();
    context.moveTo(-8, -58); context.lineTo(8, -58); context.lineTo(6, -18); context.lineTo(-6, -18); context.closePath(); context.fill();
    // Fuselage, seen from behind and above.
    const body = context.createLinearGradient(0, -50, 0, 30);
    body.addColorStop(0, '#f4f8fa');
    body.addColorStop(0.6, '#d7e6ee');
    body.addColorStop(1, '#9fb8c6');
    context.fillStyle = body;
    context.beginPath();
    context.ellipse(0, -12, 26, 46, 0, 0, Math.PI * 2);
    context.fill();
    // Canopy windows and stripe.
    context.fillStyle = '#1d4e6b';
    context.beginPath();
    context.ellipse(0, -34, 16, 12, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#c94f3d';
    context.fillRect(-26, -6, 52, 7);
    // Navigation lights: red left, green right, white strobe.
    context.fillStyle = '#ff3b30';
    context.beginPath(); context.arc(-150, 14, 5, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#39d353';
    context.beginPath(); context.arc(150, 14, 5, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#fff';
    context.beginPath(); context.arc(0, -58, 4, 0, Math.PI * 2); context.fill();
    // Floats of the seaplane.
    context.fillStyle = '#8a6d4b';
    context.fillRect(-38, 34, 14, 10);
    context.fillRect(24, 34, 14, 10);
    context.restore();
  }

  function drawCockpitNose() {
    const cx = FIELD.width / 2;
    const cy = FIELD.height;
    context.fillStyle = '#d7e6ee';
    context.beginPath();
    context.moveTo(cx - 150, cy);
    context.quadraticCurveTo(cx - 60, cy - 130, cx, cy - 150);
    context.quadraticCurveTo(cx + 60, cy - 130, cx + 150, cy);
    context.closePath();
    context.fill();
    context.fillStyle = '#1d4e6b';
    context.beginPath();
    context.ellipse(cx, cy - 118, 46, 16, 0, Math.PI, 0);
    context.fill();
    // Canopy frame.
    context.strokeStyle = '#10161d';
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(cx - 170, cy - 40);
    context.quadraticCurveTo(cx - 90, cy - 150, cx, cy - 168);
    context.quadraticCurveTo(cx + 90, cy - 150, cx + 170, cy - 40);
    context.stroke();
    context.lineWidth = 1;
  }

  function dial(cx, cy, r, label, valueText, needleAngle, colour) {
    context.fillStyle = PALETTE.dialFace;
    context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.fill();
    context.strokeStyle = PALETTE.litAmber;
    context.lineWidth = 2;
    context.beginPath(); context.arc(cx, cy, r, 0, Math.PI * 2); context.stroke();
    context.lineWidth = 1;
    for (let i = 0; i < 12; i += 1) {
      const a = i * Math.PI / 6;
      context.strokeStyle = '#5a7285';
      context.beginPath();
      context.moveTo(cx + Math.sin(a) * (r - 6), cy - Math.cos(a) * (r - 6));
      context.lineTo(cx + Math.sin(a) * (r - 12), cy - Math.cos(a) * (r - 12));
      context.stroke();
    }
    context.strokeStyle = colour;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.sin(needleAngle) * (r - 10), cy - Math.cos(needleAngle) * (r - 10));
    context.stroke();
    context.lineWidth = 1;
    context.fillStyle = colour;
    context.beginPath(); context.arc(cx, cy, 4, 0, Math.PI * 2); context.fill();
    text(label, cx, cy + r + 16, 13, PALETTE.muted, 'center');
    text(valueText, cx, cy + 16, 15, PALETTE.text, 'center', true);
  }

  function drawInstruments(flight) {
    const top = 556;
    context.fillStyle = PALETTE.panel;
    context.fillRect(0, top, FIELD.width, FIELD.height - top);
    context.fillStyle = PALETTE.panelEdge;
    context.fillRect(0, top, FIELD.width, 3);
    // Artificial horizon.
    const ax = 150;
    const ay = 640;
    const ar = 52;
    context.save();
    context.beginPath(); context.arc(ax, ay, ar, 0, Math.PI * 2); context.clip();
    context.translate(ax, ay);
    context.rotate(-flight.roll * DEG);
    context.translate(0, flight.pitch * 1.4);
    context.fillStyle = '#3f9be0'; context.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
    context.fillStyle = '#7a5a34'; context.fillRect(-ar, 0, ar * 2, ar * 2);
    context.fillStyle = '#fff'; context.fillRect(-ar, -2, ar * 2, 4);
    context.restore();
    context.strokeStyle = PALETTE.litAmber; context.lineWidth = 2;
    context.beginPath(); context.arc(ax, ay, ar, 0, Math.PI * 2); context.stroke();
    context.lineWidth = 1;
    context.fillStyle = PALETTE.litAmber;
    context.fillRect(ax - 22, ay - 3, 16, 5);
    context.fillRect(ax + 6, ay - 3, 16, 5);
    text('ATTITUDE', ax, ay + ar + 16, 13, PALETTE.muted, 'center');
    // Airspeed, altitude, heading dials.
    const speedKmh = Math.round(flight.speed * 3.6);
    dial(330, 640, 48, 'AIRSPEED km/h', String(speedKmh), (speedKmh / 360) * Math.PI * 2 - Math.PI, PALETTE.litCyan);
    const alt = Math.round(flight.alt);
    dial(490, 640, 48, 'ALTITUDE m', String(alt), (alt % 1000) / 1000 * Math.PI * 2 - Math.PI, PALETTE.litCyan);
    // Heading compass strip.
    const hx = 700;
    const hy = 640;
    context.fillStyle = PALETTE.dialFace;
    context.fillRect(hx - 110, hy - 48, 220, 96);
    context.strokeStyle = PALETTE.litAmber;
    context.strokeRect(hx - 110, hy - 48, 220, 96);
    const headings = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    for (const hdg of headings) {
      const diff = ((hdg - flight.heading + 540) % 360) - 180;
      if (Math.abs(diff) > 70) continue;
      const x = hx + diff * 1.5;
      text(hdg === 0 ? 'N' : hdg === 90 ? 'E' : hdg === 180 ? 'S' : hdg === 270 ? 'W' : String(hdg), x, hy + 6, 15, Math.abs(diff) < 4 ? PALETTE.litAmber : PALETTE.text, 'center', true);
    }
    context.fillStyle = PALETTE.litAmber;
    context.beginPath(); context.moveTo(hx - 7, hy - 48); context.lineTo(hx + 7, hy - 48); context.lineTo(hx, hy - 34); context.closePath(); context.fill();
    text('HEADING ' + String(Math.round(((flight.heading % 360) + 360) % 360)).padStart(3, '0') + '°', hx, hy + 72, 14, PALETTE.text, 'center', true);
    // Fuel and throttle bars.
    const fx = 930;
    text('FUEL', fx, 592, 13, PALETTE.muted, 'left');
    context.fillStyle = '#24313d'; context.fillRect(fx, 600, 110, 18);
    context.fillStyle = flight.fuel < 20 ? PALETTE.litRed : PALETTE.litGreen;
    context.fillRect(fx, 600, 110 * flight.fuel / 100, 18);
    text(Math.round(flight.fuel) + '%', fx + 118, 615, 14, PALETTE.text, 'left', true);
    text('THROTTLE', fx, 646, 13, PALETTE.muted, 'left');
    context.fillStyle = '#24313d'; context.fillRect(fx, 654, 110, 18);
    context.fillStyle = PALETTE.litAmber;
    context.fillRect(fx, 654, 110 * flight.throttle, 18);
    text(Math.round(flight.throttle * 100) + '%', fx + 118, 669, 14, PALETTE.text, 'left', true);
    // Damage and gear lights.
    const lx = 1185;
    text('DAMAGE ' + Math.round(flight.damage) + '%', lx, 600, 13, flight.damage > 50 ? PALETTE.litRed : PALETTE.muted, 'center', true);
    context.fillStyle = flight.damage > 50 ? PALETTE.litRed : '#24313d';
    context.beginPath(); context.arc(lx - 40, 632, 9, 0, Math.PI * 2); context.fill();
    context.fillStyle = flight.gearDown ? PALETTE.litGreen : '#24313d';
    context.beginPath(); context.arc(lx, 632, 9, 0, Math.PI * 2); context.fill();
    context.fillStyle = flight.speed < 34 && !flight.onGround ? PALETTE.litRed : '#24313d';
    context.beginPath(); context.arc(lx + 40, 632, 9, 0, Math.PI * 2); context.fill();
    text('DMG  GEAR  STALL', lx, 660, 11, PALETTE.muted, 'center');
    text(flight.onGround ? 'ON GROUND' : 'AIRBORNE', lx, 690, 12, PALETTE.litCyan, 'center', true);
  }

  function drawHud(flight, mission, screen) {
    // Top bar.
    context.fillStyle = 'rgba(8,18,26,0.55)';
    context.fillRect(0, 0, FIELD.width, 64);
    const hdg = Math.round(((flight.heading % 360) + 360) % 360);
    text('ALT  ' + Math.round(flight.alt) + ' m', 24, 30, 24, PALETTE.text, 'left', true);
    text('SPD  ' + Math.round(flight.speed * 3.6) + ' km/h', 24, 56, 20, PALETTE.litCyan, 'left', true);
    text('HDG  ' + String(hdg).padStart(3, '0') + '°', 330, 30, 24, PALETTE.text, 'left', true);
    text('V/S  ' + (flight.verticalSpeed >= 0 ? '+' : '') + flight.verticalSpeed.toFixed(1) + ' m/s', 330, 56, 20, PALETTE.muted, 'left', true);
    const target = nextRing(mission);
    text(mission.name.toUpperCase(), FIELD.width / 2, 30, 20, PALETTE.litAmber, 'center', true);
    text(target ? `Next ring ${target.label} — ${ringsLeft(mission)} left` : 'All rings flown', FIELD.width / 2, 56, 17, PALETTE.text, 'center');
    text('SCORE ' + flight.score, FIELD.width - 24, 30, 22, PALETTE.text, 'right', true);
    text('TIME ' + Math.floor(flight.time) + 's   FUEL ' + Math.round(flight.fuel) + '%', FIELD.width - 24, 56, 17, flight.fuel < 20 ? PALETTE.litRed : PALETTE.muted, 'right', true);
    // Centre reticle.
    if (screen === SCREEN_PLAY) {
      context.strokeStyle = 'rgba(255,255,255,0.7)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(FIELD.width / 2, FIELD.height * 0.42, 14, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(FIELD.width / 2 - 22, FIELD.height * 0.42);
      context.lineTo(FIELD.width / 2 - 8, FIELD.height * 0.42);
      context.moveTo(FIELD.width / 2 + 8, FIELD.height * 0.42);
      context.lineTo(FIELD.width / 2 + 22, FIELD.height * 0.42);
      context.stroke();
      context.lineWidth = 1;
    }
    // Pilot message, centre-low above the panel.
    if (flight.message && flight.messageTimer > 0) {
      text(flight.message, FIELD.width / 2, 520, 22, '#fff', 'center');
    }
    // Stall / fuel warnings.
    if (!flight.onGround && flight.speed < 34) text('⚠ STALL — NOSE DOWN, FULL THROTTLE', FIELD.width / 2, 96, 20, PALETTE.litRed, 'center', true);
    else if (flight.fuel < 15) text('⚠ LOW FUEL', FIELD.width / 2, 96, 20, PALETTE.litRed, 'center', true);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2 - 40;
    context.fillStyle = 'rgba(10,18,26,0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    context.lineWidth = 1;
    text(title, FIELD.width / 2, y + 62, 42, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 112 + i * 34, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 28, 20, accent, 'center');
  }

  function drawTitle(flight, mission, best) {
    text('TELUK BIRU FLIGHT', FIELD.width / 2, 118, 48, '#fff', 'center');
    text('Island Runway Run  •  a seaplane, a valley, and rings in the sky', FIELD.width / 2, 148, 19, PALETTE.text, 'center');
    const buttons = [
      { id: 'rings', label: '1  Ring Run — 8 rings', y: 196 },
      { id: 'return', label: '2  Runway Return — 3 rings + land', y: 252 },
      { id: 'rescue', label: '3  Mountain Rescue — 5 rings + land', y: 308 },
    ];
    for (const button of buttons) {
      const selected = mission.id === button.id;
      context.fillStyle = selected ? PALETTE.litAmber : 'rgba(10,18,26,0.85)';
      context.fillRect(FIELD.width / 2 - 260, button.y, 520, 46);
      context.strokeStyle = selected ? '#fff' : PALETTE.panelEdge;
      context.lineWidth = 2;
      context.strokeRect(FIELD.width / 2 - 260, button.y, 520, 46);
      context.lineWidth = 1;
      text(button.label, FIELD.width / 2, button.y + 31, 20, selected ? '#10161d' : PALETTE.text, 'center');
    }
    text('Arrows / mouse steer  •  W/S or wheel: throttle  •  C: cockpit view  •  G: gear  •  P: pause', FIELD.width / 2, 398, 18, PALETTE.text, 'center');
    text('Take off from Runway 36, fly the amber rings, mind your fuel — and land gently.', FIELD.width / 2, 426, 18, PALETTE.muted, 'center');
    text('Best score ' + best, FIELD.width / 2, 462, 18, PALETTE.litAmber, 'center', true);
    text('Press Space or click to fly', FIELD.width / 2, 498, 20, PALETTE.litCyan, 'center');
  }

  /** Paint one frame. */
  function draw(flight, mission, screen, best, cameraMode) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b1c2c';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const cam = cameraFor(flight, cameraMode);
    drawSky(flight, cam);
    drawMountains(cam);
    drawGround(cam, flight);
    drawRunway(cam);
    drawRings(cam, mission);
    if (cameraMode === 'cockpit') drawCockpitNose();
    else if (screen !== SCREEN_TITLE) drawPlaneChase(flight);
    else drawPlaneChase(flight);
    drawInstruments(flight);
    drawHud(flight, mission, screen);
    if (screen === SCREEN_TITLE) drawTitle(flight, mission, best);
    else if (screen === SCREEN_PAUSED) drawPanel('Paused', ['The island will wait for you.', 'Fuel is not burning while you rest.'], 'Press P or click to resume', PALETTE.litAmber);
    else if (screen === SCREEN_OVER) drawPanel('Crashed', ['The seaplane is down — ' + (flight.damage >= 100 ? 'the airframe gave up.' : 'check the damage.'), 'Score ' + flight.score + '  •  Rings ' + flight.ringsHit + '  •  Best ' + best], 'Press Space or click to fly again', PALETTE.litRed);
    else if (screen === SCREEN_DONE) drawPanel('Mission complete!', [mission.name + ' — flown and finished.', 'Score ' + flight.score + '  •  Time ' + Math.floor(flight.time) + 's  •  Fuel left ' + Math.round(flight.fuel) + '%  •  Best ' + best], 'Press Space or click to fly again', PALETTE.litGreen);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
