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

## Conditions on the tracker
Each row in the Exchange tab has **+ Condition** (GM). The seven Sins' signature conditions are there, plus your own (name, optional timer):
- **Burn** (Wrath): Hurt at the end of each Exchange, for 3 Exchanges unless put out (x removes it). Adding Burn again renews it.
- **Bleed** (Lust): Hurt whenever the target spends E.G.O. or acts under strain; no timer, the GM removes it when treated.
- **Tremor** (Sloth): a delayed hit; bursts for Harm at the end of the Exchange after the one it was placed in.
- **Rupture** (Gluttony), **Sinking** (Gloom, max 3), **Poise** (Pride), **Charge** (Envy): stacks, spent one at a time with the - button (Rupture: +1 Harm on the next hit; Charge: dice or Harm). Unspent Charge discharges as a Complication when the fight ends.
- **Sinking and Poise change the rolls by themselves**, for any character or Threat the GM has put in the order (the row must be that character, not just a name). The roll dialog says so before you roll.
  - **Sinking:** a die off the next roll per stack (max -3), then it is used up. It also works on the other side: a Sinking opponent rolls that many fewer dice against you. A Threat's own roll loses the dice too.
  - **Poise:** a die on per stack, on a roll **tagged Pride**. The manual says a Failure spends it all but not what a Success does, so my reading is: it stays through successes and every Pride roll gets the bonus; a Failure (or Critical Failure) on a Pride roll spends it all. Change it in `js/engine.mjs` if you read it differently.
  - Used-up conditions disappear from the tracker; when a player's roll used them up, their browser tells the GM's, which clears them. Hail Mary rolls are not affected.
**Next Exchange** applies the end-of-Exchange effects and posts them to the log ("Wren is burning and takes Hurt"); **End fight** discharges Charge and clears everything. Hover a condition to read its rule; players see them read-only. The tracker reports what happens and leaves applying Hurt or Harm to the GM, because the manual does not fix how Hurt stacks.
The manual gives these effects but not how long they last, so the durations above are my defaults; change them in `js/conditions.mjs` or per condition when adding it.

## Turn timer
In the **Exchange** tab the GM picks a time per turn (15 s to 3 min, or none). **Start / Pause / Reset** control it; with **Auto** on, each new turn (marking someone Acted, or a new Exchange) resets it to full and starts it. Everyone sees the same countdown in the Exchange tab and in a chip at the top that shows whose turn it is (it turns red in the last 10 seconds; click it to open the tab). There are ticks in the last five seconds and an alarm at zero. Running out does nothing by itself: the GM decides. Each browser keeps its own clock from the moment it receives the timer, and a player who joins late gets the time actually left.

## Sounds
All made in the browser (nothing to download): dice clattering on every roll, then a sound for the result (a rising chime for a Critical, two notes for a Success, a flat tone for a Partial, a low thud for a Failure, a dark growl for a Critical Failure), a heartbeat before a Hail Mary, a low swell for the Voice (deeper when it is loud), a bell for each new Exchange, paper for a handout, a pop for chat, and the timer's tick and alarm. Everyone hears the other players' rolls too. The **Sound** button at the top turns it off; the slider sets the volume (both remembered). Browsers only allow sound after your first click on the page.

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
- `js/rules.mjs`: the pure rules (bands, E.G.O., Sins, Fit, Drift, Hail Mary, upkeep). `js/engine.mjs`: rolls, techniques, downtime. `js/model.mjs`, `js/store.mjs`: data and saving. `js/ui.mjs`: the interface. `js/room.mjs`: the shared-room protocol. `js/board.mjs`, `js/boardui.mjs`, `js/maplist.mjs`: the Exchange tracker and map. `js/handouts.mjs`, `js/handoutui.mjs`: handouts. `js/timer.mjs`: the turn timer. `js/conditions.mjs`: conditions. `js/sfx.mjs`: sounds. `js/es.mjs`, `js/ui_es.mjs`, `js/room_es.mjs`: Spanish.
- `tests/`: `node --test tests/*.test.mjs` (needs Node 20+; 96 tests).

## If you change the rules
Edit `js/rules.mjs` (and the tests), then the text in `js/config.mjs`, `js/engine.mjs` and Spanish in `js/es.mjs`. Any new English text passed to `t("...")` must get a Spanish entry, or `tests/i18n.test.mjs` fails.
