// The DOM HUD: health, ammo, money, timer, score, alive counts, kill feed, buy menu,
// bomb bar and the overlays. It never touches the simulation; main.js pushes numbers
// in and reads the play callback out.
const COPY = {
  start: {
    title: 'Cinder Yard',
    copy: 'Ember Crew against the Yard Wardens. Plant the spark cell at Crane Bay or the Fuel Depot — or drop all five Wardens. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Cinder Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: { title: '', copy: '', action: 'Next round' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammo = $('ammo');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const scoreValue = $('score-value');
  const hitmarker = $('hitmarker');
  const healthBar = $('health-fill');
  const healthText = $('health-value');
  const moneyText = $('money-value');
  const timerText = $('timer-value');
  const roundText = $('round-value');
  const aliveEmber = $('alive-ember');
  const aliveWarden = $('alive-warden');
  const feedList = $('feed');
  const buyPanel = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const bombBar = $('bomb');
  const bombFill = $('bomb-fill');
  const bombText = $('bomb-text');
  const vignette = $('vignette');
  const crosshair = $('crosshair');
  const banner = $('banner');
  let hitTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastWeapon = '';
  let lastHp = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastRound = -1;
  let lastScore = '';
  let lastAlive = '';

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve, name) {
      if (mag === lastMag && reserve === lastReserve && name === lastWeapon) return;
      lastMag = mag;
      lastReserve = reserve;
      lastWeapon = name;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === lastHp) return;
      lastHp = v;
      healthText.textContent = String(v);
      healthBar.style.width = `${v}%`;
      healthBar.classList.toggle('low', v <= 30);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyText.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds) {
      const text = formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerText.textContent = text;
      timerText.classList.toggle('urgent', seconds <= 10);
    },
    setRound(round, ember, warden) {
      const text = `R${round} · ${ember} — ${warden}`;
      if (text === lastRound) return;
      lastRound = text;
      roundText.textContent = text;
      scoreValue.textContent = `${ember} — ${warden}`;
    },
    setAlive(ember, warden) {
      const text = `${ember}|${warden}`;
      if (text === lastAlive) return;
      lastAlive = text;
      aliveEmber.textContent = '■'.repeat(ember) + '□'.repeat(5 - ember);
      aliveWarden.textContent = '■'.repeat(warden) + '□'.repeat(5 - warden);
    },
    feed(text) {
      const li = document.createElement('li');
      li.textContent = text;
      feedList.prepend(li);
      while (feedList.children.length > 5) feedList.removeChild(feedList.lastChild);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    crosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    bomb(show, fraction, text) {
      bombBar.hidden = !show;
      if (!show) return;
      bombFill.style.width = `${Math.round(fraction * 100)}%`;
      bombText.textContent = text;
    },
    banner(text, ms = 2600) {
      banner.textContent = text;
      banner.hidden = false;
      setTimeout(() => {
        banner.hidden = true;
      }, ms);
    },
    showBuy(items, money) {
      buyList.innerHTML = '';
      for (const item of items) {
        const li = document.createElement('li');
        li.innerHTML = `<b>[${item.key}]</b> ${item.name} <span>$${item.price}${item.owned ? ' · owned' : ''}</span>`;
        if (money < item.price && !item.owned) li.classList.add('poor');
        buyList.appendChild(li);
      }
      buyMoney.textContent = `$${money}`;
      buyPanel.hidden = false;
    },
    hideBuy() {
      buyPanel.hidden = true;
    },
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      if (mode === 'roundEnd') {
        title.textContent = data.winner === 'ember' ? 'Round to Ember Crew' : 'Round to the Wardens';
        copy.textContent = `${data.reason} Score is ${data.ember} — ${data.warden}.`;
        play.textContent = 'Next round';
      } else if (mode === 'matchEnd') {
        title.textContent = data.winner === 'ember' ? 'Ember Crew takes the yard' : data.winner === 'warden' ? 'The Wardens hold the yard' : 'A drawn yard';
        copy.textContent = `Final score ${data.ember} — ${data.warden}.`;
        play.textContent = 'Play again';
      } else {
        title.textContent = text.title;
        copy.textContent = text.copy;
        play.textContent = text.action;
      }
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
