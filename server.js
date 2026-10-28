"use strict";
// IT Portal server - no dependencies. Needs Node.js 18 or newer.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), net = require("net");
const { execFile } = require("child_process");

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const FILE = path.join(DATA_DIR, "data.json");
const COLS = ["tickets", "isps", "tasks", "inventory", "monitors"];
const MON_MIN = Math.max(3, +process.env.MON_MIN_INTERVAL || 3);
const MAXBODY = 2 * 1024 * 1024;
fs.mkdirSync(DATA_DIR, { recursive: true });

const rnd = n => crypto.randomBytes(n).toString("hex");
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
const checkPw = (pw, u) => {
  const a = Buffer.from(hashPw(pw, u.salt), "hex");
  const b = Buffer.from(u.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const mkUser = o => {
  const salt = rnd(16);
  return { id: rnd(4), username: o.username, name: o.name, role: o.role, company: o.company || "", salt, hash: hashPw(o.password, salt) };
};

let db;
if (fs.existsSync(FILE)) {
  db = JSON.parse(fs.readFileSync(FILE, "utf8"));
  db.users = db.users || {};
  db.sessions = db.sessions || {};
  db.cols = db.cols || {};
  db.ver = db.ver || {};
  COLS.forEach(c => { db.cols[c] = db.cols[c] || {}; db.ver[c] = db.ver[c] || 1; });
} else {
  db = { users: {}, sessions: {}, cols: {}, ver: {} };
  COLS.forEach(c => { db.cols[c] = {}; db.ver[c] = 1; });

  const seed = path.join(__dirname, "seed", "inventory.json");
  if (fs.existsSync(seed)) JSON.parse(fs.readFileSync(seed, "utf8")).forEach(d => { db.cols.inventory[d.id] = d.data; });
  const seedI = path.join(__dirname, "seed", "isps.json");
  if (fs.existsSync(seedI)) JSON.parse(fs.readFileSync(seedI, "utf8")).forEach(d => { db.cols.isps[d.id] = d.data; });

  const username = (process.env.ADMIN_USER || "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || rnd(5);
  const u = mkUser({ username, name: "Administrator", role: "manager", password });
  db.users[u.id] = u;
  console.log("\n=== FIRST RUN ===\nManager account created.\n  Username: " + username + "\n  Password: " + password + "\nSign in and change the password (click your name in the sidebar).\n=================\n");
}

db.mon = db.mon || {};
db.events = db.events || [];
let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { flush(); }
    catch (e) { console.error("Could not save IT Portal database:", e); }
  }, 300);
}
function flush() {
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}
flush();
["SIGINT", "SIGTERM"].forEach(s => process.on(s, () => {
  try { clearTimeout(timer); flush(); }
  catch (e) { console.error("Error while saving on shutdown:", e); }
  process.exit(0);
}));

