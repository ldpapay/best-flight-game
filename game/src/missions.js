// The three sorties. Each mission is a list of glowing target rings in
// the sky plus a finish: rings only, rings then a runway landing, or
// rings through the mountain pass then a short-strip landing. Rings are
// placed over recognisable landmarks so the pilot can navigate by eye:
// the lake, the town, the beach and the north ridge.

export function createMission(id) {
  if (id === 'return') {
    return {
      id: 'return',
      name: 'Runway Return',
      goal: 'Take off, fly the 3 rings, then land back on Runway 36',
      finish: 'land',
      rings: [
        { x: -900, y: 180, z: -900, r: 55, hit: false, label: '1' },
        { x: 900, y: 220, z: -1400, r: 55, hit: false, label: '2' },
        { x: 0, y: 160, z: -2100, r: 55, hit: false, label: '3' },
      ],
    };
  }
  if (id === 'rescue') {
    return {
      id: 'rescue',
      name: 'Mountain Rescue',
      goal: 'Thread 5 rings through the north pass, then land on the strip',
      finish: 'land',
      rings: [
        { x: -600, y: 200, z: -1600, r: 50, hit: false, label: '1' },
        { x: 500, y: 260, z: -2200, r: 50, hit: false, label: '2' },
        { x: -400, y: 320, z: -2800, r: 50, hit: false, label: '3' },
        { x: 600, y: 380, z: -3300, r: 50, hit: false, label: '4' },
        { x: 0, y: 340, z: -3800, r: 50, hit: false, label: '5' },
      ],
    };
  }
  return {
    id: 'rings',
    name: 'Ring Run',
    goal: 'Fly all 8 rings over the lake, town and beach — fast and clean',
    finish: 'rings',
    rings: [
      { x: -1200, y: 170, z: -600, r: 55, hit: false, label: '1' },
      { x: -1750, y: 200, z: -750, r: 55, hit: false, label: '2' },
      { x: -900, y: 230, z: -1500, r: 55, hit: false, label: '3' },
      { x: 400, y: 210, z: -1800, r: 55, hit: false, label: '4' },
      { x: 1250, y: 190, z: -400, r: 55, hit: false, label: '5' },
      { x: 1400, y: 240, z: 900, r: 55, hit: false, label: '6' },
      { x: -1400, y: 220, z: 1200, r: 55, hit: false, label: '7' },
      { x: 0, y: 180, z: 600, r: 55, hit: false, label: '8' },
    ],
  };
}

export function nextRing(mission) {
  return mission.rings.find((ring) => !ring.hit) ?? null;
}

export function ringsLeft(mission) {
  return mission.rings.filter((ring) => !ring.hit).length;
}

export function missionComplete(mission, flightState) {
  if (mission.finish === 'rings') return ringsLeft(mission) === 0;
  return ringsLeft(mission) === 0 && flightState.landed;
}

export function missionScore(mission, flightState) {
  let score = flightState.score;
  if (missionComplete(mission, flightState)) score += 1000;
  const timeBonus = Math.max(0, 600 - Math.floor(flightState.time)) * 2;
  return score + (missionComplete(mission, flightState) ? timeBonus : 0);
}
