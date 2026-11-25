'use strict';
/* Texas Hold'em engine: cards, hand evaluation, betting rounds, side pots. No DOM access. */
(function (root) {
  const SUIT_CH = ['♠', '♥', '♦', '♣'];
  const RANK_CH = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const RN = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
  const RS = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const fmt = n => '$' + Math.round(n).toLocaleString('en-US');

  function shuffle(a, rng) {
    rng = rng || Math.random;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  const COMBO_CACHE = {};
  function combos(n, k) {
    const key = n + ',' + k;
    if (COMBO_CACHE[key]) return COMBO_CACHE[key];
    const out = [], cur = [];
    (function rec(s) {
      if (cur.length === k) { out.push(cur.slice()); return; }
      for (let i = s; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); }
    })(0);
    return (COMBO_CACHE[key] = out);
  }

  // card id: rank = id>>2 (0..12 => 2..A), suit = id&3
  const P5 = 759375; // 15^5
  function eval5(c0, c1, c2, c3, c4) {
    const r = [(c0 >> 2) + 2, (c1 >> 2) + 2, (c2 >> 2) + 2, (c3 >> 2) + 2, (c4 >> 2) + 2].sort((a, b) => b - a);
    const s0 = c0 & 3;
    const flush = s0 === (c1 & 3) && s0 === (c2 & 3) && s0 === (c3 & 3) && s0 === (c4 & 3);
    const ranks = [], counts = [];
    for (let i = 0; i < 5; i++) {
      if (i > 0 && r[i] === r[i - 1]) counts[counts.length - 1]++;
      else { ranks.push(r[i]); counts.push(1); }
    }
    const idx = ranks.map((_, i) => i).sort((a, b) => counts[b] - counts[a] || ranks[b] - ranks[a]);
    const gr = idx.map(i => ranks[i]), gc = idx.map(i => counts[i]);
    const straight = ranks.length === 5 && (r[0] - r[4] === 4 || (r[0] === 14 && r[1] === 5));
    let cat, tb;
    if (straight) {
      const hi = (r[0] === 14 && r[1] === 5) ? 5 : r[0];
      tb = [hi]; cat = flush ? 8 : 4;
    } else if (gc[0] === 4) { cat = 7; tb = gr; }
    else if (gc[0] === 3 && gc[1] === 2) { cat = 6; tb = gr; }
    else if (flush) { cat = 5; tb = gr; }
    else if (gc[0] === 3) { cat = 3; tb = gr; }
    else if (gc[0] === 2 && gc[1] === 2) { cat = 2; tb = gr; }
    else if (gc[0] === 2) { cat = 1; tb = gr; }
    else { cat = 0; tb = gr; }
    let s = cat;
    for (let i = 0; i < 5; i++) s = s * 15 + (tb[i] || 0);
    return s;
  }

  function bestScore(cards) {
    const n = cards.length;
    if (n < 5) return 0;
    if (n === 5) return eval5(cards[0], cards[1], cards[2], cards[3], cards[4]);
    let best = -1;
    const cs = combos(n, 5);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const s = eval5(cards[c[0]], cards[c[1]], cards[c[2]], cards[c[3]], cards[c[4]]);
      if (s > best) best = s;
    }
    return best;
  }

  function handName(s) {
    const cat = Math.floor(s / P5);
    const t1 = Math.floor(s / 50625) % 15;
    switch (cat) {
      case 8: return t1 === 14 ? 'Royal Flush' : 'Straight Flush';
      case 7: return 'Four ' + RN[t1 - 2];
      case 6: return 'Full House';
      case 5: return 'Flush';
      case 4: return RS[t1 - 2] + '-high Straight';
      case 3: return 'Three ' + RN[t1 - 2];
      case 2: return 'Two Pair';
      case 1: return 'Pair of ' + RN[t1 - 2];
      default: return RS[t1 - 2] + ' High';
    }
  }

  class Engine {
    constructor(o) {
      o = o || {};
      this.sb = o.sb || 5; this.bb = o.bb || 10;
      this.levels = o.levels || null; this.levelHands = o.levelHands || 6; this.level = 0;
      if (this.levels) { this.sb = this.levels[0][0]; this.bb = this.levels[0][1]; }
      this.elimination = !!o.elimination;
      this.onChange = o.onChange || function () {};
      this.onHandEnd = o.onHandEnd || function () {};
      this.rng = o.rng || Math.random;
      this.players = [];
      this.dealer = -1; this.sbSeat = -1; this.bbSeat = -1;
      this.handNum = 0; this.phase = 'waiting'; this.stage = 0;
      this.board = []; this.deck = [];
      this.cur = 0; this.minRaise = this.bb; this.toAct = -1; this.raiseCount = 0;
      this.log = []; this.summary = []; this.over = false; this.winnerSeat = -1;
    }

    change() { this.onChange(this); }
    logLine(t) { this.log.push(t); if (this.log.length > 80) this.log.shift(); }

    addPlayer(o) {
      this.players.push({
        id: o.id, name: o.name, avatar: o.avatar, back: o.back, chipc: o.chipc,
        chips: o.chips, isBot: !!o.isBot, profile: o.profile || null, buyin: o.buyin || o.chips,
        bet: 0, total: 0, folded: true, allIn: false, acted: false, sitting: false, show: false,
        win: 0, lastAct: '', handName: '', score: 0, hand: [], startChips: o.chips,
        out: false, left: false, place: 0
      });
      return this.players.length - 1;
    }

    alive(p) { return !p.out && !p.left && p.chips > 0; }
    aliveCount() { return this.players.filter(p => this.alive(p)).length; }
    live() { return this.players.filter(p => p.sitting && !p.folded); }
    potTotal() { return this.players.reduce((s, p) => s + p.total, 0); }

    nextSeat(from, pred) {
      const n = this.players.length;
      for (let k = 1; k <= n; k++) {
        const i = (((from + k) % n) + n) % n;
        if (pred(this.players[i], i)) return i;
      }
      return -1;
    }

    pay(p, a) {
      a = Math.max(0, Math.min(a, p.chips));
      p.chips -= a; p.bet += a; p.total += a;
      if (p.chips === 0) p.allIn = true;
      return a;
    }

    startHand() {
      if (this.over) return false;
      if (this.aliveCount() < 2) { this.phase = 'waiting'; this.change(); return false; }
      this.handNum++;
      if (this.levels) {
        this.level = Math.min(this.levels.length - 1, Math.floor((this.handNum - 1) / this.levelHands));
        this.sb = this.levels[this.level][0]; this.bb = this.levels[this.level][1];
      }
      this.deck = shuffle(Array.from({ length: 52 }, (_, i) => i), this.rng);
      this.board = []; this.stage = 0; this.summary = [];
      for (const p of this.players) {
        p.hand = []; p.bet = 0; p.total = 0; p.allIn = false; p.acted = false; p.show = false;
        p.win = 0; p.lastAct = ''; p.handName = ''; p.score = 0;
        p.sitting = this.alive(p); p.folded = !p.sitting; p.startChips = p.chips;
      }
      this.dealer = this.nextSeat(this.dealer, p => p.sitting);
      const count = this.players.filter(p => p.sitting).length;
      if (count === 2) {
        this.sbSeat = this.dealer;
        this.bbSeat = this.nextSeat(this.dealer, p => p.sitting);
      } else {
        this.sbSeat = this.nextSeat(this.dealer, p => p.sitting);
        this.bbSeat = this.nextSeat(this.sbSeat, p => p.sitting);
      }
      for (let r = 0; r < 2; r++) {
        let s = this.dealer;
        for (let k = 0; k < this.players.length; k++) {
          s = this.nextSeat(s, p => p.sitting);
          this.players[s].hand.push(this.deck.pop());
        }
      }
      this.logLine('— Hand #' + this.handNum + ' —');
      const sbp = this.players[this.sbSeat], bbp = this.players[this.bbSeat];
      const a = this.pay(sbp, this.sb); sbp.lastAct = 'SB ' + a;
      const b = this.pay(bbp, this.bb); bbp.lastAct = 'BB ' + b;
      this.logLine(sbp.name + ' posts small blind ' + fmt(a));
      this.logLine(bbp.name + ' posts big blind ' + fmt(b));
      this.cur = Math.max(a, b); this.minRaise = this.bb; this.raiseCount = 0;
      this.phase = 'betting';
      this.toAct = this.bbSeat;
      this.advance();
      this.change();
      return true;
    }

    advance() {
      const live = this.live();
      if (live.length === 1) { this.finishUncontested(live[0]); return; }
      const canAct = live.filter(p => !p.allIn);
      const done = canAct.length === 0 ||
        (canAct.length === 1 && canAct[0].bet >= this.cur) ||
        canAct.every(p => p.acted && p.bet === this.cur);
      if (done) { this.nextStage(); return; }
      this.toAct = this.nextSeat(this.toAct, p => p.sitting && !p.folded && !p.allIn && !(p.acted && p.bet === this.cur));
    }

    nextStage() {
      for (const p of this.players) { p.bet = 0; p.acted = false; if (p.sitting && !p.folded) p.lastAct = p.allIn ? 'All-in' : ''; }
      this.cur = 0; this.minRaise = this.bb; this.raiseCount = 0;
      if (this.stage === 3) { this.showdown(); return; }
      this.stage++;
      const n = this.stage === 1 ? 3 : 1;
      for (let i = 0; i < n; i++) this.board.push(this.deck.pop());
      this.logLine(['', 'Flop', 'Turn', 'River'][this.stage] + ': ' + this.board.map(c => RANK_CH[c >> 2] + SUIT_CH[c & 3]).join(' '));
      this.toAct = this.dealer;
      this.advance();
    }

    act(seat, type, amt) {
      if (this.phase !== 'betting' || seat !== this.toAct) return false;
      const p = this.players[seat];
      const toCall = this.cur - p.bet;
      if (type === 'fold') {
        p.folded = true; p.lastAct = 'Fold';
        this.logLine(p.name + ' folds');
      } else if (type === 'call' || type === 'check') {
        if (toCall <= 0) { p.lastAct = 'Check'; this.logLine(p.name + ' checks'); }
        else {
          const a = this.pay(p, toCall);
          p.lastAct = p.allIn ? 'All-in ' + p.bet : 'Call ' + a;
          this.logLine(p.name + (p.allIn ? ' calls all-in ' : ' calls ') + fmt(a));
        }
      } else if (type === 'raise') {
        let to = Math.floor(Number(amt));
        if (!isFinite(to)) return false;
        const maxTo = p.bet + p.chips;
        to = Math.min(to, maxTo);
        const minTo = this.cur + this.minRaise;
        if (to < minTo && to < maxTo) to = Math.min(minTo, maxTo);
        if (to <= this.cur) return this.act(seat, 'call');
        const wasBet = this.cur === 0;
        const size = to - this.cur;
        this.pay(p, to - p.bet);
        if (size >= this.minRaise) this.minRaise = size;
        this.cur = to; this.raiseCount++;
        for (const q of this.players) if (q !== p) q.acted = false;
        p.lastAct = p.allIn ? 'All-in ' + to : (wasBet ? 'Bet ' : 'Raise ') + to;
        this.logLine(p.name + (p.allIn ? ' is all-in for ' : (wasBet ? ' bets ' : ' raises to ')) + fmt(to));
      } else return false;
      p.acted = true;
      this.advance();
      this.change();
      return true;
    }

    finishUncontested(w) {
      const pot = this.potTotal();
      w.chips += pot; w.win = pot; w.show = false;
      this.logLine(w.name + ' wins ' + fmt(pot) + ' (everyone folded)');
      this.endHand();
    }

    showdown() {
      const live = this.live();
      for (const p of live) {
        p.show = true;
        p.score = bestScore(p.hand.concat(this.board));
        p.handName = handName(p.score);
      }
      const levels = Array.from(new Set(this.players.map(p => p.total).filter(x => x > 0))).sort((a, b) => a - b);
      let prev = 0;
      for (const lv of levels) {
        let amount = 0;
        for (const p of this.players) amount += Math.max(0, Math.min(p.total, lv) - prev);
        let elig = live.filter(p => p.total >= lv);
        if (elig.length === 0) elig = live.slice();
        const best = Math.max.apply(null, elig.map(p => p.score));
        const winners = elig.filter(p => p.score === best);
        const share = Math.floor(amount / winners.length);
        let rem = amount - share * winners.length;
        const order = winners.slice().sort((a, b) => {
          const da = (this.players.indexOf(a) - this.dealer + this.players.length) % this.players.length;
          const db = (this.players.indexOf(b) - this.dealer + this.players.length) % this.players.length;
          return da - db;
        });
        for (const w of order) { w.chips += share; w.win += share; }
        for (let i = 0; rem > 0; i = (i + 1) % order.length, rem--) { order[i].chips += 1; order[i].win += 1; }
        prev = lv;
      }
      for (const p of this.players) if (p.win > 0) this.logLine(p.name + ' wins ' + fmt(p.win) + (p.show ? ' with ' + p.handName : ''));
      this.endHand();
    }

    endHand() {
      this.phase = 'showdown';
      this.summary = [];
      this.players.forEach((p, i) => { if (p.win > 0) this.summary.push({ seat: i, amount: p.win, hand: p.show ? p.handName : '' }); });
      if (this.elimination) {
        const sitting = this.players.filter(p => p.sitting);
        const bust = sitting.filter(p => p.chips === 0).sort((a, b) => a.startChips - b.startChips);
        let place = sitting.length;
        for (const p of bust) { p.out = true; p.place = place--; this.logLine(p.name + ' is eliminated in ' + p.place + this.ord(p.place) + ' place'); }
        const surv = sitting.filter(p => p.chips > 0 && !p.left);
        if (surv.length <= 1) {
          this.over = true;
          if (surv[0]) { surv[0].place = 1; this.winnerSeat = this.players.indexOf(surv[0]); }
        }
      }
      this.onHandEnd({ handNum: this.handNum, pot: this.potTotal(), summary: this.summary });
    }

    ord(n) { return (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'); }

    removePlayer(seat) {
      const p = this.players[seat];
      if (!p || p.left) return;
      p.left = true;
      this.logLine(p.name + ' left the table');
      if (this.phase === 'betting' && p.sitting && !p.folded) {
        if (this.toAct === seat) { this.act(seat, 'fold'); return; }
        p.folded = true; p.lastAct = 'Fold';
        const live = this.live();
        if (live.length === 1) { this.finishUncontested(live[0]); }
      }
      this.change();
    }

    rebuy(seat, amt) {
      const p = this.players[seat];
      if (!p || p.left || p.out || p.chips > 0) return false;
      if (this.phase === 'betting' && p.sitting && !p.folded) return false;
      p.chips += amt;
      this.logLine(p.name + ' rebuys for ' + fmt(amt));
      this.change();
      return true;
    }

    view(seat) {
      const me = this.players[seat];
      const seats = this.players.map((p, i) => {
        let hand = null;
        if (p.sitting) {
          if (i === seat) hand = p.hand.slice();
          else if (p.show) hand = p.hand.slice();
          else if (!p.folded) hand = [null, null];
        }
        return {
          name: p.name, avatar: p.avatar, back: p.back, chipc: p.chipc,
          chips: p.chips, bet: p.bet, total: p.total, folded: p.folded, allIn: p.allIn,
          sitting: p.sitting, out: p.out, left: p.left, isBot: p.isBot,
          dealer: i === this.dealer && p.sitting, sb: i === this.sbSeat, bb: i === this.bbSeat,
          hand, lastAct: p.lastAct, win: p.win, handName: p.show ? p.handName : '',
          score: p.show ? p.score : 0, startChips: p.startChips, place: p.place
        };
      });
      let myRank = '';
      if (me && me.sitting && me.hand.length === 2 && this.board.length >= 3) myRank = handName(bestScore(me.hand.concat(this.board)));
      return {
        handNum: this.handNum, phase: this.phase, stage: this.stage, board: this.board.slice(),
        pot: this.potTotal(), cur: this.cur, minRaise: this.minRaise, toAct: this.phase === 'betting' ? this.toAct : -1,
        me: seat, seats, sb: this.sb, bb: this.bb, level: this.level,
        levelLeft: this.levels ? this.levelHands - ((this.handNum - 1) % this.levelHands) : 0,
        isLevels: !!this.levels, myRank, over: this.over, winnerSeat: this.winnerSeat,
        summary: this.summary.slice(), log: this.log.slice(-40), raiseCount: this.raiseCount
      };
    }
  }

  const api = { SUIT_CH, RANK_CH, eval5, bestScore, handName, shuffle, Engine, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
