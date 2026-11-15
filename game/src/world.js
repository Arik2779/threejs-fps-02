// Cinder Yard: a decommissioned freight yard, 44 x 32 m, played north to south.
// Attackers spawn south, defenders north. Two plant sites: A Crane Bay (north-west)
// and B Fuel Depot (north-east). Lanes: containers west, warehouse shed east, open
// crates mid. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Nav nodes: indices are the graph; edges join neighbours that can walk straight.
const NODES = [
  [-8, 13], [0, 13], [8, 13], [-16, 8], [-18, 2], [-16, -4], [-14, -8],
  [-16, -11], [0, 8], [0, 2], [-6, 2], [6, 2], [0, -4], [-6, -4], [6, -4],
  [16, 8], [18, 2], [16, -4], [14, -8], [16, -11], [-10, -10], [10, -10],
  [-8, -13], [0, -13], [8, -13], [-6, 8], [6, 8],
];
const EDGES = [
  [0, 8], [1, 8], [2, 8], [0, 3], [2, 15], [0, 25], [2, 26], [25, 8], [26, 8],
  [8, 9], [9, 10], [9, 11], [9, 12], [10, 4], [11, 16], [4, 5], [16, 17],
  [5, 6], [17, 18], [6, 7], [18, 19], [6, 20], [18, 21], [20, 7], [21, 19],
  [12, 13], [12, 14], [13, 6], [14, 18], [13, 20], [14, 21], [12, 23],
  [13, 22], [14, 24], [20, 22], [21, 24], [7, 22], [19, 24], [3, 25],
  [15, 26], [3, 4], [15, 16], [5, 13], [17, 14], [10, 25], [11, 26],
  [25, 9], [26, 9], [8, 25], [8, 26], [22, 23], [23, 24], [0, 1], [1, 2],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the 5 m perimeter.
  box(44.4, 0.4, 32.4, 0, -0.2, 0, 'canvas');
  box(0.4, 5, 32.4, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 32.4, 22.2, 2.5, 0, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, -16.2, 'surface');
  box(44.4, 5, 0.4, 0, 2.5, 16.2, 'surface');

  // West lane: container stacks, two high on the outer row.
  box(6, 2.6, 2.4, -17, 1.3, -3, 'steel');
  box(6, 2.6, 2.4, -17, 3.9, -3, 'rust');
  box(2.4, 2.6, 6, -19, 1.3, 4, 'rust');
  box(2.4, 2.6, 6, -13, 1.3, 7, 'steel');
  box(3.4, 1.1, 1.2, -15, 0.55, 3.4, 'hairline');
  box(1.2, 1.1, 3.4, -10, 0.55, -6.4, 'hairline');

  // East lane: the warehouse shed — roof on four pillars, crates inside.
  box(8.4, 0.3, 12.4, 16.5, 4.4, 1.5, 'surface');
  box(0.5, 4.4, 0.5, 12.6, 2.2, -4.2, 'hairline');
  box(0.5, 4.4, 0.5, 20.4, 2.2, -4.2, 'hairline');
  box(0.5, 4.4, 0.5, 12.6, 2.2, 7.2, 'hairline');
  box(0.5, 4.4, 0.5, 20.4, 2.2, 7.2, 'hairline');
  box(2.2, 1.2, 2.2, 15, 0.6, -1, 'hairline');
  box(1.6, 0.9, 1.6, 19, 0.45, 4.5, 'hairline');
  box(1.2, 1.1, 3.2, 13.5, 0.55, 6.5, 'hairline');

  // Mid: crate field and low walls, plus the yard's own landmark, the gantry crane.
  box(1.6, 1.6, 1.6, -3, 0.8, 1, 'hairline');
  box(1.6, 1.6, 1.6, 3, 0.8, 1, 'hairline');
  box(1.6, 1.6, 1.6, 0, 0.8, 5.5, 'rust');
  box(3.6, 1.0, 0.8, -7, 0.5, 5.5, 'hairline');
  box(3.6, 1.0, 0.8, 7, 0.5, 5.5, 'hairline');
  box(1.2, 1.1, 1.2, -5, 0.55, -8.5, 'hairline');
  box(1.2, 1.1, 1.2, 5, 0.55, -8.5, 'hairline');
  box(2.2, 0.9, 1.4, -11, 0.45, 11, 'hairline');
  box(2.2, 0.9, 1.4, 11, 0.45, 11, 'hairline');
  // Crane: four legs, a top beam, a hanging hook block over the yard's middle.
  box(0.5, 5.2, 0.5, -2, 2.6, -7, 'accent');
  box(0.5, 5.2, 0.5, 2, 2.6, -7, 'accent');
  box(0.5, 5.2, 0.5, -2, 2.6, 3, 'accent');
  box(0.5, 5.2, 0.5, 2, 2.6, 3, 'accent');
  box(5.4, 0.5, 0.5, 0, 5.2, -2, 'accent');
  box(0.9, 0.9, 0.9, 0, 4.2, -2, 'hairline');

  // Site A, Crane Bay: the plant floor under the crane's north leg.
  // Site B, Fuel Depot: three tanks and a pipe rack.
  cylinder(1.15, 2.6, 15, 1.3, -12.5, 'steel');
  cylinder(1.15, 2.6, 17.6, 1.3, -12.5, 'rust');
  cylinder(1.15, 2.6, 16.3, 1.3, -14.6, 'steel');
  box(4.6, 0.35, 0.35, 16.3, 2.9, -12, 'hairline');
  cylinder(0.45, 1.1, -19, 0.55, -9.5, 'rust');
  cylinder(0.45, 1.1, -18, 0.55, 11.5, 'steel');
  cylinder(0.45, 1.1, 19.5, 0.55, -8, 'rust');
  cylinder(0.45, 1.1, 8.5, 0.55, -12.5, 'steel');

  // Site rings: flat markers on the floor, amber for A, teal for B.
  function siteRing(x, z, color) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 1.9, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    group.add(ring);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8),
      materials.hairline,
    );
    pole.position.set(x + 2.2, 1.3, z);
    group.add(pole);
    return ring;
  }
  const ringA = siteRing(-16, -11, PALETTE.accent);
  const ringB = siteRing(16, -11, PALETTE.warden);

  // Light: dusk sky, a warm key from the south-east, a cool fill, two yard lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.0);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffe0b3), 2.0);
  key.position.set(12, 16, 10);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-10, 10, -12);
  scene.add(fill);
  for (const [lx, lz] of [[-8, 4], [10, -2]]) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16, 1.6);
    lamp.position.set(lx, 4.6, lz);
    scene.add(lamp);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.6, 8), materials.hairline);
    post.position.set(lx, 2.3, lz);
    group.add(post);
  }

  // Nav graph: adjacency from the edge list.
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { x: -16, z: -11, r: 2.2, name: 'Crane Bay', ring: ringA },
      B: { x: 16, z: -11, r: 2.2, name: 'Fuel Depot', ring: ringB },
    },
    spawns: {
      ember: [[-8, 13], [-4, 14], [0, 13], [4, 14], [8, 13]],
      warden: [[-8, -13], [-4, -14], [0, -13], [4, -14], [8, -13]],
    },
    nav: { nodes: NODES, adjacency },
  };
}
