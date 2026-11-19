// Bots: 3 attackers + 4 defenders against the player (4v4 with the player).
// A bot is a player body driven by a synthetic key set, so it obeys the same
// physics, the same walls and the same collision as the human. Its brain is
// small on purpose: follow a route to the site, hold a spot, look for an
// enemy, shoot in bursts when one is seen, plant the bomb when the site is
// clear, defuse when the bomb is down. It never teleports and never knows
// anything it could not see.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createPlayer } from './player.js';

const HEALTH = 100;
const SEE_DISTANCE = 45;
const SEE_HALF_ANGLE = 1.35; // ~77 degrees each side
const FIRE_GAP = 0.13;
const BOT_DAMAGE_BODY = 20;
const BOT_DAMAGE_HEAD = 50;
const FALL_SECONDS = 0.4;
const SITE = { x: 0, z: -11.5 }; // bombsite centre, on the ground in front of the stage
const DEFUSE_RECT = { minX: -5, maxX: 5, minZ: -14, maxZ: -9 }; // ground a defender must stand on to defuse

const BODY_GEOMETRY = new THREE.BoxGeometry(0.55, 0.8, 0.32);
const HEAD_GEOMETRY = new THREE.SphereGeometry(0.16, 14, 10);
const LEG_GEOMETRY = new THREE.BoxGeometry(0.2, 0.75, 0.24);
const GUN_GEOMETRY = new THREE.BoxGeometry(0.07, 0.09, 0.55);

