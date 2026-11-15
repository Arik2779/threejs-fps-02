// The bots: nine opponents and allies who walk routes, hold sites, react to sight and
// sound, and shoot back. One fixed raycaster, one scratch path and one events list are
// reused across frames; nothing here allocates in the hot loop.
import * as THREE from 'three';
import { createMover } from './physics.js';
import { PALETTE } from './palette.js';

const BOT_HP = 100;
const BOT_SPEED = 3.4;
const BOT_STRAFE = 1.8;
const SIGHT_RANGE = 38;
const SIGHT_FOV = 0.25;
const HEAR_RANGE = 26;
const SHOT_DMG = 11;
const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;

const EMBER_NAMES = ['Ash', 'Flint', 'Cinder', 'Spark'];
const WARDEN_NAMES = ['Bolt', 'Rivet', 'Gage', 'Holt', 'Pike'];

export function createBots(scene, world, rng) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const losFrom = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  const events = [];
  const queue = new Int32Array(64);
  const visited = new Uint8Array(64);
  const parent = new Int32Array(64);

  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.canvas), roughness: 0.7 });
  const emberMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.6 });
  const wardenMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.warden), roughness: 0.6 });
  const torsoGeo = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  const armGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
  const gunGeo = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const visorGeo = new THREE.BoxGeometry(0.2, 0.05, 0.05);

  const bots = [];
  const hitMeshes = [];

  function buildBot(team, name, index) {
    const group = new THREE.Group();
    const teamMat = team === 'ember' ? emberMat : wardenMat;
    const torso = new THREE.Mesh(torsoGeo, teamMat);
    torso.position.y = 1.12;
    const head = new THREE.Mesh(headGeo, darkMat);
    head.position.y = 1.66;
    const visor = new THREE.Mesh(visorGeo, teamMat);
    visor.position.set(0, 1.68, -0.14);
    const legL = new THREE.Mesh(legGeo, bodyMat);
    legL.position.set(-0.11, 0.4, 0);
    const legR = new THREE.Mesh(legGeo, bodyMat);
    legR.position.set(0.11, 0.4, 0);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.32, 1.15, 0);
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.32, 1.15, -0.1);
    const gun = new THREE.Mesh(gunGeo, darkMat);
    gun.position.set(0.2, 1.2, -0.4);
    group.add(torso, head, visor, legL, legR, armL, armR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      id: index, name, team, group, torso, head,
      mover: createMover(world.colliders, 0.34, 1.75),
      hp: BOT_HP, alive: true,
      state: 'route', route: [], routeIdx: 0, routeTarget: -1, holdNode: -1, holdT: 0,
      target: null, targetKind: '', reaction: 0, burst: 0, shotT: 0, pauseT: 0,
      sightT: index * 0.03, lostT: 0, strafeDir: 1, strafeT: 0,
      plantT: 0, defuseT: 0, role: '', site: '', yaw: 0, walkPhase: index * 1.3,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    return bot;
  }

  for (let i = 0; i < 4; i += 1) bots.push(buildBot('ember', EMBER_NAMES[i], i));
  for (let i = 0; i < 5; i += 1) bots.push(buildBot('warden', WARDEN_NAMES[i], 4 + i));

  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    const nodes = world.nav.nodes;
    for (let i = 0; i < nodes.length; i += 1) {
      const dx = nodes[i][0] - x;
      const dz = nodes[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  function findPath(from, to) {
    if (from === to) return [to];
    visited.fill(0);
    parent.fill(-1);
    let head = 0;
    let tail = 0;
    queue[tail++] = from;
    visited[from] = 1;
    while (head < tail) {
      const n = queue[head++];
      const adj = world.nav.adjacency[n];
      for (let i = 0; i < adj.length; i += 1) {
        const m = adj[i];
        if (visited[m]) continue;
        visited[m] = 1;
        parent[m] = n;
        if (m === to) {
          const path = [to];
          let cur = m;
          while (parent[cur] !== -1) {
            cur = parent[cur];
            path.push(cur);
          }
          path.reverse();
          return path;
        }
        queue[tail++] = m;
      }
    }
    return [to];
  }

  function routeTo(bot, node) {
    const from = nearestNode(bot.mover.pos.x, bot.mover.pos.z);
    bot.route = findPath(from, node);
    bot.routeIdx = 0;
    bot.routeTarget = node;
    bot.state = 'route';
  }

  function losClear(from, to) {
    losFrom.copy(from);
    losDir.set(to.x - from.x, to.y - from.y, to.z - from.z);
    const dist = losDir.length();
    if (dist > SIGHT_RANGE) return false;
    losDir.normalize();
    raycaster.set(losFrom, losDir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > dist - 0.6;
  }

  function visibleEnemy(bot, ctx) {
    // Returns {kind, bot|player, pos, dist} or null: nearest enemy in sight.
    let best = null;
    let bestD = Infinity;
    const eye = bot.mover.pos;
    const fx = Math.sin(bot.yaw);
    const fz = Math.cos(bot.yaw);
    const eyePos = { x: eye.x, y: eye.y + 1.6, z: eye.z };
    if (ctx.player.alive) {
      const p = ctx.player;
      const dx = p.pos.x - eye.x;
      const dy = p.pos.y + 1.45 - (eye.y + 1.6);
      const dz = p.pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < bestD && d < SIGHT_RANGE) {
        const dot = (dx * -fx + dz * -fz) / (d || 1);
        if (dot > SIGHT_FOV || d < 4) {
          if (losClear(eyePos, { x: p.pos.x, y: p.pos.y + 1.45, z: p.pos.z })) {
            best = { kind: 'player', dist: d };
            bestD = d;
          }
        }
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team || other === bot) continue;
      const dx = other.mover.pos.x - eye.x;
      const dz = other.mover.pos.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestD || d >= SIGHT_RANGE) continue;
      const dot = (dx * -fx + dz * -fz) / (d || 1);
      if (dot < SIGHT_FOV && d > 4) continue;
      if (losClear(eyePos, { x: other.mover.pos.x, y: other.mover.pos.y + 1.2, z: other.mover.pos.z })) {
        best = { kind: 'bot', bot: other, dist: d };
        bestD = d;
      }
    }
    return best;
  }

  function aimAt(bot, tx, tz) {
    bot.yaw = Math.atan2(-(tx - bot.mover.pos.x), -(tz - bot.mover.pos.z));
  }

  function muzzleOf(bot, out) {
    out.set(bot.mover.pos.x, bot.mover.pos.y + 1.25, bot.mover.pos.z);
    return out;
  }

  const muzzle = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  return {
    bots,
    hitMeshes,
    carrier: null,
    reset() {
      const emberSpawn = world.spawns.ember;
      const wardenSpawn = world.spawns.warden;
      const emberSites = ['A', 'A', 'B', null];
      const wardenSites = ['A', 'A', 'B', 'B', null];
      for (const bot of bots) {
        bot.hp = BOT_HP;
        bot.alive = true;
        bot.group.rotation.set(0, 0, 0);
        bot.group.position.y = 0;
        bot.target = null;
        bot.plantT = 0;
        bot.defuseT = 0;
        bot.burst = 0;
        bot.pauseT = 0;
        bot.reaction = 0;
        if (bot.team === 'ember') {
          const s = emberSpawn[bot.id];
          bot.mover.set(s[0], 0, s[1]);
          bot.yaw = Math.PI;
          bot.role = 'attack';
          bot.site = emberSites[bot.id];
        } else {
          const i = bot.id - 4;
          const s = wardenSpawn[i];
          bot.mover.set(s[0], 0, s[1]);
          bot.yaw = 0;
          bot.role = 'defend';
          bot.site = wardenSites[i];
        }
        bot.state = 'route';
        const dest = bot.role === 'attack'
          ? (bot.site === 'A' ? 7 : bot.site === 'B' ? 19 : 9)
          : (bot.site === 'A' ? 6 : bot.site === 'B' ? 18 : 2);
        routeTo(bot, dest);
        bot.holdNode = dest;
      }
      this.carrier = null;
    },
    aliveCount(team) {
      let n = 0;
      for (const bot of bots) if (bot.alive && bot.team === team) n += 1;
      return n;
    },
    damage(bot, amount, part) {
      if (!bot.alive) return false;
      bot.hp -= amount;
      bot.plantT = 0;
      bot.defuseT = 0;
      if (bot.hp > 0) return false;
      bot.hp = 0;
      bot.alive = false;
      bot.group.rotation.x = -1.45;
      bot.group.position.y = -0.1;
      return true;
    },
    step(dt, time, ctx) {
      events.length = 0;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const pos = bot.mover.pos;
        // Sight: staggered checks, one target at a time.
        bot.sightT -= dt;
        if (bot.sightT <= 0) {
          bot.sightT = 0.15;
          const seen = visibleEnemy(bot, ctx);
          if (seen) {
            bot.lostT = 0;
            if (!bot.target) bot.reaction = 0.4 + rng() * 0.35;
            bot.target = seen;
            bot.targetKind = seen.kind;
          } else if (bot.target) {
            bot.lostT += 0.15;
            if (bot.lostT > 2) {
              bot.target = null;
              bot.plantT = 0;
            }
          }
        }
        // Hearing: a shot nearby pulls an idle bot to look.
        if (!bot.target && ctx.noise) {
          for (const n of ctx.noise) {
            if (n.team === bot.team) continue;
            const dx = n.x - pos.x;
            const dz = n.z - pos.z;
            if (dx * dx + dz * dz < HEAR_RANGE * HEAR_RANGE) {
              routeTo(bot, nearestNode(n.x, n.z));
              bot.holdT = 3;
              break;
            }
          }
        }

        let wx = 0;
        let wz = 0;
        let speed = BOT_SPEED;
        if (bot.target) {
          const t = bot.target;
          const tx = t.kind === 'player' ? ctx.player.pos.x : t.bot.mover.pos.x;
          const ty = t.kind === 'player' ? ctx.player.pos.y + 1.45 : t.bot.mover.pos.y + 1.2;
          const tz = t.kind === 'player' ? ctx.player.pos.z : t.bot.mover.pos.z;
          aimAt(bot, tx, tz);
          bot.plantT = 0;
          // Strafe while engaging; plant/defuse pause the fight.
          bot.strafeT -= dt;
          if (bot.strafeT <= 0) {
            bot.strafeDir = rng() < 0.5 ? -1 : 1;
            bot.strafeT = 0.8 + rng() * 0.6;
          }
          const sin = Math.sin(bot.yaw);
          const cos = Math.cos(bot.yaw);
          wx = cos * bot.strafeDir;
          wz = -sin * bot.strafeDir;
          speed = BOT_STRAFE;
          if (bot.reaction > 0) {
            bot.reaction -= dt;
          } else if (bot.pauseT > 0) {
            bot.pauseT -= dt;
          } else {
            if (bot.burst === 0) bot.burst = 3 + Math.floor(rng() * 3);
            bot.shotT -= dt;
            if (bot.shotT <= 0) {
              bot.shotT = 0.13;
              bot.burst -= 1;
              const d = bot.target.dist;
              let chance = 0.42 - (d / SIGHT_RANGE) * 0.24;
              if (t.kind === 'player') {
                if (ctx.player.moving) chance *= 0.7;
                if (ctx.player.crouched) chance *= 0.75;
              }
              const hit = rng() < chance;
              muzzleOf(bot, muzzle);
              targetPos.set(tx, ty, tz);
              events.push({
                type: 'shot', from: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
                to: { x: tx, y: ty, z: tz }, hit,
                dmg: hit ? SHOT_DMG : 0, killer: bot,
                victim: t.kind === 'player' ? 'player' : t.bot,
                dist: d,
              });
              if (bot.burst === 0) bot.pauseT = 0.5 + rng() * 0.4;
            }
          }
        } else if (ctx.bomb.state === 'planted' && bot.team === 'warden') {
          // Defenders converge on the planted site and defuse.
          const site = world.sites[ctx.bomb.site];
          const dx = site.x - pos.x;
          const dz = site.z - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < site.r) {
            bot.defuseT += dt;
            if (bot.defuseT >= DEFUSE_SECONDS) {
              bot.defuseT = 0;
              events.push({ type: 'defused', bot });
            }
          } else {
            bot.defuseT = 0;
            const targetNode = ctx.bomb.site === 'A' ? 7 : 19;
            if (bot.state !== 'route' || bot.routeTarget !== targetNode) routeTo(bot, targetNode);
          }
        } else if (this.carrier === bot && bot.role === 'attack' && ctx.bomb.state === 'carried') {
          // The carrier plants at its assigned site.
          const site = world.sites[bot.site || 'A'];
          const dx = site.x - pos.x;
          const dz = site.z - pos.z;
          if (Math.hypot(dx, dz) < site.r) {
            bot.plantT += dt;
            if (bot.plantT >= PLANT_SECONDS) {
              bot.plantT = 0;
              events.push({ type: 'planted', bot, site: bot.site || 'A' });
            }
          }
        }

        // Walk the route when not fighting, planting or defusing.
        if (!bot.target && bot.state === 'route' && bot.route.length > 0) {
          const node = world.nav.nodes[bot.route[bot.routeIdx]];
          const dx = node[0] - pos.x;
          const dz = node[1] - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.6) {
            bot.routeIdx += 1;
            if (bot.routeIdx >= bot.route.length) {
              bot.state = 'hold';
              bot.holdT = bot.role === 'defend' ? 999 : 2;
            }
          } else {
            wx = dx / dist;
            wz = dz / dist;
            bot.yaw = Math.atan2(-wx, -wz);
          }
        } else if (!bot.target && bot.state === 'hold') {
          // Defenders hold and slowly scan; attackers wait, then push on.
          bot.yaw += Math.sin(time * 0.5 + bot.walkPhase) * dt * 0.35;
          if (bot.holdT !== 999) {
            bot.holdT -= dt;
            if (bot.holdT <= 0) {
              const next = bot.role === 'attack'
                ? (bot.site === 'A' ? 7 : bot.site === 'B' ? 19 : 9)
                : bot.holdNode;
              routeTo(bot, next);
            }
          }
        }

        bot.mover.step(dt, wx, wz, speed, 30, 8, false);
        bot.group.position.copy(pos);
        bot.group.rotation.y = bot.yaw;
        // Walk bob: legs swing while moving.
        bot.walkPhase += dt * (Math.hypot(bot.mover.vel.x, bot.mover.vel.z) > 0.5 ? 9 : 0);
        const swing = Math.sin(bot.walkPhase) * 0.35;
        bot.group.children[3].rotation.x = swing;
        bot.group.children[4].rotation.x = -swing;
      }
      return events;
    },
  };
}
