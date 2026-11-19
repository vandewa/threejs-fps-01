// The map: "Pasar Malam" — an Indonesian night market, 30 x 34 m, open to the
// night sky. One main lane runs south (attacker spawn) to north (the stage,
// the one bombsite); two kiosk rows flank the lane and a back alley runs
// behind each row, so there are three ways to the site. Every solid box is a
// collider for the player and a surface a bullet stops on. Lamps, string
// lights and signs are decoration only — they never block movement or shots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Map bounds, in metres. North (the stage) is -Z, south (attacker spawn) +Z.
const HALF_X = 15;
const HALF_Z = 17;
const WALL_H = 4.6;

// One bombsite: the ground in front of the stage.
export const PLANT_ZONE = { minX: -4, maxX: 4, minZ: -13, maxZ: -10 };

export const SPAWNS = {
  attack: [
    [-2.4, 14],
    [-0.8, 14.6],
    [0.8, 14.6],
    [2.4, 14],
  ],
  defend: [
    [-7, -8],
    [7, -8],
    [-3, -6.5],
    [3, -6.5],
  ],
};

// Waypoint routes bots follow. Main lane, left alley, right alley, and the
// spots defenders hold while the bomb is not planted.
export const ROUTES = {
  main: [
    [0, 13],
    [0, 5],
    [0, -3],
    [0, -9],
    [0, -11.5],
  ],
  alleyLeft: [
    [-13.5, 13],
    [-13.5, 4],
    [-13.5, -5],
    [-13.5, -10],
    [-8, -11],
    [-2, -11.5],
  ],
  alleyRight: [
    [13.5, 13],
    [13.5, 4],
    [13.5, -5],
    [13.5, -10],
    [8, -11],
    [2, -11.5],
  ],
  defendHold: [
    [-6, -8],
    [6, -8],
    [-3, -6],
    [3, -6],
  ],
  defendMid: [
    [-8, 2],
    [8, 2],
  ],
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.5 : 0.92,
      metalness: 0.03,
    });
  }
  // Warm lamp bulbs glow on their own; they need no light to be seen.
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const bulbGeometry = new THREE.SphereGeometry(0.09, 10, 8);

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function decor(mesh) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  }

  // Floor and perimeter walls.
  box(HALF_X * 2 + 0.4, 0.4, HALF_Z * 2 + 0.4, 0, -0.2, 0, 'canvas');
  box(0.4, WALL_H, HALF_Z * 2 + 0.4, -HALF_X - 0.2, WALL_H / 2, 0, 'surface');
  box(0.4, WALL_H, HALF_Z * 2 + 0.4, HALF_X + 0.2, WALL_H / 2, 0, 'surface');
  box(HALF_X * 2 + 0.4, WALL_H, 0.4, 0, WALL_H / 2, -HALF_Z - 0.2, 'surface');
  box(HALF_X * 2 + 0.4, WALL_H, 0.4, 0, WALL_H / 2, HALF_Z + 0.2, 'surface');

  // The stage: a low platform with a backdrop wall at the north end.
  box(10, 0.5, 3.5, 0, 0.25, -15.25, 'hairline');
  box(10, 3.2, 0.4, 0, 1.6, -16.8, 'surface');
  box(10, 0.18, 0.5, 0, 3.25, -16.8, 'accent');

  // Stage sign: canvas texture, drawn at runtime — no network, no asset file.
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 512;
  signCanvas.height = 96;
  const signCtx = signCanvas.getContext('2d');
  signCtx.fillStyle = '#241a12';
  signCtx.fillRect(0, 0, 512, 96);
  signCtx.fillStyle = '#ffb347';
  signCtx.font = 'bold 56px system-ui, sans-serif';
  signCtx.textAlign = 'center';
  signCtx.textBaseline = 'middle';
  signCtx.fillText('★ PANGGUNG ★', 256, 52);
  const signTexture = new THREE.CanvasTexture(signCanvas);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.125),
    new THREE.MeshBasicMaterial({ map: signTexture }),
  );
  sign.position.set(0, 2.6, -16.55);
  decor(sign);

  // Bombsite marker on the ground in front of the stage + four corner posts.
  const zone = new THREE.Mesh(
    new THREE.BoxGeometry(PLANT_ZONE.maxX - PLANT_ZONE.minX, 0.04, PLANT_ZONE.maxZ - PLANT_ZONE.minZ),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6, transparent: true, opacity: 0.35 }),
  );
  zone.position.set(0, 0.02, (PLANT_ZONE.minZ + PLANT_ZONE.maxZ) / 2);
  decor(zone);
  for (const [px, pz] of [[-4, -13], [4, -13], [-4, -10], [4, -10]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), materials.accent);
    post.position.set(px, 0.55, pz);
    decor(post);
  }

  // Kiosk rows: five stalls per side, gaps between them so the lane and the
  // back alley connect. Each stall: wood body, counter facing the lane, a
  // cloth awning, a hanging lamp bulb.
  const kioskZ = [-6, -1.5, 3, 7.5, 12];
  for (const side of [-1, 1]) {
    kioskZ.forEach((z, index) => {
      const cx = side * 11;
      const cloth = index % 2 === 0 ? 'clothA' : 'clothB';
      box(3, 2.6, 2.6, cx, 1.3, z, 'surface'); // stall body
      box(0.6, 1.0, 2.6, cx - side * 1.7, 0.5, z, 'hairline'); // counter
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 3.0), materials[cloth]);
      awning.position.set(cx - side * 2.2, 2.55, z);
      awning.rotation.z = side * 0.18; // tilted down toward the lane
      awning.castShadow = true;
      awning.receiveShadow = true;
      group.add(awning);
      const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
      bulb.position.set(cx - side * 2.6, 2.3, z);
      decor(bulb);
      // A coloured mat in front of every other stall, for the market feel.
      if (index % 2 === 0) {
        const mat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 2.2), materials[cloth]);
        mat.position.set(cx - side * 3.4, 0.01, z);
        decor(mat);
      }
    });
  }

  // Cover in the main lane: crates, barrels, one food cart.
  box(1.1, 1.1, 1.1, -3, 0.55, 2, 'hairline');
  box(1.1, 1.1, 1.1, -3, 0.55, 3.1, 'hairline');
  box(1.1, 1.1, 1.1, 3, 0.55, -2, 'hairline');
  box(1.6, 0.8, 1.6, 5.2, 0.4, 6, 'hairline');
  box(1.6, 0.8, 1.6, -5.2, 0.4, -6, 'hairline');
  const barrelGeometry = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 14);
  for (const [bx, bz] of [[5.6, -5.4], [-5.6, 5.4], [7.5, -8.5]]) {
    const barrel = new THREE.Mesh(barrelGeometry, materials.clothB);
    barrel.position.set(bx, 0.5, bz);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    colliders.push(new THREE.Box3().setFromObject(barrel));
    shootables.push(barrel);
  }
  box(2.2, 1.0, 1.2, 0, 0.5, 8.5, 'clothA'); // food cart

  // Spawn cover: a low wall across the lane just north of the attacker
  // spawn, so the defenders holding the site cannot farm the spawn from
  // twenty metres away. Two segments leave a centre gap (the main lane)
  // and side gaps into the back alleys — the player picks a route instead
  // of dying for crossing open ground.
  box(4.8, 1.8, 0.6, -3.6, 0.9, 10.5, 'hairline');
  box(4.8, 1.8, 0.6, 3.6, 0.9, 10.5, 'hairline');

  // String lights across the main lane: three rows of bulbs sagging in the
  // middle, warm against the night.
  for (const rowZ of [-4, 2, 8]) {
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      const x = -9 + t * 18;
      const sag = Math.sin(t * Math.PI) * 0.55;
      const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
      bulb.position.set(x, 3.6 - sag, rowZ);
      decor(bulb);
    }
  }

  // Light: a dim cool moon overhead, warm pools of lamp light along the lane
  // and at the stage. Point lights do not cast shadows — the one directional
  // light does, so the scene stays cheap.
  const sky = new THREE.HemisphereLight(new THREE.Color('#2a3242'), new THREE.Color(PALETTE.canvas), 1.0);
  scene.add(sky);

  const moon = new THREE.DirectionalLight(new THREE.Color('#b9c8e8'), 0.85);
  moon.position.set(9, 16, 8);
  moon.target.position.set(0, 0, -3);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -20;
  moon.shadow.camera.right = 20;
  moon.shadow.camera.top = 20;
  moon.shadow.camera.bottom = -20;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);

  const lampLight = (x, z, intensity) => {
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), intensity, 14, 1.6);
    light.position.set(x, 3.1, z);
    scene.add(light);
  };
  lampLight(0, -6, 45);
  lampLight(0, 0, 45);
  lampLight(0, 6, 45);
  lampLight(0, 12, 36);
  lampLight(-3, -14, 40);
  lampLight(3, -14, 40);

  return { colliders, shootables, group, plantZone: PLANT_ZONE, spawns: SPAWNS, routes: ROUTES };
}
