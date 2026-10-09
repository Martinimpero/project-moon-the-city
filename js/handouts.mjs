/** Handouts: things the GM shows the table (a contract, a note, a photo). Plain data and helpers. */
import { uid } from "./model.mjs";

export const MAX_HANDOUTS = 60;
export const MAX_TEXT = 6000;

export function newHandout({ title = "", text = "", img = "" } = {}) {
  return { id: uid(), title: String(title).slice(0, 80), text: String(text).slice(0, MAX_TEXT), img, shown: false };
}
/** What goes to players: no `shown` flag, nothing else of the GM's. */
export const forPlayers = h => ({ id: h.id, title: h.title, text: h.text, img: h.img });
export const shownList = list => list.filter(h => h.shown).map(forPlayers);

/** A starter the GM can fill in: the paperwork of a Contract (Part V: Client, Risk, payment, Report). */
export function contractTemplate(labels) {
  return {
    title: labels.title,
    text: `${labels.client}: \n${labels.risk}: \n${labels.job}: \n${labels.payment}: \n${labels.deadline}: \n${labels.terms}: `
  };
}

/** Plain text to safe HTML: paragraphs on blank lines, line breaks kept, *emphasis* and **bold** only. */
export function textToHtml(text, esc) {
  return String(text ?? "").split(/\n{2,}/).filter(p => p.trim()).map(p =>
    `<p>${esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>").replace(/\n/g, "<br>")}</p>`).join("");
}
