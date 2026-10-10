/**
 * The guided character builder: Part III of the manual, one screen at a time, with the point-buy counted for you.
 * `openWizard()` resolves with a finished character, "blank" (the player skipped the guide), or null (cancelled).
 */
import * as C from "./creation.mjs";
import { SIN_LABEL, SKILL_LABEL, ATTRIBUTE_LABEL, BOND_TYPE_LABEL, GEAR_KIND_LABEL, SIN_TEXT } from "./config.mjs";
import { ATTRIBUTES, SKILLS, SINS, DEFAULT_ATTRIBUTE } from "./rules.mjs";
import { t, currentLang } from "./i18n.mjs";
import { esc } from "./engine.mjs";
import { refButton } from "./manualrefs.mjs";

const STEP_TITLE = {
  name: "Who is this?", who: "Where from, and how do you survive?", ties: "The people and the cause", wound: "Your Wound",
  wants: "What you want, and what trips you", attributes: "Attributes", skills: "Skills", gear: "What you carry", review: "Review"
};

export function openWizard() {
  return new Promise(resolve => {
    const b = C.blankBuild();
    let step = 0, done = false;
    const dlg = document.createElement("dialog");
    dlg.className = "pm-modal wizard";
    document.body.appendChild(dlg);
    const finish = v => { if (done) return; done = true; dlg.remove(); resolve(v); };
    dlg.addEventListener("cancel", e => { e.preventDefault(); finish(null); });
    dlg.addEventListener("close", () => finish(null));

    const key = () => C.STEPS[step];
    const text = (field, label, { rows = 0, hint = "", ph = "" } = {}) => `<label class="wz-field"><span>${esc(label)}</span>${rows
      ? `<textarea data-f="${field}" rows="${rows}" placeholder="${esc(ph)}">${esc(b[field])}</textarea>` : `<input type="text" data-f="${field}" value="${esc(b[field])}" placeholder="${esc(ph)}">`}${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
    const select = (field, label, options, { blank = "" } = {}) => `<label class="wz-field"><span>${esc(label)}</span><select data-s="${field}">${blank ? `<option value="">${esc(blank)}</option>` : ""}${Object.entries(options).map(([k, v]) => `<option value="${esc(k)}" ${b[field] === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
    const counter = (label, left, total) => `<div class="wz-count ${left === 0 ? "ok" : (left < 0 ? "bad" : "")}"><b>${left}</b> ${esc(label)} <small>/ ${total}</small></div>`;
    const stepper = (id, name, value, extra = "", { dMax = true } = {}) => `<div class="wz-row"><span class="nm">${esc(name)}</span><span class="ctl"><button type="button" data-b="${id}" data-d="-1">&minus;</button><b>${value}</b><button type="button" data-b="${id}" data-d="1">+</button></span>${extra ? `<small>${extra}</small>` : ""}</div>`;
    const issues = () => C.problemsFor(b, key()).map(p => {
      const msg = {
        blank: t("Not filled in yet: {field}", { field: ({ concept: t("Concept"), identity: t("Identity"), background: t("Background"), occupation: t("Occupation"), affiliation: t("Affiliation"), relationship: t("Relationship"), principle: t("Principle"), burden: t("Burden"), fear: t("Fear"), boundary: t("Boundary"), desire: t("Desire"), vice: t("Vice"), ambition: t("Ambition") })[p.field] ?? p.field }),
        name: t("Give the character a name."), package: t("Pick exactly three Skills for the Occupation."),
        attrLeft: t("{n} Attribute points left to spend.", { n: p.n }), attrOver: t("Too many points in an Attribute."),
        skillLeft: t("{n} Skill points left to spend.", { n: p.n }), skillOver: t("A Skill is above 3, or too many points are spent."),
        resLeft: t("{n} Resonance points left to spend.", { n: p.n }), resOver: t("Too many Resonance points."), gearSin: t("Attuned gear needs a Sin.")
      }[p.code];
      return `<li class="${p.severity}">${esc(msg)}</li>`;
    }).join("");

    /* ---- the screens ---- */
    const screens = {
      name: () => `<p class="wz-lead">${esc(t("Build a character in order: later steps rest on earlier ones. This is Part III of the manual."))}</p>
        ${text("name", t("Name"))}
        ${text("concept", t("Concept"), { hint: t("One line joining who you are and what you do."), ph: t("A Backstreets medic who used to work Wing security.") })}
        ${text("identity", t("Identity"), { hint: t("A short phrase about yourself, not a class. Your E.G.O. Manifestation and Distortion will relate back to it."), ph: t("The one who fixes people, not machines.") })}`,
      who: () => {
        const occ = Object.fromEntries(C.OCCUPATIONS.map(o => [o.key, t(o.name)]));
        const cur = C.OCCUPATIONS.find(o => o.key === b.occKey);
        return `${text("background", t("Background"), { hint: t("Where you are from. It colours your starting Bonds and may give one free Skill point, if your GM allows it."), ph: t("Raised in a Backstreets market") })}
          <div class="wz-two"><label class="wz-field"><span>${esc(t("Free Skill point from the Background (if your GM allows)"))}</span><select data-s="bgSkill"><option value="">${esc(t("none"))}</option>${SKILLS.map(s => `<option value="${s}" ${b.bgSkill === s ? "selected" : ""}>${esc(SKILL_LABEL[s])}</option>`).join("")}</select></label>
            <label class="wz-chk"><input type="checkbox" data-c="bgBond" ${b.bgBond ? "checked" : ""}> ${esc(t("My GM also gives a minor Bond from the Background (Strength 1)"))}</label></div>
          <hr>${select("occKey", t("Occupation package (a template: change the Skills if you like)"), occ, { blank: t("Build my own") })}
          ${text("occupation", t("Occupation"), { hint: t("How you survive."), ph: t("Backstreets Medic (unlicensed)") })}
          <div class="wz-count ${b.package.length === 3 ? "ok" : ""}"><b>${b.package.length}</b> ${esc(t("of 3 package Skills (each starts at 2)"))}${cur?.or ? ` <small>${esc(t("The manual offers: {x}", { x: t(cur.or) }))}</small>` : ""}</div>
          <div class="wz-skills">${SKILLS.map(s => `<label class="${b.package.includes(s) ? "on" : ""}"><input type="checkbox" data-p="${s}" ${b.package.includes(s) ? "checked" : ""}> ${esc(SKILL_LABEL[s])}</label>`).join("")}</div>`;
      },
      ties: () => `${text("affiliation", t("Affiliation"), { hint: t("A Wing, the Association, a Syndicate, a mutual-aid network, or none. It gives you a starting Bond (Strength 1)."), ph: t("Mutual-aid network (a market street clinic)") })}
        ${select("affBond", t("What that Bond is"), Object.fromEntries(C.AFFILIATION_BONDS.map(k => [k, BOND_TYPE_LABEL[k]])))}<hr>
        ${text("relationship", t("Relationship"), { hint: t("One person who matters to you. It gives you a Bond (Strength 2) of a kind you choose."), ph: t("Old Tabbi, who runs the market street clinic") })}
        ${select("relBond", t("What that Bond is"), Object.fromEntries(C.BOND_TYPES.map(k => [k, BOND_TYPE_LABEL[k]])))}<hr>
        ${text("principle", t("Principle"), { hint: t("One belief, stated so that it can bend under real pressure. It has no number; the GM can bring it up like a Vice."), ph: t("Everyone gets one honest chance to be helped.") })}`,
      wound: () => {
        const tied = C.tiedTop(b), align = C.alignmentOf(b);
        return `<p class="wz-lead">${esc(t("Answer three questions together, as one thing: what happened to you, what you are afraid of because of it, and what line you will never cross again because of it. Write all three in one sitting."))}</p>
          ${text("burden", t("Burden: what happened"), { rows: 3, hint: t("A concrete past event, written so it can trigger again. It becomes your starting Trauma. Write only as much as you want on the table."), ph: t("A Wing guard bled out in my arms after I waited for a supervisor's sign-off.") })}
          ${text("fear", t("Fear"), { hint: t("Specific enough to name: not \"dying\" but \"dying without anyone knowing what happened to me\"."), ph: t("Dying without anyone knowing what happened to me.") })}
          ${text("boundary", t("Boundary"), { hint: t("Personal, not a setting-wide taboo. This is the fault line the Hail Mary keys off."), ph: t("I won't let someone die on my table because I hesitated.") })}
          <hr><h4>${esc(t("What does that Wound feel like?"))}</h4>
          ${counter(t("Resonance points left"), C.resonanceLeft(b), C.RESONANCE_POINTS)}
          <div class="wz-sins">${SINS.map(s => `<div class="sin-${s}"><div class="wz-row"><span class="nm"><b>${esc(SIN_LABEL[s])}</b> <small>${esc(SIN_TEXT[s].keyword)}</small></span><span class="ctl"><button type="button" data-r="${s}" data-d="-1">&minus;</button><b>${b.resonance[s]}</b><button type="button" data-r="${s}" data-d="1">+</button></span></div></div>`).join("")}</div>
          <p class="hint">${esc(t("Up to {max} in any one Sin. Your highest is your Alignment.", { max: C.RESONANCE_MAX }))} ${align ? `<b>${esc(t("Alignment"))}: ${esc(SIN_LABEL[align])}${tied.length > 1 ? ` (${esc(t("tied with {x}; the first on the sheet counts", { x: tied.slice(1).map(s => SIN_LABEL[s]).join(", ") }))})` : ""}</b>` : ""}</p>`;
      },
      wants: () => `${text("desire", t("Desire"), { hint: t("A concrete, pursuable want the GM can put pressure on."), ph: t("Open a real clinic with a door that locks and a license on the wall.") })}
        ${text("vice", t("Vice"), { hint: t("A specific, recurring weakness. The GM may invoke it to add a complication, and you regain 1 E.G.O. when it does (once per scene)."), ph: t("Can't say no to a patient, even when it's obviously a trap.") })}
        ${text("ambition", t("Ambition"), { hint: t("The question your whole story should eventually answer."), ph: t("Is a clean conscience something the City lets you keep?") })}`,
      attributes: () => `<p class="wz-lead">${esc(t("All four start at 1. Spend 6 more points, up to 4 in any one (5 is earned in play)."))}</p>
        ${counter(t("Attribute points left"), C.attrPointsLeft(b), C.ATTR_POINTS)}
        ${ATTRIBUTES.map(a => stepper(`attr:${a}`, ATTRIBUTE_LABEL[a], b.attrs[a], a === "resolve" ? esc(t("Your E.G.O. maximum is your Resolve: {n}", { n: b.attrs.resolve })) : "")).join("")}`,
      skills: () => `<p class="wz-lead">${esc(t("Your package Skills start at 2. Spend 7 more points freely, with no Skill above 3."))}</p>
        ${counter(t("Skill points left"), C.skillPointsLeft(b), C.FREE_POINTS)}
        ${SKILLS.map(s => stepper(`skill:${s}`, SKILL_LABEL[s], C.skillValue(b, s), `${b.package.includes(s) ? esc(t("package")) + " &middot; " : ""}${esc(ATTRIBUTE_LABEL[DEFAULT_ATTRIBUTE[s]])}`)).join("")}`,
      gear: () => `<p class="wz-lead">${esc(t("You start with Resources 2 and one piece of gear of Cost 2 or less. It may be attuned to a Sin, so you begin with one already in hand."))}</p>
        ${text("gearName", t("Gear"), { hint: t("Leave empty for none."), ph: t("Ember Knife") })}
        ${select("gearKind", t("Kind"), GEAR_KIND_LABEL)}
        ${b.gearKind !== "mundane" ? select("gearSin", t("Attuned to"), Object.fromEntries(SINS.map(s => [s, SIN_LABEL[s]])), { blank: t("(a Sin)") }) : ""}
        ${text("gearNote", t("What it does"), { ph: t("A blade that never quite cools.") })}`,
      review: () => {
        const list = C.problems(b);
        const a = C.buildCharacter(b);
        return `<h4>${esc(a.name)}</h4><p>${esc(b.concept)}</p>
          <div class="wz-sum"><div><b>E.G.O.</b> ${a.system.ego.max}</div><div><b>${esc(t("Stress"))}</b> ${a.system.stress}</div><div><b>${esc(t("Resources"))}</b> ${a.system.resources}</div><div><b>${esc(t("Grade"))}</b> ${a.system.grade}</div><div><b>${esc(t("Alignment"))}</b> ${esc(SIN_LABEL[a.derived.alignment] ?? "-")}</div></div>
          <p>${ATTRIBUTES.map(k => `${esc(ATTRIBUTE_LABEL[k])} <b>${a.system.attributes[k]}</b>`).join(" &middot; ")}</p>
          <p>${SKILLS.filter(s => a.system.skills[s] > 0).map(s => `${esc(SKILL_LABEL[s])} <b>${a.system.skills[s]}</b>`).join(" &middot; ") || "-"}</p>
          <p>${a.items.map(i => esc(i.name)).join(" &middot; ")}</p>
          ${list.length ? `<h4>${esc(t("Still open"))}</h4><ul class="wz-issues">${list.map(p => `<li class="${p.severity}"><a href="#" data-go="${p.step}">${esc(t(STEP_TITLE[p.step]))}</a></li>`).join("")}</ul><p class="hint">${esc(t("You can create the character now and finish the rest on the sheet."))}</p>` : `<p class="wz-done">${esc(t("Everything the manual asks for is done."))}</p>`}`;
      }
    };

    function render() {
      const k = key(), last = step === C.STEPS.length - 1;
      const bar = C.STEPS.map((s, i) => `<button type="button" class="dot ${i === step ? "now" : ""} ${i < step ? "past" : ""} ${C.problemsFor(b, s).some(p => p.severity === "error") ? "bad" : ""}" data-go="${s}" title="${esc(t(STEP_TITLE[s]))}"></button>`).join("");
      dlg.innerHTML = `<form method="dialog" class="pm-dialog wz" novalidate>
        <header><h2>${esc(t("New character"))}${refButton("creation", t("Open this in the manual"))} <small>${step + 1} / ${C.STEPS.length}: ${esc(t(STEP_TITLE[k]))}</small></h2><div class="wz-bar">${bar}</div></header>
        <div class="pm-dlg-body">${screens[k]()}${k === "review" ? "" : `<ul class="wz-issues soft">${issues()}</ul>`}</div>
        <footer><button type="button" class="ghost" data-skip>${esc(t("Skip the guide: blank sheet"))}</button><span class="spacer"></span>
          <button type="button" class="ghost" data-cancel>${esc(t("Cancel"))}</button>
          ${step > 0 ? `<button type="button" class="ghost" data-back>${esc(t("Back"))}</button>` : ""}
          ${last ? `<button type="button" class="primary" data-create>${esc(t("Create the character"))}</button>` : `<button type="button" class="primary" data-next>${esc(t("Next"))}</button>`}</footer></form>`;
    }

    dlg.addEventListener("input", e => { const f = e.target.dataset?.f; if (f !== undefined) b[f] = e.target.value; });
    dlg.addEventListener("change", e => {
      const el = e.target;
      if (el.dataset.s !== undefined) {
        b[el.dataset.s] = el.value;
        if (el.dataset.s === "occKey") { if (el.value) { C.applyOccupation(b, el.value); const o = C.OCCUPATIONS.find(x => x.key === el.value); if (!b.occupation.trim()) b.occupation = t(o.name); } }
        if (el.dataset.s === "gearKind" && el.value === "mundane") b.gearSin = "";
        render();
      } else if (el.dataset.c !== undefined) { b[el.dataset.c] = el.checked; }
      else if (el.dataset.p !== undefined) { if (!C.togglePackageSkill(b, el.dataset.p)) el.checked = !el.checked; render(); }
    });
    dlg.addEventListener("click", e => {
      const el = e.target.closest("button, a");
      if (!el) return;
      if (el.dataset.b) { const [kind, id] = el.dataset.b.split(":"); (kind === "attr" ? C.bumpAttr : C.bumpSkill)(b, id, Number(el.dataset.d)); render(); }
      else if (el.dataset.r) { C.bumpResonance(b, el.dataset.r, Number(el.dataset.d)); render(); }
      else if (el.dataset.go) { e.preventDefault(); step = Math.max(0, C.STEPS.indexOf(el.dataset.go)); render(); }
      else if (el.hasAttribute("data-next")) { step = Math.min(step + 1, C.STEPS.length - 1); render(); dlg.querySelector(".pm-dlg-body").scrollTop = 0; }
      else if (el.hasAttribute("data-back")) { step = Math.max(0, step - 1); render(); }
      else if (el.hasAttribute("data-cancel")) finish(null);
      else if (el.hasAttribute("data-skip")) finish("blank");
      else if (el.hasAttribute("data-create")) finish(C.buildCharacter(b, currentLang()));
    });
    render();
    dlg.showModal();
  });
}
