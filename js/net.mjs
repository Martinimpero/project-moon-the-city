/**
 * Network helpers for rooms: reading a TURN relay setting, and a "test my connection" check.
 * Rooms connect browsers directly (WebRTC). That needs a STUN helper to find each other's public address, and on strict networks
 * (some schools, offices, mobile data) it needs a TURN relay as well. There is no free relay that is safe to hard-code, so the app
 * lets the GM or a player paste one in (many services have a free tier) and tells them honestly whether their network looks fine.
 */

/** The STUN servers PeerJS uses when none are given; they must be kept if we pass our own list. */
export const DEFAULT_ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" }
];

/**
 * Parse relay settings, one server per line:  `turn:host:3478  username  password`  (the login is optional for stun:).
 * Returns { servers, errors }: errors say which lines were skipped and why.
 */
export function parseIceServers(text) {
  const servers = [], errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const [urls, username, ...rest] = line.split(/\s+/);
    const credential = rest.join(" ");
    if (!/^(stun|stuns|turn|turns):[^\s:]+(:\d+)?(\?transport=(udp|tcp))?$/i.test(urls)) { errors.push({ line: i + 1, reason: "address" }); return; }
    if (/^turns?:/i.test(urls) && (!username || !credential)) { errors.push({ line: i + 1, reason: "login" }); return; }
    servers.push(username ? { urls, username, credential } : { urls });
  });
  return { servers, errors };
}

/** Options to hand to PeerJS: our STUN servers plus the relay(s) the user added; null when they added nothing. */
export function peerOptionsFor(text) {
  const { servers } = parseIceServers(text);
  return servers.length ? { config: { iceServers: [...DEFAULT_ICE, ...servers] } } : null;
}

/** Count what kinds of network address a browser found for itself ("host" = local, "srflx" = public, "relay" = through a relay). */
export function classifyCandidates(candidates) {
  const c = { host: 0, srflx: 0, relay: 0 };
  for (const s of candidates) { const m = /\btyp (host|srflx|relay|prflx)\b/.exec(String(s)); if (m) c[m[1] === "prflx" ? "srflx" : m[1]]++; }
  return c;
}
/** What the counts mean: "relay" (a relay is working), "direct" (public address found), "blocked" (only local addresses), "none". */
export function connectionVerdict(counts) {
  if (counts.relay > 0) return "relay";
  if (counts.srflx > 0) return "direct";
  if (counts.host > 0) return "blocked";
  return "none";
}

/**
 * Run the check in a browser: can we reach the broker, and what addresses does this network give us?
 * `PeerCtor` is PeerJS' Peer; `iceServers` the servers to try. Never throws; resolves { broker, brokerMs, counts, verdict }.
 */
export async function testConnection({ PeerCtor, iceServers = DEFAULT_ICE, timeoutMs = 7000 } = {}) {
  const out = { broker: false, brokerMs: 0, counts: { host: 0, srflx: 0, relay: 0 }, verdict: "none" };
  const brokerCheck = new Promise(resolve => {
    if (!PeerCtor) return resolve();
    const t0 = Date.now();
    let peer;
    const done = ok => { try { peer?.destroy(); } catch { /* ignore */ } out.broker = ok; out.brokerMs = Date.now() - t0; resolve(); };
    try { peer = new PeerCtor(); peer.on("open", () => done(true)); peer.on("error", () => done(false)); } catch { done(false); }
    setTimeout(() => done(false), timeoutMs);
  });
  const iceCheck = new Promise(resolve => {
    const RTC = globalThis.RTCPeerConnection;
    if (!RTC) return resolve();
    const found = [];
    let pc;
    const finish = () => { try { pc?.close(); } catch { /* ignore */ } out.counts = classifyCandidates(found); out.verdict = connectionVerdict(out.counts); resolve(); };
    try {
      pc = new RTC({ iceServers });
      pc.createDataChannel("probe");
      pc.onicecandidate = e => { if (e.candidate) found.push(e.candidate.candidate); else finish(); };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(finish);
    } catch { finish(); }
    setTimeout(finish, timeoutMs);
  });
  await Promise.all([brokerCheck, iceCheck]);
  return out;
}
