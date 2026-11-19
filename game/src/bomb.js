// The bomb: one state machine, owned by nobody's team. The carrier plants it
// by holding still inside the site for 3 seconds; once planted it ticks 40
// seconds to an explosion that wins the round for the attackers; a defender
// standing in the site can defuse it in 5 seconds for the defenders. Taking
// damage wipes defuse progress. The bomb is a small blinking box on the
// ground once planted, so the site always reads as "the bomb is here".
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const DEFUSE_SECONDS = 5;
const BOMB_SECONDS = 40;

export function createBomb(scene, plantZone) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger) }),
  );
  lamp.position.y = 0.14;
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  let state = 'carried'; // carried | planting | planted | defusing | exploded | defused
  let progress = 0;
  let timerLeft = BOMB_SECONDS;
  let plantPosition = null;
  let blinkAt = 0;

  function inZone(position) {
    return position.x >= plantZone.minX && position.x <= plantZone.maxX
      && position.z >= plantZone.minZ && position.z <= plantZone.maxZ;
  }

  return {
    get state() {
      return state;
    },
    get progress() {
      return progress;
    },
    get timerLeft() {
      return timerLeft;
    },
    isPlanted() {
      return state === 'planted' || state === 'defusing';
    },
    isCarried() {
      return state === 'carried' || state === 'planting';
    },
    inZone,
    // Called every fixed step while the carrier holds the plant key inside
    // the site. Returns true on the step the bomb goes down.
    plant(dt, planter) {
      if (state !== 'carried' && state !== 'planting') return false;
      state = 'planting';
      progress += dt / PLANT_SECONDS;
      if (progress >= 1) {
        state = 'planted';
        timerLeft = BOMB_SECONDS;
        progress = 0;
        plantPosition = planter.position
          ? new THREE.Vector3(planter.position.x, 0.1, planter.position.z)
          : new THREE.Vector3(0, 0.1, -11.5);
        group.position.copy(plantPosition);
        group.visible = true;
        return true;
      }
      return false;
    },
    // Called every fixed step while a defender holds the defuse key in the
    // site. Returns true on the step the bomb is safe.
    defuse(dt) {
      if (state !== 'planted' && state !== 'defusing') return false;
      state = 'defusing';
      progress += dt / DEFUSE_SECONDS;
      if (progress >= 1) {
        state = 'defused';
        progress = 0;
        group.visible = false;
        return true;
      }
      return false;
    },
    interruptDefuse() {
      if (state === 'defusing') {
        state = 'planted';
        progress = 0;
      }
    },
    cancelPlant() {
      if (state === 'planting') {
        state = 'carried';
        progress = 0;
      }
    },
    // Ticks the planted timer. Returns 'exploded' once, on the step it blows.
    update(dt, now) {
      if (state === 'planted' || state === 'defusing') {
        timerLeft -= dt;
        // Blink faster as the timer runs down.
        const interval = timerLeft > 20 ? 0.9 : timerLeft > 10 ? 0.5 : 0.25;
        if (now - blinkAt > interval) {
          blinkAt = now;
          lamp.visible = !lamp.visible;
        }
        if (timerLeft <= 0) {
          state = 'exploded';
          group.visible = false;
          return 'exploded';
        }
      }
      return null;
    },
    reset() {
      state = 'carried';
      progress = 0;
      timerLeft = BOMB_SECONDS;
      plantPosition = null;
      group.visible = false;
      lamp.visible = true;
    },
  };
}
