'use strict';
/* Save data (localStorage), wallet, shop catalog and cosmetics. */

const CAT_LABELS = {
  felt: 'Table Felt', back: 'Card Backs', avatar: 'Avatars', chip: 'Chips',
  bg: 'Backgrounds', deck: 'Card Faces', fx: 'Win Effects'
};

const CATALOG = {
  felt: [
    { id: 'green',   name: 'Classic Green',  price: 0,    c: ['#1f8a4f', '#0b4a29'] },
    { id: 'navy',    name: 'Midnight Blue',  price: 300,  c: ['#2457a6', '#0c2552'] },
    { id: 'slate',   name: 'Slate Grey',     price: 400,  c: ['#59636e', '#272d34'] },
    { id: 'crimson', name: 'Crimson Velvet', price: 500,  c: ['#b3243b', '#5a0f1d'] },
    { id: 'teal',    name: 'Lagoon Teal',    price: 600,  c: ['#139c9c', '#075252'] },
    { id: 'purple',  name: 'Royal Purple',   price: 800,  c: ['#7a3fc4', '#34175f'] },
    { id: 'sunset',  name: 'Desert Sunset',  price: 1500, c: ['#e0703a', '#7a2a14'] },
    { id: 'gold',    name: 'Gold Leaf',      price: 4000, c: ['#e3c15a', '#7d5f12'] }
  ],
  back: [
    { id: 'blue',    name: 'Classic Blue',   price: 0,    css: 'repeating-linear-gradient(45deg,#1d3f9b 0 6px,#2d58c8 6px 12px)' },
    { id: 'red',     name: 'Crimson Weave',  price: 200,  css: 'repeating-linear-gradient(45deg,#a5192e 0 6px,#d33a50 6px 12px)' },
    { id: 'emerald', name: 'Emerald Stripes', price: 400, css: 'repeating-linear-gradient(0deg,#0f6b45 0 5px,#14935f 5px 10px)' },
    { id: 'checker', name: 'Checkerboard',   price: 600,  css: 'conic-gradient(#222 25%,#e8e8e8 0 50%,#222 0 75%,#e8e8e8 0) 0 0/16px 16px' },
    { id: 'stars',   name: 'Night Sky',      price: 900,  css: 'radial-gradient(circle at 50% 50%,#fff 0 2px,transparent 3px) 0 0/12px 12px,#2a1260' },
    { id: 'cyber',   name: 'Cyber Pulse',    price: 1800, css: 'linear-gradient(135deg,#00e5ff,#7a00ff 60%,#ff00aa)' },
    { id: 'gold',    name: 'Golden Royale',  price: 2500, css: 'repeating-linear-gradient(45deg,#c79a1e 0 5px,#f6dc7a 5px 10px)' },
    { id: 'flame',   name: 'Inferno',        price: 3000, css: 'linear-gradient(0deg,#ff3d00,#ffb300 60%,#fff176)' }
  ],
  avatar: [
    { id: 'smile',   name: 'Smiley',   price: 0,    emoji: '🙂' },
    { id: 'cool',    name: 'Cool',     price: 0,    emoji: '😎' },
    { id: 'grin',    name: 'Grinner',  price: 0,    emoji: '😀' },
    { id: 'cowboy',  name: 'Cowboy',   price: 300,  emoji: '🤠' },
    { id: 'fox',     name: 'Fox',      price: 300,  emoji: '🦊' },
    { id: 'panda',   name: 'Panda',    price: 300,  emoji: '🐼' },
    { id: 'lion',    name: 'Lion',     price: 500,  emoji: '🦁' },
    { id: 'robot',   name: 'Robot',    price: 600,  emoji: '🤖' },
    { id: 'skull',   name: 'Skull',    price: 700,  emoji: '💀' },
    { id: 'alien',   name: 'Alien',    price: 800,  emoji: '👽' },
    { id: 'wizard',  name: 'Wizard',   price: 900,  emoji: '🧙' },
    { id: 'dragon',  name: 'Dragon',   price: 1000, emoji: '🐉' },
    { id: 'ninja',   name: 'Ninja',    price: 1200, emoji: '🥷' },
    { id: 'unicorn', name: 'Unicorn',  price: 1500, emoji: '🦄' },
    { id: 'shark',   name: 'Card Shark', price: 2000, emoji: '🦈' },
    { id: 'fire',    name: 'On Fire',  price: 2500, emoji: '🔥' },
    { id: 'crown',   name: 'Royalty',  price: 3000, emoji: '👑' }
  ],
  chip: [
    { id: 'red',     name: 'Casino Red',    price: 0,    css: '#d22f3d' },
    { id: 'blue',    name: 'Ocean Blue',    price: 250,  css: '#2d6ae0' },
    { id: 'green',   name: 'Emerald',       price: 350,  css: '#1f9d55' },
    { id: 'black',   name: 'Obsidian',      price: 450,  css: '#22252b' },
    { id: 'purple',  name: 'Amethyst',      price: 700,  css: '#8a3ff0' },
    { id: 'gold',    name: 'Solid Gold',    price: 2000, css: 'linear-gradient(135deg,#ffe27a,#c8961b)' },
    { id: 'rainbow', name: 'Rainbow',       price: 4000, css: 'conic-gradient(#f33,#fa0,#ee0,#3d3,#0cf,#36f,#c3f,#f33)' }
  ],
  bg: [
    { id: 'dark',   name: 'Dark Room',     price: 0,    css: 'radial-gradient(ellipse at top,#1c2433,#0b0e14 70%)' },
    { id: 'lounge', name: 'Velvet Lounge', price: 500,  css: 'linear-gradient(160deg,#3b1d4a,#12081a)' },
    { id: 'ocean',  name: 'Deep Ocean',    price: 700,  css: 'linear-gradient(160deg,#0b3a5b,#04121f)' },
    { id: 'forest', name: 'Pine Cabin',    price: 900,  css: 'linear-gradient(160deg,#16452e,#06150d)' },
    { id: 'aurora', name: 'Aurora',        price: 1500, css: 'linear-gradient(135deg,#0b1f3a,#14614f 50%,#5b2a86)' },
    { id: 'vegas',  name: 'Vegas Night',   price: 2500, css: 'linear-gradient(135deg,#2a0a2f,#7a0b3a 50%,#e0451a)' }
  ],
  deck: [
    { id: 'classic', name: 'Classic (2 colour)', price: 0 },
    { id: 'four',    name: 'Four-Colour Deck',   price: 1000 }
  ],
  fx: [
    { id: 'sparkle',  name: 'Sparkles',    price: 0,    e: ['✨'] },
    { id: 'confetti', name: 'Confetti',    price: 800,  e: ['🎉', '🎊'] },
    { id: 'coins',    name: 'Coin Rain',   price: 1500, e: ['🪙'] },
    { id: 'stars',    name: 'Starfall',    price: 2500, e: ['⭐', '🌟'] },
    { id: 'cash',     name: 'Money Storm', price: 5000, e: ['💸', '💵'] }
  ]
};

