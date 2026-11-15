// The player: one body against the world's colliders, a view, health and recoil. The
// mover owns the physics; this module owns the human parts (crouch, jump, eye height).
import { createMover } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;

export function createPlayer(colliders) {
  const mover = createMover(colliders, RADIUS, STAND_HEIGHT);
  mover.set(0, 0, 13);
  const player = {
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    hp: 100,
    alive: true,
  };

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      mover.setHeight(CROUCH_HEIGHT);
    } else if (!crouching && player.crouching && !mover.overlaps(mover.pos.x, mover.pos.y, mover.pos.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      mover.setHeight(STAND_HEIGHT);
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wx = 0;
    let wz = 0;
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wx = -sin * forward + cos * strafe;
      wz = -cos * forward - sin * strafe;
      const len = Math.hypot(wx, wz) || 1;
      wx /= len;
      wz /= len;
    }
    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    mover.step(
      dt, wx, wz, speed,
      mover.onGround ? GROUND_ACCEL : AIR_ACCEL, FRICTION,
      keys.has('Space'),
    );
  }

  return {
    state: player,
    mover,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(mover.vel.x, mover.vel.z);
    },
    feet() {
      return mover.pos;
    },
    eyePosition(out) {
      out.set(mover.pos.x, mover.pos.y + player.eye, mover.pos.z);
      return out;
    },
    damage(amount) {
      if (!player.alive) return false;
      player.hp -= amount;
      if (player.hp > 0) return false;
      player.hp = 0;
      player.alive = false;
      return true;
    },
    reset(x, z) {
      mover.set(x, 0, z);
      player.yaw = 0;
      player.pitch = 0;
      player.hp = 100;
      player.alive = true;
      player.crouching = false;
      mover.setHeight(STAND_HEIGHT);
      player.eye = STAND_EYE;
    },
  };
}