export function createBots(scene, world, rng, hooks) {
  const teamMaterial = {
    attack: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.6 }),
    defend: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.clothB), roughness: 0.6 }),
  };
  const skinMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });

  const bots = [];
  const hitMeshes = [];
  const tmpDir = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpPoint = new THREE.Vector3(); // reused enemy aim point: perceive runs every step

  function buildBot(id, team, spawn) {
    const body = createPlayer(world.colliders, spawn);
    const group = new THREE.Group();
    const torso = new THREE.Mesh(BODY_GEOMETRY, teamMaterial[team]);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(HEAD_GEOMETRY, skinMaterial);
    head.position.y = 1.55;
    const legL = new THREE.Mesh(LEG_GEOMETRY, darkMaterial);
    legL.position.set(-0.14, 0.38, 0);
    const legR = new THREE.Mesh(LEG_GEOMETRY, darkMaterial);
    legR.position.set(0.14, 0.38, 0);
    const gun = new THREE.Mesh(GUN_GEOMETRY, darkMaterial);
    gun.position.set(0.2, 1.05, -0.25);
    group.add(torso, head, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);
    const bot = {
      id, team, body, group, torso, head,
      health: HEALTH, alive: true, fall: 0,
      route: [], routeIndex: 0, hold: null,
      isCarrier: false, state: 'route',
      perceiveAt: 0, target: null, targetPoint: new THREE.Vector3(), targetIsPlayer: false,
      reactionLeft: 0, burstLeft: 0, burstPause: 0, fireCooldown: 0,
      keys: new Set(),
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) buildBot(`atk-${i}`, 'attack', world.spawns.attack[i + 1]);
  for (let i = 0; i < 4; i += 1) buildBot(`def-${i}`, 'defend', world.spawns.defend[i]);

  function eyeOf(bot) {
    const s = bot.body.state;
    return tmpEye.set(s.position.x, s.position.y + s.eye, s.position.z);
  }

  function canSee(bot, point) {
    const eye = eyeOf(bot);
    tmpTo.copy(point).sub(eye);
    const distance = tmpTo.length();
    if (distance > SEE_DISTANCE || distance < 0.5) return false;
    tmpTo.normalize();
    const s = bot.body.state;
    const forward = tmpDir.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    if (forward.dot(tmpTo) < Math.cos(SEE_HALF_ANGLE)) return false;
    if (hooks.smokeBlocks(eye, point)) return false;
    return hooks.hasLineOfSight(eye, point);
  }

  function perceive(bot, now, playerInfo) {
    if (now < bot.perceiveAt) return;
    bot.perceiveAt = now + 0.2;
    let best = null;
    let bestDistance = Infinity;
    let bestIsPlayer = false;
    if (playerInfo.alive && playerInfo.team !== bot.team) {
      const point = playerInfo.aimPoint;
      const distance = eyeOf(bot).distanceTo(point);
      if (distance < bestDistance && canSee(bot, point)) {
        best = point;
        bestDistance = distance;
        bestIsPlayer = true;
      }
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      const point = tmpPoint.set(other.body.state.position.x, other.body.state.position.y + 1.2, other.body.state.position.z);
      const distance = eyeOf(bot).distanceTo(point);
      if (distance < bestDistance && canSee(bot, point)) {
        best = point;
        bestDistance = distance;
        bestIsPlayer = false;
      }
    }
    if (best && !bot.target) bot.reactionLeft = 0.45 + rng() * 0.35;
    if (best) {
      // Copy: best may point at a scratch vector another bot reuses next tick.
      bot.targetPoint.copy(best);
      bot.target = bot.targetPoint;
    } else {
      bot.target = null;
    }
    bot.targetIsPlayer = bestIsPlayer;
  }

  function faceToward(bot, point, dt) {
    const s = bot.body.state;
    const dx = point.x - s.position.x;
    const dz = point.z - s.position.z;
    const want = Math.atan2(-dx, -dz);
    let diff = want - s.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    s.yaw += Math.max(-dt * 6, Math.min(dt * 6, diff));
  }

  function moveToward(bot, point, dt) {
    const s = bot.body.state;
    const dx = point.x - s.position.x;
    const dz = point.z - s.position.z;
    const distance = Math.hypot(dx, dz);
    bot.keys.clear();
    if (distance < 0.5) return true;
    faceToward(bot, point, dt);
    // Keys are relative to where the bot faces: forward + strafe from the
    // wish direction, so a bot turning a corner strafes around it.
    const sin = Math.sin(s.yaw);
    const cos = Math.cos(s.yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;
    const along = (dx * forwardX + dz * forwardZ) / distance;
    const across = (dx * rightX + dz * rightZ) / distance;
    if (along > 0.3) bot.keys.add('KeyW');
    else if (along < -0.3) bot.keys.add('KeyS');
    if (across > 0.3) bot.keys.add('KeyD');
    else if (across < -0.3) bot.keys.add('KeyA');
    return false;
  }

  function nearestEnemyDistance(bot, playerInfo) {
    let best = Infinity;
    if (playerInfo.alive && playerInfo.team !== bot.team) {
      best = Math.min(best, bot.body.state.position.distanceTo(playerInfo.position));
    }
    for (const other of bots) {
      if (other === bot || !other.alive || other.team === bot.team) continue;
      best = Math.min(best, bot.body.state.position.distanceTo(other.body.state.position));
    }
    return best;
  }

  function stepBot(bot, dt, now, playerInfo, bomb) {
    const s = bot.body.state;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / FALL_SECONDS);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    perceive(bot, now, playerInfo);

    // Defuse urgency: once the bomb is down, a defender standing on it
    // defuses instead of duelling, and when the fuse runs short every
    // defender runs for the site instead of fighting. Combat used to win
    // over defuse unconditionally, so in live play the bomb always
    // exploded — observed: 40 s fuse, 3 defenders alive, zero defuse
    // progress. Damage still interrupts a defuse (see damage()).
    if (bot.team === 'defend' && bomb.isPlanted()) {
      const inRect = s.position.x > DEFUSE_RECT.minX && s.position.x < DEFUSE_RECT.maxX
        && s.position.z > DEFUSE_RECT.minZ && s.position.z < DEFUSE_RECT.maxZ;
      if (inRect || bomb.timerLeft <= 20) {
        if (inRect) {
          bot.keys.clear();
          bot.state = 'defuse';
          bomb.defuse(dt, bot);
        } else {
          moveToward(bot, SITE, dt);
          bot.state = 'route';
        }
        bot.body.step(dt, bot.keys);
        bot.group.position.copy(s.position);
        return;
      }
    }

    // Combat: face the enemy, wait out the reaction time, then fire bursts.
    if (bot.target) {
      faceToward(bot, bot.target, dt);
      bot.keys.clear();
      if (bot.reactionLeft > 0) {
        bot.reactionLeft -= dt;
      } else {
        bot.fireCooldown -= dt;
        bot.burstPause -= dt;
        if (bot.burstLeft <= 0 && bot.burstPause <= 0) {
          bot.burstLeft = 3 + Math.floor(rng() * 3);
          bot.burstPause = 1.0 + rng() * 0.8;
        }
        if (bot.burstLeft > 0 && bot.fireCooldown <= 0) {
          bot.fireCooldown = FIRE_GAP;
          bot.burstLeft -= 1;
          const distance = eyeOf(bot).distanceTo(bot.target);
          // Bots are dangerous up close and sloppy at range: a player
          // crossing open ground should have seconds to react, not one burst.
          const spread = 0.05 + distance * 0.002;
          hooks.shoot(bot, bot.target, spread, BOT_DAMAGE_BODY, BOT_DAMAGE_HEAD);
        }
      }
      bot.body.step(dt, bot.keys);
      bot.group.position.copy(s.position);
      return;
    }

    // No enemy in sight: do the job. Attackers walk their route to the site;
    // the carrier plants when the site is clear. Defenders hold their spot,
    // and run to the site once the bomb is down.
    bot.fireCooldown = 0;
    bot.burstLeft = 0;
    if (bot.team === 'attack') {
      if (bot.isCarrier && s.position.distanceTo(tmpTo.set(SITE.x, 0, SITE.z)) < 1.6
        && nearestEnemyDistance(bot, playerInfo) > 12) {
        bot.keys.clear();
        bot.state = 'plant';
        bomb.plant(dt, bot.body.state);
      } else if (bot.routeIndex < bot.route.length) {
        const waypoint = bot.route[bot.routeIndex];
        if (moveToward(bot, { x: waypoint[0], z: waypoint[1] }, dt)) bot.routeIndex += 1;
        bot.state = 'route';
      } else {
        bot.keys.clear();
        bot.state = 'hold';
        faceToward(bot, { x: 0, z: -16 }, dt);
      }
    } else if (bomb.isPlanted()) {
      if (s.position.x > DEFUSE_RECT.minX && s.position.x < DEFUSE_RECT.maxX
        && s.position.z > DEFUSE_RECT.minZ && s.position.z < DEFUSE_RECT.maxZ) {
        bot.keys.clear();
        bot.state = 'defuse';
        bomb.defuse(dt, bot);
      } else {
        moveToward(bot, SITE, dt);
        bot.state = 'route';
      }
    } else if (bot.hold) {
      const arrived = moveToward(bot, { x: bot.hold[0], z: bot.hold[1] }, dt);
      bot.state = arrived ? 'hold' : 'route';
      if (arrived) faceToward(bot, { x: 0, z: 14 }, dt);
    }
    bot.body.step(dt, bot.keys);
    bot.group.position.copy(s.position);
  }

  function damage(bot, amount) {
    if (!bot.alive) return false;
    bot.health -= amount;
    // A bot that is defusing and gets hit loses its progress.
    if (bot.state === 'defuse') hooks.onDefuseInterrupted();
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.target = null;
    hooks.onBotKilled(bot);
    return true;
  }

  function reset() {
    bots.forEach((bot, index) => {
      const spawn = bot.team === 'attack'
        ? world.spawns.attack[(index % 3) + 1]
        : world.spawns.defend[index % 4];
      bot.body.reset(spawn);
      bot.health = HEALTH;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.copy(bot.body.state.position);
      bot.target = null;
      bot.routeIndex = 0;
      // The bomb starts with the player (main.js owns the carrier); no bot
      // is the carrier until the player goes down and hands it over.
      bot.isCarrier = false;
      bot.state = 'route';
      bot.perceiveAt = 0;
      if (bot.team === 'attack') {
        const roll = rng();
        bot.route = roll < 0.6 ? world.routes.main : roll < 0.8 ? world.routes.alleyLeft : world.routes.alleyRight;
      } else {
        bot.hold = world.routes.defendHold[index % world.routes.defendHold.length];
        bot.route = [];
      }
    });
  }

  return {
    bots,
    hitMeshes,
    step(dt, now, playerInfo, bomb) {
      for (const bot of bots) stepBot(bot, dt, now, playerInfo, bomb);
    },
    damage,
    reset,
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    carrier() {
      return bots.find((bot) => bot.team === 'attack' && bot.isCarrier && bot.alive) ?? null;
    },
    handBombToNearestAttacker(position) {
      let best = null;
      let bestDistance = Infinity;
      for (const bot of bots) {
        if (bot.team !== 'attack' || !bot.alive) continue;
        const distance = bot.body.state.position.distanceTo(position);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = bot;
        }
      }
      if (best) {
        for (const bot of bots) bot.isCarrier = false;
        best.isCarrier = true;
      }
      return best;
    },
  };
}
