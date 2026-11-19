// Weapons: a pistol, a rifle and an SMG, plus one smoke grenade. Each weapon
// is a row of numbers — magazine, damage, fire gap, reload, spread — and the
// view model is rebuilt from those numbers when the player switches, so the
// rifle looks longer than the pistol on screen. This module owns the numbers
// and the smoke clouds; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Pistol', price: 0, mag: 12, reserve: 48,
    damageBody: 25, damageHead: 60, gap: 0.18, reload: 1.2,
    spreadStill: 0.004, spreadMoving: 0.03, kick: 0.012, barrel: 0.22, tint: '#c9b18a',
  },
  rifle: {
    id: 'rifle', name: 'Rifle', price: 2700, mag: 30, reserve: 90,
    damageBody: 34, damageHead: 100, gap: 0.096, reload: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.02, barrel: 0.42, tint: '#e9e6df',
  },
  smg: {
    id: 'smg', name: 'SMG', price: 1500, mag: 25, reserve: 100,
    damageBody: 22, damageHead: 55, gap: 0.07, reload: 1.6,
    spreadStill: 0.003, spreadMoving: 0.034, kick: 0.011, barrel: 0.3, tint: '#8fb8b2',
  },
};
export const SMOKE_PRICE = 300;
const SMOKE_RADIUS = 3;
const SMOKE_SECONDS = 14;
const MUZZLE_TIME = 0.06;
const MOVE_REFERENCE = 5.2;

export function createWeapon(camera) {
  const gripMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const model = new THREE.Group();
  model.position.set(0.22, -0.22, -0.5);
  model.scale.setScalar(0.8); // held close to the camera: keep it out of the way
  camera.add(model);

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

  // One ammo state per weapon; switching keeps the magazine you left behind.
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) {
    ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  const owned = new Set(['pistol']);
  let current = 'pistol';
  const state = { mag: ammo.pistol.mag, reserve: ammo.pistol.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, smokes: 0 };
  const smokes = []; // { mesh, center: Vector3, until }
  const grenades = []; // flying smoke grenades { position, velocity, landed }
  const smokeGeometry = new THREE.SphereGeometry(SMOKE_RADIUS, 18, 12);
  const smokeMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b9b2a4'), roughness: 1, transparent: true, opacity: 0.82, depthWrite: false,
  });
  const grenadeGeometry = new THREE.SphereGeometry(0.07, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.clothB), roughness: 0.6 });

  function rebuildModel() {
    while (model.children.length > 0) {
      const child = model.children.pop();
      child.geometry.dispose();
    }
    const def = WEAPONS[current];
    const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.tint), roughness: 0.5, metalness: 0.35 });
    // The receiver is short on the pistol and long on the rifle, so the gun
    // in the player's hands reads as the weapon they bought.
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, def.barrel + 0.1), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, def.barrel), gripMaterial);
    barrel.position.set(0, 0.02, -(def.barrel / 2 + 0.05));
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.2), gripMaterial);
    stock.position.set(0, -0.02, 0.26);
    model.add(receiver, barrel, stock);
  }
  rebuildModel();

  function syncState() {
    state.mag = ammo[current].mag;
    state.reserve = ammo[current].reserve;
  }

  function step(dt, now, scene) {
    const def = WEAPONS[current];
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - ammo[current].mag;
        const take = Math.min(need, ammo[current].reserve);
        ammo[current].mag += take;
        ammo[current].reserve -= take;
        syncState();
      }
    }
    // Flying grenades arc under gravity; on landing they bloom into a cloud.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.velocity.y -= 14 * dt;
      g.position.addScaledVector(g.velocity, dt);
      g.mesh.position.copy(g.position);
      if (g.position.y <= 0.1) {
        scene.remove(g.mesh);
        grenades.splice(i, 1);
        // Each cloud gets its own material, so fading one out at expiry
        // does not dim the others still in the air.
        const cloud = new THREE.Mesh(smokeGeometry, smokeMaterial.clone());
        cloud.position.set(g.position.x, 1.4, g.position.z);
        scene.add(cloud);
        smokes.push({ mesh: cloud, center: cloud.position.clone(), until: now + SMOKE_SECONDS });
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const left = smokes[i].until - now;
      smokes[i].mesh.material.opacity = left < 3 ? Math.max(0, left / 3) * 0.82 : 0.82;
      if (left <= 0) {
        scene.remove(smokes[i].mesh);
        smokes[i].mesh.material.dispose();
        smokes.splice(i, 1);
      }
    }
  }

  return {
    state,
    step,
    def() {
      return WEAPONS[current];
    },
    currentId() {
      return current;
    },
    owned: () => owned,
    own(id) {
      owned.add(id);
    },
    select(id) {
      if (!owned.has(id) || id === current) return false;
      current = id;
      state.cooldown = 0;
      state.reloadLeft = 0;
      rebuildModel();
      syncState();
      return true;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const def = WEAPONS[current];
      state.cooldown = def.gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (ammo[current].mag <= 0) return false;
      ammo[current].mag -= 1;
      state.mag = ammo[current].mag;
      return true;
    },
    reload() {
      const def = WEAPONS[current];
      if (state.reloadLeft > 0 || ammo[current].mag === def.mag || ammo[current].reserve === 0) return;
      state.reloadLeft = def.reload;
    },
    spread(speed) {
      const def = WEAPONS[current];
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
    },
    refill() {
      for (const id of Object.keys(WEAPONS)) {
        ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      syncState();
    },
    // Smoke: throw from the camera, along its aim, in a short arc.
    throwSmoke(origin, direction, scene) {
      if (state.smokes <= 0) return false;
      state.smokes -= 1;
      const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
      mesh.position.copy(origin);
      scene.add(mesh);
      const velocity = direction.clone().multiplyScalar(11);
      velocity.y += 3.5;
      grenades.push({ mesh, position: origin.clone(), velocity });
      return true;
    },
    giveSmoke(count) {
      state.smokes += count;
    },
    smokeCount() {
      return state.smokes;
    },
    clearSmokes(scene) {
      for (const cloud of smokes) scene.remove(cloud.mesh);
      smokes.length = 0;
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
    },
    // Does any live smoke cloud sit between two points? A segment-sphere
    // test: bullets pass through smoke, but eyes do not.
    blocksSight(a, b) {
      for (const cloud of smokes) {
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abz = b.z - a.z;
        const acx = cloud.center.x - a.x;
        const acy = cloud.center.y - a.y;
        const acz = cloud.center.z - a.z;
        const lengthSq = abx * abx + aby * aby + abz * abz || 1;
        const t = Math.max(0, Math.min(1, (acx * abx + acy * aby + acz * abz) / lengthSq));
        const dx = a.x + abx * t - cloud.center.x;
        const dy = a.y + aby * t - cloud.center.y;
        const dz = a.z + abz * t - cloud.center.z;
        if (dx * dx + dy * dy + dz * dz < SMOKE_RADIUS * SMOKE_RADIUS) return true;
      }
      return false;
    },
  };
}