// ---------- Network monitoring ----------
const hourKey = t => new Date(t).toISOString().slice(0, 13);
function tcpCheck(host, port) {
  return new Promise(ok => {
    const t0 = Date.now();
    let done = false;
    const finish = result => { if (done) return; done = true; ok(result); };
    const s = net.connect({ host, port, timeout: 4000 });
    s.on("connect", () => { s.destroy(); finish({ ok: true, ms: Date.now() - t0 }); });
    s.on("timeout", () => { s.destroy(); finish({ ok: false }); });
    s.on("error", () => finish({ ok: false }));
  });
}
function pingCheck(host) {
  return new Promise(ok => {
    const win = process.platform === "win32", t0 = Date.now();
    execFile("ping", win ? ["-n", "1", "-w", "3000", host] : ["-c", "1", "-W", "3", host], { timeout: 6000 }, err => ok({ ok: !err, ms: Date.now() - t0 }));
  });
}
async function httpCheck(url) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: "manual" });
    return { ok: r.status < 500, ms: Date.now() - t0 };
  } catch (e) { return { ok: false }; }
}
function runCheck(m) {
  if (m.type === "tcp") return tcpCheck(m.host, +m.port || 80);
  if (m.type === "http") return httpCheck(m.host);
  return pingCheck(m.host);
}
function evalState(h, prev, fast) {
  let cf = 0;
  for (let i = h.length - 1; i >= 0 && !h[i].ok; i--) cf++;
  if (cf >= 3) return "down";
  if (cf > 0) return prev || "checking";
  let ok = 0;
  for (let i = h.length - 1; i >= 0 && h[i].ok; i--) ok++;
  if (prev === "down") return ok >= (fast ? 1 : 2) ? "up" : "down";
  const w = h.slice(-10);
  let tr = 0;
  for (let i = 1; i < w.length; i++) if (w[i].ok !== w[i - 1].ok) tr++;
  if (tr >= 3) return "intermittent";
  if (prev === "intermittent") return ok >= 5 ? "up" : "intermittent";
  return "up";
}
const ISP_STATUS = { up: "Active", down: "Down", intermittent: "Intermittent" };
function applyResult(id, m, r) {
  const now = Date.now(), st = db.mon[id] = db.mon[id] || { state: "checking", hist: [], hours: {} };
  st.hist.push({ t: now, ok: r.ok, ms: r.ms || 0 });
  if (st.hist.length > 60) st.hist.shift();
  st.lastCheck = now;
  st.ms = r.ok ? r.ms : null;
  const hk = hourKey(now);
  st.hours[hk] = st.hours[hk] || [0, 0];
  st.hours[hk][1]++;
  if (r.ok) st.hours[hk][0]++;
  Object.keys(st.hours).sort().slice(0, -48).forEach(k => delete st.hours[k]);
  const prev = st.state === "checking" ? null : st.state;
  // Heartbeat requests with ?internet=down must switch to down immediately.
  const next = r.forceState || evalState(st.hist, prev, m.type === "heartbeat");
  if (next !== st.state) {
    const from = st.state;
    st.state = next;
    st.since = now;
    if (next !== "checking") {
      db.events.push({ ts: now, id, name: m.name, company: m.company || "", from, to: next });
      if (db.events.length > 300) db.events.shift();
      const isp = m.isp && db.cols.isps[m.isp];
      if (isp && m.auto !== false && ISP_STATUS[next] && isp.status !== ISP_STATUS[next]) {
        db.cols.isps[m.isp] = { ...isp, status: ISP_STATUS[next], statusAt: now, statusSource: "monitor" };
        db.ver.isps++;
      }
    }
  }
  save();
}
const rt = {}, STARTED = Date.now(), hbCount = {};
function monitorTick() {
  const now = Date.now();
  Object.entries(db.cols.monitors).forEach(([id, m]) => {
    if (m.paused) return;
    if (m.type === "heartbeat") {
      const st = db.mon[id], base = (st && st.lastBeat) || m.createdAt || STARTED;
      const every = Math.max(MON_MIN, +m.intervalSec || 60);
      const r = rt[id] = rt[id] || { next: 0, busy: false };
      if (now - base > 3 * every * 1000 && now >= r.next) {
        const first = !r.missed;
        r.missed = true;
        r.next = now + every * 1000;
        for (let i = 0; i < (first ? 3 : 1); i++) applyResult(id, m, { ok: false });
      }
      return;
    }
    const r = rt[id] = rt[id] || { next: 0, busy: false };
    if (r.busy || now < r.next) return;
    r.busy = true;
    r.next = now + Math.max(MON_MIN, +m.intervalSec || 60) * 1000;
    runCheck(m)
      .then(res => applyResult(id, m, res))
      .catch(() => applyResult(id, m, { ok: false }))
      .finally(() => { r.busy = false; });
  });
}
setInterval(monitorTick, 2000);
function monView(id) {
  const st = db.mon[id];
  if (!st) return { state: "checking", hist: [] };
  const keys = Object.keys(st.hours).sort().slice(-24);
  let o = 0, t = 0;
  keys.forEach(k => { o += st.hours[k][0]; t += st.hours[k][1]; });
  return {
    type: (db.cols.monitors[id] || {}).type,
    lastBeat: st.lastBeat || null,
    state: st.state,
    since: st.since,
    lastCheck: st.lastCheck,
    ms: st.ms,
    uptime: t ? Math.round(o / t * 1000) / 10 : null,
    hist: st.hist.slice(-30).map(x => x.ok ? 1 : 0),
    pulse: st.hist.slice(-30).map(x => ({
      t: x.t,
      ok: !!x.ok,
      ms: x.ms || 0
    }))
  };
}
function validMonitor(b) {
  if (b.type === "heartbeat") return /^[a-f0-9]{24,64}$/.test(String(b.token || "")) ? null : "Missing heartbeat token.";
  if (!["ping", "tcp", "http"].includes(b.type)) return "Type must be ping, tcp or http.";
  const host = String(b.host || "");
  if (!(b.type === "http" ? /^https?:\/\/[A-Za-z0-9._:\-/?=&%]{3,200}$/ : /^[A-Za-z0-9._:\-]{1,200}$/).test(host)) return "Invalid host or address.";
  if (b.type === "tcp" && !(+b.port >= 1 && +b.port <= 65535)) return "TCP needs a port (1-65535).";
  return null;
}

