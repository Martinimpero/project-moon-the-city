/** The Exchange tracker and the map: views and interaction. Built with `createBoardUI(ctx)` so it does not import ui.mjs. */
import * as B from "./board.mjs";
import { MAPS, TOKENS } from "./maplist.mjs";
import { SIN_LABEL, HARM_LABEL, SIN_TEXT } from "./config.mjs";
import * as C from "./conditions.mjs";
import { t } from "./i18n.mjs";
import { esc } from "./engine.mjs";
import { REFS as MAN_REFS, refButton } from "./manualrefs.mjs";
import { DURATIONS, timerOf, timerStart, timerPause, timerReset, timerNewTurn, timerSetSecs, fmt } from "./timer.mjs";

/**
 * ctx: { state, room(), isGM(), board() -> {tracker, map, image}, remoteActors(), findActor(id), changed(), post(html), ask(opts), toast(msg), $ }
 * `changed()` saves, redraws and (as host) sends the board on.
 */
export function createBoardUI(ctx) {
  let view = null;               // {x, y, w, h}: the visible part of the map, in image pixels (local to this browser)
  let viewKey = "";
  let sel = "";                  // selected token id
  let tool = "";                 // "" (pan), "measure", "ping", "reveal", "cover", "draw", "pin", "erase", "wall", "door" or "area"
  let areaShape = "circle", areaWidth = 1;               // the area template being laid: its shape, and a line's width in squares
  let markColor = B.MARK_COLORS[0], markShown = true;   // the colour of the next drawing, and whether players see it
  let look = false;              // a ping also centres everyone's view
  let lastSent = 0;
  const pings = [];              // the pings on this map right now (short-lived)
  let radius = 3;                // squares revealed around a token
  const $ = ctx.$;

  /* ------------------------------------------------------------------ Exchange tracker */

  function slotInfo(slot) {
    const a = slot.actorId ? ctx.findActor(slot.actorId) : null;
    if (!a) return "";
    if (a.type === "character") return `E.G.O. ${a.derived.egoCurrent}/${a.system.ego.max} · ${HARM_LABEL[a.system.harm]}`;
    if (a.type === "npc") return `${[t("Holding"), t("Breaking"), t("Routed")][a.system.threat] ?? ""} · ${HARM_LABEL[a.system.harm]}${a.system.alignment ? ` · ${SIN_LABEL[a.system.alignment]}` : ""}`;
    return "";
  }

  /* ---- conditions ---- */
  const condName = c => (c.type === "custom" ? c.name : SIN_TEXT[C.CONDITIONS[c.type].sin].keyword);
  function condsHtml(slot, gm) {
    const list = C.conditionsOf(slot);
    if (!list.length && !gm) return "";
    const chips = list.map(c => {
      const def = C.CONDITIONS[c.type];
      const label = `${esc(condName(c))}${def.stacks && c.stacks > 1 ? ` &times;${c.stacks}` : ""}${c.rounds > 0 ? ` (${c.rounds})` : ""}${c.type === "tremor" && c.delay > 0 ? " &hellip;" : ""}`;
      const tip = [t(def.rule), c.note].filter(Boolean).join(" ");
      return `<span class="cond sin-${def.sin || "none"}" title="${esc(tip)}"><b>${label}</b>${gm ? `${def.stacks ? `<button type="button" data-action="condStep" data-slot="${slot.id}" data-id="${c.id}" data-delta="-1" title="${esc(t("Spend one"))}">&minus;</button><button type="button" data-action="condStep" data-slot="${slot.id}" data-id="${c.id}" data-delta="1" title="${esc(t("Add one"))}">+</button>` : ""}<button type="button" data-action="condRemove" data-slot="${slot.id}" data-id="${c.id}" title="${esc(t("Remove"))}">&times;</button>` : ""}</span>`;
    }).join("");
    return `<div class="conds">${chips}${gm ? `<button type="button" class="condadd" data-action="condAdd" data-slot="${slot.id}">+ ${esc(t("Condition"))}</button>` : ""}${refButton("conditions", t("Open this in the manual"))}</div>`;
  }
  function eventText(e) {
    const name = e.slot.name, cond = condName(e.cond);
    if (e.kind === "hurt") return t("{name} is burning and takes Hurt.", { name });
    if (e.kind === "burst") return t("{cond} bursts on {name}: it deals Harm.", { cond, name });
    if (e.kind === "discharge") return t("{name}'s unspent Charge ({n}) discharges as a Complication.", { name, n: e.cond.stacks });
    return t("{cond} on {name} ends.", { cond, name });
  }
  function eventsCard(title, events) {
    const line = e => `<p>${esc(eventText(e))}${e.kind === "hurt" && e.slot.actorId !== undefined ? ` <button type="button" class="gm-only hurtbtn" data-action="applyHurt" data-slot="${e.slot.id}">${esc(t("Apply Hurt"))}</button>` : ""}</p>`;
    return `<div class="pm-card pm-conditions"><div class="pm-card-head">${esc(title)}</div><div class="pm-notes">${events.map(line).join("")}</div></div>`;
  }

  function trackerHtml() {
    const { tracker: tr } = ctx.board();
    const gm = ctx.isGM();
    const cur = B.currentSlot(tr);
    const kindLabel = { pc: t("Character"), threat: t("Threat"), named: t("Named opponent"), other: "" };
    const rows = tr.slots.map((s, i) => `<li class="slot ${s.kind} ${s.acted ? "acted" : ""} ${cur?.id === s.id && tr.active ? "now" : ""}">
      ${gm ? `<span class="mv"><button type="button" data-action="slotMove" data-id="${s.id}" data-delta="-1" ${i === 0 ? "disabled" : ""}>&uarr;</button><button type="button" data-action="slotMove" data-id="${s.id}" data-delta="1" ${i === tr.slots.length - 1 ? "disabled" : ""}>&darr;</button></span>` : ""}
      ${(() => { const src = ctx.portraitSrc?.(s.actorId); return `<span class="av">${src ? `<img src="${esc(src)}" alt="">` : esc(B.initials(s.name))}</span>`; })()}<span class="who"><b>${esc(s.name)}</b><small>${esc([kindLabel[s.kind], slotInfo(s)].filter(Boolean).join(" · "))}</small></span>
      ${condsHtml(s, gm)}
      ${gm && s.hurtDue > 0 ? `<button type="button" class="hurtdue" data-action="applyHurt" data-slot="${s.id}" title="${esc(t("Harm becomes at least Hurt"))}">${esc(t("Apply Hurt"))}${s.hurtDue > 1 ? ` &times;${s.hurtDue}` : ""}</button>` : ""}
      ${gm ? `<button type="button" class="act ${s.acted ? "on" : ""}" data-action="slotActed" data-id="${s.id}">${esc(s.acted ? t("Acted") : t("Waiting"))}</button><button type="button" data-action="slotRemove" data-id="${s.id}" title="${esc(t("Remove"))}">&times;</button>`
        : `<span class="state">${esc(s.acted ? t("Acted") : (cur?.id === s.id && tr.active ? t("Up now") : t("Waiting")))}</span>`}</li>`).join("");
    const others = ctx.state.actors.concat(ctx.remoteActors()).filter(a => (a.type === "character" || a.type === "npc") && !tr.slots.some(s => s.actorId === a.id));
    const add = gm ? `<div class="x-add"><select id="x-actor"><option value="">${esc(t("Add someone..."))}</option>${others.map(a => `<option value="${a.id}">${esc(a.name)}${a.remote ? ` (${esc(a.remote.owner)})` : ""}</option>`).join("")}</select>
      <input id="x-name" type="text" placeholder="${esc(t("or a name"))}" maxlength="40"><button type="button" data-action="slotAdd">${esc(t("Add"))}</button></div>` : "";
    const T = timerOf(tr), rem = ctx.clock.remaining(T);
    const timer = (T.secs || gm) ? `<div class="x-timer ${T.running && rem <= 10 ? "low" : ""}"><span class="clk" id="x-clk">${T.secs ? fmt(rem) : "--:--"}</span><small>${cur && tr.active ? esc(cur.name) : ""}</small>
      ${gm ? `<span class="tctl"><select id="x-secs" title="${esc(t("Time per turn"))}">${DURATIONS.map(d => `<option value="${d}" ${T.secs === d ? "selected" : ""}>${d ? `${d} s` : esc(t("No timer"))}</option>`).join("")}</select>
        ${T.secs ? `<button type="button" data-action="timerToggle">${esc(T.running ? t("Pause") : t("Start"))}</button><button type="button" data-action="timerReset">${esc(t("Reset"))}</button>
        <label class="chk"><input type="checkbox" id="x-auto" ${T.auto ? "checked" : ""}> ${esc(t("Auto"))}</label>` : ""}</span>` : ""}</div>` : "";
    const head = `<div class="x-head"><div class="x-title"><b>${esc(t("Exchange"))} ${tr.exchange}</b><button type="button" class="man-ref" data-action="manual" data-ref="${MAN_REFS.exchange}" title="${esc(t("Open this in the manual"))}" aria-label="${esc(t("Open this in the manual"))}">?</button>${tr.active ? "" : ` <small>${esc(t("No fight running."))}</small>`}</div>${timer}
      ${gm ? `<div class="x-btns">${tr.active
        ? `<button type="button" data-action="xNext" class="primary">${esc(t("Next Exchange"))}</button><button type="button" data-action="xEnd">${esc(t("End fight"))}</button>`
        : `<button type="button" data-action="xStart" class="primary">${esc(t("Start fight"))}</button>`}<button type="button" data-action="xFill">${esc(t("Fill from the table"))}</button></div>` : ""}</div>`;
    const hint = `<p class="x-hint">${esc(t("An Exchange is every character acting in fictional order, then one action from each Threat and one from each named opponent."))}</p>`;
    return `${head}${tr.slots.length ? `<ol class="slots">${rows}</ol>` : `<p class="hint pad">${esc(t("Nobody in the order yet."))}</p>`}${add}${hint}`;
  }

  function exchangeCard(tr) {
    const list = tr.slots.map(s => `<li>${esc(s.name)}</li>`).join("");
    return `<div class="pm-card pm-exchange"><div class="pm-card-head">${esc(t("Exchange"))} ${tr.exchange}</div><div class="pm-notes"><ol>${list}</ol></div></div>`;
  }

  const trackerActions = {
    xStart: () => { const tr = ctx.board().tracker; B.startFight(tr); if (!tr.slots.length) fill(); newTurn(tr); ctx.post(ctx.bi(() => exchangeCard(tr))); ctx.changed(); },
    xEnd: () => { const tr = ctx.board().tracker; const ev = C.endScene(tr); if (ev.length) ctx.post(ctx.bi(() => eventsCard(t("The scene ends"), ev))); B.endFight(tr); timerReset(timerOf(tr)); ctx.clock.sync(timerOf(tr)); ctx.post(ctx.bi(() => `<div class="pm-card"><div class="pm-card-head">${esc(t("The fight is over."))}</div></div>`)); ctx.changed(); },
    xNext: () => { const tr = ctx.board().tracker; const ev = C.tickExchange(tr); if (ev.length) ctx.post(ctx.bi(() => eventsCard(t("End of Exchange {n}", { n: tr.exchange }), ev))); B.nextExchange(tr); newTurn(tr); ctx.post(ctx.bi(() => exchangeCard(tr))); ctx.changed(); },
    xFill: () => { fill(); ctx.changed(); },
    slotMove: el => { B.moveSlot(ctx.board().tracker, el.dataset.id, Number(el.dataset.delta)); ctx.changed(); },
    slotActed: el => { const tr = ctx.board().tracker; const s = B.toggleActed(tr, el.dataset.id); if (s?.acted && tr.active) newTurn(tr); ctx.changed(); },
    condStep: el => { const s = ctx.board().tracker.slots.find(x => x.id === el.dataset.slot); if (s) { C.stepCondition(s, el.dataset.id, Number(el.dataset.delta)); ctx.changed(); } },
    condRemove: el => { const s = ctx.board().tracker.slots.find(x => x.id === el.dataset.slot); if (s) { C.removeCondition(s, el.dataset.id); ctx.changed(); } },
    condAdd: async el => {
      const s = ctx.board().tracker.slots.find(x => x.id === el.dataset.slot); if (!s) return;
      const opts = C.CONDITION_TYPES.map(k => `<option value="${k}">${esc(k === "custom" ? t("Other condition") : SIN_TEXT[C.CONDITIONS[k].sin].keyword)}</option>`).join("");
      const r = await ctx.ask({ title: t("Add a condition to {name}", { name: s.name }), ok: t("Add"), wide: true,
        body: `<div class="pm-row"><label>${esc(t("Condition"))}</label><select name="type">${opts}</select><label>${esc(t("Name"))}</label><input type="text" name="name" maxlength="30" placeholder="${esc(t("Stunned"))}" disabled></div>
          <div class="pm-row"><label>${esc(t("Stacks"))}</label><input type="number" name="stacks" value="1" min="1" max="9"><label>${esc(t("Lasts (Exchanges)"))}</label><input type="number" name="rounds" min="0" max="12" placeholder="${esc(t("default"))}"></div>
          <div class="pm-row"><label>${esc(t("Note"))}</label><input type="text" name="note" maxlength="80"></div>
          <p class="pm-note rule"></p>`,
        read: f => ({ type: f.elements.type.value, name: f.elements.name.value.trim(), stacks: f.elements.stacks.value, rounds: f.elements.rounds.value, note: f.elements.note.value.trim() }),
        setup: f => {
          const upd = () => { const k = f.elements.type.value; f.elements.name.disabled = k !== "custom"; f.querySelector(".rule").textContent = t(C.CONDITIONS[k].rule); };
          f.elements.type.addEventListener("change", upd); upd();
        } });
      if (!r) return;
      C.addCondition(s, r.type, r);
      ctx.changed();
    },
    timerToggle: () => { const T = timerOf(ctx.board().tracker); if (T.running) timerPause(T, ctx.clock.remaining(T)); else timerStart(T); ctx.clock.sync(T); ctx.changed(); },
    timerReset: () => { const T = timerOf(ctx.board().tracker); timerReset(T); ctx.clock.sync(T); ctx.changed(); },
    slotRemove: el => { B.removeSlot(ctx.board().tracker, el.dataset.id); ctx.changed(); },
    slotAdd: () => {
      const tr = ctx.board().tracker;
      const id = $("#x-actor").value, name = $("#x-name").value.trim();
      const a = id ? ctx.findActor(id) : null;
      if (a) B.addSlot(tr, { name: a.name, kind: a.type === "character" ? "pc" : (a.system.isGroup ? "threat" : "named"), actorId: a.id });
      else if (name) B.addSlot(tr, { name, kind: "other" });
      else return;
      ctx.changed();
    }
  };
  /** A new turn: the timer goes back to full and, if set to Auto, runs. */
  function newTurn(tr) { const T = timerOf(tr); timerNewTurn(T); ctx.clock.sync(T); }
  function fill() {
    const tr = ctx.board().tracker;
    const all = ctx.state.actors.concat(ctx.remoteActors());
    const seen = new Set();
    const uniq = list => list.filter(a => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    const chars = uniq(all.filter(a => a.type === "character")), npcs = uniq(all.filter(a => a.type === "npc"));
    for (const s of B.suggestSlots(chars, npcs)) B.addSlot(tr, s);
  }

  /* ------------------------------------------------------------------ map */

  const mapSrc = () => {
    const b = ctx.board();
    if (!b.map) return "";
    return b.map.src || (b.image?.rev === b.map.rev ? b.image.src : "");
  };
  const tokenImg = tk => ctx.portraitSrc?.(tk.actorId) || (tk.img ? `tokens/${tk.img}.png` : "");

  function fit(map) { view = { x: 0, y: 0, w: map.w, h: map.h }; viewKey = map.rev; }

  /** The GM's scene bar: pick, make, rename, copy and delete scenes, and show one to the table (or keep preparing it unseen). */
  function sceneBar() {
    const info = ctx.sceneInfo(), preparing = info.viewId !== info.shownId;
    const opts = info.list.map(s => `<option value="${s.id}" ${s.id === info.viewId ? "selected" : ""}>${s.id === info.shownId ? "\u25B6 " : ""}${esc(s.name)}</option>`).join("");
    return `<div class="m-bar scenebar"><select id="sc-pick" title="${esc(t("Scenes. The one with a triangle is on show to the table."))}">${opts}</select>
      <button type="button" data-action="sceneNew">+ ${esc(t("Scene"))}</button><button type="button" data-action="sceneRename">${esc(t("Rename"))}</button><button type="button" data-action="sceneDup">${esc(t("Copy"))}</button><button type="button" data-action="sceneDel" ${info.list.length < 2 ? "disabled" : ""}>${esc(t("Delete"))}</button>
      ${preparing ? `<span class="prep">${esc(t("Preparing: the table cannot see this."))}</span><button type="button" class="primary" data-action="sceneShow">${esc(t("Show to the table"))}</button>` : `<span class="live">${esc(t("On show to the table"))}</span>`}</div>`;
  }

  /* ---- tokens that know their sheets ---- */
  const HARM_RING = ["#14151b", "#e0c030", "#f08c28", "#d63031", "#9650c8"];
  const SIN_HEX = { wrath: "#d63031", lust: "#f08c28", sloth: "#c9aa1e", gluttony: "#46aa5a", gloom: "#2fa9bd", pride: "#4664dc", envy: "#9650c8" };
  const actorOf = tk => (tk.actorId ? ctx.findActor(tk.actorId) : null);
  const condsOf = tk => { const s = tk.actorId ? C.slotForActor(ctx.board().tracker, tk.actorId) : null; return s ? C.conditionsOf(s) : []; };
  /** Condition chips above a token and E.G.O. pips below it. */
  function tokenExtras(tk, rr) {
    const a = actorOf(tk), conds = condsOf(tk);
    const chips = conds.map((c, i, all) => {
      const def = C.CONDITIONS[c.type], x = (i - (all.length - 1) / 2) * 28, name = condName(c);
      return `<g transform="translate(${x} ${-rr - 14})"><circle r="12" fill="${SIN_HEX[def.sin] ?? "#8d94a8"}" stroke="#14151b" stroke-width="3"/><text y="4.5" font-size="13" font-weight="800" text-anchor="middle" fill="#fff" style="font-family:var(--pm-head)">${esc(name.slice(0, 1).toUpperCase())}${def.stacks && c.stacks > 1 ? `<tspan font-size="9" dy="-4">${c.stacks}</tspan>` : ""}</text></g>`;
    }).join("");
    let pips = "";
    if (a?.type === "character") {
      const max = a.system.ego.max, cur = a.derived.egoCurrent;
      pips = Array.from({ length: max }, (_, i) => `<circle cx="${(i - (max - 1) / 2) * 16}" cy="${rr + 13}" r="6" fill="${i < cur ? "#c9a227" : "#14151b"}" stroke="#c9a227" stroke-width="2"/>`).join("");
    }
    return { chips, pips, harm: a?.system?.harm ?? 0, hasPips: !!pips };
  }
  /** The panel for the selected token: what its sheet says, and a way to open it. */
  function tokenInfo(map) {
    const tk = map.tokens.find(x => x.id === sel);
    if (!tk) return "";
    const a = actorOf(tk), gm = ctx.isGM(), conds = condsOf(tk);
    const lines = [];
    if (a?.type === "character") lines.push(`E.G.O. ${a.derived.egoCurrent}/${a.system.ego.max} · ${esc(t("Stress"))} ${a.system.stress} · ${esc(HARM_LABEL[a.system.harm])}`);
    else if (a?.type === "npc") lines.push(`${esc(t("Grade"))} ${a.system.grade} · ${esc([t("Holding"), t("Breaking"), t("Routed")][a.system.threat] ?? "")} · ${esc(HARM_LABEL[a.system.harm])}`);
    if (conds.length) lines.push(conds.map(c => `<span class="cond sin-${C.CONDITIONS[c.type].sin || "none"}"><b>${esc(condName(c))}${c.stacks > 1 ? ` &times;${c.stacks}` : ""}</b></span>`).join(" "));
    const others = gm && !a ? ctx.state.actors.concat(ctx.remoteActors()).filter(x => x.type === "character" || x.type === "npc") : [];
    const link = others.length ? `<select id="tk-link"><option value="">${esc(t("Link to a sheet..."))}</option>${others.map(x => `<option value="${x.id}">${esc(x.name)}${x.remote ? ` (${esc(x.remote.owner)})` : ""}</option>`).join("")}</select>` : "";
    const inOrder = !!(tk.actorId && C.slotForActor(ctx.board().tracker, tk.actorId));
    return `<div class="tk-info"><b>${esc(tk.name)}</b>${lines.map(l => `<div>${l}</div>`).join("")}<div class="btns">
      ${a ? `<button type="button" data-action="tkSheet" data-id="${tk.id}">${esc(t("Open sheet"))}</button>` : ""}
      ${gm && a && !inOrder ? `<button type="button" data-action="tkExchange" data-id="${tk.id}">${esc(t("Add to Exchange"))}</button>` : ""}${link}</div></div>`;
  }

  function mapHtml() {
    const b = ctx.board(), map = b.map, gm = ctx.isGM();
    const options = `<option value="">${esc(t("No map"))}</option>` + MAPS.map(m => `<option value="${m.id}" ${map?.bundled === m.id ? "selected" : ""}>${esc(m.title)}</option>`).join("") + `<option value="__upload">${esc(t("Upload an image..."))}</option>`;
    const measureBtn = `<button type="button" data-action="toolSet" data-tool="measure" class="${tool === "measure" ? "on" : ""}" title="${esc(t("Drag on the map to measure in squares"))}">${esc(t("Measure"))}</button>`;
    const fog = map?.fog;
    const fogBar = gm && map ? `<div class="m-bar fogbar"><label class="chk"><input type="checkbox" id="m-fog" ${fog?.on ? "checked" : ""}> ${esc(t("Fog of war"))}</label>
      ${fog?.on ? `<button type="button" data-action="toolSet" data-tool="reveal" class="${tool === "reveal" ? "on" : ""}">${esc(t("Reveal"))}</button><button type="button" data-action="toolSet" data-tool="cover" class="${tool === "cover" ? "on" : ""}">${esc(t("Cover up"))}</button>
      <button type="button" data-action="fogAll" data-v="1">${esc(t("Reveal all"))}</button><button type="button" data-action="fogAll" data-v="0">${esc(t("Cover all"))}</button>
      <button type="button" data-action="fogAround" ${sel && map.tokens.some(x => x.id === sel) ? "" : "disabled"} title="${esc(t("Reveal the squares around the selected token"))}">${esc(t("Around token"))}</button>
      <input type="number" id="m-rad" value="${radius}" min="1" max="12" title="${esc(t("Squares"))}">` : ""}</div>
      ${fog?.on ? `<div class="m-bar visbar"><label class="chk" title="${esc(t("Player tokens reveal the squares they can see, and walls block the view"))}"><input type="checkbox" id="m-dyn" ${B.dynOf(map).on ? "checked" : ""}> ${esc(t("Automatic vision"))}</label>
        ${B.dynOf(map).on ? `<label class="chk">${esc(t("Sees"))} <input type="number" id="m-vrad" value="${B.dynOf(map).radius}" min="1" max="${B.MAX_VISION}" title="${esc(t("Squares"))}"></label><label class="chk"><input type="checkbox" id="m-vrem" ${B.dynOf(map).remember ? "checked" : ""}> ${esc(t("Remember explored"))}</label>` : ""}
        <button type="button" data-action="toolSet" data-tool="wall" class="${tool === "wall" ? "on" : ""}" title="${esc(t("Drag on the map to draw a wall"))}">${esc(t("Wall"))}</button>
        <button type="button" data-action="toolSet" data-tool="door" class="${tool === "door" ? "on" : ""}" title="${esc(t("Drag to draw a door; click a door to open or close it"))}">${esc(t("Door"))}</button>
        <button type="button" data-action="wallsClear">${esc(t("Clear walls"))}</button></div>` : ""}` : "";
    const pingBtn = `<button type="button" data-action="toolSet" data-tool="ping" class="${tool === "ping" ? "on" : ""}" title="${esc(t("Click the map to point everyone to a spot"))}">${esc(t("Ping"))}</button><label class="chk" title="${esc(t("Also centre everyone's view on the spot"))}"><input type="checkbox" id="m-look" ${look ? "checked" : ""}> ${esc(t("Look here"))}</label>`;
    const bar = gm ? `<div class="m-bar"><select id="m-pick">${options}</select>${map ? measureBtn + pingBtn : ""}
      ${map ? `<label class="chk"><input type="checkbox" id="m-grid" ${map.grid ? "checked" : ""}> ${esc(t("Grid"))}</label><label class="chk"><input type="checkbox" id="m-snap" ${map.snap ? "checked" : ""}> ${esc(t("Snap"))}</label>
      <label class="chk">${esc(t("Square"))} <input type="number" id="m-cell" value="${map.cell}" min="10" max="400" step="1"></label>
      <button type="button" data-action="tokenAdd">+ ${esc(t("Token"))}</button><button type="button" data-action="tokensAll" title="${esc(t("Put a token on the map for every character"))}">+ ${esc(t("Characters"))}</button>
      ${sel && map.tokens.some(x => x.id === sel) ? `<button type="button" data-action="tokenHide">${esc(map.tokens.find(x => x.id === sel).hidden ? t("Show") : t("Hide"))}</button><button type="button" data-action="tokenDel">${esc(t("Remove"))}</button>` : ""}` : ""}
      </div>` : "";
    const pingOnly = `<button type="button" data-action="toolSet" data-tool="ping" class="${tool === "ping" ? "on" : ""}" title="${esc(t("Click the map to point everyone to a spot"))}">${esc(t("Ping"))}</button>`;
    const markBar = gm && map ? `<div class="m-bar markbar"><button type="button" data-action="toolSet" data-tool="draw" class="${tool === "draw" ? "on" : ""}" title="${esc(t("Drag on the map to draw"))}">${esc(t("Draw"))}</button>
      <button type="button" data-action="toolSet" data-tool="pin" class="${tool === "pin" ? "on" : ""}" title="${esc(t("Click the map to leave a note"))}">${esc(t("Note"))}</button>
      <button type="button" data-action="toolSet" data-tool="area" class="${tool === "area" ? "on" : ""}" title="${esc(t("Drag from a point to lay a circle, cone or line, and see who is inside"))}">${esc(t("Area"))}</button>
      ${tool === "area" ? `<select id="m-ashape" title="${esc(t("Shape"))}">${B.AREA_SHAPES.map(s => `<option value="${s}" ${s === areaShape ? "selected" : ""}>${esc(({ circle: t("Circle"), cone: t("Cone"), line: t("Line") })[s])}</option>`).join("")}</select>${areaShape === "line" ? `<label class="chk">${esc(t("Width"))} <input type="number" id="m-awidth" value="${areaWidth}" min="1" max="10"></label>` : ""}` : ""}
      <button type="button" data-action="toolSet" data-tool="erase" class="${tool === "erase" ? "on" : ""}" title="${esc(t("Click a drawing or a note to remove it"))}">${esc(t("Erase"))}</button>
      <span class="swatches">${B.MARK_COLORS.map(c => `<button type="button" class="sw ${c === markColor ? "on" : ""}" data-action="markColor" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</span>
      <label class="chk" title="${esc(t("Drawings are seen by the players when this is ticked"))}"><input type="checkbox" id="m-mshown" ${markShown ? "checked" : ""}> ${esc(t("Players see drawings and areas"))}</label>
      <button type="button" data-action="marksClear">${esc(t("Clear drawings"))}</button></div>` : "";
    const bars = gm ? sceneBar() + bar + markBar + fogBar : (map ? `<div class="m-bar">${measureBtn}${pingOnly}</div>` : "");
    if (!map) return `${gm ? sceneBar() + bar : ""}<p class="hint pad">${esc(gm ? t("Pick a map for this scene.") : t("The GM has not shown a map."))}</p>`;
    const src = mapSrc();
    if (!view || viewKey !== map.rev) fit(map);
    const r = map.cell * 0.46;
    const grid = map.grid && map.cell > 0 ? `<defs><pattern id="g" width="${map.cell}" height="${map.cell}" patternUnits="userSpaceOnUse"><path d="M ${map.cell} 0 H 0 V ${map.cell}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/></pattern></defs><rect width="${map.w}" height="${map.h}" fill="url(#g)" pointer-events="none"/>` : "";
    const tokens = map.tokens.map(tk => {
      const rr = r * (tk.size || 1);
      const img = tokenImg(tk), ex = tokenExtras(tk, rr);
      return `<g class="tk ${tk.id === sel ? "sel" : ""} ${tk.hidden ? "hid" : ""}" data-id="${tk.id}" transform="translate(${tk.x} ${tk.y})">
        <circle r="${rr}" fill="${esc(tk.color)}" stroke="${HARM_RING[ex.harm] ?? HARM_RING[0]}" stroke-width="${ex.harm ? 9 : 4}"/>
        ${img ? `<clipPath id="c${tk.id}"><circle r="${rr - 3}"/></clipPath><image href="${esc(img)}" x="${-rr}" y="${-rr}" width="${rr * 2}" height="${rr * 2}" clip-path="url(#c${tk.id})"/>` : `<text class="ini" y="${rr * 0.32}" font-size="${rr * 0.9}" text-anchor="middle">${esc(B.initials(tk.name))}</text>`}
        ${tk.id === sel ? `<circle r="${rr + 5}" fill="none" stroke="#c9a227" stroke-width="5"/>` : ""}
        ${ex.chips}${ex.pips}
        <text class="lbl" y="${rr + (ex.hasPips ? 40 : 26)}" font-size="22" text-anchor="middle">${esc(tk.name)}</text></g>`;
    }).join("");
    const marks = marksSvg(map, gm, r);
    const svg = `<svg id="mapsvg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <rect width="${map.w}" height="${map.h}" fill="#20222a"/>${src ? `<image href="${esc(src)}" width="${map.w}" height="${map.h}"/>` : `<text x="${map.w / 2}" y="${map.h / 2}" fill="#9aa3b5" font-size="40" text-anchor="middle">${esc(t("Loading the map..."))}</text>`}${grid}${marks}${fogSvg(map, gm)}${gm ? wallsSvg(map) : ""}${tokens}${pingsSvg(map)}</svg>`;
    const zoom = `<div class="m-zoom"><button type="button" data-action="mapZoom" data-f="0.8">+</button><button type="button" data-action="mapZoom" data-f="1.25">&minus;</button><button type="button" data-action="mapFit">${esc(t("Fit"))}</button></div>`;
    const note = map.name ? `<div class="m-name">${esc(map.name)}</div>` : "";
    return `${bars}<div class="m-stage ${tool ? "tool-" + tool : ""}">${svg}${zoom}${note}${tokenInfo(map)}</div>`;
  }

  /** Walls and doors, drawn for the GM only. A door is amber and dashed when closed, green and dotted when open; the wide clear line is the click target. */
  function wallsSvg(map) {
    if (!map.fog?.on) return "";
    return B.wallsOf(map).map(w => {
      const col = w.kind === "wall" ? "#e0575b" : (w.open ? "#6bd98f" : "#ffb347"), dash = w.kind === "door" ? (w.open ? ' stroke-dasharray="3 12"' : ' stroke-dasharray="16 8"') : "";
      return `<g class="wl ${w.kind}" data-id="${esc(w.id)}"><line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="transparent" stroke-width="26"/><line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${col}" stroke-width="7" stroke-linecap="round"${dash} pointer-events="none"/></g>`;
    }).join("");
  }
  /** Drawings and note pins. The GM sees all of them (the ones players cannot see are faded); a pin's private note is never drawn. */
  function marksSvg(map, gm, r) {
    return (gm ? B.marksOf(map) : (map.marks ?? [])).map(m => {
      const fade = gm && !m.shown ? ' opacity=".5" stroke-dasharray="14 10"' : "";
      if (m.kind === "area") {
        const c = map.cell > 0 ? map.cell : 70, col = esc(m.color), attrs = `class="mk ar" data-id="${esc(m.id)}" fill="${col}" fill-opacity=".28" stroke="${col}" stroke-width="5"${fade}`;
        if (m.shape === "circle") return `<circle ${attrs} cx="${m.x}" cy="${m.y}" r="${m.size * c}"/>`;
        return `<polygon ${attrs} points="${B.areaPolygon(m, c).map(p => p.map(v => Math.round(v * 10) / 10).join(",")).join(" ")}"/>`;
      }
      if (m.kind === "stroke") return `<polyline class="mk st" data-id="${esc(m.id)}" points="${m.pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${esc(m.color)}" stroke-width="${m.width}" stroke-linecap="round" stroke-linejoin="round"${fade}/>`;
      const label = m.label ? `<text class="lbl" y="${r * 0.95 + 20}" font-size="24" text-anchor="middle">${esc(m.label)}</text>` : "";
      return `<g class="mk pn" data-id="${esc(m.id)}" transform="translate(${m.x} ${m.y})"><title>${esc(m.label)}</title><path d="M0 ${-r * 0.1} L${r * 0.55} ${-r * 0.9} A${r * 0.55} ${r * 0.55} 0 1 0 ${-r * 0.55} ${-r * 0.9} Z" fill="${esc(m.color)}" stroke="#000" stroke-width="3"${gm && !m.shown ? ' opacity=".6"' : ""}/><circle cy="${-r * 0.9}" r="${r * 0.2}" fill="#fff" stroke="#000" stroke-width="2"/>${gm && m.note ? `<text y="${-r * 0.9 + 9}" font-size="26" text-anchor="middle">&#9998;</text>` : ""}${label}</g>`;
    }).join("");
  }
  /** The covered squares as one dark path. The GM sees through it; players do not. */
  function fogSvg(map, gm) {
    if (!map.fog?.on) return "";
    const d = B.fogRects(map.fog).map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join("");
    return `<path class="fog" d="${d}" fill="#05060a" fill-opacity="${gm ? 0.6 : 1}" pointer-events="none"/>`;
  }

  /* ---- pings ---- */
  const pingGroup = (p, map) => {
    const r = (map.cell > 0 ? map.cell : 70) * 1.2, age = Math.max(0, Date.now() - p.at);
    const col = p.color || "#c9a227";
    const ring = n => `<circle r="${r}" style="animation-delay:${n * 380 - age}ms;stroke:${esc(col)}"/>`;
    const label = p.who ? `<text class="plbl" y="${r * 0.42}" font-size="${Math.max(22, r * 0.34)}" text-anchor="middle" style="fill:${esc(col)}">${esc(p.who)}</text>` : "";
    return `<g class="ping" data-ping="${p.id}" transform="translate(${p.x} ${p.y})" pointer-events="none">${ring(0)}${ring(1)}${ring(2)}<circle class="dot" r="${r * 0.16}" style="stroke:${esc(col)}"/>${label}</g>`;
  };
  function pingsSvg(map) {
    const now = Date.now();
    for (let i = pings.length - 1; i >= 0; i--) if (!B.pingAlive(pings[i], now)) pings.splice(i, 1);
    return pings.filter(p => B.pingFits(p, map)).map(p => pingGroup(p, map)).join("");
  }
  /** Show a ping (the GM's own, or one that arrived). A "look here" ping also centres the view, and for a player brings the map up. */
  function showPing(p, { remote = false } = {}) {
    const map = ctx.board().map;
    if (!B.pingFits(p, map)) return;
    pings.push(p);
    ctx.sfx(p.who ? "pingPlayer" : "ping", { note: p.who ? B.pingNote(p.who) : 0 });
    if (p.look && view) view = B.centreView(view, map, p.x, p.y);
    if (remote) { ctx.toast(p.who ? t("{name} pinged the map", { name: p.who }) : t("The GM pinged the map")); if (p.look) ctx.showMap(); }
    const svg = $("#mapsvg");
    if (svg && !(p.look && view)) {
      const tmp = document.createElementNS("http://www.w3.org/2000/svg", "g");
      tmp.innerHTML = pingGroup(p, map);
      svg.appendChild(tmp.firstElementChild);
    } else if (svg) { ctx.redrawMap(); }
    setTimeout(() => { svg?.querySelector(`[data-ping="${p.id}"]`)?.remove(); }, B.PING_MS);
  }
  /** The GM clicks the map with the Ping tool. */
  function sendPing(x, y) {
    const map = ctx.board().map;
    const p = B.makePing(map, x, y, look && ctx.isGM(), Date.now(), ctx.isGM() ? "" : ctx.myName());   // only the GM's ping can move everyone's view
    if (!p) return;
    const now = Date.now();
    if (!ctx.isGM() && now - lastSent < 500) return;                      // a player pings at most twice a second
    lastSent = now;
    showPing(p);
    ctx.sendPing(p);
  }

  /* ---- pointer interaction ---- */
  function svgPoint(svg, e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function canMove(tk) {
    if (ctx.isGM()) return true;
    return !!tk.actorId && ctx.state.actors.some(a => a.id === tk.actorId);
  }
  let last = 0;
  function attach() {
    const svg = $("#mapsvg");
    if (!svg) return;
    const map = ctx.board().map;
    let drag = null;
    svg.addEventListener("pointerdown", e => {
      if (tool === "ping") { const p = svgPoint(svg, e); sendPing(p.x, p.y); e.preventDefault(); return; }
      if (ctx.isGM() && tool === "erase" && e.target.closest(".wl")) {
        const wl = e.target.closest(".wl"); e.preventDefault();
        ctx.mark?.("Wall removed"); B.removeWall(map, wl.dataset.id); ctx.changed(); return;
      }
      if (ctx.isGM() && (tool === "wall" || tool === "door")) {
        const p = svgPoint(svg, e), c = map.cell > 0 ? map.cell : 70, s = map.snap ? (v => Math.round(v / c) * c) : (v => v), from = { x: s(p.x), y: s(p.y) };
        const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
        el.setAttribute("x1", from.x); el.setAttribute("y1", from.y); el.setAttribute("x2", from.x); el.setAttribute("y2", from.y);
        el.setAttribute("stroke", tool === "wall" ? "#e0575b" : "#ffb347"); el.setAttribute("stroke-width", 7); el.setAttribute("stroke-linecap", "round"); el.setAttribute("pointer-events", "none");
        svg.appendChild(el); drag = { kind: "wall", from, kind2: tool, el, s };
        svg.setPointerCapture(e.pointerId); svg.dataset.drag = "1"; e.preventDefault(); return;
      }
      if (ctx.isGM() && !tool && e.target.closest(".wl.door")) {
        const wl = e.target.closest(".wl"); e.preventDefault();
        ctx.mark?.("Door"); B.toggleDoor(map, wl.dataset.id); ctx.changed(); return;
      }
      if (ctx.isGM() && tool === "erase") {
        const mk = e.target.closest(".mk"); e.preventDefault();
        if (mk && B.marksOf(map).some(m => m.id === mk.dataset.id)) { ctx.mark?.("Drawing erased"); B.removeMark(map, mk.dataset.id); ctx.changed(); }
        return;
      }
      if (ctx.isGM() && tool === "pin") { const p = svgPoint(svg, e); e.preventDefault(); newPin(map, p); return; }
      if (ctx.isGM() && tool === "area") {
        const p = svgPoint(svg, e), c = map.cell > 0 ? map.cell : 70, o = map.snap ? { x: (Math.floor(p.x / c) + 0.5) * c, y: (Math.floor(p.y / c) + 0.5) * c } : { x: p.x, y: p.y };
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("pointer-events", "none"); svg.appendChild(g);
        drag = { kind: "area", o, g, last: null };
        updateAreaPreview(map, drag, p);
        svg.setPointerCapture(e.pointerId); svg.dataset.drag = "1"; e.preventDefault(); return;
      }
      if (ctx.isGM() && tool === "draw") {
        const p = svgPoint(svg, e);
        const el = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        el.setAttribute("fill", "none"); el.setAttribute("stroke", markColor); el.setAttribute("stroke-width", map.cell * 0.08); el.setAttribute("stroke-linecap", "round"); el.setAttribute("stroke-linejoin", "round"); el.setAttribute("pointer-events", "none");
        el.setAttribute("points", `${p.x},${p.y}`); svg.appendChild(el);
        drag = { kind: "stroke", pts: [[p.x, p.y]], el };
        svg.setPointerCapture(e.pointerId); svg.dataset.drag = "1"; e.preventDefault(); return;
      }
      const pn = e.target.closest(".pn");
      if (pn && !e.target.closest(".tk")) { e.preventDefault(); openPin(map, pn.dataset.id); return; }
      const g = e.target.closest(".tk");
      if (g) {
        const tk = map.tokens.find(x => x.id === g.dataset.id);
        sel = tk.id;
        if (!canMove(tk)) { ctx.redrawMap(); return; }
        drag = { kind: "token", tk, g, moved: false };
      } else if (tool === "measure") {
        const p = svgPoint(svg, e);
        drag = { kind: "measure", from: p, el: ruler(svg) };
      } else if ((tool === "reveal" || tool === "cover") && ctx.isGM()) {
        const p = svgPoint(svg, e);
        drag = { kind: "fog", v: tool === "reveal" };
        B.paintFog(map, p.x, p.y, drag.v, 0); drawFog(svg, map);
      } else {
        drag = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
        sel = "";
      }
      svg.setPointerCapture(e.pointerId);
      svg.dataset.drag = "1";
      e.preventDefault();
    });
    svg.addEventListener("pointermove", e => {
      if (!drag) return;
      if (drag.kind === "pan") {
        const rect = svg.getBoundingClientRect();
        const k = Math.max(view.w / rect.width, view.h / rect.height);
        view.x = drag.vx - (e.clientX - drag.sx) * k; view.y = drag.vy - (e.clientY - drag.sy) * k;
        svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
        return;
      }
      if (drag.kind === "area") { updateAreaPreview(map, drag, svgPoint(svg, e)); return; }
      if (drag.kind === "wall") { const p = svgPoint(svg, e); drag.el.setAttribute("x2", drag.s(p.x)); drag.el.setAttribute("y2", drag.s(p.y)); return; }
      if (drag.kind === "stroke") { const p = svgPoint(svg, e), l = drag.pts[drag.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 4) { drag.pts.push([p.x, p.y]); drag.el.setAttribute("points", drag.pts.map(q => q.join(",")).join(" ")); } return; }
      if (drag.kind === "measure") { const p = svgPoint(svg, e); showRuler(svg, drag, p); return; }
      if (drag.kind === "fog") {
        const p = svgPoint(svg, e);
        B.paintFog(map, p.x, p.y, drag.v, 0); drawFog(svg, map);
        const now = Date.now(); if (now - last > 160) { last = now; ctx.sendBoard(); }
        return;
      }
      const p = svgPoint(svg, e);
      if (!drag.start) drag.start = { x: drag.tk.x, y: drag.tk.y };
      drag.moved = true;
      drag.g.setAttribute("transform", `translate(${p.x} ${p.y})`);
      showRuler(svg, { from: drag.start }, p, true);
      drag.x = p.x; drag.y = p.y;
      const now = Date.now();
      if (now - last > 140) { last = now; push(drag, false); }
    });
    const end = e => {
      if (!drag) return;
      const d = drag; drag = null; delete svg.dataset.drag;
      if (d.kind === "area") {
        d.g.remove();
        if (!d.last) { ctx.redrawMap(); return; }
        ctx.mark?.("Area");
        const a = B.addArea(map, { shape: areaShape, x: d.o.x, y: d.o.y, angle: d.last.angle, size: d.last.size, width: areaWidth, color: markColor, shown: markShown });
        if (!a) { ctx.toast(t("That is the most marks this map holds.")); ctx.redrawMap(); return; }
        const inside = B.tokensInArea(map, a).map(x => x.name);
        ctx.changed();
        ctx.toast(inside.length ? t("Inside: {names}", { names: inside.join(", ") }) : t("Nobody is inside."));
      } else if (d.kind === "wall") {
        const x2 = Number(d.el.getAttribute("x2")), y2 = Number(d.el.getAttribute("y2")); d.el.remove();
        if (Math.hypot(x2 - d.from.x, y2 - d.from.y) < 8) { ctx.redrawMap(); return; }
        ctx.mark?.("Wall added");
        if (B.addWall(map, { x1: d.from.x, y1: d.from.y, x2, y2, kind: d.kind2, snap: false })) ctx.changed(); else { ctx.toast(t("That is the most walls this map holds.")); ctx.redrawMap(); }
      } else if (d.kind === "stroke") {
        d.el.remove();
        ctx.mark?.("Drawing");
        if (B.addStroke(map, d.pts, { color: markColor, width: map.cell * 0.08, shown: markShown })) ctx.changed(); else ctx.redrawMap();
      } else if (d.kind === "token" && d.moved) push(d, true);
      else if (d.kind === "fog") ctx.changed();
      else if (d.kind === "measure") { /* the ruler stays until the next click */ }
      else { ctx.redrawMap(); }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("dblclick", e => {
      const g = e.target.closest(".tk"); if (!g) return;
      const tk = map.tokens.find(x => x.id === g.dataset.id);
      if (tk?.actorId) ctx.openSheet(tk.actorId);
    });
    svg.addEventListener("wheel", e => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.85 : 1.18, svgPoint(svg, e)); }, { passive: false });
  }
  /** The measuring line: a gold line and a label with the distance in squares. */
  function ruler(svg) {
    svg.querySelector("#ruler")?.remove();
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.id = "ruler"; g.setAttribute("pointer-events", "none");
    g.innerHTML = `<line stroke="#c9a227" stroke-width="6" stroke-dasharray="14 8" stroke-linecap="round"/><circle r="10" fill="#c9a227"/><text font-size="30" font-weight="800" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="6" paint-order="stroke" style="font-family:var(--pm-head)"></text>`;
    svg.appendChild(g);
    return g;
  }
  function showRuler(svg, d, to, fromToken = false) {
    const map = ctx.board().map;
    const g = d.el ?? ruler(svg); d.el = g;
    const line = g.querySelector("line"), label = g.querySelector("text"), dot = g.querySelector("circle");
    line.setAttribute("x1", d.from.x); line.setAttribute("y1", d.from.y); line.setAttribute("x2", to.x); line.setAttribute("y2", to.y);
    dot.setAttribute("cx", d.from.x); dot.setAttribute("cy", d.from.y);
    const n = map.cell > 0 ? B.squaresBetween(map, d.from, to) : 0;
    label.textContent = `${n} ${n === 1 ? t("square") : t("squares")}`;
    label.setAttribute("x", (d.from.x + to.x) / 2); label.setAttribute("y", (d.from.y + to.y) / 2 - 14);
  }
  function drawFog(svg, map) {
    const old = svg.querySelector(".fog");
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "g");
    tmp.innerHTML = fogSvg(map, ctx.isGM());
    const fresh = tmp.firstElementChild;
    if (old && fresh) old.replaceWith(fresh); else if (old) old.remove(); else if (fresh) svg.querySelector(".tk")?.before(fresh) ?? svg.appendChild(fresh);
  }

  /** While dragging with the Area tool: draw the shape as it would be laid, with its size in squares. */
  function updateAreaPreview(map, d, p) {
    const c = map.cell > 0 ? map.cell : 70, dr = B.areaFromDrag(map, d.o.x, d.o.y, p.x, p.y);
    if (Math.hypot(p.x - d.o.x, p.y - d.o.y) < c * 0.4) { d.last = null; d.g.innerHTML = ""; return; }
    d.last = dr;
    const a = { shape: areaShape, x: d.o.x, y: d.o.y, angle: dr.angle, size: dr.size, width: areaWidth };
    const attrs = `fill="${esc(markColor)}" fill-opacity=".28" stroke="${esc(markColor)}" stroke-width="5" stroke-dasharray="12 8"`;
    const shape = areaShape === "circle" ? `<circle cx="${a.x}" cy="${a.y}" r="${a.size * c}" ${attrs}/>` : `<polygon points="${B.areaPolygon(a, c).map(q => q.join(",")).join(" ")}" ${attrs}/>`;
    d.g.innerHTML = `${shape}<text x="${p.x}" y="${p.y - 18}" font-size="28" font-weight="800" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="6" paint-order="stroke">${a.size} ${esc(a.size === 1 ? t("square") : t("squares"))}</text>`;
  }
  const pinForm = p => `<div class="pm-row"><label>${esc(t("Label"))}</label><input type="text" name="label" maxlength="${B.MAX_LABEL}" value="${esc(p?.label ?? "")}" placeholder="${esc(t("the fire barrel"))}"></div>
    <div class="pm-row"><label class="full">${esc(t("Private note (only you see it)"))}</label><textarea name="note" rows="4" maxlength="${B.MAX_NOTE}">${esc(p?.note ?? "")}</textarea></div>
    <div class="pm-row"><label>${esc(t("Colour"))}</label><select name="color">${B.MARK_COLORS.map(c => `<option value="${c}" ${c === (p?.color ?? markColor) ? "selected" : ""} style="background:${c}">${c}</option>`).join("")}</select>
      <label class="chk"><input type="checkbox" name="shown" ${p?.shown ? "checked" : ""}> ${esc(t("Players see this pin and its label"))}</label></div>`;
  const readPin = f => ({ label: f.elements.label.value, note: f.elements.note.value, color: f.elements.color.value, shown: f.elements.shown.checked });
  async function newPin(map, p) {
    const r = await ctx.ask({ title: t("New note on the map"), ok: t("Add"), wide: true, body: pinForm(null), read: readPin });
    if (!r) return;
    ctx.mark?.("Note added");
    if (!B.addPin(map, { x: p.x, y: p.y, ...r })) return ctx.toast(t("That is the most marks this map holds."));
    ctx.changed();
  }
  async function openPin(map, id) {
    const pin = B.marksOf(map).find(m => m.id === id && m.kind === "pin");
    if (!pin) { const shown = (map.marks ?? []).find(m => m.id === id); if (shown?.label) ctx.toast(shown.label); return; }
    if (!ctx.isGM()) { if (pin.label) ctx.toast(pin.label); return; }
    const r = await ctx.ask({ title: pin.label || t("Note"), ok: t("Save"), wide: true, body: `${pinForm(pin)}<div class="pm-row"><button type="button" data-do="del">${esc(t("Delete"))}</button></div>`, read: readPin,
      setup: f => f.querySelector('[data-do="del"]').addEventListener("click", () => { ctx.mark?.("Drawing erased"); B.removeMark(map, id); f.closest("dialog").close(); ctx.changed(); }) });
    if (r) { ctx.mark?.("Note edited"); B.editPin(map, id, r); ctx.changed(); }
  }

  /** Move a token (live while dragging, final on drop). Players ask the host to do it. */
  function push(d, final) {
    const map = ctx.board().map;
    if (ctx.room()?.role === "player" && ctx.room().online) {
      if (final) { const tk = B.moveToken(map, d.tk.id, d.x, d.y); ctx.room().sendToken(d.tk.id, d.x, d.y); if (tk) ctx.redrawMap(); }
      else ctx.room().sendToken(d.tk.id, d.x, d.y);
      return;
    }
    B.moveToken(map, d.tk.id, d.x, d.y);
    if (final) ctx.changed(); else ctx.sendBoard();
  }
  function zoom(f, about) {
    const map = ctx.board().map; if (!map || !view) return;
    const cx = about?.x ?? view.x + view.w / 2, cy = about?.y ?? view.y + view.h / 2;
    const nw = Math.max(map.w / 8, Math.min(map.w * 1.2, view.w * f)), k = nw / view.w;
    view = { x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w: nw, h: view.h * k };
    const svg = $("#mapsvg"); if (svg) svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  /* ---- map actions ---- */
  const mapActions = {
    mapZoom: el => zoom(Number(el.dataset.f)),
    sceneNew: async () => {
      const r = await ctx.ask({ title: t("New scene"), ok: t("Add"), body: `<div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" maxlength="40" placeholder="${esc(t("The warehouse"))}"></div>`, read: f => f.elements.name.value.trim() });
      if (r === null) return;
      ctx.sceneDo("add", r); sel = ""; view = null; ctx.changed();
    },
    sceneRename: async () => {
      const info = ctx.sceneInfo(), cur = info.list.find(s => s.id === info.viewId);
      const r = await ctx.ask({ title: t("Rename scene"), ok: t("Save"), body: `<div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" maxlength="40" value="${esc(cur?.name ?? "")}"></div>`, read: f => f.elements.name.value.trim() });
      if (r) { ctx.sceneDo("rename", r); ctx.changed(); }
    },
    sceneDup: () => { if (ctx.sceneDo("dup")) { sel = ""; view = null; ctx.changed(); } else ctx.toast(t("That is the most scenes this app keeps.")); },
    sceneDel: async () => {
      const info = ctx.sceneInfo(), cur = info.list.find(s => s.id === info.viewId);
      const ok = await ctx.ask({ title: t("Delete {name}?", { name: cur?.name ?? "" }), ok: t("Delete"), body: `<p>${esc(t("The map, its tokens and its fog go with it. This cannot be undone. Export first if you want a copy."))}</p>`, read: () => true });
      if (ok && ctx.sceneDo("del")) { sel = ""; view = null; ctx.changed(); }
    },
    sceneShow: () => { ctx.sceneDo("show"); view = null; ctx.changed(); ctx.toast(t("The table now sees this scene.")); },
    tkSheet: el => { const tk = ctx.board().map?.tokens.find(x => x.id === el.dataset.id); if (tk?.actorId && !ctx.openSheet(tk.actorId)) ctx.toast(t("That sheet is not available here.")); },
    tkExchange: el => { const tk = ctx.board().map?.tokens.find(x => x.id === el.dataset.id); if (tk?.actorId && ctx.addToExchange(tk.actorId)) { ctx.toast(t("{name} added to the Exchange order.", { name: tk.name })); ctx.changed(); } },
    tokensAll: () => {
      const map = ctx.board().map; if (!map) return;
      const all = ctx.state.actors.concat(ctx.remoteActors()).filter(a => a.type === "character" && !map.tokens.some(x => x.actorId === a.id));
      if (!all.length) return ctx.toast(t("Every character already has a token here."));
      const cx = view ? view.x + view.w / 2 : map.w / 2, cy = view ? view.y + view.h / 2 : map.h / 2, step = (map.cell > 0 ? map.cell : 70) * 1.5;
      all.forEach((a, i) => {
        const guess = TOKENS.find(x => x.endsWith(a.name.replace(/\s+/g, "_"))) ?? "";
        const tk = B.addToken(map, { name: a.name, x: cx + (i - (all.length - 1) / 2) * step, y: cy, color: B.TOKEN_COLORS[i % (B.TOKEN_COLORS.length - 1)], img: guess, actorId: a.id, pc: true });
        B.moveToken(map, tk.id, tk.x, tk.y);
      });
      ctx.changed();
    },
    wallsClear: async () => {
      const m = ctx.board().map; if (!m || !ctx.isGM()) return;
      if (!B.wallsOf(m).length) return ctx.toast(t("There are no walls to clear."));
      ctx.mark?.("Walls cleared"); B.clearWalls(m); ctx.changed();
    },
    markColor: el => { markColor = el.dataset.c; ctx.redrawMap(); },
    marksClear: async () => {
      const m = ctx.board().map; if (!m || !ctx.isGM()) return;
      if (!B.marksOf(m).some(x => x.kind === "stroke")) return ctx.toast(t("There are no drawings to clear."));
      ctx.mark?.("Drawings cleared");
      B.clearMarks(m); ctx.changed();
    },
    toolSet: el => { tool = tool === el.dataset.tool ? "" : el.dataset.tool; ctx.redrawMap(); },
    fogAll: el => { const m = ctx.board().map; if (m?.fog) { B.fogAll(m, el.dataset.v === "1"); ctx.changed(); } },
    fogAround: () => {
      const m = ctx.board().map, tk = m?.tokens.find(x => x.id === sel);
      if (m?.fog && tk) { B.paintFog(m, tk.x, tk.y, true, radius); ctx.changed(); }
    },
    mapFit: () => { const m = ctx.board().map; if (m) { fit(m); ctx.redrawMap(); } },
    tokenDel: () => { B.removeToken(ctx.board().map, sel); sel = ""; ctx.changed(); },
    tokenHide: () => { const tk = ctx.board().map.tokens.find(x => x.id === sel); if (tk) tk.hidden = !tk.hidden; ctx.changed(); },
    tokenAdd: async () => {
      const map = ctx.board().map; if (!map) return;
      const actors = ctx.state.actors.concat(ctx.remoteActors()).filter(a => a.type === "character" || a.type === "npc");
      const imgs = `<option value="">${esc(t("No picture"))}</option>` + TOKENS.map(x => `<option value="${x}">${esc(x.replace(/_/g, " "))}</option>`).join("");
      const r = await ctx.ask({ title: t("Add a token"), ok: t("Add"), wide: true, body: `
        <div class="pm-row"><label>${esc(t("Who"))}</label><select name="actor"><option value="">${esc(t("Someone else"))}</option>${actors.map(a => `<option value="${a.id}">${esc(a.name)}${a.remote ? ` (${esc(a.remote.owner)})` : ""}</option>`).join("")}</select></div>
        <div class="pm-row"><label>${esc(t("Name"))}</label><input type="text" name="name" maxlength="30"></div>
        <div class="pm-row"><label>${esc(t("Picture"))}</label><select name="img">${imgs}</select></div>
        <div class="pm-row"><label>${esc(t("Colour"))}</label><select name="color">${B.TOKEN_COLORS.map((c, i) => `<option value="${c}" style="background:${c}">${["Red", "Orange", "Gold", "Green", "Teal", "Blue", "Purple", "White"].map(t)[i]}</option>`).join("")}</select>
          <label>${esc(t("Size"))}</label><select name="size"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div>
        <div class="pm-row"><label class="chk"><input type="checkbox" name="hidden"> ${esc(t("Hidden from the players"))}</label></div>`,
        read: f => ({ actor: f.elements.actor.value, name: f.elements.name.value.trim(), img: f.elements.img.value, color: f.elements.color.value, size: Number(f.elements.size.value), hidden: f.elements.hidden.checked }),
        setup: f => f.elements.actor.addEventListener("change", () => {
          const a = ctx.findActor(f.elements.actor.value);
          if (a) { f.elements.name.value = a.name; const guess = TOKENS.find(x => x.endsWith(a.name.replace(/\s+/g, "_"))); if (guess) f.elements.img.value = guess; }
        }) });
      if (!r) return;
      const a = r.actor ? ctx.findActor(r.actor) : null;
      const name = r.name || a?.name || t("Token");
      const img = r.img || (a ? (TOKENS.find(x => x.endsWith(a.name.replace(/\s+/g, "_"))) ?? "") : "");
      const tk = B.addToken(map, { name, x: view ? view.x + view.w / 2 : map.w / 2, y: view ? view.y + view.h / 2 : map.h / 2, color: r.color, img, actorId: a?.id ?? "", size: r.size, hidden: r.hidden, pc: a?.type === "character" });
      B.moveToken(map, tk.id, tk.x, tk.y);
      sel = tk.id; ctx.changed();
    }
  };

  /** Toolbar changes (selects and checkboxes inside the map pane). */
  async function onChange(e) {
    if (!ctx.isGM()) return;
    const el = e.target;
    if (el.id === "x-secs") { const T = timerOf(ctx.board().tracker); timerSetSecs(T, Number(el.value)); ctx.clock.sync(T); ctx.changed(); return; }
    if (el.id === "x-auto") { timerOf(ctx.board().tracker).auto = el.checked; ctx.changed(); return; }
    if (el.id === "sc-pick") { ctx.sceneDo("view", el.value); sel = ""; view = null; ctx.changed(); return; }
    if (el.id === "tk-link") {
      const tk = ctx.board().map?.tokens.find(x => x.id === sel), a = ctx.findActor(el.value);
      if (tk && a) { tk.actorId = a.id; tk.pc = a.type === "character"; ctx.changed(); }
      return;
    }
    if (el.id === "m-pick") {
      if (el.value === "__upload") { $("#mapfile").click(); el.value = ctx.board().map?.bundled ?? ""; return; }
      if (!el.value) ctx.setMap(null);
      else { const m = MAPS.find(x => x.id === el.value); const map = B.newMap({ src: m.file, name: m.title, w: m.w, h: m.h, cell: m.cell || 70, bundled: m.id }); map.grid = m.grid; ctx.setMap(map); }
      sel = ""; view = null; ctx.changed();
    } else if (el.id === "m-grid") { ctx.board().map.grid = el.checked; ctx.changed(); }
    else if (el.id === "m-mshown") { markShown = el.checked; return; }
    else if (el.id === "m-ashape") { areaShape = el.value; ctx.redrawMap(); return; }
    else if (el.id === "m-awidth") { areaWidth = Math.max(1, Math.min(10, Math.round(Number(el.value)) || 1)); return; }
    else if (el.id === "m-fog") { const m = ctx.board().map; if (!m.fog) m.fog = B.newFog(m); m.fog.on = el.checked; if (!el.checked && (tool === "reveal" || tool === "cover" || tool === "wall" || tool === "door")) tool = ""; B.updateVision(m); ctx.changed(); }
    else if (el.id === "m-dyn") { const m = ctx.board().map, d = B.dynOf(m); ctx.mark?.("Vision setting"); d.on = el.checked; B.updateVision(m); ctx.changed(); }
    else if (el.id === "m-vrad") { const m = ctx.board().map, d = B.dynOf(m); d.radius = Math.max(1, Math.min(B.MAX_VISION, Number(el.value) || 8)); B.updateVision(m); ctx.changed(); }
    else if (el.id === "m-vrem") { const m = ctx.board().map, d = B.dynOf(m); d.remember = el.checked; B.updateVision(m); ctx.changed(); }
    else if (el.id === "m-rad") { radius = Math.max(1, Math.min(12, Number(el.value) || 3)); }
    else if (el.id === "m-look") { look = el.checked; }
    else if (el.id === "m-snap") { ctx.board().map.snap = el.checked; ctx.changed(); }
    else if (el.id === "m-cell") { ctx.board().map.cell = Math.max(10, Math.min(400, Number(el.value) || 70)); ctx.changed(); }
  }
  async function onUpload(file) {
    try {
      const { src, w, h } = await B.shrinkImage(file);
      const map = B.newMap({ src, name: file.name.replace(/\.[^.]+$/, ""), w, h, cell: Math.round(w / 30) || 70 });
      ctx.setMap(map); sel = ""; view = null; ctx.changed();
    } catch { ctx.toast(t("That image could not be read.")); }
  }

  const actions = { ...trackerActions, ...mapActions };
  return {
    actions,
    renderTracker: () => { $("#pane-xchg").innerHTML = trackerHtml(); },
    renderMap: () => { $("#pane-map").innerHTML = mapHtml(); attach(); },
    onChange, onUpload, showPing,
    resetView: () => { view = null; sel = ""; },
    centre: () => view
  };
}
