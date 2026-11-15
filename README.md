# Cinder Yard

A round-based tactical FPS in three.js. Ember Crew (amber) attacks two plant sites
in a decommissioned freight yard; the Yard Wardens (teal) hold them. Five attackers
— you plus four bots — against five defender bots. A round ends when a team is
eliminated, when the planted spark cell detonates, or when a Warden defuses it.
First to five rounds, at most nine. Money earned each round buys weapons and
grenades between rounds.

## Play

```sh
node serve.ts   # then open http://localhost:8080
```

No build step, no network: static files under `game/`, three.js 0.187.0 vendored
in `game/vendor/three/`.

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look (click the game first to lock the pointer) |
| Click | Fire |
| R | Reload |
| Ctrl or C | Crouch |
| Space | Jump |
| 1–4 | Switch weapon |
| Q | Cycle weapon |
| B | Buy menu (buy phase only) |
| 1–5 in buy menu | Buy |
| E (hold) | Plant the spark cell inside a site |
| G | Throw a spark grenade |

## Arsenal

| Weapon | Price | Damage | Magazine |
| --- | --- | --- | --- |
| P10 Sidearm | $0 | 34 (×3 head) | 12 |
| Hornet-9 SMG | $1,500 | 26 (×3 head) | 28 |
| VK-7 Carbine | $2,700 | 34 (×3 head) | 30 |
| Longbow DMR | $3,800 | 82 (×2.5 head) | 8 |
| Spark Grenade | $300 | up to 90 splash | max 2/round |

Round economy: start $800, kill +$300, plant +$300, round win +$3,250,
round loss +$1,900.

## The yard

A 44 × 32 m freight yard with three lanes: container stacks west, the warehouse
shed east, open crates mid, and a gantry crane over the middle. Site A, Crane
Bay, sits under the crane's north leg; site B, the Fuel Depot, holds three tanks
and a pipe rack. Dusk light, one warm key, two yard lamps, amber against teal.

## How it is built

- `game/src/main.js` — boot, the fixed 60 Hz loop, shooting, the bomb, rounds.
- `game/src/game.js` — match state: phases, money, the buy list, the bomb.
- `game/src/world.js` — the yard: geometry, colliders, sites, spawns, nav graph.
- `game/src/bots.js` — nine bots: BFS routes, site holds, sight and hearing,
  bursts, strafe, plant and defuse.
- `game/src/player.js` — the body: crouch, jump, eye height, health, recoil.
- `game/src/weapons.js` — four guns and a grenade, ammo, view models.
- `game/src/physics.js` — shared AABB movement, one axis at a time.
- `game/src/input.js` — keyboard, mouse, pointer lock, one-shot edges.
- `game/src/hud.js` — the DOM HUD: health, ammo, money, timer, score,
  kill feed, buy menu, bomb bar, overlays.
- `game/src/audio.js` — synthesised WebAudio only; no audio files.
- `game/src/palette.js` — the look plan, shared by the scene and the CSS.

`?shot=start|play|end&seed=N` stages a deterministic frame for a screenshot
and freezes it, setting `window.__shotReady` after two paints.

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and writes
`dossier.json` with the vendored `vendor/makefun-threejs.ts` library. The entry
is its own work: an original map, names and art, no commercial game copied.