const isIT = u => u.role === "manager" || u.role === "it";
const pub = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, company: u.company });
const me = u => ({ ...pub(u), canEdit: isIT(u), isOwner: u.role === "manager" });

// Send a response only if one has not already started or ended.
// Returns false when the response can no longer be written.
function send(res, code, obj, extra) {
  if (!res || res.destroyed || res.writableEnded || res.headersSent) return false;
  const body = obj === undefined ? "" : JSON.stringify(obj);
  try {
    res.writeHead(code, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extra || {})
    });
    res.end(body);
    return true;
  } catch (e) {
    console.error("Failed to send HTTP response:", e.message);
    if (!res.destroyed && !res.writableEnded) res.destroy();
    return false;
  }
}
function readBody(req) {
  return new Promise((ok, no) => {
    let n = 0;
    let tooBig = false;
    const ch = [];
    req.on("data", c => {
      if (tooBig) return; // Continue draining the request without buffering more data.
      n += c.length;
      if (n > MAXBODY) {
        tooBig = true;
        ch.length = 0;
        no(new Error("too big"));
      } else {
        ch.push(c);
      }
    });
    req.on("end", () => {
      if (tooBig) return;
      try { ok(ch.length ? JSON.parse(Buffer.concat(ch).toString("utf8")) : {}); }
      catch (e) { no(new Error("bad json")); }
    });
    req.on("error", no);
  });
}
const cookies = req => Object.fromEntries((req.headers.cookie || "").split(";").map(s => s.trim().split("=")).filter(a => a[0]).map(a => [a[0], a.slice(1).join("=")]));
function auth(req) {
  const t = cookies(req).sid;
  const s = t && db.sessions[t];
  if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[t]; return null; }
  return db.users[s.uid] || null;
}
const fails = {};
function limited(key) {
  const now = Date.now();
  fails[key] = (fails[key] || []).filter(t => now - t < 600000);
  return fails[key].length >= 5;
}
const idOk = s => /^[A-Za-z0-9_-]{1,60}$/.test(s);
const TASK_FIELDS = ["status", "note", "updatedAt"];

