// The arsenal: four guns and a grenade, each with its own numbers, view model and feel.
// The module owns the ammo and the models; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = [
  { id: 'p10', name: 'P10 Sidearm', price: 0, dmg: 34, headMul: 3, mag: 12, reserve: 48, gap: 0.16, auto: false, reload: 1.1, spreadStill: 0.004, spreadMove: 0.03, kick: 0.008, range: 60 },
  { id: 'hornet', name: 'Hornet-9 SMG', price: 1500, dmg: 26, headMul: 3, mag: 28, reserve: 84, gap: 0.085, auto: true, reload: 1.6, spreadStill: 0.006, spreadMove: 0.035, kick: 0.005, range: 45 },
  { id: 'vk7', name: 'VK-7 Carbine', price: 2700, dmg: 34, headMul: 3, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.009, range: 80 },
  { id: 'longbow', name: 'Longbow DMR', price: 3800, dmg: 82, headMul: 2.5, mag: 8, reserve: 24, gap: 0.9, auto: false, reload: 2.4, spreadStill: 0.0008, spreadMove: 0.05, kick: 0.03, range: 100 },
];
export const GRENADE = { id: 'spark', name: 'Spark Grenade', price: 300 };

const GRAVITY = 14;
const FUSE = 2.2;

export function createArsenal(camera, colliders, audio) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });

  const models = {};
  for (const def of WEAPONS) {
    const model = new THREE.Group();
    const long = def.id === 'longbow';
    const short = def.id === 'hornet';
    const pistol = def.id === 'p10';
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(pistol ? 0.07 : 0.09, pistol ? 0.09 : 0.1, pistol ? 0.26 : long ? 0.5 : 0.42), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, long ? 0.55 : short ? 0.22 : 0.4), grip);
    barrel.position.set(0, 0.025, long ? -0.48 : short ? -0.3 : -0.38);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, pistol ? 0.1 : 0.22), grip);
    stock.position.set(0, -0.02, pistol ? 0.16 : 0.3);
    model.add(receiver, barrel, stock);
    if (!pistol) {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), dark);
      mag.position.set(0, -0.11, -0.05);
      mag.rotation.x = 0.15;
      model.add(mag);
    }
    if (long) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10), dark);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.08, -0.05);
      model.add(scope);
    }
    if (def.id === 'vk7') {
      const gripFront = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), dark);
      gripFront.position.set(0, -0.09, -0.22);
      model.add(gripFront);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const def of WEAPONS) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  const owned = new Set(['p10']);
  const state = {
    current: 'p10', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, nades: 0,
  };
  const grenades = [];
  const booms = [];
  const probe = new THREE.Box3();
  const muzzle = new THREE.Vector3();

  function def() {
    return WEAPONS.find((w) => w.id === state.current);
  }

  function overlapsGrenade(x, y, z) {
    probe.min.set(x - 0.12, y - 0.12, z - 0.12);
    probe.max.set(x + 0.12, y + 0.12, z + 0.12);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  function showModel() {
    for (const id of Object.keys(models)) models[id].visible = id === state.current;
  }
  showModel();

  return {
    state,
    owned,
    def,
    stats() {
      return def();
    },
    ammo() {
      return ammo[state.current];
    },
    // Fires one round. Returns 'shot', 'dry' or null (not ready).
    fire() {
      const d = def();
      if (state.cooldown > 0 || state.reloadLeft > 0) return null;
      if (ammo[d.id].mag <= 0) {
        audio.dry();
        return 'dry';
      }
      ammo[d.id].mag -= 1;
      state.cooldown = d.gap;
      state.flash = 0.06;
      state.kick = d.id === 'longbow' ? 0.09 : 0.055;
      audio.shot(d.id);
      return 'shot';
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || ammo[d.id].mag === d.mag || ammo[d.id].reserve === 0) return false;
      state.reloadLeft = d.reload;
      audio.reload();
      return true;
    },
    switchTo(id) {
      if (!owned.has(id) || id === state.current) return false;
      state.current = id;
      state.reloadLeft = 0;
      state.cooldown = 0;
      showModel();
      return true;
    },
    buy(id, money) {
      if (id === 'spark') {
        if (state.nades >= 2) return { ok: false, reason: 'full' };
        if (money < GRENADE.price) return { ok: false, reason: 'poor' };
        state.nades += 1;
        return { ok: true, cost: GRENADE.price };
      }
      const d = WEAPONS.find((w) => w.id === id);
      if (!d) return { ok: false, reason: 'unknown' };
      if (owned.has(id)) return { ok: false, reason: 'owned' };
      if (money < d.price) return { ok: false, reason: 'poor' };
      owned.add(id);
      ammo[id] = { mag: d.mag, reserve: d.reserve };
      state.current = id;
      state.reloadLeft = 0;
      showModel();
      return { ok: true, cost: d.price };
    },
    refill() {
      for (const id of owned) {
        const d = WEAPONS.find((w) => w.id === id);
        ammo[id] = { mag: d.mag, reserve: d.reserve };
      }
      state.nades = 0;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMove;
    },
    kick() {
      return def().kick;
    },
    throwNade(origin, direction) {
      if (state.nades <= 0) return false;
      state.nades -= 1;
      grenades.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(direction.x * 13, direction.y * 13 + 3.2, direction.z * 13),
        fuse: FUSE,
      });
      return true;
    },
    muzzleWorld(out) {
      muzzle.set(0.24, -0.18, -0.95);
      return camera.localToWorld(out.copy(muzzle));
    },
    booms() {
      return booms;
    },
    step(dt) {
      const d = def();
      state.cooldown = Math.max(0, state.cooldown - dt);
      state.flash = Math.max(0, state.flash - dt);
      state.kick += (0 - state.kick) * Math.min(1, dt * 14);
      const model = models[state.current];
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      flash.visible = state.flash > 0;
      flash.rotation.z = state.flash * 30;
      flashLight.intensity = state.flash > 0 ? 18 : 0;
      if (state.reloadLeft > 0) {
        state.reloadLeft = Math.max(0, state.reloadLeft - dt);
        model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
        if (state.reloadLeft === 0) {
          const need = d.mag - ammo[d.id].mag;
          const take = Math.min(need, ammo[d.id].reserve);
          ammo[d.id].mag += take;
          ammo[d.id].reserve -= take;
        }
      }
      for (let i = grenades.length - 1; i >= 0; i -= 1) {
        const g = grenades[i];
        g.fuse -= dt;
        g.vel.y -= GRAVITY * dt;
        const nx = g.pos.x + g.vel.x * dt;
        if (!overlapsGrenade(nx, g.pos.y, g.pos.z)) g.pos.x = nx;
        else g.vel.x *= -0.45;
        const nz = g.pos.z + g.vel.z * dt;
        if (!overlapsGrenade(g.pos.x, g.pos.y, nz)) g.pos.z = nz;
        else g.vel.z *= -0.45;
        const ny = g.pos.y + g.vel.y * dt;
        if (ny < 0.12) {
          g.pos.y = 0.12;
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.vel.x *= 0.8;
          g.vel.z *= 0.8;
        } else if (!overlapsGrenade(g.pos.x, ny, g.pos.z)) g.pos.y = ny;
        else g.vel.y *= -0.45;
        if (g.fuse <= 0) {
          booms.push({ x: g.pos.x, y: g.pos.y, z: g.pos.z });
          grenades.splice(i, 1);
        }
      }
    },
    takeBooms() {
      const out = booms.splice(0, booms.length);
      return out;
    },
    grenadeMeshes() {
      return grenades;
    },
  };
}
