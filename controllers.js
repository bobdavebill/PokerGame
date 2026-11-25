'use strict';
/* Game controllers: LocalGame (bots / sit&go / hot-seat), HostGame and ClientGame (online, PeerJS). */

const TURN_MS = 30000;
const Net = {
  PREFIX: 'holdem-royale-',
  available() { return typeof Peer !== 'undefined'; },
  genCode() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  },
  send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) { /* ignore */ } },
  clean(name) { return String(name || 'Player').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14) || 'Player'; }
};

function botPlayers(ids, chips) {
  return ids.map(id => {
    const pr = BotAI.PROFILES.find(x => x.id === id);
    return { id: 'bot-' + id, name: pr.name, avatar: pr.avatar, back: pr.back, chipc: pr.chip, chips, isBot: true, profile: pr, buyin: chips };
  });
}

/* ---------- shared bot-handling mixin ---------- */
function botRebuy(engine, buyinOf) {
  engine.players.forEach((p, i) => {
    if (p.isBot && p.chips <= 0 && !p.out && !p.left) engine.rebuy(i, buyinOf(p));
  });
}

/* ========== Local games ========== */
class LocalGame {
  constructor(cfg) {
    this.cfg = cfg;
    this.mode = cfg.mode; // 'bots' | 'tourney' | 'hotseat'
    this.title = cfg.title;
    this.recordsStats = cfg.mode !== 'hotseat';
    this.usesWallet = cfg.mode === 'bots';
    this.canNext = true;
    this.revealed = -1;
    this.botT = null; this.nextT = null; this.closed = false;
    this.paid = false; this.place = 0; this.prize = 0;
    this.engine = new Engine({
      sb: cfg.sb, bb: cfg.bb, levels: cfg.levels, levelHands: cfg.levelHands, elimination: !!cfg.elimination,
      onChange: () => this.changed(), onHandEnd: r => this.handEnd(r)
    });
    cfg.players.forEach(p => this.engine.addPlayer(p));
    this.humanSeat = this.engine.players.findIndex(p => !p.isBot);
  }

  start() { UI.enterTable(this); this.engine.startHand(); }

  humanOut() {
    return this.mode === 'tourney' && this.humanSeat >= 0 && this.engine.players[this.humanSeat].out;
  }

  changed() {
    if (this.closed) return;
    const e = this.engine;
    clearTimeout(this.botT);
    if (this.usesWallet && this.humanSeat >= 0) Wallet.setChips(e.players[this.humanSeat].chips);
    this.emit();
    if (e.phase === 'betting') {
      const p = e.players[e.toAct];
      if (p && p.isBot) {
        const fast = this.humanOut();
        this.botT = setTimeout(() => this.botMove(), fast ? 120 : 600 + Math.random() * 900);
      }
    } else if (e.phase === 'showdown' && !e.over && this.mode !== 'hotseat' && !this.nextT) {
      this.nextT = setTimeout(() => this.next(), this.humanOut() ? 900 : 5500);
    }
  }

  botMove() {
    const e = this.engine;
    if (this.closed || e.phase !== 'betting') return;
    const seat = e.toAct, p = e.players[seat];
    if (!p || !p.isBot) return;
    const d = BotAI.decide(e, seat);
    e.act(seat, d.a, d.amt);
  }

  emit() {
    const e = this.engine;
    let seat = this.humanSeat, pass = null;
    if (this.mode === 'hotseat') {
      if (e.phase === 'betting') {
        if (e.toAct !== this.revealed) {
          seat = -1;
          const p = e.players[e.toAct];
          pass = { name: p.name, avatar: p.avatar };
        } else seat = e.toAct;
      } else seat = -1;
    }
    const v = e.view(seat);
    v.pass = pass; v.turnMs = 0;
    v.extra = { place: this.place, prize: this.prize, tourney: this.mode === 'tourney', entry: this.cfg.entry || 0 };
    UI.render(v, this);
  }

  reveal() { this.revealed = this.engine.toAct; this.emit(); }

  act(a, amt) {
    const e = this.engine;
    const seat = this.mode === 'hotseat' ? this.revealed : this.humanSeat;
    if (seat < 0 || e.toAct !== seat || e.phase !== 'betting') return;
    e.act(seat, a, amt);
  }

  next() {
    clearTimeout(this.nextT); this.nextT = null;
    const e = this.engine;
    if (this.closed || e.over || e.phase === 'betting') return;
    this.revealed = -1;
    e.startHand();
  }