const DEFAULT_SAVE = {
  v: 1, bank: 5000, name: 'Player',
  owned: ['felt:green', 'back:blue', 'avatar:smile', 'avatar:cool', 'avatar:grin', 'chip:red', 'bg:dark', 'deck:classic', 'fx:sparkle'],
  eq: { felt: 'green', back: 'blue', avatar: 'smile', chip: 'red', bg: 'dark', deck: 'classic', fx: 'sparkle' },
  stats: { hands: 0, won: 0, biggest: 0, net: 0, bestScore: 0, bestName: '', tourneys: 0, tourneyWins: 0, peak: 5000 },
  lastDaily: '', streak: 0, session: null, sound: true
};

const Store = {
  key: 'holdem-royale-save-v1',
  data: null,

  load() {
    let parsed = null;
    try { const raw = localStorage.getItem(this.key); if (raw) parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    const d = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    if (parsed && typeof parsed === 'object') {
      Object.assign(d, parsed);
      d.eq = Object.assign({}, DEFAULT_SAVE.eq, parsed.eq || {});
      d.stats = Object.assign({}, DEFAULT_SAVE.stats, parsed.stats || {});
      d.owned = Array.from(new Set(DEFAULT_SAVE.owned.concat(Array.isArray(parsed.owned) ? parsed.owned : [])));
    }
    if (typeof d.bank !== 'number' || !isFinite(d.bank) || d.bank < 0) d.bank = 0;
    this.data = d;
    // Recover chips left on a table when the tab was closed
    if (d.session) {
      if (!d.session.forfeit) d.bank += Math.max(0, Math.floor(d.session.chips || 0));
      d.session = null;
    }
    this.save();
  },

  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ }
  },

  item(cat, id) {
    const list = CATALOG[cat] || [];
    return list.find(x => x.id === id) || list[0];
  },
  has(cat, id) { return this.data.owned.includes(cat + ':' + id); },
  isEquipped(cat, id) { return this.data.eq[cat] === id; },
  valid(cat, id) { return (CATALOG[cat] || []).some(x => x.id === id); },

  buy(cat, id) {
    const it = this.item(cat, id);
    if (!it || this.has(cat, id) || this.data.bank < it.price) return false;
    this.data.bank -= it.price;
    this.data.owned.push(cat + ':' + id);
    this.save();
    return true;
  },
  equip(cat, id) {
    if (!this.has(cat, id)) return false;
    this.data.eq[cat] = id;
    this.save();
    return true;
  },

  css(cat, id) { const it = this.item(cat, id); return it ? (it.css || '') : ''; },
  emoji(id) { const it = this.item('avatar', id); return it ? it.emoji : '🙂'; },

  export() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.data)))); },
  import(code) {
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (!obj || typeof obj.bank !== 'number') return false;
      obj.session = null;
      localStorage.setItem(this.key, JSON.stringify(obj));
      this.load();
      return true;
    } catch (e) { return false; }
  },
  reset() {
    try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ }
    this.load();
  }
};

