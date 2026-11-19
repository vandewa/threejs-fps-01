// The economy: money in, money out. Everyone starts a match with $800 —
// enough for a smoke, not for a rifle — and earns for kills, plants and
// round wins, so the buy menu matters from round two on. The numbers are
// Counter-Strike-shaped on purpose: a win pays much more than a loss, so
// winning rounds is how a team affords rifles.
import { WEAPONS, SMOKE_PRICE } from './weapon.js';

export const START_MONEY = 800;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;

export function createEconomy() {
  let money = START_MONEY;
  let smokesOwned = 0;

  return {
    get money() {
      return money;
    },
    get smokes() {
      return smokesOwned;
    },
    reset() {
      money = START_MONEY;
      smokesOwned = 0;
    },
    earn(amount) {
      money += amount;
    },
    // Buy a weapon by id. Returns the weapon def on success, null when the
    // player cannot afford it or already owns it.
    buyWeapon(id) {
      const def = WEAPONS[id];
      if (!def || money < def.price) return null;
      money -= def.price;
      return def;
    },
    buySmoke() {
      if (money < SMOKE_PRICE) return false;
      money -= SMOKE_PRICE;
      smokesOwned += 1;
      return true;
    },
    spendSmoke() {
      if (smokesOwned <= 0) return false;
      smokesOwned -= 1;
      return true;
    },
    smokePrice() {
      return SMOKE_PRICE;
    },
  };
}
