// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=start|play|end with &seed=N stages a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS } from './weapons.js';
import { createBots } from './bots.js';
import { createMatch } from './game.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera, world.colliders, audio);
const bots = createBots(scene, world, rng);
const match = createMatch();
const hud = createHud();
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 120;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();

// Tracers: eight reusable lines, each fading out after one frame's life.
const tracerPool = [];
for (let i = 0; i < 8; i += 1) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }));
  line.frustumCulled = false;
  scene.add(line);
  tracerPool.push({ line, life: 0 });
}
let tracerIdx = 0;
function tracer(from, to) {
  const t = tracerPool[tracerIdx];
  tracerIdx = (tracerIdx + 1) % tracerPool.length;
  const attr = t.line.geometry.getAttribute('position');
  attr.setXYZ(0, from.x, from.y, from.z);
  attr.setXYZ(1, to.x, to.y, to.z);
  attr.needsUpdate = true;
  t.line.material.opacity = 0.9;
  t.life = 0.07;
}

// One reusable explosion flash.
const boomMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 12),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
);
boomMesh.visible = false;
scene.add(boomMesh);
const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 30);
scene.add(boomLight);
let boomLife = 0;
function explode(x, y, z) {
  boomMesh.position.set(x, y + 0.5, z);
  boomMesh.visible = true;
  boomMesh.scale.setScalar(0.2);
  boomLight.position.set(x, y + 1, z);
  boomLight.intensity = 60;
  boomLife = 0.5;
  audio.boom();
}
// Grenade meshes: one dark sphere per live grenade, from a pool of four.
const nadePool = [];
for (let i = 0; i < 4; i += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.5, metalness: 0.4 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  nadePool.push(mesh);
}

const matchState = match.state;
let started = false;
let overlayMode = 'start';
let matchOverShown = false;
let plantProgress = 0;
let beepT = 0;
let wasFiring = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
const noiseEvents = [];

