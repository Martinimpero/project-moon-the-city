# Project Moon: The City: web app (Phases 1 and 2)

A free table companion for the rules in the manual. No accounts, no server, no license. Plain files; everything runs in the browser.

## Play it
- **On this computer:** double-click `start.bat` (needs Python). It opens http://localhost:8766/.
- **On the internet, free:** it is live at https://martinimpero.github.io/project-moon-the-city/ (GitHub Pages, from the public repo https://github.com/Martinimpero/project-moon-the-city). To update it, commit and push the `webapp` folder: `git add -A && git commit -m "..." && git push`; the site rebuilds in about a minute.
- Your sheets are saved in the browser. **Export** downloads a `.json` backup; **Import** loads it on another device.

## What it does
- Character sheets (five tabs), the four pregens (English or Spanish), Threats and Crew sheets.
- The roll dialog: Attribute + Skill, Sin tag with matchup and Fit, attuned gear Boon and Pull/Wear, Bonds, E.G.O. dice (1s and 2s are Complications), Help, a target (fills in its dice and Sin).
- Hail Mary with Verdict and Acceptance, the Voice, Signature Techniques (Rampage, Hook, Unmoved, Devour, Sorrow's Weight, Unbowed, Borrowed Face), Vice, Riding, Drift.
- Downtime: upkeep, repairs, rest, the Fund and dormant Assets; Contract payment; Clocks and the Ledger.
- English and Spanish (the button at the top right). Works on a phone: three tabs (People, Sheet, Log).

## Shared rooms (Phase 2)
Press **Room** at the top. The **GM** opens a room (a 5-letter code, plus a link with `?room=CODE`); **players** join with the code. No server of ours: the browsers connect directly through the free PeerJS broker (the PeerJS script loads from jsDelivr only when you press Room, so solo play works offline).
- Everyone sees every roll, Hail Mary and downtime card. A chat box sends messages to everyone; the GM can whisper to one player.
- The **Voice** is private: only the player and the GM see it.
- The GM sees each player's characters, read-only, under "At the table". Players keep editing their own sheets.
- A Threat marked **Show to the table** appears in players' target list, with its dice and Sin. Sorrow's Weight and the like are routed to whoever owns the target.
- The GM's **New scene for all** resets every player's scene.
- Limits: the GM's page must stay open (the room closes when the GM leaves; a reload can re-open the same code after a few seconds). Strict networks can block peer-to-peer; then play solo-style on a call. Peers learn each other's IP address (how WebRTC works), so only share the code with your table.

## Exchange tracker and maps
The right-hand pane has three tabs: **Log**, **Exchange** and **Map** (on a phone they are under **Table**).
- **Exchange:** the manual has no initiative, so this tracks who has acted in the current Exchange. The GM adds characters and Threats ("Fill from the table"), reorders with the arrows, marks who has acted, and presses **Next Exchange**. The first one who has not acted is highlighted as "up now". Each row shows E.G.O. and Harm, or the Threat's track. Players see it read-only; each new Exchange posts its order to the log.
- **Map:** the GM picks one of the eight bundled maps (web copies of the vault's maps: `maps/`, made by `make_maps.py`) or uploads an image (shrunk to 1800 px and shared with the table). Grid, snap-to-square and square size are adjustable. Tokens: add one for a character or Threat (the picture is chosen from `tokens/` when a name matches), colour, size, optionally hidden from players. Drag tokens; drag the background to pan; wheel or +/- to zoom.
- In a room, players see the GM's tracker and map (without hidden tokens) and can drag **only their own character's token**; the host checks that.

## Handouts
The fourth tab. The GM keeps a library of handouts (a note, a contract, a picture; text supports *italic* and **bold**, pictures are shrunk to 1400 px). **+ Contract** starts one with the paperwork fields (client, Risk, job, payment, deadline, terms). **Show** sends it to the table: each player gets a reading window at once, a line in the log, and it stays in their Handouts tab until the GM presses **Take back**. Players joining later get whatever is currently shown. Alone, Show just opens it for you.

## Fog of war and measuring
- **Measure** (everyone): press it, then drag on the map. A gold line shows the distance in squares; diagonals count as one square (the larger of the two axes). While you drag a token it also shows how far it has moved.
- **Fog of war** (GM): tick **Fog of war** on the map. The whole map is covered; **Reveal** and **Cover up** paint squares by dragging, **Reveal all** / **Cover all** do the lot, and **Around token** reveals a few squares around the selected token (the number beside it). Players see solid black; the GM sees through it. Players' tokens for characters always show; any other token standing in fog is hidden from players.
- **Fog hides things on screen only.** The map picture itself is still sent to players, so someone who opens the browser's developer tools could see it. Fine for a friendly table; do not rely on it against a determined player.

## Not built yet
Accounts, cloud save, per-player vision, dynamic lighting.

## Files
- `index.html`, `css/style.css`: the page and look (same design as the rulebook).
- `js/rules.mjs`: the pure rules (bands, E.G.O., Sins, Fit, Drift, Hail Mary, upkeep). `js/engine.mjs`: rolls, techniques, downtime. `js/model.mjs`, `js/store.mjs`: data and saving. `js/ui.mjs`: the interface. `js/room.mjs`: the shared-room protocol. `js/board.mjs`, `js/boardui.mjs`, `js/maplist.mjs`: the Exchange tracker and map. `js/handouts.mjs`, `js/handoutui.mjs`: handouts. `js/es.mjs`, `js/ui_es.mjs`, `js/room_es.mjs`: Spanish.
- `tests/`: `node --test tests/*.test.mjs` (needs Node 20+; 71 tests).

## If you change the rules
Edit `js/rules.mjs` (and the tests), then the text in `js/config.mjs`, `js/engine.mjs` and Spanish in `js/es.mjs`. Any new English text passed to `t("...")` must get a Spanish entry, or `tests/i18n.test.mjs` fails.
