// Shared AABB movement: one box against the world's boxes, one axis at a time, so a
// wall never swallows a body. Player and bots both move through it; nothing here
// allocates after construction.
import * as THREE from 'three';

const GRAVITY = 20;
const JUMP_SPEED = 6.2;
const TERMINAL = -30;

export function createMover(colliders, radius, height) {
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const probe = new THREE.Box3();
  let h = height;

  function overlaps(x, y, z, heightNow, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + heightNow - lift, z + radius);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  return {
    pos,
    vel,
    set(x, y, z) {
      pos.set(x, y, z);
      vel.set(0, 0, 0);
    },
    setHeight(next) {
      h = next;
    },
    height() {
      return h;
    },
    overlaps,
    // wishX/wishZ is a unit direction (or zero); speed is the target horizontal speed.
    // Returns true while standing on something.
    step(dt, wishX, wishZ, speed, accel, friction, jump) {
      const blend = Math.min(1, (accel * dt) / speed);
      vel.x += (wishX * speed - vel.x) * blend;
      vel.z += (wishZ * speed - vel.z) * blend;
      if (!wishX && !wishZ) {
        const damp = Math.max(0, 1 - friction * dt);
        vel.x *= damp;
        vel.z *= damp;
      }
      if (jump && this.onGround) {
        vel.y = JUMP_SPEED;
        this.onGround = false;
      }
      vel.y -= GRAVITY * dt;
      const nextX = pos.x + vel.x * dt;
      if (!overlaps(nextX, pos.y, pos.z, h, 0.04)) pos.x = nextX;
      else vel.x = 0;
      const nextZ = pos.z + vel.z * dt;
      if (!overlaps(pos.x, pos.y, nextZ, h, 0.04)) pos.z = nextZ;
      else vel.z = 0;
      pos.y += vel.y * dt;
      this.onGround = false;
      const hit = overlaps(pos.x, pos.y, pos.z, h, 0);
      if (hit && vel.y <= 0) {
        pos.y = hit.max.y;
        vel.y = 0;
        this.onGround = true;
      } else if (hit) {
        pos.y = hit.min.y - h;
        vel.y = 0;
      }
      if (pos.y < 0) {
        pos.y = 0;
        vel.y = 0;
        this.onGround = true;
      }
      if (vel.y < TERMINAL) vel.y = TERMINAL;
      return this.onGround;
    },
    onGround: true,
  };
}
