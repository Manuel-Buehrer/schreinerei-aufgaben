/* Fenster-Aufmaß · Schwarzwald Schreinerei
   Fenster, Balkontüren, Hebe-Schiebe-Türen, Haustüren und gekoppelte Elemente aufmessen.
   Speichert in Supabase (Tabelle "aufmasse", Fotos im Speicher "aufmass-fotos"),
   ohne Eintrag in config.js im Vorschau-Modus (nur im Browser). */
(function () {
  "use strict";
  const CFG = window.SWS_CONFIG || {};
  const DEMO = !CFG.supabaseUrl || !CFG.supabaseKey || !window.supabase;
  const $ = id => document.getElementById(id);
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const nowIso = () => new Date().toISOString();
  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const fmtDate = s => s ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : "";
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const initials = n => (n || "?").trim().split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
  function lsGet(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  const num = v => { if (v === "" || v == null) return null; const n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Katalog ----------
  const TYPES = [
    { k: "fenster1", name: "Fenster 1-flg.", aspect: 0.85, grid: { cols: 1, rows: 1, cells: [["DK-R"]] } },
    { k: "fenster2", name: "Fenster 2-flg. Stulp", aspect: 1.25, grid: { cols: 2, rows: 1, cells: [["D-L", "DK-R"]], stulp: true } },
    { k: "fenster2p", name: "Fenster 2-flg. Pfosten", aspect: 1.25, grid: { cols: 2, rows: 1, cells: [["DK-L", "DK-R"]] } },
    { k: "fenster3", name: "Fenster 3-teilig", aspect: 1.9, grid: { cols: 3, rows: 1, cells: [["DK-L", "F", "DK-R"]] } },
    { k: "fensterOL", name: "Fenster mit Oberlicht", aspect: 0.75, grid: { cols: 1, rows: 2, cells: [["K"], ["DK-R"]], rowsRatio: [0.28] } },
    { k: "fest", name: "Festverglasung", aspect: 1, grid: { cols: 1, rows: 1, cells: [["F"]] } },
    { k: "btuer1", name: "Balkontür 1-flg.", aspect: 0.42, grid: { cols: 1, rows: 1, cells: [["DK-R"]] } },
    { k: "btuer2", name: "Balkontür 2-flg.", aspect: 0.72, grid: { cols: 2, rows: 1, cells: [["D-L", "DK-R"]], stulp: true } },
    { k: "hst", name: "Hebe-Schiebe-Tür", aspect: 1.45, grid: { cols: 2, rows: 1, cells: [["F", "S-L"]] } },
    { k: "haustuer", name: "Haustür", aspect: 0.45, door: true, grid: { cols: 1, rows: 1, cells: [["T-L"]] } },
    { k: "haustuerST", name: "Haustür + Seitenteil", aspect: 0.72, door: true, grid: { cols: 2, rows: 1, cells: [["F", "T-L"]], colsRatio: [0.36] } },
    { k: "haustuerOL", name: "Haustür + Oberlicht", aspect: 0.42, door: true, grid: { cols: 1, rows: 2, cells: [["F"], ["T-L"]], rowsRatio: [0.18] } },
    { k: "gekoppelt", name: "Gekoppeltes Element", aspect: 1.3, grid: { cols: 2, rows: 2, cells: [["F", "F"], ["DK-L", "DK-R"]], rowsRatio: [0.3] } },
    { k: "sonder", name: "Sonderform", aspect: 1, grid: { cols: 1, rows: 1, cells: [["F"]] } }
  ];
  const TYPE = Object.fromEntries(TYPES.map(t => [t.k, t]));
  const CELL = {
    "DK-L": "Dreh-Kipp, Band links", "DK-R": "Dreh-Kipp, Band rechts", "D-L": "Dreh, Band links", "D-R": "Dreh, Band rechts",
    "K": "Kipp", "F": "Festverglasung", "S-L": "Schiebe nach links", "S-R": "Schiebe nach rechts",
    "T-L": "Tür, Band links", "T-R": "Tür, Band rechts", "P": "Paneel / geschlossen"
  };
  const WIN_CELLS = ["DK-L", "DK-R", "D-L", "D-R", "K", "F", "S-L", "S-R", "P"];
  const DOOR_CELLS = ["T-L", "T-R", "F", "P", "DK-L", "DK-R", "K"];
  const EINBAU = [["laibung", "In Laibung"], ["anschlag_innen", "Innenanschlag"], ["anschlag_aussen", "Außenanschlag"], ["renovierung", "Renovierung auf Altrahmen"], ["sonstiges", "Sonstiges"]];
  const OPTS = [
    { f: "material", label: "Material", vals: ["Holz", "Holz-Alu", "Kunststoff", "Kunststoff-Alu", "Alu"] },
    { f: "farbeInnen", label: "Farbe innen", vals: ["Weiß", "Eiche natur", "Fichte/Kiefer", "Anthrazit"], free: true },
    { f: "farbeAussen", label: "Farbe außen", vals: ["Weiß", "Eiche natur", "Fichte/Kiefer", "Anthrazit"], free: true },
    { f: "verglasung", label: "Verglasung", vals: ["2-fach", "3-fach"] },
    { f: "glasExtra", label: "Glas-Extras", vals: ["Schallschutz", "VSG", "ESG", "Ornament/Milchglas", "Sonnenschutzglas"], multi: true },
    { f: "sprossen", label: "Sprossen", vals: ["keine", "aufgesetzt", "Wiener Sprosse", "glasteilend"] },
    { f: "griff", label: "Griff", vals: ["Standard", "abschließbar", "Kindersicherung"] },
    { f: "sonnenschutz", label: "Rollladen / Raffstore", vals: ["keiner", "Rollladen Vorbau", "Rollladen Aufsatz", "Raffstore", "vorhanden, bleibt"] },
    { f: "fbInnen", label: "Fensterbank innen", vals: ["keine", "neu", "bleibt"] },
    { f: "fbAussen", label: "Fensterbank außen", vals: ["keine", "neu", "bleibt"] },
    { f: "ausbau", label: "Altelement ausbauen", vals: ["ja", "nein"] },
    { f: "etage", label: "Etage", vals: ["UG", "EG", "OG", "DG"] },
    { f: "tuerRichtung", label: "Tür öffnet nach", vals: ["innen", "außen"], door: true },
    { f: "schloss", label: "Schloss", vals: ["Mehrfachverriegelung", "Automatik", "E-Öffner", "Fingerprint/Code"], door: true, multi: true },
    { f: "schwelle", label: "Schwelle", vals: ["Standard", "barrierefrei"], door: true },
    { f: "form", label: "Form", vals: ["Schräge links", "Schräge rechts", "Rundbogen", "Segmentbogen", "Dreieck"], sonder: true },
    { f: "bruestung", label: "Brüstungshöhe (mm)", numeric: true }
  ];
  const DEFAULT_SETTINGS = {
    toleranz: 5, zweiMasse: false,
    abzug: { laibung: { b: 0, h: 0 }, anschlag_innen: { b: 0, h: 0 }, anschlag_aussen: { b: 0, h: 0 }, renovierung: { b: 0, h: 0 }, sonstiges: { b: 0, h: 0 } }
  };

  // ---------- Speicher ----------
  function supaStore() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "sws-auth" } });
    const chk = r => { if (r.error) throw r.error; return r.data; };
    const urlCache = new Map();
    return {
      async hasSession() { const { data } = await sb.auth.getSession(); return !!data.session; },
      async login(code) { const r = await sb.auth.signInWithPassword({ email: CFG.teamEmail, password: code }); if (r.error) throw r.error; },
      async logout() { await sb.auth.signOut(); },
      async team() { return chk(await sb.from("team").select("*").order("sortierung")); },
      async list() { return chk(await sb.from("aufmasse").select("*").order("geaendert_am", { ascending: false }).limit(500)); },
      async get(id) { return chk(await sb.from("aufmasse").select("*").eq("id", id).single()); },
      async save(doc) { chk(await sb.from("aufmasse").upsert(doc)); },
      async remove(id) { chk(await sb.from("aufmasse").delete().eq("id", id)); },
      async settings() { const d = chk(await sb.from("einstellungen").select("wert").eq("schluessel", "aufmass")); return d[0] ? d[0].wert : null; },
      async saveSettings(w) { chk(await sb.from("einstellungen").upsert({ schluessel: "aufmass", wert: w })); },
      async uploadPhoto(path, blob) { chk(await sb.storage.from("aufmass-fotos").upload(path, blob, { contentType: "image/jpeg", upsert: true })); return { path }; },
      async photoUrl(f) {
        if (f.data) return f.data;
        const c = urlCache.get(f.path); if (c && c.until > Date.now()) return c.url;
        const r = await sb.storage.from("aufmass-fotos").createSignedUrl(f.path, 3600);
        if (r.error) throw r.error; urlCache.set(f.path, { url: r.data.signedUrl, until: Date.now() + 3e6 }); return r.data.signedUrl;
      },
      async removePhoto(f) { if (f.path) await sb.storage.from("aufmass-fotos").remove([f.path]); }
    };
  }
  function demoStore() {
    const K = "sws-aufmass-vorschau";
    let db = lsGet(K, null);
    if (!db) { db = { aufmasse: [demoAufmass()], settings: null, team: [{ name: "Manuel", sortierung: 1 }, { name: "Marco", sortierung: 2 }, { name: "Simon", sortierung: 3 }] }; lsSet(K, db); }
    const save = () => { if (!lsSet(K, db)) toast("Speicher im Vorschau-Modus voll – Fotos ggf. entfernen."); };
    return {
      async hasSession() { return true; }, async login() { }, async logout() { },
      async team() { return db.team; },
      async list() { return JSON.parse(JSON.stringify(db.aufmasse)).sort((a, b) => b.geaendert_am.localeCompare(a.geaendert_am)); },
      async get(id) { return JSON.parse(JSON.stringify(db.aufmasse.find(a => a.id === id))); },
      async save(doc) { const i = db.aufmasse.findIndex(a => a.id === doc.id); const c = JSON.parse(JSON.stringify(doc)); if (i < 0) db.aufmasse.push(c); else db.aufmasse[i] = c; save(); },
      async remove(id) { db.aufmasse = db.aufmasse.filter(a => a.id !== id); save(); },
      async settings() { return db.settings; },
      async saveSettings(w) { db.settings = w; save(); },
      async uploadPhoto(path, blob) { const data = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); }); return { data }; },
      async photoUrl(f) { return f.data || ""; },
      async removePhoto() { }
    };
  }
  function demoAufmass() {
    const p1 = newPos("fenster2", 1); Object.assign(p1, { raum: "Beispiel: Wohnzimmer", m: { B: "1230", H: "1385", B2: "", H2: "", teilB: [], teilH: [] } });
    Object.assign(p1.opt, { material: "Holz", farbeInnen: "Weiß", farbeAussen: "Weiß", verglasung: "3-fach", sonnenschutz: "Rollladen Vorbau", etage: "EG", ausbau: "ja" });
    const p2 = newPos("haustuerST", 2); Object.assign(p2, { raum: "Beispiel: Eingang", two: true, m: { B: "1520", B2: "1514", H: "2185", H2: "2190", teilB: [], teilH: [] } });
    Object.assign(p2.opt, { material: "Holz-Alu", farbeAussen: "Anthrazit", tuerRichtung: "innen", schloss: ["Mehrfachverriegelung", "E-Öffner"], ausbau: "ja", etage: "EG" });
    return { id: uuid(), kunde: "Beispiel Familie Muster", projekt: "Fenstertausch EG", adresse: "Musterweg 1, Freiamt", datum: today(),
      aufgemessen_von: "Manuel", notiz: "", positionen: [p1, p2], erstellt_am: nowIso(), erstellt_von: "Manuel", geaendert_am: nowIso() };
  }
  // ---------- Zustand ----------
  let me = lsGet("sws-ich", "");
  let team = [], settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), list = [], doc = null, posId = null;
  const store = DEMO ? demoStore() : supaStore();

  function newPos(typ, nr) {
    const t = TYPE[typ];
    return { id: uuid(), nr, raum: "", stk: 1, typ, grid: JSON.parse(JSON.stringify(t.grid)), two: !!settings.zweiMasse, showTeil: false,
      m: { B: "", H: "", B2: "", H2: "", teilB: [], teilH: [] }, einbau: "laibung", opt: {}, notiz: "", fotos: [] };
  }
  const curPos = () => doc && doc.positionen.find(p => p.id === posId);
  const isDoor = p => !!TYPE[p.typ].door;

  // Maße auswerten
  function calc(p) {
    const B1 = num(p.m.B), B2 = p.two ? num(p.m.B2) : null, H1 = num(p.m.H), H2 = p.two ? num(p.m.H2) : null;
    const bs = [B1, B2].filter(v => v != null), hs = [H1, H2].filter(v => v != null);
    const rohB = bs.length ? Math.min(...bs) : null, rohH = hs.length ? Math.min(...hs) : null;
    const a = (settings.abzug && settings.abzug[p.einbau]) || { b: 0, h: 0 };
    const warn = [];
    const tol = Number(settings.toleranz) || 5;
    if (p.two && B1 != null && B2 != null && Math.abs(B1 - B2) > tol) warn.push("Breite oben und unten weichen um " + Math.abs(B1 - B2) + " mm ab – Öffnung ist nicht parallel. Es wird mit dem kleineren Maß gerechnet.");
    if (p.two && H1 != null && H2 != null && Math.abs(H1 - H2) > tol) warn.push("Höhe links und rechts weichen um " + Math.abs(H1 - H2) + " mm ab – Öffnung ist schief. Es wird mit dem kleineren Maß gerechnet.");
    [["Breite", rohB], ["Höhe", rohH]].forEach(([n, v]) => { if (v != null && (v < 150 || v > 8000)) warn.push(n + " " + v + " mm wirkt unplausibel – bitte prüfen (Maße in mm)."); });
    const tb = (p.m.teilB || []).slice(0, p.grid.cols - 1).map(num).filter(v => v != null);
    const th = (p.m.teilH || []).slice(0, p.grid.rows - 1).map(num).filter(v => v != null);
    if (rohB != null && tb.length && tb.reduce((x, y) => x + y, 0) >= rohB) warn.push("Die Teilungsbreiten sind zusammen größer als die Gesamtbreite.");
    if (rohH != null && th.length && th.reduce((x, y) => x + y, 0) >= rohH) warn.push("Die Teilungshöhen sind zusammen größer als die Gesamthöhe.");
    return { rohB, rohH, abB: Number(a.b) || 0, abH: Number(a.h) || 0,
      bestB: rohB != null ? rohB - (Number(a.b) || 0) : null, bestH: rohH != null ? rohH - (Number(a.h) || 0) : null, warn };
  }

  // ---------- Skizze ----------
  function splits(total, n, given, ratio) {
    // given: Maße für die ersten n-1 Felder (mm, optional); ratio: Standard-Anteile
    const out = []; let rest = total, free = 0;
    for (let i = 0; i < n; i++) {
      const g = i < n - 1 ? num(given && given[i]) : null;
      if (g != null && g > 0) { out.push(g); rest -= g; } else { out.push(null); free++; }
    }
    if (ratio && !(given || []).some(v => num(v) != null)) {
      const used = ratio.reduce((a, b) => a + b, 0);
      return out.map((v, i) => total * (i < ratio.length ? ratio[i] : (1 - used) / (n - ratio.length)));
    }
    const each = free ? Math.max(rest, total * 0.1 * free) / free : 0;
    return out.map(v => v == null ? each : v);
  }
  function drawSketch(p, o) {
    o = Object.assign({ w: 320, h: 300, dims: true, interactive: false, mini: false }, o || {});
    const t = TYPE[p.typ], c = calc(p);
    let W = c.rohB || 1000 * t.aspect, H = c.rohH || 1000;
    if (c.rohB && !c.rohH) H = c.rohB / t.aspect; if (c.rohH && !c.rohB) W = c.rohH * t.aspect;
    if (W / H > 6) H = W / 6; if (H / W > 6) W = H / 6; // unfertige Eingaben (z. B. "1,1") nicht verzerren
    const padR = o.dims ? 34 : 2, padB = o.dims ? 30 : 2, padT = o.dims && p.showTeil && p.grid.cols > 1 ? 24 : 2, padL = o.dims && p.showTeil && p.grid.rows > 1 ? 24 : 2;
    const s = Math.min((o.w - padL - padR) / W, (o.h - padT - padB) / H);
    const fw = W * s, fh = H * s, x0 = padL + (o.w - padL - padR - fw) / 2, y0 = padT + (o.h - padT - padB - fh) / 2;
    const fr = Math.min(o.mini ? 2.5 : Math.max(5, Math.min(fw, fh) * 0.045), Math.min(fw, fh) / 5);
    const cw = splits(W, p.grid.cols, p.m.teilB, t.grid.colsRatio && p.grid.cols === t.grid.cols ? t.grid.colsRatio : null).map(v => v * s);
    const rh = splits(H, p.grid.rows, p.m.teilH, t.grid.rowsRatio && p.grid.rows === t.grid.rows ? t.grid.rowsRatio : null).map(v => v * s);
    const sw = o.mini ? 1 : 1.6;
    let svg = `<svg viewBox="0 0 ${o.w} ${o.h}" width="100%" height="100%" class="sk${o.mini ? " mini" : ""}" xmlns="http://www.w3.org/2000/svg">`;
    if (p.typ === "sonder" && !o.mini) svg += `<text x="${x0 + 4}" y="${y0 - 4 + (padT > 2 ? 0 : 12)}" class="sk-note">${esc(p.opt.form || "Sonderform")}</text>`;
    svg += `<rect x="${x0}" y="${y0}" width="${fw}" height="${fh}" class="sk-frame" stroke-width="${sw}"/>`;
    let yy = y0 + fr;
    const innerW = fw - 2 * fr, innerH = fh - 2 * fr;
    const scaleW = innerW / cw.reduce((a, b) => a + b, 0), scaleH = innerH / rh.reduce((a, b) => a + b, 0);
    const gap = o.mini ? 1.5 : (p.grid.stulp ? 1.5 : fr * 0.9);
    for (let r = 0; r < p.grid.rows; r++) {
      const ch = rh[r] * scaleH; let xx = x0 + fr;
      for (let col = 0; col < p.grid.cols; col++) {
        const cwid = cw[col] * scaleW;
        const gx = xx + (col > 0 ? gap / 2 : 0), gy = yy + (r > 0 ? fr * 0.45 : 0);
        const gw = cwid - (col > 0 ? gap / 2 : 0) - (col < p.grid.cols - 1 ? gap / 2 : 0), gh = ch - (r > 0 ? fr * 0.45 : 0) - (r < p.grid.rows - 1 ? fr * 0.45 : 0);
        const type = (p.grid.cells[r] || [])[col] || "F";
        svg += cellSvg(type, gx, gy, Math.max(1, gw), Math.max(1, gh), o, r, col, sw);
        xx += cwid;
      }
      yy += ch;
    }
    if (o.dims) {
      const by = y0 + fh + 16, rx = x0 + fw + 16;
      const bTxt = p.two && num(p.m.B) != null && num(p.m.B2) != null ? p.m.B + " / " + p.m.B2 : (c.rohB != null ? String(c.rohB) : "Breite ?");
      const hTxt = p.two && num(p.m.H) != null && num(p.m.H2) != null ? p.m.H + " / " + p.m.H2 : (c.rohH != null ? String(c.rohH) : "Höhe ?");
      svg += dimLine(x0, by, x0 + fw, by, bTxt, false, c.rohB == null);
      svg += dimLine(rx, y0, rx, y0 + fh, hTxt, true, c.rohH == null);
      if (p.showTeil && p.grid.cols > 1) {
        let xx = x0 + fr;
        cw.forEach((v, i) => { const w2 = v * scaleW; const g = num((p.m.teilB || [])[i]); svg += dimLine(xx, y0 - 12, xx + w2, y0 - 12, i < p.grid.cols - 1 ? (g != null ? String(g) : "?") : "Rest", false, g == null, true); xx += w2; });
      }
      if (p.showTeil && p.grid.rows > 1) {
        let y2 = y0 + fr;
        rh.forEach((v, i) => { const h2 = v * scaleH; const g = num((p.m.teilH || [])[i]); svg += dimLine(x0 - 12, y2, x0 - 12, y2 + h2, i < p.grid.rows - 1 ? (g != null ? String(g) : "?") : "Rest", true, g == null, true); y2 += h2; });
      }
    }
    return svg + "</svg>";
  }
  function dimLine(x1, y1, x2, y2, txt, vert, missing, small) {
    const cls = "sk-dim" + (missing ? " miss" : "") + (small ? " small" : "");
    let s = `<g class="${cls}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    if (vert) s += `<line x1="${x1 - 4}" y1="${y1}" x2="${x1 + 4}" y2="${y1}"/><line x1="${x1 - 4}" y1="${y2}" x2="${x1 + 4}" y2="${y2}"/>` +
      `<text x="${x1 + (small ? -4 : 5)}" y="${(y1 + y2) / 2}" transform="rotate(-90 ${x1 + (small ? -4 : 5)} ${(y1 + y2) / 2})" text-anchor="middle" dy="${small ? 0 : 9}">${esc(txt)}</text>`;
    else s += `<line x1="${x1}" y1="${y1 - 4}" x2="${x1}" y2="${y1 + 4}"/><line x1="${x2}" y1="${y1 - 4}" x2="${x2}" y2="${y1 + 4}"/>` +
      `<text x="${(x1 + x2) / 2}" y="${y1 + (small ? -3 : 12)}" text-anchor="middle">${esc(txt)}</text>`;
    return s + "</g>";
  }
  function cellSvg(type, x, y, w, h, o, r, c, sw) {
    const door = type[0] === "T" || type === "P";
    let s = `<g class="sk-cellg${o.interactive ? " sk-click" : ""}" data-r="${r}" data-c="${c}">`;
    s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${door ? "sk-door" : "sk-glass"}" stroke-width="${sw * 0.8}"/>`;
    const m = Math.min(w, h) * 0.06, X = x + m, Y = y + m, Wd = w - 2 * m, Hd = h - 2 * m;
    const L = `class="sk-sym" stroke-width="${sw * 0.9}"`, Ld = `class="sk-sym dash" stroke-width="${sw * 0.9}"`;
    const hingeL = /-L$/.test(type) && type[0] !== "S", hingeR = /-R$/.test(type) && type[0] !== "S";
    if (hingeL) s += `<polyline points="${X + Wd},${Y} ${X},${Y + Hd / 2} ${X + Wd},${Y + Hd}" fill="none" ${L}/>`;
    if (hingeR) s += `<polyline points="${X},${Y} ${X + Wd},${Y + Hd / 2} ${X},${Y + Hd}" fill="none" ${L}/>`;
    if (type === "K" || type.startsWith("DK")) s += `<polyline points="${X},${Y} ${X + Wd / 2},${Y + Hd} ${X + Wd},${Y}" fill="none" ${Ld}/>`;
    if (type === "F" && !o.mini) s += `<text x="${x + w / 2}" y="${y + h / 2}" class="sk-f" text-anchor="middle" dominant-baseline="central">F</text>`;
    if (type === "P" && !o.mini) s += `<text x="${x + w / 2}" y="${y + h / 2}" class="sk-f" text-anchor="middle" dominant-baseline="central">P</text>`;
    if (type === "S-L" || type === "S-R") {
      const ym = y + h / 2, a = x + w * 0.2, b = x + w * 0.8, tip = type === "S-L" ? a : b, back = type === "S-L" ? b : a, d = type === "S-L" ? 1 : -1, hs = Math.min(w, h) * 0.08;
      s += `<line x1="${back}" y1="${ym}" x2="${tip}" y2="${ym}" ${L}/><polyline points="${tip + d * hs},${ym - hs} ${tip},${ym} ${tip + d * hs},${ym + hs}" fill="none" ${L}/>`;
    }
    if (type[0] === "T" && !o.mini) { const hx = hingeL ? x + w - m * 2.2 : x + m * 2.2; s += `<line x1="${hx}" y1="${y + h * 0.48}" x2="${hx}" y2="${y + h * 0.56}" class="sk-handle" stroke-width="${sw * 2}"/>`; }
    return s + "</g>";
  }

  // ---------- Ansichten ----------
  function show(v) {
    ["loginView", "whoView", "listView", "editView", "protoView"].forEach(id => $(id).hidden = id !== v);
    const inApp = ["listView", "editView", "protoView"].includes(v);
    $("meBtn").hidden = !inApp; $("menuBtn").hidden = !inApp;
    document.body.classList.toggle("proto-mode", v === "protoView");
    if (v !== "editView") hideKeypad();
  }
  function status(msg) { $("status").textContent = msg || ""; $("status").hidden = !msg; }
  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3000); }

  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault(); $("loginMsg").textContent = ""; $("loginBtn").disabled = true;
    try { await store.login($("teamCode").value); $("teamCode").value = ""; await start(); }
    catch (err) {
      const wrong = err && (err.status === 400 || /invalid login/i.test(err.message || ""));
      $("loginMsg").textContent = wrong ? "Der Team-Code stimmt nicht." : (navigator.onLine ? "Anmelden hat gerade nicht geklappt – bitte nochmal versuchen." : "Keine Internetverbindung.");
    }
    $("loginBtn").disabled = false;
  });
  function showWho() {
    show("whoView"); const b = $("whoList"); b.innerHTML = "";
    team.forEach(p => { const x = el("button", "", p.name); x.type = "button"; x.onclick = () => setMe(p.name); b.appendChild(x); });
  }
  $("whoForm").addEventListener("submit", e => { e.preventDefault(); const n = $("whoInput").value.trim(); if (n) setMe(n); });
  function setMe(n) { me = n; lsSet("sws-ich", n); $("meName").textContent = n; $("meDot").textContent = initials(n); openList(); }

  async function start() {
    if (DEMO) status("Vorschau-Modus: Beispieldaten, nur auf diesem Gerät gespeichert.");
    if (!(await store.hasSession())) { show("loginView"); setTimeout(() => $("teamCode").focus(), 50); return; }
    try {
      team = await store.team();
      const s = await store.settings(); if (s) settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s, { abzug: Object.assign({}, DEFAULT_SETTINGS.abzug, s.abzug || {}) });
    } catch (e) { console.error(e); if (/JWT|auth|401/i.test(String(e.message || ""))) { show("loginView"); return; } status("Daten können gerade nicht geladen werden – Verbindung prüfen."); }
    $("meName").textContent = me; $("meDot").textContent = initials(me);
    if (!me) showWho(); else openList();
  }

  // ---------- Liste ----------
  async function openList() {
    await flushSave();
    doc = null; posId = null; $("topTitle").textContent = "Aufmaß"; show("listView");
    try { list = await store.list(); } catch (e) { console.error(e); status("Aufmaße können gerade nicht geladen werden."); list = []; }
    renderList();
  }
  function renderList() {
    const q = ($("search").value || "").toLowerCase(), box = $("amList"); box.innerHTML = "";
    const items = list.filter(a => !q || ((a.kunde || "") + " " + (a.projekt || "") + " " + (a.adresse || "")).toLowerCase().includes(q));
    if (!items.length) { const e = el("div", "empty"); e.appendChild(el("b", "", q ? "Nichts gefunden" : "Noch kein Aufmaß")); e.appendChild(document.createTextNode(q ? "Anderen Suchbegriff probieren." : "Mit „+ Neues Aufmaß“ starten.")); box.appendChild(e); return; }
    items.forEach(a => {
      const c = el("article", "am-card"); c.tabIndex = 0; c.setAttribute("role", "button");
      const thumbs = el("div", "am-thumbs");
      (a.positionen || []).slice(0, 4).forEach(p => { const d = el("div", "am-thumb"); d.innerHTML = drawSketch(p, { w: 60, h: 52, dims: false, mini: true }); thumbs.appendChild(d); });
      const main = el("div", "am-main");
      main.appendChild(el("div", "am-title", a.kunde || "Ohne Kunde"));
      main.appendChild(el("div", "am-sub", [a.projekt, a.adresse].filter(Boolean).join(" · ")));
      const n = (a.positionen || []).reduce((s, p) => s + (Number(p.stk) || 1), 0);
      main.appendChild(el("div", "am-meta", (a.positionen || []).length + " Positionen · " + n + " Elemente · " + fmtDate(a.datum) + (a.aufgemessen_von ? " · " + a.aufgemessen_von : "")));
      c.appendChild(thumbs); c.appendChild(main);
      const del = el("button", "btn danger small", "Löschen"); del.type = "button"; let armed = false;
      del.onclick = async ev => {
        ev.stopPropagation();
        if (!armed) { armed = true; del.textContent = "Wirklich löschen?"; del.classList.add("confirm"); setTimeout(() => { armed = false; del.textContent = "Löschen"; del.classList.remove("confirm"); }, 4000); return; }
        try { for (const p of a.positionen || []) for (const f of p.fotos || []) await store.removePhoto(f).catch(() => { }); await store.remove(a.id); list = list.filter(x => x.id !== a.id); renderList(); toast("Aufmaß gelöscht"); }
        catch (e) { toast("Löschen hat nicht geklappt."); }
      };
      c.appendChild(del);
      c.onclick = () => openDoc(a.id);
      c.onkeydown = e => { if (e.key === "Enter") openDoc(a.id); };
      box.appendChild(c);
    });
  }
  $("search").oninput = renderList;
  $("newBtn").onclick = async () => {
    doc = { id: uuid(), kunde: "", projekt: "", adresse: "", datum: today(), aufgemessen_von: me, notiz: "", positionen: [], erstellt_am: nowIso(), erstellt_von: me, geaendert_am: nowIso() };
    posId = null; showEditor(); setTimeout(() => $("hKunde").focus(), 50);
  };
  async function openDoc(id) {
    try { doc = await store.get(id); } catch (e) { toast("Aufmaß konnte nicht geladen werden."); return; }
    if (!doc) return;
    doc.positionen = doc.positionen || [];
    posId = doc.positionen[0] ? doc.positionen[0].id : null; showEditor();
  }

  // ---------- Speichern ----------
  let saveT = null, saving = Promise.resolve(), dirty = false;
  function changed() {
    if (!doc) return; dirty = true; doc.geaendert_am = nowIso(); $("saved").textContent = "…";
    clearTimeout(saveT); saveT = setTimeout(flushSave, 800);
  }
  function flushSave() {
    clearTimeout(saveT);
    if (!dirty || !doc) return saving;
    dirty = false; const snapshot = JSON.parse(JSON.stringify(doc));
    saving = saving.then(() => store.save(snapshot)).then(() => { $("saved").textContent = "Gespeichert ✓"; setTimeout(() => { if ($("saved").textContent === "Gespeichert ✓") $("saved").textContent = ""; }, 2500); })
      .catch(e => { console.error(e); dirty = true; $("saved").textContent = "Nicht gespeichert!"; toast(navigator.onLine ? "Speichern fehlgeschlagen – wird erneut versucht." : "Offline – wird gespeichert, sobald wieder Netz da ist."); clearTimeout(saveT); saveT = setTimeout(flushSave, 5000); });
    return saving;
  }
  window.addEventListener("online", () => { status(DEMO ? "Vorschau-Modus: Beispieldaten, nur auf diesem Gerät gespeichert." : ""); flushSave(); });
  window.addEventListener("offline", () => status("Offline – Eingaben bleiben auf dem Gerät, bis wieder Netz da ist. Seite nicht schließen."));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
  window.addEventListener("beforeunload", e => { if (dirty) { flushSave(); e.preventDefault(); e.returnValue = ""; } });

  // ---------- Editor ----------
  function showEditor() {
    show("editView"); $("topTitle").textContent = "Aufmaß";
    ["kunde", "projekt", "adresse", "datum", "aufgemessen_von"].forEach(f => { const i = document.querySelector('[data-h="' + f + '"]'); i.value = doc[f] || ""; });
    renderPosList(); renderPos();
  }
  $("headForm").addEventListener("input", e => { const f = e.target.dataset.h; if (!f) return; doc[f] = e.target.value; if (f === "kunde") renderPosList(); changed(); });
  $("backBtn").onclick = () => openList();

  function renderPosList() {
    const ol = $("posList"); ol.innerHTML = "";
    $("posCount").textContent = doc.positionen.length || "";
    doc.positionen.forEach(p => {
      const li = el("li", "pos-item" + (p.id === posId ? " on" : "")); li.tabIndex = 0;
      const th = el("div", "pos-thumb"); th.innerHTML = drawSketch(p, { w: 54, h: 46, dims: false, mini: true }); li.appendChild(th);
      const t = el("div", "pos-txt"); const c = calc(p);
      t.appendChild(el("b", "", p.nr + (p.raum ? " · " + p.raum : "")));
      t.appendChild(el("span", "", TYPE[p.typ].name + (Number(p.stk) > 1 ? " · " + p.stk + " Stk." : "")));
      t.appendChild(el("span", c.rohB && c.rohH ? "" : "miss", c.rohB && c.rohH ? c.rohB + " × " + c.rohH : "Maße fehlen"));
      li.appendChild(t);
      li.onclick = () => { posId = p.id; renderPosList(); renderPos(); if (window.innerWidth < 900) $("posEditor").scrollIntoView({ behavior: "smooth" }); };
      li.onkeydown = e => { if (e.key === "Enter") li.onclick(); };
      ol.appendChild(li);
    });
  }
  function addPos(typ) {
    const last = doc.positionen[doc.positionen.length - 1];
    const p = newPos(typ || (last ? last.typ : "fenster1"), doc.positionen.length ? Math.max(...doc.positionen.map(x => Number(x.nr) || 0)) + 1 : 1);
    if (last) { p.einbau = last.einbau; p.two = last.two; ["material", "farbeInnen", "farbeAussen", "verglasung", "sprossen", "etage", "ausbau"].forEach(k => { if (last.opt[k]) p.opt[k] = last.opt[k]; }); }
    doc.positionen.push(p); posId = p.id; changed(); renderPosList(); renderPos();
    setTimeout(() => $("pRaum").focus(), 50);
  }
  $("addPosBtn").onclick = () => addPos();
  $("nextPos").onclick = () => addPos();
  $("dupPos").onclick = () => {
    const p = curPos(); if (!p) return;
    const c = JSON.parse(JSON.stringify(p)); c.id = uuid(); c.nr = Math.max(...doc.positionen.map(x => Number(x.nr) || 0)) + 1; c.fotos = [];
    doc.positionen.push(c); posId = c.id; changed(); renderPosList(); renderPos(); toast("Position kopiert – Maße prüfen");
  };
  let delArmed = false;
  $("delPos").onclick = () => {
    const p = curPos(); if (!p) return;
    if (!delArmed) { delArmed = true; $("delPos").textContent = "Wirklich löschen?"; $("delPos").classList.add("confirm"); setTimeout(() => { delArmed = false; $("delPos").textContent = "Löschen"; $("delPos").classList.remove("confirm"); }, 4000); return; }
    delArmed = false; $("delPos").textContent = "Löschen"; $("delPos").classList.remove("confirm");
    (p.fotos || []).forEach(f => store.removePhoto(f).catch(() => { }));
    const i = doc.positionen.indexOf(p); doc.positionen.splice(i, 1);
    posId = doc.positionen[Math.max(0, i - 1)] ? doc.positionen[Math.max(0, i - 1)].id : null;
    changed(); renderPosList(); renderPos();
  };

  function renderPos() {
    const p = curPos();
    $("noPos").hidden = !!p; $("posForm").hidden = !p;
    if (!p) return;
    $("pNr").textContent = "Pos. " + p.nr;
    $("pRaum").value = p.raum || ""; $("pStk").value = p.stk || 1; $("pNotiz").value = p.notiz || "";
    $("twoMeas").checked = !!p.two; $("showTeil").checked = !!p.showTeil;
    // Typen
    const tg = $("typeGrid"); tg.innerHTML = "";
    TYPES.forEach(t => {
      const b = el("button", "type" + (p.typ === t.k ? " on" : "")); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", p.typ === t.k);
      const pv = { typ: t.k, grid: t.grid, m: {}, two: false, opt: {} };
      const ic = el("span", "type-ic"); ic.innerHTML = drawSketch(pv, { w: 64, h: 54, dims: false, mini: true }); b.appendChild(ic);
      b.appendChild(el("span", "type-n", t.name));
      b.onclick = () => setType(t.k); tg.appendChild(b);
    });
    // Raster
    $("gridTools").hidden = false;
    fillNum($("gCols"), 1, 6, p.grid.cols); fillNum($("gRows"), 1, 4, p.grid.rows);
    $("gStulp").checked = !!p.grid.stulp; $("gStulp").parentElement.hidden = p.grid.cols < 2;
    renderMeasure(); renderEinbau(); renderOpts(); renderPhotos();
  }
  function fillNum(sel, a, b, v) { sel.innerHTML = ""; for (let i = a; i <= b; i++) { const o = el("option", "", String(i)); o.value = i; sel.appendChild(o); } sel.value = v; }
  function setType(k) {
    const p = curPos(); if (!p || p.typ === k) return;
    p.typ = k; p.grid = JSON.parse(JSON.stringify(TYPE[k].grid)); p.m.teilB = []; p.m.teilH = [];
    changed(); renderPosList(); renderPos();
  }
  $("gCols").onchange = e => resizeGrid(Number(e.target.value), null);
  $("gRows").onchange = e => resizeGrid(null, Number(e.target.value));
  $("gStulp").onchange = e => { const p = curPos(); p.grid.stulp = e.target.checked; changed(); renderMeasure(); renderPosList(); };
  function resizeGrid(cols, rows) {
    const p = curPos(); cols = cols || p.grid.cols; rows = rows || p.grid.rows;
    const cells = [];
    for (let r = 0; r < rows; r++) { cells.push([]); for (let c = 0; c < cols; c++) cells[r].push((p.grid.cells[r] && p.grid.cells[r][c]) || "F"); }
    p.grid = { cols, rows, cells, stulp: cols > 1 && p.grid.stulp, colsRatio: undefined };
    p.m.teilB = (p.m.teilB || []).slice(0, cols - 1); p.m.teilH = (p.m.teilH || []).slice(0, rows - 1);
    changed(); renderPos(); renderPosList();
  }
  $("pRaum").addEventListener("input", e => { curPos().raum = e.target.value; changed(); renderPosListSoon(); });
  $("pStk").addEventListener("input", e => { curPos().stk = Math.max(1, parseInt(e.target.value, 10) || 1); changed(); renderPosListSoon(); });
  $("pNotiz").addEventListener("input", e => { curPos().notiz = e.target.value; changed(); });
  $("twoMeas").onchange = e => { const p = curPos(); p.two = e.target.checked; changed(); renderMeasure(); renderPosList(); };
  $("showTeil").onchange = e => { const p = curPos(); p.showTeil = e.target.checked; changed(); renderMeasure(); };
  let plT; function renderPosListSoon() { clearTimeout(plT); plT = setTimeout(renderPosList, 300); }

  // Maße: Felder an der Skizze
  function mfield(key, label, idx) {
    const p = curPos();
    const w = el("label", "mf"); w.appendChild(el("span", "mf-l", label));
    const i = el("input", "mfield"); i.inputMode = "none"; i.autocomplete = "off"; i.dataset.key = key; if (idx != null) i.dataset.idx = idx;
    i.dataset.label = label; i.placeholder = "mm"; i.id = "m-" + key + (idx != null ? idx : "");
    const v = idx != null ? (p.m[key] || [])[idx] : p.m[key]; i.value = v == null ? "" : v;
    w.appendChild(i); return w;
  }
  function renderMeasure() {
    const p = curPos();
    ["mTop", "mLeft", "mRight", "mBottom"].forEach(id => $(id).innerHTML = "");
    if (p.two) {
      $("mTop").appendChild(mfield("B", "Breite oben"));
      $("mBottom").appendChild(mfield("B2", "Breite unten"));
      $("mLeft").appendChild(mfield("H", "Höhe links"));
      $("mRight").appendChild(mfield("H2", "Höhe rechts"));
    } else {
      $("mBottom").appendChild(mfield("B", "Breite"));
      $("mRight").appendChild(mfield("H", "Höhe"));
    }
    if (p.showTeil) {
      for (let i = 0; i < p.grid.cols - 1; i++) $("mTop").appendChild(mfield("teilB", "Feld " + (i + 1) + " breit", i));
      for (let i = 0; i < p.grid.rows - 1; i++) $("mLeft").appendChild(mfield("teilH", "Reihe " + (i + 1) + " hoch", i));
      if (p.grid.cols < 2 && p.grid.rows < 2) $("mTop").appendChild(el("span", "muted small-note", "Keine Teilung – unter „Felder“ Spalten/Reihen erhöhen."));
    }
    renderSketch();
  }
  function renderSketch() {
    const p = curPos(); if (!p) return;
    const wrap = $("sketch"), box = $("measure");
    // Skizze so groß wie das Element, damit die Maßfelder direkt an den Maßlinien sitzen
    const t = TYPE[p.typ], c0 = calc(p);
    let W = c0.rohB || 1000 * t.aspect, H = c0.rohH || 1000;
    if (c0.rohB && !c0.rohH) H = c0.rohB / t.aspect; if (c0.rohH && !c0.rohB) W = c0.rohH * t.aspect;
    const asp = Math.max(1 / 6, Math.min(6, W / H));
    const side = window.innerWidth < 640 ? 24 : 300;
    const availW = Math.max(200, (box.clientWidth || 600) - side), maxH = window.innerWidth < 640 ? 260 : 330;
    const extraW = 40, extraH = 34 + (p.showTeil && p.grid.cols > 1 ? 24 : 0);
    let w = Math.min(availW, maxH * asp + extraW + (p.showTeil && p.grid.rows > 1 ? 24 : 0));
    let h = Math.min(maxH + extraH, (w - extraW) / asp + extraH);
    w = Math.max(160, Math.round(w)); h = Math.max(150, Math.round(h));
    wrap.style.width = w + "px"; wrap.style.height = h + "px";
    wrap.innerHTML = drawSketch(p, { w, h, dims: true, interactive: true });
    const c = calc(p);
    const res = $("result"); res.innerHTML = "";
    const row = (k, v, cls) => { const d = el("div", "res-row " + (cls || "")); d.appendChild(el("span", "", k)); d.appendChild(el("b", "", v)); res.appendChild(d); };
    row("Rohbau-/Lichtmaß", c.rohB != null && c.rohH != null ? c.rohB + " × " + c.rohH + " mm" : "–");
    const einb = (EINBAU.find(e => e[0] === p.einbau) || ["", ""])[1];
    row("Abzug (" + einb + ")", "B −" + c.abB + " · H −" + c.abH + " mm", "sub");
    row("Bestellmaß", c.bestB != null && c.bestH != null ? c.bestB + " × " + c.bestH + " mm" : "–", "best");
    if (!c.abB && !c.abH) { const n = el("div", "res-note", "Für diese Einbausituation ist noch kein Abzug hinterlegt (Menü → Einstellungen)."); res.appendChild(n); }
    const wb = $("measWarn"); wb.hidden = !c.warn.length; wb.innerHTML = ""; c.warn.forEach(x => wb.appendChild(el("div", "", "⚠ " + x)));
  }
  window.addEventListener("resize", () => { if (!$("editView").hidden && curPos()) renderSketch(); });

  // Öffnungsart pro Feld
  let cellTarget = null;
  $("sketch").addEventListener("click", e => {
    const g = e.target.closest(".sk-click"); if (!g) return;
    cellTarget = [Number(g.dataset.r), Number(g.dataset.c)];
    const p = curPos(), list2 = isDoor(p) ? DOOR_CELLS : WIN_CELLS, box = $("cellTypes"); box.innerHTML = "";
    list2.forEach(k => {
      const b = el("button", "cell-t" + (p.grid.cells[cellTarget[0]][cellTarget[1]] === k ? " on" : "")); b.type = "button";
      const ic = el("span", "cell-ic"); ic.innerHTML = `<svg viewBox="0 0 60 70" class="sk">${cellSvg(k, 4, 4, 52, 62, { mini: false }, 0, 0, 1.6)}</svg>`;
      b.appendChild(ic); b.appendChild(el("span", "", CELL[k]));
      b.onclick = () => { p.grid.cells[cellTarget[0]][cellTarget[1]] = k; $("cellModal").hidden = true; changed(); renderSketch(); renderPosList(); };
      box.appendChild(b);
    });
    $("cellModal").hidden = false;
  });
  $("cellClose").onclick = () => $("cellModal").hidden = true;

  // Einbau + Ausführung
  function renderEinbau() {
    const p = curPos(), box = document.querySelector('.chipsel[data-f="einbau"]'); box.innerHTML = "";
    EINBAU.forEach(([k, n]) => { const b = el("button", "chip" + (p.einbau === k ? " on" : ""), n); b.type = "button"; b.onclick = () => { p.einbau = k; changed(); renderEinbau(); renderSketch(); }; box.appendChild(b); });
  }
  function renderOpts() {
    const p = curPos(), box = $("optsBox"); box.innerHTML = "";
    OPTS.forEach(o => {
      if (o.door && !isDoor(p)) return;
      if (o.sonder && p.typ !== "sonder") return;
      const row = el("div", "opt"); row.appendChild(el("div", "opt-l", o.label));
      const vals = el("div", "opt-v");
      if (o.numeric) {
        const i = el("input", "mfield opt-num"); i.inputMode = "none"; i.dataset.key = "opt:" + o.f; i.dataset.label = o.label; i.placeholder = "mm"; i.id = "m-opt-" + o.f;
        i.value = p.opt[o.f] || ""; vals.appendChild(i);
      } else {
        o.vals.forEach(v => {
          const on = o.multi ? (p.opt[o.f] || []).includes(v) : p.opt[o.f] === v;
          const b = el("button", "chip" + (on ? " on" : ""), v); b.type = "button";
          b.onclick = () => {
            if (o.multi) { const a = (p.opt[o.f] || []).slice(); const i = a.indexOf(v); if (i < 0) a.push(v); else a.splice(i, 1); p.opt[o.f] = a; }
            else p.opt[o.f] = p.opt[o.f] === v ? "" : v;
            changed(); renderOpts(); if (o.f === "form") renderSketch();
          };
          vals.appendChild(b);
        });
        if (o.free) {
          const custom = p.opt[o.f] && !o.vals.includes(p.opt[o.f]) ? p.opt[o.f] : "";
          const i = el("input", "opt-free"); i.placeholder = "andere …"; i.value = custom; i.setAttribute("aria-label", o.label + " frei");
          i.addEventListener("change", () => { p.opt[o.f] = i.value.trim(); changed(); renderOpts(); });
          vals.appendChild(i);
        }
      }
      row.appendChild(vals); box.appendChild(row);
    });
  }

  // Fotos
  async function renderPhotos() {
    const p = curPos(), box = $("photos"); box.innerHTML = "";
    for (const f of p.fotos || []) {
      const d = el("div", "photo"); const img = el("img"); img.alt = "Foto Position " + p.nr; d.appendChild(img);
      const x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Foto löschen");
      x.onclick = () => { p.fotos = p.fotos.filter(y => y !== f); store.removePhoto(f).catch(() => { }); changed(); renderPhotos(); };
      d.appendChild(x); box.appendChild(d);
      store.photoUrl(f).then(u => { img.src = u; }).catch(() => { img.alt = "Foto nicht ladbar"; });
    }
  }
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const m = 1600, k = Math.min(1, m / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error("Bild")), "image/jpeg", DEMO ? 0.6 : 0.82);
      };
      img.onerror = rej; img.src = url;
    });
  }
  $("photoIn").addEventListener("change", async e => {
    const p = curPos(); const files = [...e.target.files]; e.target.value = "";
    for (const f of files) {
      try {
        const blob = await shrink(f);
        const ref = await store.uploadPhoto(doc.id + "/" + p.id + "/" + uuid() + ".jpg", blob);
        p.fotos = (p.fotos || []).concat([ref]); changed(); renderPhotos();
      } catch (err) { console.error(err); toast("Foto konnte nicht gespeichert werden."); }
    }
  });

  // ---------- Ziffernblock & Laser ----------
  let kpInput = null;
  function seq() { return [...document.querySelectorAll("#measure .mfield")].sort((a, b) => order(a) - order(b)); }
  function order(i) { const k = i.dataset.key; return { B: 1, B2: 2, H: 3, H2: 4, teilB: 5, teilH: 6 }[k] * 10 + (Number(i.dataset.idx) || 0); }
  function showKeypad(i) { kpInput = i; $("keypad").hidden = false; if (window.innerWidth < 640) setTimeout(() => i.scrollIntoView({ block: "center", behavior: "smooth" }), 60); $("kpLabel").textContent = i.dataset.label; $("kpVal").textContent = i.value ? i.value + " mm" : ""; document.body.classList.add("kp-open"); }
  function hideKeypad() { kpInput = null; $("keypad").hidden = true; document.body.classList.remove("kp-open"); }
  document.addEventListener("focusin", e => { if (e.target.classList && e.target.classList.contains("mfield")) showKeypad(e.target); });
  document.addEventListener("focusout", e => {
    if (e.target.classList && e.target.classList.contains("mfield")) {
      commit(e.target);
      setTimeout(() => { if (!document.activeElement || !document.activeElement.classList.contains("mfield")) hideKeypad(); }, 120);
    }
  });
  $("keypad").addEventListener("pointerdown", e => e.preventDefault()); // Fokus bleibt im Feld
  $("keypad").addEventListener("click", e => {
    const b = e.target.closest("[data-k]"); if (!b || !kpInput) return;
    const k = b.dataset.k, i = kpInput;
    if (/^\d$/.test(k)) { if (i.value.length < 6) i.value += k; }
    else if (k === "B") i.value = i.value.slice(0, -1);
    else if (k === "C") i.value = "";
    else if (k === "N") { next(i); return; }
    else if (k === "X") { commit(i); i.blur(); hideKeypad(); return; }
    i.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("input", e => {
    const i = e.target; if (!i.classList || !i.classList.contains("mfield")) return;
    i.value = i.value.replace(/[^\d.,]/g, "");
    store_(i, i.value); $("kpVal").textContent = i.value ? i.value + " mm" : "";
  });
  document.addEventListener("keydown", e => {
    const i = e.target;
    if (i.classList && i.classList.contains("mfield") && (e.key === "Enter" || e.key === "Tab" && !e.shiftKey && i.closest("#measure"))) { e.preventDefault(); next(i); }
    if (e.key === "Escape") { if (!$("cellModal").hidden) $("cellModal").hidden = true; else if (!$("menuModal").hidden) $("menuModal").hidden = true; }
  });
  // Laser liefert oft Meter mit Komma/Punkt ("1,234") → in mm umrechnen
  function commit(i) {
    const v = i.value.trim(); if (!v) return;
    if (/[.,]/.test(v)) { const n = num(v); if (n != null) { i.value = String(n < 20 ? Math.round(n * 1000) : Math.round(n)); store_(i, i.value); } }
  }
  function store_(i, v) {
    const p = curPos(); if (!p) return;
    const k = i.dataset.key;
    if (k.startsWith("opt:")) p.opt[k.slice(4)] = v;
    else if (i.dataset.idx != null) { const a = (p.m[k] || []).slice(); a[Number(i.dataset.idx)] = v; p.m[k] = a; }
    else p.m[k] = v;
    changed(); if (!k.startsWith("opt:")) { renderSketch(); renderPosListSoon(); }
  }
  function next(i) {
    commit(i);
    const s = seq(), at = s.indexOf(i);
    if (at >= 0 && at < s.length - 1) { s[at + 1].focus(); }
    else { i.blur(); hideKeypad(); const c = calc(curPos()); if (c.rohB && c.rohH) toast("Maße komplett: " + c.rohB + " × " + c.rohH + " mm"); }
  }

  // ---------- Protokoll ----------
  function optText(p) {
    const parts = [];
    OPTS.forEach(o => { if (o.door && !isDoor(p)) return; if (o.sonder && p.typ !== "sonder") return; const v = p.opt[o.f]; if (v == null || v === "" || (Array.isArray(v) && !v.length)) return; parts.push([o.label, Array.isArray(v) ? v.join(", ") : v + (o.numeric ? " mm" : "")]); });
    return parts;
  }
  function cellsText(p) {
    const rows = p.grid.cells.map(r => r.map(k => CELL[k] || k).join(" | "));
    return rows.join(" / ") + (p.grid.cols > 1 ? (p.grid.stulp ? " (Stulp)" : " (Pfosten)") : "");
  }
  $("protoBtn").onclick = async () => { await flushSave(); renderProto(); show("protoView"); window.scrollTo(0, 0); };
  $("protoBack").onclick = () => showEditor();
  $("printBtn").onclick = () => window.print();
  async function renderProto() {
    const pr = $("proto"); pr.innerHTML = "";
    const head = el("div", "pr-band"); const lg = el("img"); lg.src = "../logo.jpg"; lg.alt = "Schwarzwald Schreinerei"; head.appendChild(lg);
    const ht = el("div", "pr-title"); ht.appendChild(el("b", "", "AUFMASSPROTOKOLL")); ht.appendChild(el("span", "", "Fenster · Türen · Elemente")); head.appendChild(ht);
    pr.appendChild(head);
    const info = el("div", "pr-info");
    [["Kunde", doc.kunde], ["Bauvorhaben", doc.projekt], ["Adresse", doc.adresse], ["Datum", fmtDate(doc.datum)], ["Aufgemessen von", doc.aufgemessen_von]]
      .forEach(([k, v]) => { const d = el("div"); d.appendChild(el("span", "", k)); d.appendChild(el("b", "", v || "–")); info.appendChild(d); });
    pr.appendChild(info);
    // Übersicht
    const tb = el("table", "pr-table"); const thr = el("tr");
    ["Pos.", "Stk.", "Raum", "Element", "Rohbaumaß B × H", "Bestellmaß B × H", "Einbau"].forEach(h => thr.appendChild(el("th", "", h)));
    const thead = el("thead"); thead.appendChild(thr); tb.appendChild(thead); const tbody = el("tbody");
    doc.positionen.forEach(p => {
      const c = calc(p), tr = el("tr");
      [p.nr, p.stk, p.raum || "–", TYPE[p.typ].name, c.rohB && c.rohH ? c.rohB + " × " + c.rohH : "fehlt", c.bestB && c.bestH ? c.bestB + " × " + c.bestH : "–",
        (EINBAU.find(e => e[0] === p.einbau) || ["", ""])[1]].forEach((v, i) => tr.appendChild(el("td", i === 5 ? "best" : "", String(v))));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody); pr.appendChild(tb);
    const total = doc.positionen.reduce((s, p) => s + (Number(p.stk) || 1), 0);
    pr.appendChild(el("p", "pr-sum", doc.positionen.length + " Positionen · " + total + " Elemente · Maße in mm · Ansicht der Skizzen von innen · Bestellmaß = kleinstes Rohbaumaß abzüglich Einbaufuge laut Einstellungen"));
    // Positionen
    for (const p of doc.positionen) {
      const c = calc(p), blk = el("section", "pr-pos");
      const h = el("h3", "", "Pos. " + p.nr + (p.raum ? " · " + p.raum : "") + " – " + TYPE[p.typ].name + (Number(p.stk) > 1 ? " · " + p.stk + " Stück" : ""));
      blk.appendChild(h);
      const row = el("div", "pr-row"); const sk = el("div", "pr-sketch"); sk.innerHTML = drawSketch(p, { w: 300, h: 260, dims: true }); row.appendChild(sk);
      const dl = el("dl", "pr-dl");
      const add = (k, v) => { if (!v) return; dl.appendChild(el("dt", "", k)); dl.appendChild(el("dd", "", v)); };
      add("Rohbau-/Lichtmaß", c.rohB && c.rohH ? c.rohB + " × " + c.rohH + " mm" : "fehlt");
      if (p.two) add("Einzelmaße", "B oben " + (p.m.B || "–") + " · B unten " + (p.m.B2 || "–") + " · H links " + (p.m.H || "–") + " · H rechts " + (p.m.H2 || "–"));
      add("Einbau", (EINBAU.find(e => e[0] === p.einbau) || ["", ""])[1] + " (Abzug B " + c.abB + " / H " + c.abH + " mm)");
      add("Bestellmaß", c.bestB && c.bestH ? c.bestB + " × " + c.bestH + " mm" : "–");
      add("Felder / Öffnung", cellsText(p));
      const tB = (p.m.teilB || []).filter(v => num(v) != null), tH = (p.m.teilH || []).filter(v => num(v) != null);
      if (tB.length || tH.length) add("Teilungen", (tB.length ? "Breiten " + tB.join(" / ") : "") + (tB.length && tH.length ? " · " : "") + (tH.length ? "Höhen " + tH.join(" / ") : ""));
      optText(p).forEach(([k, v]) => add(k, v));
      add("Notiz", p.notiz);
      c.warn.forEach(w => add("Hinweis", w));
      row.appendChild(dl); blk.appendChild(row);
      if ((p.fotos || []).length) {
        const ph = el("div", "pr-photos");
        for (const f of p.fotos) { const img = el("img"); img.alt = "Foto"; ph.appendChild(img); store.photoUrl(f).then(u => img.src = u).catch(() => { }); }
        blk.appendChild(ph);
      }
      pr.appendChild(blk);
    }
    pr.appendChild(el("p", "pr-foot", "Schwarzwald Schreinerei · Aufmaßprotokoll · erstellt " + new Date().toLocaleDateString("de-DE")));
  }

  // ---------- Bestellliste CSV ----------
  $("csvBtn").onclick = () => {
    const cols = ["Pos", "Stück", "Raum", "Element", "Felder/Öffnung (von innen)", "Rohmaß B", "Rohmaß H", "Bestellmaß B", "Bestellmaß H", "Einbau",
      ...OPTS.map(o => o.label), "Notiz"];
    const rows = doc.positionen.map(p => {
      const c = calc(p);
      return [p.nr, p.stk, p.raum, TYPE[p.typ].name, cellsText(p), c.rohB, c.rohH, c.bestB, c.bestH, (EINBAU.find(e => e[0] === p.einbau) || ["", ""])[1],
        ...OPTS.map(o => { const v = p.opt[o.f]; return Array.isArray(v) ? v.join(", ") : (v || ""); }), p.notiz];
    });
    const csv = "﻿" + [cols, ...rows].map(r => r.map(v => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n");
    const a = el("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "Bestellliste " + ((doc.kunde || "Aufmaß") + " " + (doc.projekt || "")).replace(/[\\/:*?"<>|]+/g, "").trim() + ".csv";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  // ---------- Menü & Einstellungen ----------
  $("menuBtn").onclick = () => { $("settingsBox").hidden = true; $("homeHelp").hidden = true; $("menuModal").hidden = false; };
  $("menuClose").onclick = () => $("menuModal").hidden = true;
  $("meBtn").onclick = () => showWho();
  $("mWho").onclick = () => { $("menuModal").hidden = true; showWho(); };
  $("mHome").onclick = () => { $("homeHelp").hidden = !$("homeHelp").hidden; $("settingsBox").hidden = true; };
  $("mLogout").onclick = async () => { $("menuModal").hidden = true; await flushSave(); await store.logout(); if (!DEMO) show("loginView"); else toast("Im Vorschau-Modus gibt es kein Abmelden."); };
  $("mSettings").onclick = () => { $("homeHelp").hidden = true; const b = $("settingsBox"); b.hidden = !b.hidden; if (!b.hidden) renderSettings(); };
  function renderSettings() {
    const b = $("settingsBox"); b.innerHTML = "";
    b.appendChild(el("h3", "", "Abzüge für das Bestellmaß"));
    b.appendChild(el("p", "muted", "Gesamtabzug in mm von Breite und Höhe (z. B. Einbaufuge beidseitig). Gilt für alle Geräte."));
    const tbl = el("div", "set-grid");
    ["", "Breite −", "Höhe −"].forEach(h => tbl.appendChild(el("b", "", h)));
    EINBAU.forEach(([k, n]) => {
      tbl.appendChild(el("span", "", n));
      ["b", "h"].forEach(d => { const i = el("input"); i.type = "number"; i.inputMode = "numeric"; i.min = 0; i.value = settings.abzug[k] ? settings.abzug[k][d] : 0; i.setAttribute("aria-label", n + " " + d);
        i.onchange = () => { settings.abzug[k] = Object.assign({ b: 0, h: 0 }, settings.abzug[k], { [d]: Number(i.value) || 0 }); saveSettings(); }; tbl.appendChild(i); });
    });
    b.appendChild(tbl);
    const t = el("label", "set-row"); t.appendChild(el("span", "", "Hinweis bei Abweichung über (mm)"));
    const ti = el("input"); ti.type = "number"; ti.min = 1; ti.value = settings.toleranz; ti.onchange = () => { settings.toleranz = Number(ti.value) || 5; saveSettings(); }; t.appendChild(ti); b.appendChild(t);
    const z = el("label", "toggle set-row"); const zi = el("input"); zi.type = "checkbox"; zi.checked = !!settings.zweiMasse; zi.onchange = () => { settings.zweiMasse = zi.checked; saveSettings(); };
    z.appendChild(zi); z.appendChild(el("span", "", "Neue Positionen mit zweitem Maß starten")); b.appendChild(z);
  }
  async function saveSettings() { try { await store.saveSettings(settings); toast("Einstellungen gespeichert"); if (curPos()) renderSketch(); } catch (e) { toast("Einstellungen konnten nicht gespeichert werden."); } }

  // ---------- Sprache ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recBtn = null;
  document.addEventListener("click", e => {
    const b = e.target.closest(".mic"); if (!b) return; e.preventDefault();
    const target = $(b.dataset.mic);
    if (!SR) { toast("Spracheingabe geht in diesem Browser nicht – bitte das Mikrofon auf der Tastatur benutzen."); target.focus(); return; }
    if (rec) { try { rec.stop(); } catch (x) { } if (recBtn === b) return; }
    const base = target.value ? target.value.replace(/\s+$/, "") + " " : "";
    rec = new SR(); rec.lang = "de-DE"; rec.interimResults = true; recBtn = b; b.classList.add("rec");
    rec.onresult = ev => { let t = ""; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; t = t.trim(); if (t && !base) t = t[0].toUpperCase() + t.slice(1); target.value = base + t; target.dispatchEvent(new Event("input", { bubbles: true })); };
    rec.onerror = ev => { if (ev.error === "not-allowed") toast("Mikrofon ist nicht erlaubt – in den Browser-Einstellungen freigeben."); };
    rec.onend = () => { b.classList.remove("rec"); rec = null; recBtn = null; };
    try { rec.start(); } catch (x) { b.classList.remove("rec"); rec = null; }
  });

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => { });
  start();
})();
