/** The Exchange tracker and the map: views and interaction. Built with `createBoardUI(ctx)` so it does not import ui.mjs. */
import * as B from "./board.mjs";
import { MAPS, TOKENS } from "./maplist.mjs";
import { SIN_LABEL, HARM_LABEL, SIN_TEXT } from "./config.mjs";
import * as C from "./conditions.mjs";
import { t } from "./i18n.mjs";
import { esc } from "./engine.mjs";
import { DURATIONS, timerOf, timerStart, timerPause, timerReset, timerNewTurn, timerSetSecs, fmt } from "./timer.mjs";

/**
 * ctx: { state, room(), isGM(), board() -> {tracker, map, image}, remoteActors(), findActor(id), changed(), post(html), ask(opts), toast(msg), $ }
 * `changed()` saves, redraws and (as host) sends the board on.
 */
export function createBoardUI(ctx) {
  let view = null;               // {x, y, w, h}: the visible part of the map, in image pixels (local to this browser)
  let viewKey = "";
  let sel = "";                  // selected token id
  let tool = "";                 // "" (pan), "measure", "ping", "reveal" or "cover"
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
    return `<div class="conds">${chips}${gm ? `<button type="button" class="condadd" data-action="condAdd" data-slot="${slot.id}">+ ${esc(t("Condition"))}</button>` : ""}</div>`;
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
      <span class="who"><b>${esc(s.name)}</b><small>${esc([kindLabel[s.kind], slotInfo(s)].filter(Boolean).join(" · "))}</small></span>
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
    const head = `<div class="x-head"><div class="x-title"><b>${esc(t("Exchange"))} ${tr.exchange}</b>${tr.active ? "" : ` <small>${esc(t("No fight running."))}</small>`}</div>${timer}
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
  const tokenImg = tk => (tk.img ? `tokens/${tk.img}.png` : "");

  function fit(map) { view = { x: 0, y: 0, w: map.w, h: map.h }; viewKey = map.rev; }

  function mapHtml() {
    const b = ctx.board(), map = b.map, gm = ctx.isGM();
    const options = `<option value="">${esc(t("No map"))}</option>` + MAPS.map(m => `<option value="${m.id}" ${map?.bundled === m.id ? "selected" : ""}>${esc(m.title)}</option>`).join("") + `<option value="__upload">${esc(t("Upload an image..."))}</option>`;
    const measureBtn = `<button type="button" data-action="toolSet" data-tool="measure" class="${tool === "measure" ? "on" : ""}" title="${esc(t("Drag on the map to measure in squares"))}">${esc(t("Measure"))}</button>`;
    const fog = map?.fog;
    const fogBar = gm && map ? `<div class="m-bar fogbar"><label class="chk"><input type="checkbox" id="m-fog" ${fog?.on ? "checked" : ""}> ${esc(t("Fog of war"))}</label>
      ${fog?.on ? `<button type="button" data-action="toolSet" data-tool="reveal" class="${tool === "reveal" ? "on" : ""}">${esc(t("Reveal"))}</button><button type="button" data-action="toolSet" data-tool="cover" class="${tool === "cover" ? "on" : ""}">${esc(t("Cover up"))}</button>
      <button type="button" data-action="fogAll" data-v="1">${esc(t("Reveal all"))}</button><button type="button" data-action="fogAll" data-v="0">${esc(t("Cover all"))}</button>
      <button type="button" data-action="fogAround" ${sel && map.tokens.some(x => x.id === sel) ? "" : "disabled"} title="${esc(t("Reveal the squares around the selected token"))}">${esc(t("Around token"))}</button>
      <input type="number" id="m-rad" value="${radius}" min="1" max="12" title="${esc(t("Squares"))}">` : ""}</div>` : "";
    const pingBtn = `<button type="button" data-action="toolSet" data-tool="ping" class="${tool === "ping" ? "on" : ""}" title="${esc(t("Click the map to point everyone to a spot"))}">${esc(t("Ping"))}</button><label class="chk" title="${esc(t("Also centre everyone's view on the spot"))}"><input type="checkbox" id="m-look" ${look ? "checked" : ""}> ${esc(t("Look here"))}</label>`;
    const bar = gm ? `<div class="m-bar"><select id="m-pick">${options}</select>${map ? measureBtn + pingBtn : ""}
      ${map ? `<label class="chk"><input type="checkbox" id="m-grid" ${map.grid ? "checked" : ""}> ${esc(t("Grid"))}</label><label class="chk"><input type="checkbox" id="m-snap" ${map.snap ? "checked" : ""}> ${esc(t("Snap"))}</label>
      <label class="chk">${esc(t("Square"))} <input type="number" id="m-cell" value="${map.cell}" min="10" max="400" step="1"></label>
      <button type="button" data-action="tokenAdd">+ ${esc(t("Token"))}</button>
      ${sel && map.tokens.some(x => x.id === sel) ? `<button type="button" data-action="tokenHide">${esc(map.tokens.find(x => x.id === sel).hidden ? t("Show") : t("Hide"))}</button><button type="button" data-action="tokenDel">${esc(t("Remove"))}</button>` : ""}` : ""}
      </div>` : "";
    const pingOnly = `<button type="button" data-action="toolSet" data-tool="ping" class="${tool === "ping" ? "on" : ""}" title="${esc(t("Click the map to point everyone to a spot"))}">${esc(t("Ping"))}</button>`;
    const bars = gm ? bar + fogBar : (map ? `<div class="m-bar">${measureBtn}${pingOnly}</div>` : "");
    if (!map) return `${bar}<p class="hint pad">${esc(gm ? t("Pick a map to show the table.") : t("The GM has not shown a map."))}</p>`;
    const src = mapSrc();
    if (!view || viewKey !== map.rev) fit(map);
    const r = map.cell * 0.46;
    const grid = map.grid && map.cell > 0 ? `<defs><pattern id="g" width="${map.cell}" height="${map.cell}" patternUnits="userSpaceOnUse"><path d="M ${map.cell} 0 H 0 V ${map.cell}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/></pattern></defs><rect width="${map.w}" height="${map.h}" fill="url(#g)" pointer-events="none"/>` : "";
    const tokens = map.tokens.map(tk => {
      const rr = r * (tk.size || 1);
      const img = tokenImg(tk);
      return `<g class="tk ${tk.id === sel ? "sel" : ""} ${tk.hidden ? "hid" : ""}" data-id="${tk.id}" transform="translate(${tk.x} ${tk.y})">
        <circle r="${rr}" fill="${esc(tk.color)}" stroke="#14151b" stroke-width="4"/>
        ${img ? `<clipPath id="c${tk.id}"><circle r="${rr - 3}"/></clipPath><image href="${esc(img)}" x="${-rr}" y="${-rr}" width="${rr * 2}" height="${rr * 2}" clip-path="url(#c${tk.id})"/>` : `<text class="ini" y="${rr * 0.32}" font-size="${rr * 0.9}" text-anchor="middle">${esc(B.initials(tk.name))}</text>`}
        ${tk.id === sel ? `<circle r="${rr + 5}" fill="none" stroke="#c9a227" stroke-width="5"/>` : ""}
        <text class="lbl" y="${rr + 26}" font-size="22" text-anchor="middle">${esc(tk.name)}</text></g>`;
    }).join("");
    const svg = `<svg id="mapsvg" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <rect width="${map.w}" height="${map.h}" fill="#20222a"/>${src ? `<image href="${esc(src)}" width="${map.w}" height="${map.h}"/>` : `<text x="${map.w / 2}" y="${map.h / 2}" fill="#9aa3b5" font-size="40" text-anchor="middle">${esc(t("Loading the map..."))}</text>`}${grid}${fogSvg(map, gm)}${tokens}${pingsSvg(map)}</svg>`;
    const zoom = `<div class="m-zoom"><button type="button" data-action="mapZoom" data-f="0.8">+</button><button type="button" data-action="mapZoom" data-f="1.25">&minus;</button><button type="button" data-action="mapFit">${esc(t("Fit"))}</button></div>`;
    const note = map.name ? `<div class="m-name">${esc(map.name)}</div>` : "";
    return `${bars}<div class="m-stage ${tool ? "tool-" + tool : ""}">${svg}${zoom}${note}</div>`;
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
      if (d.kind === "token" && d.moved) push(d, true);
      else if (d.kind === "fog") ctx.changed();
      else if (d.kind === "measure") { /* the ruler stays until the next click */ }
      else { ctx.redrawMap(); }
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
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
    if (el.id === "m-pick") {
      if (el.value === "__upload") { $("#mapfile").click(); el.value = ctx.board().map?.bundled ?? ""; return; }
      if (!el.value) ctx.setMap(null);
      else { const m = MAPS.find(x => x.id === el.value); const map = B.newMap({ src: m.file, name: m.title, w: m.w, h: m.h, cell: m.cell || 70, bundled: m.id }); map.grid = m.grid; ctx.setMap(map); }
      sel = ""; view = null; ctx.changed();
    } else if (el.id === "m-grid") { ctx.board().map.grid = el.checked; ctx.changed(); }
    else if (el.id === "m-fog") { const m = ctx.board().map; if (!m.fog) m.fog = B.newFog(m); m.fog.on = el.checked; if (!el.checked && (tool === "reveal" || tool === "cover")) tool = ""; ctx.changed(); }
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
    resetView: () => { view = null; sel = ""; }
  };
}