  handEnd() {
    const e = this.engine;
    if (!this.cfg.elimination) botRebuy(e, p => p.buyin);
    if (this.mode === 'tourney' && !this.paid && this.humanSeat >= 0) {
      const h = e.players[this.humanSeat];
      if (h.place > 0) {
        this.paid = true; this.place = h.place;
        this.prize = this.cfg.prizes[h.place - 1] || 0;
        if (this.prize) Wallet.pay(this.prize);
        const s = Store.data.stats;
        s.tourneys++; if (h.place === 1) s.tourneyWins++;
        s.net += this.prize - this.cfg.entry;
        Wallet.touchPeak(); Store.save();
      }
    }
  }

  rebuy() {
    if (this.mode !== 'bots') return;
    const amt = this.cfg.buyin;
    const h = this.engine.players[this.humanSeat];
    if (!h || h.chips > 0 || !Wallet.canAfford(amt)) return;
    if (this.engine.rebuy(this.humanSeat, amt)) Wallet.rebuy(amt);
  }

  close() {
    this.closed = true;
    clearTimeout(this.botT); clearTimeout(this.nextT);
  }

  leave() {
    this.close();
    if (this.usesWallet) Wallet.cashOut();
    else if (this.mode === 'tourney') Wallet.forfeit();
  }
}

/* ========== Online host ========== */
class HostGame {
  constructor(cfg, me) {
    this.cfg = cfg; // { sb, bb, buyin }
    this.me = me;
    this.mode = 'online';
    this.isHost = true;
    this.recordsStats = true;
    this.canNext = true;
    this.conns = {};
    this.lobby = [{ id: 'host', name: me.name, avatar: me.avatar, back: me.back, chipc: me.chipc }];
    this.botCount = 2;
    this.started = false; this.closed = false;
    this.botT = null; this.nextT = null; this.turnT = null; this.turnMs = 0;
  }

  get title() { return 'Online table ' + (this.code || ''); }

  open() {
    if (!Net.available()) { UI.onNetError('Online play needs the PeerJS library to load. Check your connection and reload the page.'); return; }
    Wallet.sitDown(this.cfg.buyin);
    this.tryOpen(0);
  }

  tryOpen(n) {
    this.code = Net.genCode();
    const peer = this.peer = new Peer(Net.PREFIX + this.code);
    peer.on('open', () => UI.onHostOpen(this));
    peer.on('error', err => {
      if (err.type === 'unavailable-id' && n < 5) { try { peer.destroy(); } catch (e) { /* ignore */ } this.tryOpen(n + 1); }
      else if (!this.started || err.type === 'network' || err.type === 'server-error') {
        if (!this.code || !this.opened) { this.fail('Could not create the table (' + err.type + ').'); }
      }
    });
    peer.on('connection', conn => this.onConn(conn));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
    this.opened = false;
    peer.on('open', () => { this.opened = true; });
  }

  fail(msg) {
    this.leave();
    UI.onNetError(msg);
  }

  onConn(conn) {
    conn.on('data', m => this.onMsg(conn, m));
    conn.on('close', () => this.onClose(conn));
    conn.on('error', () => this.onClose(conn));
  }

  onMsg(conn, m) {
    if (!m || typeof m !== 'object' || this.closed) return;
    switch (m.t) {
      case 'hello':
        if (this.started) Net.send(conn, { t: 'reject', reason: 'That game has already started.' });
        else if (this.lobby.length >= 6) Net.send(conn, { t: 'reject', reason: 'That table is full.' });
        else Net.send(conn, { t: 'info', sb: this.cfg.sb, bb: this.cfg.bb, buyin: this.cfg.buyin, host: this.me.name });
        break;
      case 'join': {
        if (this.started || this.lobby.length >= 6 || this.conns[conn.peer]) return;
        const pl = {
          id: conn.peer, name: Net.clean(m.name),
          avatar: Store.emoji(Store.valid('avatar', m.avatar) ? m.avatar : 'smile'),
          back: Store.valid('back', m.back) ? m.back : 'blue',
          chipc: Store.valid('chip', m.chip) ? m.chip : 'red'
        };
        this.conns[conn.peer] = conn;
        this.lobby.push(pl);
        Net.send(conn, { t: 'welcome' });
        this.broadcastLobby();
        break;
      }
      case 'act': {
        if (!this.started) return;
        const seat = this.engine.players.findIndex(p => p.id === conn.peer);
        if (seat < 0 || !['fold', 'call', 'check', 'raise'].includes(m.a)) return;
        this.engine.act(seat, m.a, Number(m.amt));
        break;
      }
      case 'rebuy': {
        if (!this.started) return;
        const seat = this.engine.players.findIndex(p => p.id === conn.peer);
        if (seat >= 0) this.engine.rebuy(seat, this.cfg.buyin);
        break;
      }
    }
  }

