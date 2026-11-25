'use strict';
/* UI: menus, shop, profile, lobby screens and the poker table renderer. */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');

/* ---------- sound ---------- */
const Sound = {
  ctx: null,
  init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f, d, type, v, delay) {
    if (!Store.data.sound || !this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(v || 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + d);
  },
  play(n) {
    switch (n) {
      case 'deal': this.tone(520, 0.06, 'triangle', 0.05); this.tone(380, 0.06, 'triangle', 0.04, 0.05); break;
      case 'chip': this.tone(900, 0.05, 'square', 0.03); this.tone(1300, 0.07, 'square', 0.025, 0.04); break;
      case 'turn': this.tone(660, 0.12, 'sine', 0.07); this.tone(880, 0.16, 'sine', 0.07, 0.1); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.08, i * 0.1)); break;
      case 'lose': this.tone(260, 0.25, 'sawtooth', 0.04); this.tone(200, 0.3, 'sawtooth', 0.04, 0.2); break;
      case 'click': this.tone(700, 0.04, 'square', 0.02); break;
    }
  }
};

const FX = {
  burst(emojis) {
    const layer = $('#fx-layer');
    for (let i = 0; i < 36; i++) {
      const s = document.createElement('span');
      s.className = 'fxp';
      s.textContent = emojis[i % emojis.length];
      s.style.left = Math.random() * 100 + '%';
      s.style.fontSize = 18 + Math.random() * 22 + 'px';
      s.style.animationDuration = 2 + Math.random() * 2 + 's';
      s.style.animationDelay = Math.random() * 0.8 + 's';
      layer.appendChild(s);
      setTimeout(() => s.remove(), 4800);
    }
  }
};

const POS = {
  2: [[50, 86], [50, 14]],
  3: [[50, 86], [14, 34], [86, 34]],
  4: [[50, 86], [10, 52], [50, 14], [90, 52]],
  5: [[50, 86], [10, 66], [26, 16], [74, 16], [90, 66]],
  6: [[50, 86], [10, 68], [10, 28], [50, 13], [90, 28], [90, 68]]
};
const LOCAL_AVATARS = ['😀', '😎', '🤠', '🦊', '🐼', '🦁'];
const LOCAL_BACKS = ['blue', 'red', 'emerald', 'checker', 'stars', 'gold'];
const LOCAL_CHIPS = ['red', 'blue', 'green', 'black', 'purple', 'gold'];