function syncCamera() {
  player.eyePosition(eyePos);
  camera.position.copy(eyePos);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function hudSync() {
  const a = arsenal.ammo();
  hud.setAmmo(a.mag, a.reserve, arsenal.def().name);
  hud.setHealth(player.state.hp);
  hud.setMoney(matchState.money);
  hud.setTimer(matchState.phaseT);
  hud.setRound(matchState.round, matchState.score.ember, matchState.score.warden);
  const emberAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('ember');
  hud.setAlive(emberAlive, bots.aliveCount('warden'));
  const speed = player.groundSpeed();
  hud.crosshair(4 + arsenal.spread(speed) * 1400 + (player.state.crouching ? -1 : 0));
  if (matchState.bomb.state === 'planted') {
    hud.bomb(true, matchState.bomb.timer / 40, `Spark cell at ${world.sites[matchState.bomb.site].name} — ${Math.ceil(matchState.bomb.timer)}s`);
  } else if (plantProgress > 0) {
    hud.bomb(true, plantProgress / 3, 'Planting the spark cell…');
  } else {
    hud.bomb(false, 0, '');
  }
}

function resetRound() {
  const emberSpawn = world.spawns.ember;
  player.reset(emberSpawn[2][0], emberSpawn[2][1]);
  arsenal.refill();
  bots.reset();
  plantProgress = 0;
  hudSync();
}

function restartMatch() {
  matchState.score.ember = 0;
  matchState.score.warden = 0;
  matchState.round = 1;
  matchState.money = 800;
  matchState.over = false;
  matchState.winner = '';
  matchOverShown = false;
  match.startRound();
  resetRound();
}

function showRoundEnd() {
  overlayMode = 'roundEnd';
  hud.showOverlay('roundEnd', {
    winner: matchState.lastWinner,
    reason: matchState.lastReason,
    ember: matchState.score.ember,
    warden: matchState.score.warden,
  });
  audio.sting(matchState.lastWinner === 'ember');
  if (document.pointerLockElement) document.exitPointerLock();
}

function handleMatchEvent(event) {
  if (event === 'live') {
    hud.hideBuy();
    hud.banner(`Round ${matchState.round} — plant the cell or drop the Wardens`);
  } else if (event === 'roundEnd') {
    showRoundEnd();
  } else if (event === 'boom') {
    const site = world.sites[matchState.bomb.site];
    explode(site.x, 1, site.z);
    match.endRound('ember', 'Spark cell detonated.');
    showRoundEnd();
  } else if (event === 'roundStart') {
    resetRound();
  } else if (event === 'matchOver') {
    matchOverShown = true;
    overlayMode = 'matchEnd';
    hud.showOverlay('matchEnd', {
      winner: matchState.winner,
      ember: matchState.score.ember,
      warden: matchState.score.warden,
    });
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function pickNewCarrier(deadBot) {
  const alive = bots.bots.filter((b) => b.alive && b.team === 'ember');
  if (alive.length === 0) return;
  let best = alive[0];
  let bestD = Infinity;
  for (const b of alive) {
    const d = Math.hypot(b.mover.pos.x - deadBot.mover.pos.x, b.mover.pos.z - deadBot.mover.pos.z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  bots.carrier = best;
  match.dropBomb(best);
  hud.feed(`Spark cell picked up by ${best.name}`);
}

function shootPlayer(spread) {
  const result = arsenal.fire();
  if (result !== 'shot') return;
  camera.getWorldDirection(direction);
  direction.x += (rng() * 2 - 1) * spread;
  direction.y += (rng() * 2 - 1) * spread;
  direction.z += (rng() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  arsenal.muzzleWorld(muzzlePos);
  player.eyePosition(eyePos);
  raycaster.set(eyePos, direction);
  const hits = raycaster.intersectObjects(shootables, false);
  const def = arsenal.def();
  let end = eyePos.clone().addScaledVector(direction, def.range);
  for (const hit of hits) {
    const obj = hit.object;
    const bot = obj.userData.bot;
    if (bot && !bot.alive) continue;
    end = hit.point.clone();
    if (bot) {
      const part = obj.userData.part;
      const dmg = Math.round(def.dmg * (part === 'head' ? def.headMul : 1));
      const killed = bots.damage(bot, dmg, part);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
      if (killed) {
        match.awardKill();
        hud.feed(`You ▸ ${bot.name} (${def.name}) +$300`);
        if (bots.carrier === bot) pickNewCarrier(bot);
        if (player.state.hp > 0) hud.setMoney(matchState.money);
      }
    }
    break;
  }
  tracer(muzzlePos, end);
  noiseEvents.push({ x: eyePos.x, z: eyePos.z, r: 26, team: 'ember' });
  player.recoil(def.kick * (0.9 + rng() * 0.2), (rng() * 2 - 1) * def.kick * 0.4);
  hudSync();
}

function applyBoom(boom) {
  explode(boom.x, boom.y, boom.z);
  const px = player.mover.pos.x;
  const pz = player.mover.pos.z;
  const pd = Math.hypot(px - boom.x, pz - boom.z);
  if (pd < 6 && player.state.alive) {
    const dmg = Math.round(90 - (pd / 6) * 70);
    if (player.damage(dmg)) onPlayerDeath();
    else {
      hud.damageFlash();
      audio.hurt();
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = Math.hypot(bot.mover.pos.x - boom.x, bot.mover.pos.z - boom.z);
    if (d < 6) {
      const killed = bots.damage(bot, Math.round(90 - (d / 6) * 70), 'torso');
      if (killed) {
        hud.feed(`Spark grenade ▸ ${bot.name}`);
        if (bots.carrier === bot) pickNewCarrier(bot);
      }
    }
  }
}

function onPlayerDeath() {
  hud.banner('You are down — your crew fights on');
  if (matchState.bomb.state === 'carried' && matchState.bomb.carrier === 'player') {
    pickNewCarrier({ mover: { pos: player.mover.pos } });
  }
}

function handleBotEvents(events) {
  for (const e of events) {
    if (e.type === 'shot') {
      tracer(e.from, e.to);
      const dist = e.dist || 20;
      audio.enemyShot(dist);
      noiseEvents.push({ x: e.from.x, z: e.from.z, r: 24, team: e.killer.team });
      if (!e.hit) continue;
      if (e.victim === 'player') {
        if (!player.state.alive) continue;
        if (player.damage(e.dmg)) onPlayerDeath();
        else {
          hud.damageFlash();
          audio.hurt();
        }
      } else {
        const victim = e.victim;
        const killed = bots.damage(victim, e.dmg, 'torso');
        if (killed) {
          hud.feed(`${e.killer.name} ▸ ${victim.name}`);
          if (bots.carrier === victim) pickNewCarrier(victim);
        }
      }
    } else if (e.type === 'planted') {
      match.plant(e.site);
      hud.feed(`${e.bot.name} planted the spark cell at ${world.sites[e.site].name}`);
      hud.banner('Spark cell planted — defend it');
    } else if (e.type === 'defused') {
      match.defuse();
      match.awardDefuse();
      match.endRound('warden', 'Spark cell defused.');
      showRoundEnd();
    }
  }
}

function step(dt) {
  const event = match.tick(dt);
  if (event) handleMatchEvent(event);
  const phase = matchState.phase;

  // Bomb beeps accelerate as the fuse runs down.
  if (matchState.bomb.state === 'planted') {
    beepT -= dt;
    if (beepT <= 0) {
      audio.beep(matchState.bomb.timer < 8);
      beepT = Math.max(0.25, matchState.bomb.timer / 40);
    }
  }

  if (phase === 'buy' || phase === 'live') {
    player.step(dt, input.state.keys);
  }
  if (phase === 'live') {
    const ctx = {
      player: {
        pos: player.mover.pos, alive: player.state.alive,
        moving: player.groundSpeed() > 1, crouched: player.state.crouching,
      },
      noise: noiseEvents,
      bomb: matchState.bomb,
    };
    const events = bots.step(dt, performance.now() / 1000, ctx);
    handleBotEvents(events);
    noiseEvents.length = 0;

    // Elimination ends the round.
    const emberAlive = (player.state.alive ? 1 : 0) + bots.aliveCount('ember');
    const wardenAlive = bots.aliveCount('warden');
    if (wardenAlive === 0) {
      match.endRound('ember', 'Wardens eliminated.');
      showRoundEnd();
    } else if (emberAlive === 0) {
      match.endRound('warden', 'Ember Crew eliminated.');
      showRoundEnd();
    }

    // Plant: hold E inside a site while carrying the cell.
    const carrying = matchState.bomb.state === 'carried' && matchState.bomb.carrier === 'player';
    if (carrying && player.state.alive && input.state.keys.has('KeyE')) {
      const site = playerInSite();
      if (site) {
        plantProgress += dt;
        if (plantProgress >= 3) {
          plantProgress = 0;
          match.plant(site);
          match.awardPlant();
          hud.feed(`You planted the spark cell at ${world.sites[site].name} +$300`);
          hud.banner('Spark cell planted — defend it');
          audio.beep(true);
        }
      } else plantProgress = 0;
    } else plantProgress = 0;
  } else {
    plantProgress = 0;
  }

  // Grenades and explosions run in every phase.
  arsenal.step(dt);
  const booms = arsenal.takeBooms();
  for (const boom of booms) applyBoom(boom);
  if (boomLife > 0) {
    boomLife -= dt;
    const f = Math.max(0, boomLife / 0.5);
    boomMesh.scale.setScalar(0.2 + (1 - f) * 6);
    boomMesh.material.opacity = f * 0.7;
    boomLight.intensity = f * 60;
    if (boomLife <= 0) boomMesh.visible = false;
  }
  const nades = arsenal.grenadeMeshes();
  for (let i = 0; i < nadePool.length; i += 1) {
    const mesh = nadePool[i];
    if (i < nades.length) {
      mesh.visible = true;
      mesh.position.copy(nades[i].pos);
    } else mesh.visible = false;
  }
  for (const t of tracerPool) {
    if (t.life > 0) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
    }
  }
  hudSync();
}

function playerInSite() {
  const px = player.mover.pos.x;
  const pz = player.mover.pos.z;
  for (const key of ['A', 'B']) {
    const site = world.sites[key];
    const dx = px - site.x;
    const dz = pz - site.z;
    if (dx * dx + dz * dz < site.r * site.r) return key;
  }
  return '';
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const locked = input.state.locked;
    // Edges are read once per frame here.
    const pressR = input.pressed('KeyR');
    const pressB = input.pressed('KeyB');
    const pressG = input.pressed('KeyG');
    const pressQ = input.pressed('KeyQ');
    const press1 = input.pressed('Digit1');
    const press2 = input.pressed('Digit2');
    const press3 = input.pressed('Digit3');
    const press4 = input.pressed('Digit4');
    const press5 = input.pressed('Digit5');

    if (locked) {
      const look = input.takeLook();
      player.look(look.x, look.y);
      const buyOpen = !document.getElementById('buy').hidden;
      const def = arsenal.def();
      const firing = input.state.firing;
      if (firing && player.state.alive && matchState.phase === 'live') {
        if (def.auto || !wasFiring) shootPlayer(arsenal.spread(player.groundSpeed()));
      }
      wasFiring = firing;
      if (pressR) arsenal.reload();
      if (pressG && player.state.alive && matchState.phase === 'live') {
        camera.getWorldDirection(direction);
        player.eyePosition(eyePos);
        if (arsenal.throwNade(eyePos, direction)) hud.setAmmo(arsenal.ammo().mag, arsenal.ammo().reserve, def.name);
      }
      if (pressQ && !buyOpen) cycleWeapon();
      const ownedIds = WEAPONS.filter((w) => arsenal.owned.has(w.id)).map((w) => w.id);
      if (!buyOpen) {
        if (press1 && ownedIds[0]) arsenal.switchTo(ownedIds[0]);
        if (press2 && ownedIds[1]) arsenal.switchTo(ownedIds[1]);
        if (press3 && ownedIds[2]) arsenal.switchTo(ownedIds[2]);
        if (press4 && ownedIds[3]) arsenal.switchTo(ownedIds[3]);
      }
      if (pressB && matchState.phase === 'buy') {
        if (document.getElementById('buy').hidden) openBuy();
        else hud.hideBuy();
      }
      if (!document.getElementById('buy').hidden) {
        const list = match.buyList();
        const idx = press1 ? 0 : press2 ? 1 : press3 ? 2 : press4 ? 3 : press5 ? 4 : -1;
        if (idx >= 0 && idx < list.length) {
          const item = list[idx];
          const result = arsenal.buy(item.id, matchState.money);
          if (result.ok) {
            matchState.money -= result.cost;
            audio.buy();
            openBuy();
            hud.setMoney(matchState.money);
          }
        }
      }
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
      syncCamera();
    } else {
      accumulator = 0;
    }
    input.endFrame();
  }
  renderer.render(scene, camera);
}

function cycleWeapon() {
  const owned = WEAPONS.filter((w) => arsenal.owned.has(w.id));
  if (owned.length < 2) return;
  const current = owned.findIndex((w) => w.id === arsenal.state.current);
  arsenal.switchTo(owned[(current + 1) % owned.length].id);
}

function openBuy() {
  const list = match.buyList().map((item, i) => ({
    ...item,
    key: i + 1,
    owned: item.kind === 'gun' ? arsenal.owned.has(item.id) : undefined,
  }));
  document.getElementById('buy-round').textContent = String(matchState.round);
  hud.showBuy(list, matchState.money);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    overlayMode = null;
    hud.hideOverlay();
    hud.hideBuy();
  } else if (overlayMode === null && started && !matchOverShown) {
    overlayMode = 'paused';
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (matchOverShown) restartMatch();
  input.requestLock();
});

function aimAt(point) {
  const body = player.mover.pos;
  const dx = point.x - body.x;
  const dy = point.y - (body.y + player.state.eye);
  const dz = point.z - body.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  match.startRound();
  resetRound();
  matchState.round = name === 'start' ? 1 : 2;
  matchState.phase = 'live';
  matchState.phaseT = name === 'end' ? 0 : 85;
  if (name === 'play') {
    matchState.score.ember = 1;
    matchState.score.warden = 0;
    matchState.money = 3050;
  } else if (name === 'end') {
    matchState.score.ember = 2;
    matchState.score.warden = 1;
    matchState.money = 1900;
  } else {
    matchState.score.ember = 0;
    matchState.score.warden = 0;
    matchState.money = 800;
  }
  player.state.pitch = 0;
  player.state.yaw = 0;
  if (name === 'play') {
    // Mid-round: two Wardens hold the middle lane; the player takes one down.
    const w1 = bots.bots[4];
    const w2 = bots.bots[5];
    // Lane check: from (0, 9) to (-6, 2) nothing stands between; the mid crate at
    // (0, 5.5) blocks the straight lane, so the target holds the west lane.
    w1.mover.set(-6, 0, 2);
    w1.state = 'hold';
    w1.holdT = 999;
    w1.yaw = Math.PI;
    w2.mover.set(6, 0, 0);
    w2.state = 'hold';
    w2.holdT = 999;
    w2.yaw = Math.PI;
    settle(20);
    player.mover.set(0, 0, 9);
    aimAt(new THREE.Vector3(-6, 1.2, 2));
    for (let round = 0; round < 3; round += 1) {
      shootPlayer(0);
      if (round < 2) settle(8);
    }
    settle(12);
    player.state.hp = 100;
    player.state.alive = true;
  } else if (name === 'end') {
    // Round won: the cell sits planted at the Fuel Depot, the yard behind it.
    match.plant('B');
    player.mover.set(11, 0, -6);
    aimAt(new THREE.Vector3(16, 0.6, -11));
    settle(20);
    overlayMode = 'roundEnd';
    matchState.lastWinner = 'ember';
    matchState.lastReason = 'Spark cell detonated.';
    hud.showOverlay('roundEnd', { winner: 'ember', reason: 'Spark cell detonated.', ember: 2, warden: 1 });
  } else {
    player.mover.set(0, 0, 13);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  }
  hudSync();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetRound();
syncCamera();
hudSync();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