  onClose(conn) {
    const id = conn.peer;
    if (!this.conns[id]) return;
    delete this.conns[id];
    if (!this.started) {
      this.lobby = this.lobby.filter(p => p.id !== id);
      this.broadcastLobby();
    } else if (this.engine) {
      const seat = this.engine.players.findIndex(p => p.id === id);
      if (seat >= 0) this.engine.removePlayer(seat);
    }
  }

  lobbyMsg() {
    return { t: 'lobby', players: this.lobby.map(p => ({ name: p.name, avatar: p.avatar })), bots: this.botCount, sb: this.cfg.sb, bb: this.cfg.bb, buyin: this.cfg.buyin };
  }
  broadcastLobby() {
    const m = this.lobbyMsg();
    Object.values(this.conns).forEach(c => Net.send(c, m));
    UI.onHostLobby(this);
  }
  setBots(n) {
    this.botCount = Math.max(0, Math.min(n, 6 - this.lobby.length));
    this.broadcastLobby();
  }

  start() {
    const bots = Math.min(this.botCount, 6 - this.lobby.length);
    if (this.lobby.length + bots < 2) return false;
    this.started = true;
    const e = this.engine = new Engine({
      sb: this.cfg.sb, bb: this.cfg.bb,
      onChange: () => this.changed(), onHandEnd: () => this.handEnd()
    });
    const ids = shuffle(BotAI.PROFILES.map(p => p.id)).slice(0, bots);
    const all = this.lobby.map(h => ({ id: h.id, name: h.name, avatar: h.avatar, back: h.back, chipc: h.chipc, chips: this.cfg.buyin, isBot: false, buyin: this.cfg.buyin }))
      .concat(botPlayers(ids, this.cfg.buyin));
    shuffle(all).forEach(p => e.addPlayer(p));
    Object.values(this.conns).forEach(c => Net.send(c, { t: 'start' }));
    UI.enterTable(this);
    e.startHand();
    return true;
  }

  changed() {
    if (this.closed) return;
    const e = this.engine;
    clearTimeout(this.botT); clearTimeout(this.turnT);
    this.turnMs = 0;
    const meSeat = e.players.findIndex(p => p.id === 'host');
    if (meSeat >= 0) Wallet.setChips(e.players[meSeat].chips);
    if (e.phase === 'betting') {
      const seat = e.toAct, p = e.players[seat];
      if (p && p.isBot) this.botT = setTimeout(() => this.botMove(), 700 + Math.random() * 900);
      else if (p && !p.left) {
        this.turnMs = TURN_MS;
        this.turnT = setTimeout(() => this.timeout(seat), TURN_MS);
      }
    } else if (e.phase === 'showdown' && !e.over && !this.nextT) {
      this.nextT = setTimeout(() => this.next(), 6000);
    }
    this.emit();
  }

  timeout(seat) {
    const e = this.engine;
    if (this.closed || e.phase !== 'betting' || e.toAct !== seat) return;
    const p = e.players[seat];
    e.act(seat, e.cur - p.bet > 0 ? 'fold' : 'check');
  }

  botMove() {
    const e = this.engine;
    if (this.closed || e.phase !== 'betting') return;
    const seat = e.toAct, p = e.players[seat];
    if (!p || !p.isBot) return;
    const d = BotAI.decide(e, seat);
    e.act(seat, d.a, d.amt);
  }

  emit() {
    const e = this.engine;
    e.players.forEach((p, i) => {
      if (p.isBot || p.left) return;
      const v = e.view(i);
      v.pass = null; v.turnMs = this.turnMs; v.extra = {};
      if (p.id === 'host') UI.render(v, this);
      else Net.send(this.conns[p.id], { t: 'state', v });
    });
  }

