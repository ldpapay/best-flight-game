[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ldpapay/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ldpapay/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

# Teluk Biru Flight — Island Runway Run

An original offline flight game for the make.fun "Make the best flight game" bounty ($500).

Fly a light island seaplane over Teluk Biru — a valley with a runway, a lake, a small town, a beach and mountains to the north. Chase view or cockpit view, lit instruments, and a HUD with altitude, speed and heading.

## Play

Serve `game/` with any static server, or run `node serve.ts` and open http://localhost:8080 in desktop Chrome. No network request is made; everything is local files.

- **Arrows / mouse**: steer — pitch and bank, bank turns the nose
- **W / S or mouse wheel**: throttle up / down
- **C**: toggle cockpit / chase view
- **G**: landing gear up / down
- **B**: brake, **P**: pause, **Space / click**: start
- **1 / 2 / 3** or click a mission button: choose a mission

## Missions

1. **Ring Run** — fly all 8 amber rings over the lake, town and beach.
2. **Runway Return** — take off, fly 3 rings, land back on Runway 36.
3. **Mountain Rescue** — thread 5 rings through the north pass, then land.

Throttle and turn discipline matter: climb bleeds speed, a slow plane stalls, fuel burns with throttle, and a hard touchdown or a terrain hit damages the airframe. A gentle, aligned, gear-down landing on the runway scores +500.

## Files

- `game/index.html` — the page
- `game/src/config.js` — tuning and palette
- `game/src/terrain.js` — Teluk Biru island, height and landmarks
- `game/src/flight.js` — flight model, fuel and damage
- `game/src/missions.js` — the three sorties and their rings
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — synthesised engine, ring and landing sounds
- `game/src/render.js` — perspective view, aircraft, instruments, HUD
- `game/src/shots.js` — deterministic screenshot scenes
- `game/src/main.js` — boot, loop and screens
- `main.ts` — hands `game/` and `screenshots/` to `/output` with a dossier

## License

MIT — see `LICENSE`.
