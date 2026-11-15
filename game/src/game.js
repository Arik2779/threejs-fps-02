// The match: phases, money, the buy list and the bomb. Pure state — no scene, no DOM.
// Phases: buy (12 s) → live (100 s) → end (5 s) → next round, first to 5 rounds.
import { WEAPONS, GRENADE } from './weapons.js';

const BUY_SECONDS = 12;
const ROUND_SECONDS = 100;
const END_SECONDS = 5;
const FUSE_SECONDS = 40;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const START_MONEY = 800;
const WIN_BONUS = 3250;
const LOSS_BONUS = 1900;
const KILL_BONUS = 300;
const PLANT_BONUS = 300;
const DEFUSE_BONUS = 300;

export function createMatch() {
  const feed = [];
  const match = {
    phase: 'buy',
    phaseT: BUY_SECONDS,
    round: 1,
    score: { ember: 0, warden: 0 },
    money: START_MONEY,
    bomb: { state: 'carried', carrier: 'player', site: '', timer: 0 },
    feed,
    lastWinner: '',
    lastReason: '',
    over: false,
    winner: '',
  };

  function pushFeed(text) {
    feed.push(text);
    if (feed.length > 5) feed.shift();
  }

  function startRound() {
    match.phase = 'buy';
    match.phaseT = BUY_SECONDS;
    match.bomb = { state: 'carried', carrier: 'player', site: '', timer: 0 };
    feed.length = 0;
  }

  function endRound(winner, reason) {
    match.lastWinner = winner;
    match.lastReason = reason;
    match.score[winner] += 1;
    match.money += winner === 'ember' ? WIN_BONUS : LOSS_BONUS;
    match.phase = 'end';
    match.phaseT = END_SECONDS;
    if (match.score.ember >= WIN_ROUNDS || match.score.warden >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
      match.over = true;
      match.winner = match.score.ember > match.score.warden ? 'ember' : match.score.warden > match.score.ember ? 'warden' : 'draw';
    }
  }

  return {
    state: match,
    startRound,
    endRound,
    pushFeed,
    buyList() {
      const list = WEAPONS.map((w) => ({ id: w.id, name: w.name, price: w.price, kind: 'gun' }));
      list.push({ id: GRENADE.id, name: GRENADE.name, price: GRENADE.price, kind: 'nade' });
      return list;
    },
    awardKill() {
      match.money += KILL_BONUS;
    },
    awardPlant() {
      match.money += PLANT_BONUS;
    },
    awardDefuse() {
      match.money += DEFUSE_BONUS;
    },
    plant(site) {
      match.bomb = { state: 'planted', carrier: '', site, timer: FUSE_SECONDS };
    },
    defuse() {
      match.bomb = { state: 'defused', carrier: '', site: '', timer: 0 };
    },
    dropBomb(atBot) {
      match.bomb = { state: 'carried', carrier: atBot, site: '', timer: 0 };
    },
    nextRound() {
      match.round += 1;
      startRound();
    },
    // Returns 'live' when buy ends, 'boom' when the fuse ends, '' otherwise.
    tick(dt) {
      match.phaseT -= dt;
      if (match.phase === 'buy' && match.phaseT <= 0) {
        match.phase = 'live';
        match.phaseT = ROUND_SECONDS;
        return 'live';
      }
      if (match.phase === 'live') {
        if (match.phaseT <= 0) {
          endRound('warden', 'Time expired — the site held.');
          return 'roundEnd';
        }
        if (match.bomb.state === 'planted') {
          match.bomb.timer -= dt;
          if (match.bomb.timer <= 0) {
            match.bomb.timer = 0;
            return 'boom';
          }
        }
      }
      if (match.phase === 'end' && match.phaseT <= 0) {
        if (match.over) return 'matchOver';
        this.nextRound();
        return 'roundStart';
      }
      return '';
    },
  };
}