  act(a, amt) {
    const e = this.engine;
    const seat = e.players.findIndex(p => p.id === 'host');
    if (seat < 0 || e.toAct !== seat) return;
    e.act(seat, a, amt);
  }

  next() {
    clearTimeout(this.nextT); this.nextT = null;
    const e = this.engine;
    if (this.closed || !e || e.over || e.phase === 'betting') return;
    e.startHand();
  }

  handEnd() { botRebuy(this.engine, p => p.buyin); }

  rebuy() {
    const e = this.engine;
    const seat = e.players.findIndex(p => p.id === 'host');
    const h = e.players[seat];
    if (!h || h.chips > 0 || !Wallet.canAfford(this.cfg.buyin)) return;
    if (e.rebuy(seat, this.cfg.buyin)) Wallet.rebuy(this.cfg.buyin);
  }

  leave() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.botT); clearTimeout(this.nextT); clearTimeout(this.turnT);
    Object.values(this.conns).forEach(c => { Net.send(c, { t: 'closed' }); try { c.close(); } catch (e) { /* ignore */ } });
    try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ }
    Wallet.cashOut();
  }
}

/* ========== Online client ========== */
class ClientGame {
  constructor(code, me) {
    this.code = code.toUpperCase();
    this.me = me; // { name, avatarId, back, chip }
    this.mode = 'online';
    this.isHost = false;
    this.recordsStats = true;
    this.canNext = false;
    this.started = false; this.joined = false; this.sat = false; this.leaving = false;
    this.lobby = null; this.info = null;
  }

  get title() { return 'Online table ' + this.code; }

  connect() {
    if (!Net.available()) { UI.onNetError('Online play needs the PeerJS library to load. Check your connection and reload the page.'); return; }
    const peer = this.peer = new Peer();
    this.timeout = setTimeout(() => { if (!this.joined) this.fail('Could not reach that table. Check the code and try again.'); }, 15000);
    peer.on('open', () => {
      const conn = this.conn = peer.connect(Net.PREFIX + this.code, { reliable: true });
      conn.on('open', () => conn.send({ t: 'hello' }));
      conn.on('data', m => this.onMsg(m));
      conn.on('close', () => this.onClose());
      conn.on('error', () => this.onClose());
    });
    peer.on('error', err => {
      if (err.type === 'peer-unavailable') this.fail('No table found with that code.');
      else if (!this.leaving) this.fail('Connection problem (' + err.type + ').');
    });
  }

  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'info':
        if (!Wallet.canAfford(m.buyin)) { this.fail('You need ' + money(m.buyin) + ' to sit at this table.'); return; }
        this.info = m;
        Net.send(this.conn, { t: 'join', name: this.me.name, avatar: this.me.avatarId, back: this.me.back, chip: this.me.chip });
        break;
      case 'welcome':
        this.joined = true; clearTimeout(this.timeout);
        Wallet.sitDown(this.info.buyin); this.sat = true;
        UI.onClientLobby(this);
        break;
      case 'lobby': this.lobby = m; UI.onClientLobby(this); break;
      case 'start': this.started = true; UI.enterTable(this); break;
      case 'state': {
        const v = m.v;
        if (v && v.seats && v.me >= 0 && v.seats[v.me]) {
          Wallet.setChips(v.seats[v.me].chips);
          v.pass = null; v.extra = {};
          UI.render(v, this);
        }
        break;
      }
      case 'reject': this.fail(m.reason || 'Could not join.'); break;
      case 'closed': this.onClose('The host closed the table.'); break;
    }
  }

  fail(msg) {
    if (this.leaving) return;
    this.cleanup();
    UI.onNetError(msg);
  }

  onClose(msg) {
    if (this.leaving) return;
    this.cleanup();
    UI.onNetError(typeof msg === 'string' ? msg : 'Disconnected from the table.');
  }

  cleanup() {
    this.leaving = true;
    clearTimeout(this.timeout);
    try { this.conn && this.conn.close(); } catch (e) { /* ignore */ }
    try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ }
    if (this.sat) { Wallet.cashOut(); this.sat = false; }
  }

  act(a, amt) { Net.send(this.conn, { t: 'act', a, amt }); }
  next() { /* host controls pacing */ }
  rebuy() {
    if (!this.info || !Wallet.canAfford(this.info.buyin)) return;
    Wallet.rebuy(this.info.buyin);
    Net.send(this.conn, { t: 'rebuy' });
  }
  leave() { this.cleanup(); }
}
