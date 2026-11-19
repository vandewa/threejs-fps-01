// Rounds: buy phase, live round, end banner, next round. A round ends when a
// team is eliminated, when the bomb explodes, when it is defused, or when the
// 100-second clock runs out (defenders win a timeout — the attackers failed
// their objective). First to 5 round wins takes the match. This module owns
// only time and score; main.js owns what happens on each ending.
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 5;
export const WIN_ROUNDS = 5;

export function createRounds() {
  let phase = 'buy'; // buy | live | end
  let timer = BUY_SECONDS;
  let round = 1;
  let scoreAttack = 0;
  let scoreDefend = 0;
  let lastReason = '';

  return {
    get phase() {
      return phase;
    },
    get timer() {
      return Math.max(0, Math.ceil(timer));
    },
    get round() {
      return round;
    },
    get scoreAttack() {
      return scoreAttack;
    },
    get scoreDefend() {
      return scoreDefend;
    },
    get lastReason() {
      return lastReason;
    },
    startMatch() {
      phase = 'buy';
      timer = BUY_SECONDS;
      round = 1;
      scoreAttack = 0;
      scoreDefend = 0;
      lastReason = '';
    },
    // Returns 'timeout' once, on the step the live clock hits zero.
    update(dt) {
      if (phase === 'end') {
        timer -= dt;
        return null;
      }
      timer -= dt;
      if (phase === 'buy' && timer <= 0) {
        phase = 'live';
        timer = ROUND_SECONDS;
        return 'live';
      }
      if (phase === 'live' && timer <= 0) {
        return 'timeout';
      }
      return null;
    },
    endRound(winner, reason) {
      if (phase === 'end') return false;
      phase = 'end';
      timer = END_SECONDS;
      lastReason = reason;
      if (winner === 'attack') scoreAttack += 1;
      else if (winner === 'defend') scoreDefend += 1;
      return true;
    },
    nextRound() {
      round += 1;
      phase = 'buy';
      timer = BUY_SECONDS;
    },
    matchOver() {
      if (scoreAttack >= WIN_ROUNDS) return 'attack';
      if (scoreDefend >= WIN_ROUNDS) return 'defend';
      return null;
    },
  };
}