const UI = {
  ctrl: null, lobbyCtrl: null,
  lastHand: -1, fxHand: -1, lastSig: '', turnKey: '', turnDeadline: 0, clockTimer: null,
  elimShown: false, overShown: false, raiseKey: '', shopCat: 'felt',

  /* ---------- basics ---------- */
  init() {
    Store.load();
    Cosmetics.apply();
    document.addEventListener('pointerdown', () => Sound.init(), { once: true });
    $$('[data-go]').forEach(b => b.addEventListener('click', () => { Sound.play('click'); this.go(b.dataset.go); }));
    $('#in-name').value = Store.data.name;
    $('#in-name').addEventListener('input', e => {
      Store.data.name = e.target.value.replace(/[<>]/g, '').slice(0, 14) || 'Player';
      Store.save();
    });
    $('#btn-daily').onclick = () => {
      const amt = Wallet.claimDaily();
      if (amt) { Sound.play('win'); this.toast('🎁 Daily bonus: +' + money(amt) + ' (streak ' + Store.data.streak + ')'); }
      this.refresh();
    };
    $('#btn-bailout').onclick = () => { if (Wallet.bailout()) this.toast('The casino lent you $500. Spend it wisely!'); this.refresh(); };
    $('#bot-tables').onclick = e => {
      const b = e.target.closest('[data-table]');
      if (b) this.sitModal(BotAI.TABLES.find(t => t.id === b.dataset.table));
    };
    $('#bot-tourney').onclick = e => { if (e.target.closest('[data-tourney]')) this.startTourney(); };
    $('#local-count').onchange = () => this.renderLocal();
    $('#btn-local-start').onclick = () => this.startLocal();
    $('#on-stakes').onchange = () => this.renderOnline();
    $('#btn-host').onclick = () => this.hostTable();
    $('#btn-join').onclick = () => this.joinTable();
    $('#btn-online-back').onclick = () => { this.leaveLobby(); this.go('menu'); };
    $('#shop-tabs').onclick = e => {
      const b = e.target.closest('[data-cat]');
      if (b) { this.shopCat = b.dataset.cat; this.renderShop(); }
    };
    $('#shop-grid').onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const { act, cat, id } = b.dataset;
      if (act === 'buy') {
        if (Store.buy(cat, id)) { Store.equip(cat, id); Cosmetics.apply(); Sound.play('win'); this.toast('Purchased & equipped!'); }
        else this.toast('Not enough money yet.');
      } else if (act === 'equip') { Store.equip(cat, id); Cosmetics.apply(); Sound.play('click'); }
      this.refresh(); this.renderShop();
    };
    // table controls
    $('#btn-fold').onclick = () => this.ctrl && this.ctrl.act('fold');
    $('#btn-call').onclick = () => this.ctrl && this.ctrl.act('call');
    $('#btn-raise').onclick = () => this.ctrl && this.ctrl.act('raise', Number($('#raise-num').value));
    $('#btn-next').onclick = () => this.ctrl && this.ctrl.next();
    $('#btn-rebuy').onclick = () => this.ctrl && this.ctrl.rebuy();
    $('#btn-reveal').onclick = () => this.ctrl && this.ctrl.reveal && this.ctrl.reveal();
    $('#btn-leave').onclick = () => this.leavePrompt();
    $('#btn-mute').onclick = () => {
      Store.data.sound = !Store.data.sound; Store.save(); this.refreshMute();
    };
    $('#raise-range').oninput = e => { $('#raise-num').value = e.target.value; this.updateRaiseLabel(); };
    $('#raise-num').oninput = e => { $('#raise-range').value = e.target.value; this.updateRaiseLabel(); };
    $('#raise-box').onclick = e => {
      const b = e.target.closest('[data-frac]');
      if (!b || !this.view) return;
      const v = this.view, me = v.seats[v.me];
      const toCall = Math.min(v.cur - me.bet, me.chips);
      const maxTo = me.bet + me.chips;
      const minTo = Math.min(v.cur + v.minRaise, maxTo);
      let to = b.dataset.frac === 'max' ? maxTo : Math.round(v.cur + parseFloat(b.dataset.frac) * (v.pot + toCall));
      to = Math.max(minTo, Math.min(maxTo, to));
      $('#raise-range').value = to; $('#raise-num').value = to; this.updateRaiseLabel();
    };
    document.addEventListener('keydown', e => {
      if (!$('#screen-table').classList.contains('active') || e.target.tagName === 'INPUT') return;
      if (e.key === 'f') $('#btn-fold').click();
      else if (e.key === 'c') $('#btn-call').click();
      else if (e.key === 'r') $('#btn-raise').click();
    });
    window.addEventListener('resize', () => this.layout());
    this.layout(); this.refreshMute();
    // join link support: ?join=CODE
    const jc = new URLSearchParams(location.search).get('join');
    if (jc) { this.go('online'); $('#on-code').value = jc.toUpperCase().slice(0, 5); }
    this.go(jc ? 'online' : 'menu');
  },

  layout() { $('#screen-table').classList.toggle('portrait', window.innerWidth < 720); },
  refreshMute() { $('#btn-mute').textContent = Store.data.sound ? '🔊' : '🔇'; },

  go(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + id));
    window.scrollTo(0, 0);
    this.refresh();
    if (id === 'bots') this.renderBots();
    else if (id === 'local') this.renderLocal();
    else if (id === 'online') this.renderOnline();
    else if (id === 'shop') this.renderShop();
    else if (id === 'profile') this.renderProfile();
  },

  refresh() {
    $$('.bank').forEach(el => { el.textContent = money(Store.data.bank); });
    const da = Wallet.dailyAvailable();
    const btn = $('#btn-daily');
    btn.disabled = !da;
    btn.textContent = da ? '🎁 Claim daily bonus +' + money(Wallet.dailyAmount()) : '✅ Daily bonus claimed — come back tomorrow';
    $('#btn-bailout').hidden = !(Store.data.bank < 100 && !Store.data.session);
  },

  toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { t.hidden = true; }, 3200);
  },

  modal(html, buttons, onOpen) {
    $('#modal-card').innerHTML = html + '<div class="btnrow">' +
      buttons.map((b, i) => '<button class="btn ' + (b.cls || '') + '" data-mi="' + i + '">' + b.label + '</button>').join('') + '</div>';
    $('#modal').hidden = false;
    $$('#modal-card [data-mi]').forEach(el => {
      el.onclick = () => { const b = buttons[+el.dataset.mi]; if (!b.keep) this.closeModal(); if (b.fn) b.fn(); };
    });
    if (onOpen) onOpen();
  },
  closeModal() { $('#modal').hidden = true; },

  myPlayer(chips) {
    const eq = Store.data.eq;
    return { id: 'me', name: Store.data.name || 'Player', avatar: Store.emoji(eq.avatar), back: eq.back, chipc: eq.chip, chips, isBot: false, buyin: chips };
  },

  /* ---------- bots ---------- */
  renderBots() {
    const bank = Store.data.bank;
    $('#bot-tables').innerHTML = BotAI.TABLES.map(t => {
      const locked = bank < t.minBuy;
      const avs = t.bots.map(id => BotAI.PROFILES.find(p => p.id === id).avatar).join(' ');
      return '<div class="tcard' + (locked ? ' locked' : '') + '"><div class="tc-h">' + t.emoji + ' <b>' + esc(t.name) + '</b></div>' +
        '<div class="tc-s">Blinds ' + money(t.sb) + ' / ' + money(t.bb) + '<br>Buy-in ' + money(t.minBuy) + ' – ' + money(t.maxBuy) + '</div>' +
        '<p>' + esc(t.desc) + '</p><div class="tc-bots">' + avs + '</div>' +
        '<button class="btn gold" data-table="' + t.id + '"' + (locked ? ' disabled' : '') + '>' + (locked ? '🔒 Need ' + money(t.minBuy) : 'Sit down') + '</button></div>';
    }).join('');
    const sg = BotAI.SIT_AND_GO, pool = sg.prizes.reduce((a, b) => a + b, 0);
    const can = bank >= sg.entry;
    $('#bot-tourney').innerHTML = '<div class="tcard' + (can ? '' : ' locked') + '"><div class="tc-h">🏆 <b>Sit &amp; Go Showdown</b></div>' +
      '<div class="tc-s">Entry ' + money(sg.entry) + ' · 6 players · ' + money(sg.chips) + ' chips each</div>' +
      '<p>Blinds rise every ' + sg.levelHands + ' hands. Top 3 get paid: 1st ' + money(sg.prizes[0]) + ', 2nd ' + money(sg.prizes[1]) + ', 3rd ' + money(sg.prizes[2]) + '. Total prize pool ' + money(pool) + '.</p>' +
      '<div class="tc-bots">' + sg.bots.map(id => BotAI.PROFILES.find(p => p.id === id).avatar).join(' ') + '</div>' +
      '<button class="btn gold" data-tourney="1"' + (can ? '' : ' disabled') + '>' + (can ? 'Enter for ' + money(sg.entry) : '🔒 Need ' + money(sg.entry)) + '</button></div>';
  },

  sitModal(t) {
    const bank = Store.data.bank, lo = t.minBuy, hi = Math.min(t.maxBuy, bank);
    if (bank < lo) { this.toast('You need at least ' + money(lo) + ' for this table.'); return; }
    let val = Math.min(hi, Math.max(lo, t.bb * 100));
    this.modal('<h2>' + t.emoji + ' ' + esc(t.name) + '</h2><p>Blinds ' + money(t.sb) + ' / ' + money(t.bb) + '</p>' +
      '<p>Buy-in: <b id="sit-val">' + money(val) + '</b></p>' +
      '<input id="sit-range" type="range" min="' + lo + '" max="' + hi + '" step="' + t.bb + '" value="' + val + '">' +
      '<p class="fine">Your bank: ' + money(bank) + '. Chips are returned to your bank when you leave.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Sit down', cls: 'gold', fn: () => this.startBots(t, val) }],
      () => {
        $('#sit-range').oninput = e => { val = Number(e.target.value); $('#sit-val').textContent = money(val); };
      });
  },

  startBots(t, buyin) {
    if (!Wallet.canAfford(buyin)) return;
    Wallet.sitDown(buyin);
    new LocalGame({
      mode: 'bots', title: t.name, sb: t.sb, bb: t.bb, buyin,
      players: [this.myPlayer(buyin)].concat(botPlayers(t.bots, buyin))
    }).start();
  },

  startTourney() {
    const sg = BotAI.SIT_AND_GO;
    if (!Wallet.canAfford(sg.entry)) { this.toast('Not enough money for the entry fee.'); return; }
    Wallet.enter(sg.entry);
    new LocalGame({
      mode: 'tourney', title: 'Sit & Go Showdown', elimination: true, levels: sg.levels, levelHands: sg.levelHands,
      entry: sg.entry, prizes: sg.prizes,
      players: [this.myPlayer(sg.chips)].concat(botPlayers(sg.bots, sg.chips))
    }).start();
  },

  /* ---------- local ---------- */
  renderLocal() {
    const n = Number($('#local-count').value);
    const old = $$('#local-names input').map(i => i.value);
    let h = '';
    for (let i = 0; i < n; i++) {
      const def = i === 0 ? (Store.data.name || 'Player 1') : 'Player ' + (i + 1);
      h += '<label>Player ' + (i + 1) + ' <input maxlength="14" value="' + esc(old[i] || def) + '"></label>';
    }
    $('#local-names').innerHTML = h;
  },

  startLocal() {
    const names = $$('#local-names input').map((i, k) => Net.clean(i.value || 'Player ' + (k + 1)));
    const eq = Store.data.eq;
    const players = names.map((name, i) => ({
      id: 'p' + i, name, isBot: false, chips: 1500, buyin: 1500,
      avatar: i === 0 ? Store.emoji(eq.avatar) : LOCAL_AVATARS[i],
      back: i === 0 ? eq.back : LOCAL_BACKS[i],
      chipc: i === 0 ? eq.chip : LOCAL_CHIPS[i]
    }));
    const sg = BotAI.SIT_AND_GO;
    new LocalGame({ mode: 'hotseat', title: 'Local game', elimination: true, levels: sg.levels, levelHands: 8, players }).start();
  },

  /* ---------- online ---------- */
  renderOnline() {
    const [sb, bb] = $('#on-stakes').value.split(',').map(Number);
    $('#on-buyin').textContent = 'Everyone buys in for ' + money(bb * 100) + ' (100 big blinds). Your bank: ' + money(Store.data.bank);
    $('#on-main').hidden = !!this.lobbyCtrl;
    $('#on-lobby').hidden = !this.lobbyCtrl;
    if (this.lobbyCtrl) this.renderLobby();
  },

  myOnline() {
    const eq = Store.data.eq;
    return { name: Store.data.name || 'Player', avatar: Store.emoji(eq.avatar), avatarId: eq.avatar, back: eq.back, chip: eq.chip, chipc: eq.chip };
  },

  hostTable() {
    const [sb, bb] = $('#on-stakes').value.split(',').map(Number);
    const buyin = bb * 100;
    if (!Wallet.canAfford(buyin)) { this.toast('You need ' + money(buyin) + ' to host this table.'); return; }
    this.lobbyCtrl = new HostGame({ sb, bb, buyin }, this.myOnline());
    $('#on-main').hidden = true; $('#on-lobby').hidden = false;
    $('#on-lobby').innerHTML = '<h3>Creating table…</h3>';
    this.lobbyCtrl.open();
  },

  joinTable() {
    const code = $('#on-code').value.trim().toUpperCase();
    if (code.length < 4) { this.toast('Enter the room code from your host.'); return; }
    this.lobbyCtrl = new ClientGame(code, this.myOnline());
    $('#on-main').hidden = true; $('#on-lobby').hidden = false;
    $('#on-lobby').innerHTML = '<h3>Connecting to table ' + esc(code) + '…</h3><button class="btn ghost" id="lb-cancel">Cancel</button>';
    $('#lb-cancel').onclick = () => { this.leaveLobby(); this.renderOnline(); };
    this.lobbyCtrl.connect();
  },

  onHostOpen() { this.renderLobby(); },
  onHostLobby() { if (this.lobbyCtrl && !this.lobbyCtrl.started) this.renderLobby(); },
  onClientLobby() { this.renderLobby(); },

  renderLobby() {
    const c = this.lobbyCtrl;
    if (!c) return;
    const box = $('#on-lobby');
    box.hidden = false; $('#on-main').hidden = true;
    if (c.isHost) {
      const link = location.origin + location.pathname + '?join=' + c.code;
      const humans = c.lobby.length, maxBots = 6 - humans;
      const total = humans + Math.min(c.botCount, maxBots);
      let opts = '';
      for (let i = 0; i <= maxBots; i++) opts += '<option value="' + i + '"' + (i === Math.min(c.botCount, maxBots) ? ' selected' : '') + '>' + i + '</option>';
      box.innerHTML = '<h3>Your table</h3><div class="code-big">' + esc(c.code) + '</div>' +
        '<p class="center">Friends join with this code (Online Multiplayer → Join).</p>' +
        '<p class="center"><button class="btn small" id="lb-copy">📋 Copy invite link</button></p>' +
        '<p class="fine center">Blinds ' + money(c.cfg.sb) + ' / ' + money(c.cfg.bb) + ' · Buy-in ' + money(c.cfg.buyin) + '</p>' +
        '<div class="plist">' + c.lobby.map(p => '<div class="pl">' + esc(p.avatar) + ' ' + esc(p.name) + (p.id === 'host' ? ' <small>(host)</small>' : '') + '</div>').join('') + '</div>' +
        '<label>Bots to fill seats <select id="lb-bots">' + opts + '</select></label>' +
        '<div class="btnrow"><button class="btn ghost" id="lb-cancel">Cancel</button><button class="btn gold" id="lb-start"' + (total < 2 ? ' disabled' : '') + '>Start game (' + total + ' players)</button></div>';
      $('#lb-copy').onclick = () => {
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => this.toast('Invite link copied!'), () => this.toast(link));
        else this.toast(link);
      };
      $('#lb-bots').onchange = e => c.setBots(Number(e.target.value));
      $('#lb-start').onclick = () => c.start();
    } else {
      const l = c.lobby;
      box.innerHTML = '<h3>Table ' + esc(c.code) + '</h3><p class="center">Connected! Waiting for the host to start…</p>' +
        '<p class="fine center">Blinds ' + money(c.info.sb) + ' / ' + money(c.info.bb) + ' · Buy-in ' + money(c.info.buyin) + ' (taken from your bank)</p>' +
        '<div class="plist">' + (l ? l.players.map(p => '<div class="pl">' + esc(p.avatar) + ' ' + esc(p.name) + '</div>').join('') : '') + '</div>' +
        (l && l.bots ? '<p class="fine center">+ up to ' + l.bots + ' bot(s)</p>' : '') +
        '<div class="btnrow"><button class="btn ghost" id="lb-cancel">Leave table</button></div>';
    }
    $('#lb-cancel').onclick = () => { this.leaveLobby(); this.renderOnline(); };
  },

  leaveLobby() {
    if (this.lobbyCtrl) { try { this.lobbyCtrl.leave(); } catch (e) { /* ignore */ } this.lobbyCtrl = null; }
    this.refresh();
  },

  onNetError(msg) {
    const wasTable = $('#screen-table').classList.contains('active');
    this.lobbyCtrl = null; this.ctrl = null;
    this.closeModal(); $('#pass').hidden = true;
    this.toast(msg);
    this.go(wasTable ? 'menu' : 'online');
    if (!wasTable) this.renderOnline();
  },

  /* ---------- shop ---------- */
  renderShop() {
    $('#shop-tabs').innerHTML = Object.keys(CAT_LABELS).map(c =>
      '<button class="tab' + (c === this.shopCat ? ' on' : '') + '" data-cat="' + c + '">' + CAT_LABELS[c] + '</button>').join('');
    const cat = this.shopCat;
    $('#shop-grid').innerHTML = CATALOG[cat].map(it => {
      const owned = Store.has(cat, it.id), eq = Store.isEquipped(cat, it.id), afford = Store.data.bank >= it.price;
      let btn;
      if (eq) btn = '<button class="btn small" disabled>✔ Equipped</button>';
      else if (owned) btn = '<button class="btn small" data-act="equip" data-cat="' + cat + '" data-id="' + it.id + '">Equip</button>';
      else btn = '<button class="btn small gold" data-act="buy" data-cat="' + cat + '" data-id="' + it.id + '"' + (afford ? '' : ' disabled') + '>Buy ' + money(it.price) + '</button>';
      return '<div class="item' + (eq ? ' eq' : '') + '"><div class="prev">' + this.preview(cat, it) + '</div><div class="iname">' + esc(it.name) + '</div>' + btn + '</div>';
    }).join('');
  },

  preview(cat, it) {
    switch (cat) {
      case 'felt': return '<div class="pv-felt" style="background:radial-gradient(ellipse,' + it.c[0] + ',' + it.c[1] + ')"></div>';
      case 'back': return '<div class="card back pv-card" style="background:' + it.css + '"></div>';
      case 'avatar': return '<div class="pv-av">' + it.emoji + '</div>';
      case 'chip': return '<div class="pv-chip" style="background:' + it.css + '"></div>';
      case 'bg': return '<div class="pv-bg" style="background:' + it.css + '"></div>';
      case 'deck': {
        const four = it.id === 'four';
        const col = four ? ['#111', '#c8102e', '#1d5fd1', '#1a8a3a'] : ['#111', '#c8102e', '#c8102e', '#111'];
        return '<div class="pv-deck">' + SUIT_CH.map((s, i) => '<span style="color:' + col[i] + '">' + s + '</span>').join('') + '</div>';
      }
      case 'fx': return '<div class="pv-av">' + it.e.join('') + '</div>';
    }
    return '';
  },

  /* ---------- profile ---------- */
  renderProfile() {
    const s = Store.data.stats, eq = Store.data.eq;
    const winRate = s.hands ? Math.round(100 * s.won / s.hands) : 0;
    $('#profile-body').innerHTML =
      '<div class="panel"><div class="prof-head"><div class="big-av">' + Store.emoji(eq.avatar) + '</div><div><h2>' + esc(Store.data.name) + '</h2><div>Bank: <b>' + money(Store.data.bank) + '</b></div></div></div>' +
      '<div class="stats">' +
      this.stat('Hands played', s.hands) + this.stat('Hands won', s.won + ' (' + winRate + '%)') +
      this.stat('Biggest pot won', money(s.biggest)) + this.stat('Best hand', s.bestName || '—') +
      this.stat('Net winnings (all games)', (s.net >= 0 ? '+' : '−') + money(Math.abs(s.net))) + this.stat('Peak bank', money(Math.max(s.peak, Store.data.bank))) +
      this.stat('Tournaments', s.tourneys) + this.stat('Tournament wins', s.tourneyWins) +
      this.stat('Daily streak', Store.data.streak + ' day(s)') + this.stat('Items owned', Store.data.owned.length) +
      '</div></div>' +
      '<div class="panel"><h3>Save data</h3><p class="fine">Your progress lives in this browser\'s local storage. Use a save code to move it to another device or browser.</p>' +
      '<div class="btnrow"><button class="btn" id="pf-export">Export save code</button><button class="btn" id="pf-import">Import save code</button><button class="btn danger" id="pf-reset">Reset everything</button></div></div>';
    $('#pf-export').onclick = () => this.modal('<h3>Your save code</h3><textarea id="sv-text" readonly rows="6">' + esc(Store.export()) + '</textarea><p class="fine">Copy this and keep it somewhere safe.</p>',
      [{ label: 'Copy', cls: 'gold', keep: true, fn: () => { const t = $('#sv-text'); t.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } this.toast('Copied'); } }, { label: 'Close', cls: 'ghost' }]);
    $('#pf-import').onclick = () => this.modal('<h3>Import save code</h3><textarea id="sv-text" rows="6" placeholder="Paste your save code"></textarea>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Load', cls: 'gold', fn: () => {
        if (Store.import($('#sv-text').value)) { Cosmetics.apply(); $('#in-name').value = Store.data.name; this.toast('Save loaded!'); this.go('profile'); }
        else this.toast('That save code is not valid.');
      } }]);
    $('#pf-reset').onclick = () => this.modal('<h3>Reset everything?</h3><p>This erases your money, items and stats. It cannot be undone.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Yes, reset', cls: 'danger', fn: () => { Store.reset(); Cosmetics.apply(); $('#in-name').value = Store.data.name; this.go('menu'); this.toast('Progress reset.'); } }]);
  },
  stat(k, v) { return '<div class="stat"><span>' + esc(k) + '</span><b>' + esc(String(v)) + '</b></div>'; },

  /* ---------- table ---------- */
  enterTable(ctrl) {
    this.ctrl = ctrl; this.lobbyCtrl = null;
    this.lastHand = -1; this.fxHand = -1; this.lastSig = ''; this.turnKey = ''; this.raiseKey = '';
    this.elimShown = false; this.overShown = false; this.view = null;
    this.closeModal(); $('#pass').hidden = true;
    $('#tbl-info').textContent = ctrl.title || '';
    $('#log').innerHTML = '';
    this.go('table');
    this.layout();
  },

  leavePrompt() {
    const c = this.ctrl;
    if (!c) { this.go('menu'); return; }
    let msg = 'Leave the table?';
    const v = this.view;
    if (c.mode === 'bots' || c.mode === 'online') {
      const chips = v && v.me >= 0 ? v.seats[v.me].chips : 0;
      msg = 'Leave the table? You will cash out ' + money(chips) + ' (chips already in the pot are lost).';
    } else if (c.mode === 'tourney') msg = 'Leave the tournament? Your entry fee is forfeited.';
    else msg = 'End this local game and return to the menu?';
    this.modal('<h3>Leave table</h3><p>' + esc(msg) + '</p>', [{ label: 'Stay', cls: 'ghost' }, { label: 'Leave', cls: 'danger', fn: () => this.leaveNow() }]);
  },

  leaveNow() {
    const c = this.ctrl;
    this.ctrl = null; this.view = null;
    clearInterval(this.clockTimer);
    if (c) c.leave();
    $('#pass').hidden = true;
    this.go('menu');
  },

  cardHTML(id, backId) {
    if (id === null || id === undefined) return '<div class="card back" style="background:' + Store.css('back', backId) + '"></div>';
    const r = id >> 2, s = id & 3;
    return '<div class="card s' + s + '"><span class="r">' + RANK_CH[r] + '</span><span class="su">' + SUIT_CH[s] + '</span></div>';
  },

  render(v, ctrl) {
    if (ctrl !== this.ctrl) return;
    this.view = v;
    this.record(v);
    this.sfx(v);
    this.renderTable(v);
    this.updateActions(v);
    this.renderStatus(v);
    this.renderLog(v);
    this.checkEnd(v);
    const pass = $('#pass');
    pass.hidden = !v.pass;
    if (v.pass) { $('#pass-name').textContent = v.pass.name; $('#pass-av').textContent = v.pass.avatar; }
  },

  renderTable(v) {
    const n = v.seats.length;
    const pivot = this.ctrl.mode === 'hotseat' ? 0 : Math.max(0, v.me);
    const pos = POS[n] || POS[6];
    let seatsHTML = '', betsHTML = '';
    v.seats.forEach((s, i) => {
      const rel = (i - pivot + n) % n;
      const [x, y] = pos[rel];
      const cls = ['seat'];
      if (!s.sitting || s.out || s.left) cls.push('idle');
      if (s.folded && s.sitting) cls.push('folded');
      if (v.phase === 'betting' && i === v.toAct) cls.push('turn');
      if (s.win > 0) cls.push('winner');
      if (i === v.me) cls.push('me');
      const cards = s.hand ? s.hand.map(c => this.cardHTML(c, s.back)).join('') : '';
      let stack = money(s.chips);
      if (s.left) stack = 'left'; else if (s.out) stack = s.place ? this.ordinal(s.place) : 'out'; else if (s.chips === 0 && !s.sitting) stack = 'busted';
      else if (s.allIn && s.sitting && !s.folded) stack = 'ALL-IN';
      seatsHTML += '<div class="' + cls.join(' ') + '" style="left:' + x + '%;top:' + y + '%">' +
        '<div class="hand">' + cards + '</div>' +
        '<div class="plate"><div class="avatar">' + esc(s.avatar) + (s.dealer ? '<span class="dbtn">D</span>' : '') + '</div>' +
        '<div class="info"><div class="nm">' + esc(s.name) + '</div><div class="stack">' + esc(stack) + '</div></div></div>' +
        (s.lastAct && v.phase === 'betting' && !s.folded ? '<div class="act">' + esc(s.lastAct) + '</div>' : '') +
        (s.folded && s.sitting && v.phase === 'betting' ? '<div class="act fold">Fold</div>' : '') +
        (s.win > 0 ? '<div class="winbadge">+' + money(s.win) + '</div>' : '') +
        (s.handName && v.phase === 'showdown' ? '<div class="hn">' + esc(s.handName) + '</div>' : '') + '</div>';
      if (s.bet > 0) {
        const bx = x + (50 - x) * 0.42, by = y + (50 - y) * 0.42;
        betsHTML += '<div class="bet" style="left:' + bx + '%;top:' + by + '%"><span class="chip" style="background:' + Store.css('chip', s.chipc) + '"></span>' + money(s.bet) + '</div>';
      }
    });
    $('#seats').innerHTML = seatsHTML + betsHTML;
    let b = '';
    for (let i = 0; i < 5; i++) b += v.board[i] !== undefined ? this.cardHTML(v.board[i]) : '<div class="card slot"></div>';
    $('#board').innerHTML = b;
    $('#pot').textContent = v.pot > 0 ? 'Pot ' + money(v.pot) : '';
    $('#myrank').textContent = v.me >= 0 && v.seats[v.me] && !v.seats[v.me].folded ? v.myRank : '';
    let info = this.ctrl.title ? this.ctrl.title + ' · ' : '';
    info += 'Blinds ' + money(v.sb) + '/' + money(v.bb) + ' · Hand #' + v.handNum;
    if (v.isLevels && !v.over) info += ' · Blinds up in ' + v.levelLeft + ' hand' + (v.levelLeft === 1 ? '' : 's');
    if (this.ctrl.mode === 'online' && this.ctrl.code) info += ' · Code ' + this.ctrl.code;
    $('#tbl-info').textContent = info;
  },

  ordinal(n) { return n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); },

  updateActions(v) {
    const me = v.me >= 0 ? v.seats[v.me] : null;
    const myTurn = !!me && v.phase === 'betting' && v.toAct === v.me && !v.pass;
    $('#actionbar').classList.toggle('disabled', !myTurn);
    $('#act-main').hidden = !me;
    const showNext = v.phase === 'showdown' && this.ctrl.canNext && !v.over;
    const c = this.ctrl;
    const buy = c.cfg && c.cfg.buyin ? c.cfg.buyin : (c.info ? c.info.buyin : 0);
    const needRebuy = !!me && (c.mode === 'bots' || c.mode === 'online') && me.chips === 0 && buy > 0 && !me.left;
    $('#btn-next').hidden = !showNext;
    $('#btn-rebuy').hidden = !needRebuy;
    if (needRebuy) {
      const can = Wallet.canAfford(buy);
      $('#btn-rebuy').textContent = can ? 'Rebuy ' + money(buy) : 'Cannot afford rebuy (' + money(buy) + ')';
      $('#btn-rebuy').disabled = !can;
    }
    $('#act-after').hidden = !(showNext || needRebuy);
    if (!me) return;
    const toCall = Math.max(0, Math.min(v.cur - me.bet, me.chips));
    const maxTo = me.bet + me.chips;
    const minTo = Math.min(v.cur + v.minRaise, maxTo);
    $('#btn-fold').disabled = !myTurn;
    const call = $('#btn-call');
    call.disabled = !myTurn;
    call.textContent = toCall === 0 ? 'Check' : (toCall >= me.chips ? 'All-in ' + money(me.chips) : 'Call ' + money(toCall));
    const canRaise = myTurn && me.chips > toCall;
    $('#raise-box').hidden = !canRaise;
    $('#btn-raise').disabled = !canRaise;
    if (myTurn) {
      const key = v.handNum + '-' + v.stage + '-' + v.cur + '-' + v.toAct;
      const rr = $('#raise-range'), rn = $('#raise-num');
      rr.min = minTo; rr.max = maxTo; rr.step = 1;
      rn.min = minTo; rn.max = maxTo;
      if (key !== this.raiseKey) { this.raiseKey = key; rr.value = minTo; rn.value = minTo; }
      this.updateRaiseLabel();
    } else {
      $('#btn-raise').textContent = 'Raise';
    }
  },

  updateRaiseLabel() {
    const v = this.view;
    if (!v || v.me < 0) return;
    const me = v.seats[v.me];
    const maxTo = me.bet + me.chips;
    let val = Math.floor(Number($('#raise-num').value) || 0);
    val = Math.min(val, maxTo);
    const lbl = v.cur === 0 ? 'Bet ' : 'Raise to ';
    $('#btn-raise').textContent = val >= maxTo ? 'All-in ' + money(maxTo) : lbl + money(val);
  },

  renderStatus(v) {
    let html = '';
    const me = v.me >= 0 ? v.seats[v.me] : null;
    if (v.phase === 'waiting') html = 'Waiting for players…';
    else if (v.phase === 'betting') {
      const t = v.seats[v.toAct];
      if (v.pass) html = 'Waiting for ' + esc(t.name);
      else if (v.toAct === v.me) {
        const toCall = Math.min(v.cur - me.bet, me.chips);
        html = '<b>Your turn</b>' + (toCall > 0 ? ' — ' + money(toCall) + ' to call' : '');
      } else html = esc(t.name) + ' is thinking…';
      if (v.turnMs > 0) html += ' <span id="turnclock" class="clock"></span>';
    } else if (v.phase === 'showdown') {
      html = v.summary.map(x => '🏆 ' + esc(v.seats[x.seat].name) + ' wins ' + money(x.amount) + (x.hand ? ' with ' + esc(x.hand) : '')).join(' &nbsp;·&nbsp; ');
      if (!this.ctrl.canNext && !v.over) html += ' <span class="dim">— next hand starting…</span>';
    }
    $('#status').innerHTML = html;
    // turn clock
    if (v.phase === 'betting' && v.turnMs > 0) {
      const key = v.handNum + '-' + v.stage + '-' + v.toAct + '-' + v.cur;
      if (key !== this.turnKey) { this.turnKey = key; this.turnDeadline = Date.now() + v.turnMs; }
      if (!this.clockTimer) this.clockTimer = setInterval(() => this.tickClock(), 400);
      this.tickClock();
    } else { this.turnKey = ''; this.turnDeadline = 0; }
  },

  tickClock() {
    const el = $('#turnclock');
    if (!el) return;
    const left = Math.max(0, Math.ceil((this.turnDeadline - Date.now()) / 1000));
    el.textContent = '⏱ ' + left + 's';
    el.classList.toggle('low', left <= 8);
  },

  renderLog(v) {
    const el = $('#log');
    el.innerHTML = v.log.slice(-14).map(l => '<div>' + esc(l) + '</div>').join('');
    el.scrollTop = el.scrollHeight;
  },

  /* ---------- stats, sound & effects ---------- */
  record(v) {
    if (v.phase !== 'showdown' || v.handNum === this.lastHand) return;
    this.lastHand = v.handNum;
    if (v.me < 0 || !this.ctrl.recordsStats) return;
    const s = v.seats[v.me];
    if (!s || !s.sitting) return;
    const st = Store.data.stats;
    st.hands++;
    if (s.win > 0) {
      st.won++;
      if (v.pot > st.biggest) st.biggest = v.pot;
      if (s.score > st.bestScore) { st.bestScore = s.score; st.bestName = s.handName; }
    }
    if (this.ctrl.mode !== 'tourney') st.net += s.chips - s.startChips;
    Store.save();
  },

  sfx(v) {
    const me = v.me >= 0 ? v.seats[v.me] : null;
    const sig = v.handNum + ':' + v.board.length + ':' + v.pot + ':' + v.phase;
    if (sig !== this.lastSig) {
      const old = this.lastSig.split(':');
      if (old.length === 4) {
        if (Number(old[1]) < v.board.length || Number(old[0]) !== v.handNum) Sound.play('deal');
        else if (Number(old[2]) < v.pot) Sound.play('chip');
      }
      this.lastSig = sig;
    }
    if (me && v.phase === 'betting' && v.toAct === v.me && !v.pass && this.turnPing !== v.handNum + '-' + v.stage + '-' + v.cur) {
      this.turnPing = v.handNum + '-' + v.stage + '-' + v.cur;
      Sound.play('turn');
    }
    if (v.phase === 'showdown' && v.handNum !== this.fxHand) {
      this.fxHand = v.handNum;
      if (me && me.sitting && this.ctrl.mode !== 'hotseat') {
        if (me.win > 0 && me.chips > me.startChips) {
          Sound.play('win');
          FX.burst(Store.item('fx', Store.data.eq.fx).e);
        } else if (!me.folded) Sound.play('lose');
      }
    }
  },

  /* ---------- end-of-game dialogs ---------- */
  checkEnd(v) {
    const c = this.ctrl, x = v.extra || {};
    if (x.tourney && x.place > 0 && !this.elimShown) {
      this.elimShown = true;
      const won = x.place === 1;
      const html = won
        ? '<div class="big-av">🏆</div><h2>You won the tournament!</h2><p>Prize: <b>' + money(x.prize) + '</b></p>'
        : '<h2>You finished ' + this.ordinal(x.place) + '</h2><p>' + (x.prize ? 'Prize: <b>' + money(x.prize) + '</b>' : 'No prize this time — only the top 3 get paid.') + '</p>';
      const btns = won ? [{ label: 'Back to menu', cls: 'gold', fn: () => this.leaveNow() }]
        : [{ label: 'Keep watching', cls: 'ghost' }, { label: 'Leave', cls: 'gold', fn: () => this.leaveNow() }];
      this.modal(html, btns);
      this.refresh();
    }
    if (v.over && !this.overShown && c.mode !== 'online') {
      this.overShown = true;
      const w = v.seats[v.winnerSeat];
      if (c.mode === 'hotseat') {
        this.modal('<div class="big-av">🏆</div><h2>' + esc(w ? w.name : 'Nobody') + ' wins the match!</h2><p>Great game, everyone.</p>',
          [{ label: 'Back to menu', cls: 'gold', fn: () => this.leaveNow() }]);
      } else if (c.mode === 'tourney' && x.place !== 1) {
        this.modal('<h2>Tournament finished</h2><p>' + esc(w ? w.name : 'Someone') + ' took first place.</p>', [{ label: 'Back to menu', cls: 'gold', fn: () => this.leaveNow() }]);
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => UI.init());