/* Wallet: money moves bank -> table stack (session) -> bank. The session is saved on every
   change, so closing the tab never destroys chips (except tournament entry fees). */
const Wallet = {
  bank() { return Store.data.bank; },
  canAfford(n) { return Store.data.bank >= n; },
  touchPeak() { const s = Store.data.stats; if (Store.data.bank > s.peak) s.peak = Store.data.bank; },
  sitDown(amount) {
    Store.data.bank -= amount;
    Store.data.session = { chips: amount };
    Store.save();
  },
  enter(fee) {
    Store.data.bank -= fee;
    Store.data.session = { chips: 0, forfeit: true };
    Store.save();
  },
  setChips(c) {
    if (Store.data.session && !Store.data.session.forfeit) { Store.data.session.chips = Math.max(0, Math.floor(c)); Store.save(); }
  },
  rebuy(amount) {
    Store.data.bank -= amount;
    if (Store.data.session) Store.data.session.chips += amount;
    Store.save();
  },
  pay(amount) { Store.data.bank += amount; this.touchPeak(); Store.save(); },
  cashOut() {
    const s = Store.data.session;
    if (s && !s.forfeit) Store.data.bank += Math.max(0, Math.floor(s.chips || 0));
    Store.data.session = null;
    this.touchPeak();
    Store.save();
  },
  forfeit() { Store.data.session = null; Store.save(); },

  today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  yesterday() { const d = new Date(Date.now() - 86400000); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); },
  dailyAvailable() { return Store.data.lastDaily !== this.today(); },
  dailyAmount() {
    const next = Store.data.lastDaily === this.yesterday() ? Store.data.streak + 1 : 1;
    return 500 + 100 * Math.min(next - 1, 6);
  },
  claimDaily() {
    if (!this.dailyAvailable()) return 0;
    const streak = Store.data.lastDaily === this.yesterday() ? Store.data.streak + 1 : 1;
    const amt = 500 + 100 * Math.min(streak - 1, 6);
    Store.data.streak = streak;
    Store.data.lastDaily = this.today();
    Store.data.bank += amt;
    this.touchPeak();
    Store.save();
    return amt;
  },
  bailout() {
    if (Store.data.bank >= 100 || Store.data.session) return false;
    Store.data.bank = 500;
    Store.save();
    return true;
  }
};

const Cosmetics = {
  apply() {
    const eq = Store.data.eq, root = document.documentElement;
    const f = Store.item('felt', eq.felt).c;
    root.style.setProperty('--felt1', f[0]);
    root.style.setProperty('--felt2', f[1]);
    document.body.style.background = Store.css('bg', eq.bg);
    document.body.style.backgroundAttachment = 'fixed';
    document.body.classList.toggle('deck4', eq.deck === 'four');
  }
};
