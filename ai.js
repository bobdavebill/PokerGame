'use strict';
/* Bot personalities, Monte-Carlo equity and decision making. */
(function (root) {
  const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root;
  const bestScore = E.bestScore;

  const PROFILES = [
    { id: 'rick',  name: 'Rookie Rick',    avatar: '🐣', skill: 0.15, loose: 0.9,  aggr: 0.2,  bluff: 0.05, back: 'red',    chip: 'blue' },
    { id: 'lou',   name: 'Lucky Lou',      avatar: '🍀', skill: 0.35, loose: 0.75, aggr: 0.35, bluff: 0.15, back: 'emerald', chip: 'green' },
    { id: 'nina',  name: 'Nina Nits',      avatar: '🧶', skill: 0.5,  loose: 0.15, aggr: 0.2,  bluff: 0.02, back: 'blue',   chip: 'purple' },
    { id: 'wanda', name: 'Wild Wanda',     avatar: '🌪️', skill: 0.5,  loose: 0.8,  aggr: 0.9,  bluff: 0.35, back: 'flame',  chip: 'red' },
    { id: 'sam',   name: 'Sam "The Rock"', avatar: '🪨', skill: 0.6,  loose: 0.2,  aggr: 0.3,  bluff: 0.03, back: 'checker', chip: 'black' },
    { id: 'cap',   name: 'Captain Bluff',  avatar: '🏴‍☠️', skill: 0.55, loose: 0.6,  aggr: 0.75, bluff: 0.45, back: 'stars',  chip: 'black' },
    { id: 'tony',  name: 'Big Tony',       avatar: '🕴️', skill: 0.7,  loose: 0.5,  aggr: 0.8,  bluff: 0.2,  back: 'gold',   chip: 'gold' },
    { id: 'quinn', name: 'Quiet Quinn',    avatar: '🦉', skill: 0.8,  loose: 0.35, aggr: 0.5,  bluff: 0.08, back: 'cyber',  chip: 'purple' },
    { id: 'odds',  name: 'Dr. Odds',       avatar: '🧮', skill: 0.95, loose: 0.45, aggr: 0.6,  bluff: 0.1,  back: 'blue',   chip: 'green' }
  ];

  const TABLES = [
    { id: 'rookie',  name: 'Rookie Room',       emoji: '🐣', sb: 5,   bb: 10,   minBuy: 400,   maxBuy: 2000,   bots: ['rick', 'lou', 'nina'],                  desc: 'Friendly faces and tiny stakes. Perfect for learning.' },
    { id: 'diner',   name: 'Corner Diner',      emoji: '🍔', sb: 10,  bb: 20,   minBuy: 800,   maxBuy: 4000,   bots: ['lou', 'nina', 'sam', 'wanda'],          desc: 'Regulars who know a bluff when they smell one.' },
    { id: 'river',   name: 'Riverboat',         emoji: '🚢', sb: 25,  bb: 50,   minBuy: 2000,  maxBuy: 10000,  bots: ['sam', 'wanda', 'cap', 'tony', 'quinn'], desc: 'Sharper players and bigger pots.' },
    { id: 'roller',  name: 'High Roller Suite', emoji: '💎', sb: 100, bb: 200,  minBuy: 8000,  maxBuy: 40000,  bots: ['cap', 'tony', 'quinn', 'odds', 'wanda'], desc: 'Serious money. Serious opponents.' },
    { id: 'vault',   name: 'The Vault',         emoji: '🏦', sb: 500, bb: 1000, minBuy: 40000, maxBuy: 200000, bots: ['odds', 'quinn', 'tony', 'cap', 'sam'],  desc: 'The final boss table. Bring a fortune.' }
  ];

  const SIT_AND_GO = {
    entry: 500, chips: 1500, levelHands: 6,
    prizes: [1800, 750, 450],
    levels: [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [1000, 2000]],
    bots: ['lou', 'sam', 'wanda', 'quinn', 'cap']
  };

  function equity(hand, board, opps, sims) {
    if (opps < 1) return 1;
    const used = new Array(52).fill(false);
    hand.concat(board).forEach(c => { used[c] = true; });
    const rest = [];
    for (let i = 0; i < 52; i++) if (!used[i]) rest.push(i);
    const need = (5 - board.length) + 2 * opps;
    let w = 0;
    for (let s = 0; s < sims; s++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(Math.random() * (rest.length - i));
        const t = rest[i]; rest[i] = rest[j]; rest[j] = t;
      }
      let k = 5 - board.length;
      const full = board.concat(rest.slice(0, k));
      const mine = bestScore(hand.concat(full));
      let lost = false, ties = 0;
      for (let o = 0; o < opps; o++) {
        const sc = bestScore([rest[k], rest[k + 1]].concat(full));
        k += 2;
        if (sc > mine) { lost = true; break; }
        if (sc === mine) ties++;
      }
      if (!lost) w += 1 / (ties + 1);
    }
    return w / sims;
  }

  function decide(eng, seat) {
    const p = eng.players[seat];
    const st = p.profile || PROFILES[0];
    const opps = Math.max(1, eng.players.filter((q, i) => i !== seat && q.sitting && !q.folded).length);
    const toCall = Math.max(0, Math.min(eng.cur - p.bet, p.chips));
    const pot = eng.potTotal();
    const sims = Math.round(50 + st.skill * 150);
    let eq = equity(p.hand, eng.board, opps, sims);
    eq += (Math.random() - 0.5) * (1 - st.skill) * 0.3;
    const base = 1 / (opps + 1);
    const s = (eq - base) / (1 - base);
    const maxTo = p.bet + p.chips;
    const minTo = Math.min(eng.cur + eng.minRaise, maxTo);
    const canRaise = p.chips > toCall && eng.raiseCount < 3;
    const potAfter = pot + toCall;
    const mk = frac => {
      let to = Math.round(eng.cur + potAfter * frac);
      to = Math.max(minTo, Math.min(maxTo, to));
      return { a: 'raise', amt: to };
    };
    const r = Math.random();
    if (toCall === 0) {
      if (canRaise) {
        if (s > 0.45 - 0.1 * st.aggr && r < 0.55 + 0.4 * st.aggr) return mk(0.5 + Math.random() * 0.5);
        if (s > 0.15 && r < st.aggr * 0.5) return mk(0.35 + Math.random() * 0.3);
        if (eng.stage > 0 && r < st.bluff * 0.35) return mk(0.5 + Math.random() * 0.4);
      }
      return { a: 'call' };
    }
    const odds = toCall / (pot + toCall);
    const need = odds * (1 + 0.25 * (1 - st.loose));
    if (eq < need) {
      if (r < st.bluff * 0.15) return { a: 'call' };
      return { a: 'fold' };
    }
    if (canRaise && s > 0.4 && r < 0.35 + 0.5 * st.aggr) return mk(0.6 + Math.random() * 0.5);
    if (canRaise && eq > need * 0.8 && r < st.bluff * 0.12) return mk(0.8);
    return { a: 'call' };
  }

  const api = { PROFILES, TABLES, SIT_AND_GO, equity, decide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BotAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
