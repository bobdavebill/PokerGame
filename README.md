# ♠ Hold'em Royale

A free Texas Hold'em poker game that runs entirely in the browser (plain HTML5 / CSS / JavaScript, no build step). All money is **fake** and stored in your browser's `localStorage`.

## Features

- **Play vs Bots** – five cash tables (Rookie Room → The Vault) with bots that have different personalities, plus a **Sit & Go tournament** with rising blinds and prizes for the top 3.
- **Local multiplayer** – 2–6 players pass-and-play on one device (cards are hidden between turns).
- **Online multiplayer** – host a table, share the 5-letter room code (or invite link), and friends join directly from their own browsers. Optionally fill empty seats with bots. Uses WebRTC via [PeerJS](https://peerjs.com), so no server of your own is needed.
- **Persistent bank** – your balance, owned items, stats and settings are saved in `localStorage`. Chips left on a table are returned to your bank if you close the tab. A daily bonus (with streak) and a "borrow $500" bailout stop you from ever being stuck.
- **Shop** – buy table felts, card backs, avatars, chip colours, backgrounds, a four-colour deck and win effects. Avatars, card backs and chip colours are visible to other players online.
- **Profile** – stats, plus export / import of a save code and a reset button.

## Hosting on GitHub Pages

1. Create a new repository on GitHub (e.g. `holdem-royale`).
2. Upload all files from this folder to the **root** of the repo: `index.html`, `style.css`, `engine.js`, `ai.js`, `store.js`, `controllers.js`, `ui.js`, `README.md`.
3. In the repo go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose branch `main` and folder `/ (root)`, then Save.
4. After a minute your game is live at `https://<your-username>.github.io/<repo-name>/`.

You can also just double-click `index.html` to play offline against bots and locally (online play needs internet for the PeerJS library and signalling).

## Online play notes

- Peer-to-peer connections work on most home networks. Some strict networks (school/corporate) block WebRTC.
- The host's browser runs the game, so the table closes if the host leaves.
- Each player's buy-in is taken from their own bank; chips are returned when they leave.
- Turns have a 30-second timer online (auto-check or fold).

## Files

| File | Purpose |
|------|---------|
| `engine.js` | Cards, hand evaluator, betting rounds, side pots |
| `ai.js` | Bot personalities, Monte-Carlo equity, table definitions |
| `store.js` | Save data, wallet, shop catalogue, cosmetics |
| `controllers.js` | Local games, online host and client |
| `ui.js` | Screens, table rendering, shop, lobby |
| `style.css` | Styling |

Tweak table stakes and bot personalities in `ai.js`, and shop items/prices in `store.js`.
