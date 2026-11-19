// The DOM HUD: crosshair, hit marker, health, ammo, round timer, team score,
// money, bomb status, kill feed, plant/defuse progress, contextual hints, the
// buy menu and the one overlay panel. It never touches the simulation;
// main.js pushes numbers in and reads the play callback out. Every setter
// caches its last value and skips the DOM write when nothing changed.
import { WEAPONS, SMOKE_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'Pasar Malam',
    copy: 'A night market after dark. Plant the bomb at the stage — or hold the site and defuse it. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'Pasar Malam',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoEl = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const smokeCount = $('smoke-count');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const timerEl = $('timer');
  const teamScore = $('team-score');
  const roundLabel = $('round-label');
  const moneyEl = $('money');
  const bombStatus = $('bomb-status');
  const killfeed = $('killfeed');
  const progress = $('progress');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const hint = $('hint');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const hitmarker = $('hitmarker');
  const damageFlash = $('damage-flash');
  let hitTimer = 0;
  let damageTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastSmokes = -1;
  let lastHealth = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastMoney = -1;
  let lastBomb = '';
  let lastHint = '';

  function buyRow(id, key, name, price, owned) {
    const afford = owned ? 'owned' : '';
    return `<div class="buy-row ${afford}" data-id="${id}"><kbd>${key}</kbd><span class="buy-name">${name}</span><span class="buy-price">${owned ? 'OWNED' : `$${price}`}</span></div>`;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setWeapon(name, smokes) {
      if (name === lastWeapon && smokes === lastSmokes) return;
      lastWeapon = name;
      lastSmokes = smokes;
      weaponName.textContent = name;
      smokeCount.textContent = smokes > 0 ? `Smoke x${smokes} [G]` : 'No smoke [G]';
    },
    setHealth(hp) {
      const value = Math.max(0, Math.ceil(hp));
      if (value === lastHealth) return;
      lastHealth = value;
      healthValue.textContent = String(value);
      healthFill.style.width = `${value}%`;
      healthFill.classList.toggle('low', value <= 30);
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerEl.textContent = text;
      timerEl.classList.toggle('buy', phase === 'buy');
    },
    setScore(attack, defend, round) {
      const text = `ATK ${attack} — ${defend} DEF · R${round}`;
      if (text === lastScore) return;
      lastScore = text;
      teamScore.textContent = `ATK ${attack} — ${defend} DEF`;
      roundLabel.textContent = `Round ${round} · first to 5`;
    },
    setMoney(amount) {
      if (amount === lastMoney) return;
      lastMoney = amount;
      moneyEl.textContent = `$${amount}`;
      buyMoney.textContent = `$${amount}`;
    },
    setBombStatus(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombStatus.textContent = text;
      bombStatus.classList.toggle('danger', text.includes('PLANTED') || text.includes('BOMB'));
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showProgress(label, fraction) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    hideProgress() {
      progress.hidden = true;
    },
    setHint(text) {
      if (text === lastHint) return;
      lastHint = text;
      hint.textContent = text;
      hint.hidden = text === '';
    },
    showBanner(titleText, subText) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
    },
    hideBanner() {
      banner.hidden = true;
    },
    showBuyMenu(ownedIds) {
      buyMenu.hidden = false;
      const rows = [
        buyRow('pistol', '1', WEAPONS.pistol.name, WEAPONS.pistol.price, ownedIds.has('pistol')),
        buyRow('smg', '2', WEAPONS.smg.name, WEAPONS.smg.price, ownedIds.has('smg')),
        buyRow('rifle', '3', WEAPONS.rifle.name, WEAPONS.rifle.price, ownedIds.has('rifle')),
        buyRow('smoke', '4', 'Smoke grenade', SMOKE_PRICE, false),
      ];
      $('buy-items').innerHTML = rows.join('');
    },
    hideBuyMenu() {
      buyMenu.hidden = true;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageFlash.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damageFlash.classList.remove('on'), 180);
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? detail : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