function setSec(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"), p = url.pathname, m = req.method;
    setSec(res);

    if (m === "GET" && (p === "/" || p === "/index.html")) {
      const html = fs.readFileSync(path.join(__dirname, "public", "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(html);
    }
    if (p === "/healthz") return send(res, 200, { ok: true });
    if (!p.startsWith("/api/")) return send(res, 404, { error: "Not found" });

    if (m !== "GET") {
      const o = req.headers.origin;
      if (o) {
        try {
          if (new URL(o).host !== req.headers.host) return send(res, 403, { error: "Bad origin" });
        } catch (e) { return send(res, 403, { error: "Bad origin" }); }
      }
    }

    // Heartbeat route is intentionally handled before login/auth. A wrong token
    // returns 404 Unknown token instead of falling through to the login guard.
    const hb = p.match(/^\/api\/heartbeat\/([^/]+)$/);
    if (hb && (m === "GET" || m === "POST")) {
      const k = req.socket.remoteAddress || "", t = Date.now();
      hbCount[k] = (hbCount[k] || []).filter(x => t - x < 60000);
      if (hbCount[k].length >= 120) return send(res, 429, { error: "Too many requests" });
      hbCount[k].push(t);
      const token = hb[1];
      const e = /^[a-f0-9]{24,64}$/.test(token)
        ? Object.entries(db.cols.monitors).find(([i, x]) => x.type === "heartbeat" && x.token === token)
        : null;
      if (!e) return send(res, 404, { error: "Unknown heartbeat token. Copy the exact token from the monitor settings." });
      const [id, mon] = e;
      if (mon.paused) return send(res, 200, { ok: true, paused: true });
      const internetDown = url.searchParams.get("internet") === "down";
      applyResult(id, mon, {
        ok: !internetDown,
        ms: 0,
        forceState: internetDown ? "down" : undefined
      });
      db.mon[id].lastBeat = Date.now();
      if (rt[id]) rt[id].missed = false;
      save();
      return send(res, 200, { ok: true, state: db.mon[id].state });
    }

    if (p === "/api/login" && m === "POST") {
      const b = await readBody(req), un = String(b.username || "").toLowerCase().trim();
      const key = (req.socket.remoteAddress || "") + "|" + un;
      if (limited(key)) return send(res, 429, { error: "Too many attempts. Try again in 10 minutes." });
      const u = Object.values(db.users).find(x => x.username === un);
      if (!u || !checkPw(String(b.password || ""), u)) {
        (fails[key] = fails[key] || []).push(Date.now());
        return send(res, 401, { error: "Wrong username or password." });
      }
      const tok = rnd(24), age = b.remember ? 30 * 864e5 : 12 * 36e5;
      db.sessions[tok] = { uid: u.id, exp: Date.now() + age };
      save();
      const secure = (req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted) ? "; Secure" : "";
      return send(res, 200, me(u), { "Set-Cookie": `sid=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(age / 1000)}${secure}` });
    }

    const user = auth(req);
    if (!user) return send(res, 401, { error: "Not signed in" });
    if (p === "/api/logout" && m === "POST") {
      delete db.sessions[cookies(req).sid];
      save();
      return send(res, 200, { ok: true }, { "Set-Cookie": "sid=; Path=/; HttpOnly; Max-Age=0" });
    }
    if (p === "/api/me" && m === "GET") return send(res, 200, me(user));

    if (p === "/api/password" && m === "POST") {
      const b = await readBody(req);
      if (!checkPw(String(b.old || ""), user)) return send(res, 400, { error: "Current password is wrong." });
      if (String(b.new || "").length < 8) return send(res, 400, { error: "New password must be at least 8 characters." });
      user.salt = rnd(16);
      user.hash = hashPw(String(b.new), user.salt);
      save();
      return send(res, 200, { ok: true });
    }

    if (p === "/api/people" && m === "GET") {
      if (!isIT(user)) return send(res, 403, { error: "Not allowed" });
      const team = Object.values(db.users).filter(x => isIT(x));
      if (url.searchParams.get("ids") !== null) {
        const out = {};
        url.searchParams.get("ids").split(",").forEach(i => { const x = db.users[i]; if (x) out[i] = { id: x.id, name: x.name }; });
        return send(res, 200, out);
      }
      const q = (url.searchParams.get("q") || "").toLowerCase();
      return send(res, 200, team.filter(x => (x.name + " " + x.username).toLowerCase().includes(q)).map(x => ({ id: x.id, name: x.name })));
    }

    // User admin (manager only)
    let mm = p.match(/^\/api\/users(?:\/([A-Za-z0-9]+))?$/);
    if (mm) {
      if (user.role !== "manager") return send(res, 403, { error: "Only the manager can manage users." });
      const uid = mm[1];
      if (m === "GET" && !uid) return send(res, 200, Object.values(db.users).map(pub));
      const b = (m === "POST" || m === "PUT") ? await readBody(req) : {};
      const okRole = r => ["manager", "it", "staff"].includes(r);
      if (m === "POST" && !uid) {
        const un = String(b.username || "").toLowerCase().trim();
        if (!/^[a-z0-9._-]{3,30}$/.test(un)) return send(res, 400, { error: "Username: 3-30 letters, numbers, . _ -" });
        if (Object.values(db.users).some(x => x.username === un)) return send(res, 400, { error: "That username is already used." });
        if (String(b.password || "").length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
        if (!okRole(b.role) || !String(b.name || "").trim()) return send(res, 400, { error: "Name and role are required." });
        const u = mkUser({ username: un, name: String(b.name).trim().slice(0, 80), role: b.role, company: b.role === "staff" ? String(b.company || "") : "", password: String(b.password) });
        db.users[u.id] = u;
        save();
        return send(res, 200, pub(u));
      }
      const t = uid && db.users[uid];
      if (!t) return send(res, 404, { error: "User not found" });
      if (m === "PUT") {
        if (b.name) t.name = String(b.name).trim().slice(0, 80);
        if (b.role && okRole(b.role)) {
          if (t.id === user.id && b.role !== "manager") return send(res, 400, { error: "You cannot remove your own manager role." });
          t.role = b.role;
        }
        t.company = t.role === "staff" ? String(b.company || t.company || "") : "";
        if (b.password) {
          if (String(b.password).length < 8) return send(res, 400, { error: "Password must be at least 8 characters." });
          t.salt = rnd(16);
          t.hash = hashPw(String(b.password), t.salt);
          Object.keys(db.sessions).forEach(k => { if (db.sessions[k].uid === t.id) delete db.sessions[k]; });
        }
        save();
        return send(res, 200, pub(t));
      }
      if (m === "DELETE") {
        if (t.id === user.id) return send(res, 400, { error: "You cannot delete yourself." });
        delete db.users[t.id];
        Object.keys(db.sessions).forEach(k => { if (db.sessions[k].uid === t.id) delete db.sessions[k]; });
        save();
        return send(res, 200, { ok: true });
      }
    }

    if (p.startsWith("/api/monitor/")) {
      if (!isIT(user)) return send(res, 403, { error: "Not allowed" });
      if (p === "/api/monitor/status" && m === "GET") {
        const out = {};
        Object.keys(db.cols.monitors).forEach(id => { out[id] = monView(id); });
        return send(res, 200, out);
      }
      if (p === "/api/monitor/events" && m === "GET") return send(res, 200, db.events.slice(-60).reverse());
      const mr = p.match(/^\/api\/monitor\/run\/([A-Za-z0-9_-]+)$/);
      if (mr && m === "POST") {
        const mm2 = db.cols.monitors[mr[1]];
        if (!mm2) return send(res, 404, { error: "Not found" });
        const r0 = await runCheck(mm2);
        applyResult(mr[1], mm2, r0);
        return send(res, 200, monView(mr[1]));
      }
      return send(res, 404, { error: "Not found" });
    }

    // Collections
    mm = p.match(/^\/api\/c\/([a-z]+)(?:\/([^/]+))?$/);
    if (mm && COLS.includes(mm[1])) {
      const col = mm[1], id = mm[2] && decodeURIComponent(mm[2]);
      if (col !== "tickets" && !isIT(user)) return send(res, 403, { error: "Not allowed" });
      if (m === "GET" && !id) {
        const etag = `W/"${user.id}-${db.ver[col]}"`;
        if (req.headers["if-none-match"] === etag) {
          if (!res.headersSent && !res.writableEnded) {
            res.writeHead(304, { ETag: etag, "Cache-Control": "no-store" });
            return res.end();
          }
          return;
        }
        let list = Object.entries(db.cols[col]).map(([i, d]) => ({ id: i, data: d }));
        if (user.role === "staff") list = list.filter(x => x.data.requesterId === user.id);
        return send(res, 200, list, { ETag: etag });
      }
      if (!id || !idOk(id)) return send(res, 400, { error: "Bad id" });
      const old = db.cols[col][id];
      if (m === "PUT") {
        const b = await readBody(req);
        if (!b || typeof b !== "object" || Array.isArray(b)) return send(res, 400, { error: "Bad data" });
        let doc = b;
        if (user.role === "staff") {
          if (old) return send(res, 403, { error: "You cannot change an existing ticket." });
          if (user.company && b.company !== user.company) return send(res, 400, { error: "Tickets must be for your company." });
          doc = { ...b, requesterId: user.id, by: user.name, status: "Open" };
          delete doc.resolved;
          delete doc.resolvedBy;
          delete doc.assigned;
          delete doc.itNote;
        } else if (col === "tasks" && user.role === "it") {
          if (!old || old.assigneeId !== user.id) return send(res, 403, { error: "You can only update tasks assigned to you." });
          doc = { ...old };
          TASK_FIELDS.forEach(k => { if (k in b) doc[k] = b[k]; });
          if (b.doneAt && doc.status === "Done") doc.doneAt = b.doneAt;
          else if (doc.status !== "Done") delete doc.doneAt;
        }
        if (col === "monitors") {
          const bad = validMonitor(doc);
          if (bad) return send(res, 400, { error: bad });
          doc.intervalSec = Math.max(MON_MIN, +doc.intervalSec || 60);
          if (doc.type === "heartbeat") doc.createdAt = (old && old.createdAt) || Date.now();
        }
        db.cols[col][id] = doc;
        db.ver[col]++;
        save();
        return send(res, 200, { ok: true });
      }
      if (m === "DELETE") {
        if (user.role === "staff") return send(res, 403, { error: "Not allowed" });
        if (col === "tasks" && user.role !== "manager") return send(res, 403, { error: "Only the manager can delete tasks." });
        delete db.cols[col][id];
        if (col === "monitors") delete db.mon[id];
        db.ver[col]++;
        save();
        return send(res, 200, { ok: true });
      }
    }

    return send(res, 404, { error: "Not found" });
  } catch (e) {
    console.error("IT Portal request error:", e);
    // Never call writeHead/send twice if this request already started a response.
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) {
      // Headers are already on the wire; finish the existing response safely.
      try { res.end(); } catch (endError) { res.destroy(); }
      return;
    }
    send(res, e && e.message === "too big" ? 413 : 400, {
      error: e && e.message === "too big" ? "Too much data" : "Bad request"
    });
  }
});

server.on("clientError", (err, socket) => {
  console.error("HTTP client error:", err.message);
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  else socket.destroy();
});
server.on("error", err => {
  console.error("IT Portal server error:", err);
});

server.listen(PORT, "0.0.0.0", () => console.log("IT Portal running on port " + PORT));

