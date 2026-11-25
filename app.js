/* Aufgaben · Schwarzwald Schreinerei
   Gemeinsame Aufgabenliste: Supabase (Datenbank + Live-Abgleich), Anmeldung mit Team-Code.
   Ohne Eintrag in config.js läuft die App im Vorschau-Modus (Daten nur im Browser). */
(function () {
  "use strict";

  const CFG = window.SWS_CONFIG || {};
  const DEMO = !CFG.supabaseUrl || !CFG.supabaseKey || !window.supabase;
  const KEY = { team: "name" };            // Primärschlüssel je Tabelle (sonst "id")
  const TABLES = ["aufgaben", "schritte", "eintraege", "team"];
  const $ = id => document.getElementById(id);

  // ---------- kleine Helfer ----------
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const nowIso = () => new Date().toISOString();
  const pad = n => String(n).padStart(2, "0");
  const dayStr = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => dayStr(new Date());
  const addDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return dayStr(d); };
  const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const initials = n => (n || "?").trim().split(/\s+/).map(s => s[0]).join("").slice(0, 2).toUpperCase();
  function lsGet(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch (e) { return f; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* egal */ } }

  function shortD(s) { const d = new Date(s + "T12:00:00"); return WD[d.getDay()] + " " + pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "."; }
  function fmtSpan(a) {
    const ab = a.faellig_ab, bis = a.faellig, t = today();
    if (ab && bis && ab !== bis) {
      const due = fmtDue(bis);
      if (bis < t) return due;
      if (ab <= t) return { cls: "today", text: "läuft · bis " + shortD(bis) };
      return { cls: "", text: shortD(ab) + " – " + shortD(bis) };
    }
    if (ab && !bis) return { cls: ab <= t ? "today" : "", text: "ab " + shortD(ab) };
    return fmtDue(bis);
  }
  function fmtDue(s) {
    if (!s) return null;
    const diff = daysBetween(today(), s), d = new Date(s + "T12:00:00");
    const short = pad(d.getDate()) + "." + pad(d.getMonth() + 1) + ".";
    if (diff < 0) return { cls: "late", text: diff === -1 ? "seit gestern fällig" : "überfällig seit " + (-diff) + " Tagen" };
    if (diff === 0) return { cls: "today", text: "heute fällig" };
    if (diff === 1) return { cls: "", text: "morgen" };
    if (diff < 7) return { cls: "", text: WD[d.getDay()] + " " + short };
    return { cls: "", text: short };
  }
  function fmtWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso), mins = Math.round((Date.now() - d) / 6e4);
    const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    if (mins < 1) return "gerade eben";
    if (mins < 60) return "vor " + mins + " Min.";
    const ds = dayStr(d);
    if (ds === today()) return "heute " + hm;
    if (ds === addDays(today(), -1)) return "gestern " + hm;
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + ". " + hm;
  }

  // ---------- Datenspeicher ----------
  function supaStore(opt) {
    opt = opt || { storageKey: "sws-auth", email: CFG.teamEmail, channel: "schreinerei-aufgaben" };
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: opt.storageKey }
    });
    let channel = null;
    const chk = r => { if (r.error) throw r.error; return r.data; };
    return {
      async hasSession() { const { data } = await sb.auth.getSession(); return !!data.session; },
      async login(code, email) { const r = await sb.auth.signInWithPassword({ email: email || opt.email, password: code }); if (r.error) throw r.error; },
      async uid() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user.id : null; },
      async logout() { await sb.auth.signOut(); },
      async loadAll() {
        const [a, s, e, t] = await Promise.all([
          sb.from("aufgaben").select("*").order("erstellt_am", { ascending: false }).limit(2000),
          sb.from("schritte").select("*").limit(5000),
          sb.from("eintraege").select("*").order("am", { ascending: false }).limit(5000),
          sb.from("team").select("*").order("sortierung")
        ]);
        return { aufgaben: chk(a), schritte: chk(s), eintraege: chk(e), team: chk(t) };
      },
      async insert(t, row) {
        let r = await sb.from(t).insert(row);
        const c = Object.assign({}, row);
        for (let i = 0; i < 3 && r.error; i++) { const k = ["uhrzeit", "ort", "faellig_ab", "bereich", "privat_fuer"].find(x => x in c && new RegExp(x, "i").test(r.error.message || "")); if (!k) break; delete c[k]; r = await sb.from(t).insert(c); }
        chk(r);
      },
      async update(t, k, patch) {
        let r = await sb.from(t).update(patch).eq(KEY[t] || "id", k);
        const c = Object.assign({}, patch);
        for (let i = 0; i < 3 && r.error; i++) { const x = ["uhrzeit", "ort", "faellig_ab", "bereich", "privat_fuer"].find(y => y in c && new RegExp(y, "i").test(r.error.message || "")); if (!x) break; delete c[x]; r = Object.keys(c).length ? await sb.from(t).update(c).eq(KEY[t] || "id", k) : { error: null }; }
        chk(r);
      },
      async remove(t, k) { chk(await sb.from(t).delete().eq(KEY[t] || "id", k)); },
      unsubscribe() { if (channel) { sb.removeChannel(channel); channel = null; } },
      subscribe(cb, onStatus) {
        if (channel) sb.removeChannel(channel);
        channel = sb.channel(opt.channel);
        TABLES.forEach(t => channel.on("postgres_changes", { event: "*", schema: "public", table: t },
          p => cb(t, p.eventType, p.new, p.old)));
        channel.subscribe(st => onStatus && onStatus(st));
      }
    };
  }

  function demoStore(K, isPriv) {
    K = K || "sws-aufgaben-vorschau";
    let db = lsGet(K, null);
    if (!db) {
      const t = today(), ago = h => new Date(Date.now() - h * 36e5).toISOString();
      const A = (titel, projekt, zustaendig, faellig, dringend, extra) => Object.assign({
        id: uuid(), titel, projekt, zustaendig, faellig, dringend, notiz: "", erledigt: false, erledigt_am: null, erledigt_von: null,
        erstellt_am: ago(30), erstellt_von: "Manuel", geaendert_am: ago(30)
      }, extra || {});
      const a1 = A("Beispiel: Aufmaß Fenster EG", "Beispiel Familie Muster", "Marco", addDays(t, -1), true, { notiz: "Kunde ab 14 Uhr zuhause" });
      const a2 = A("Beispiel: Küchenfronten lackieren", "Beispiel Küche Huber", "Simon", addDays(t, 2), false);
      const a3 = A("Beispiel: Kantenmaterial nachbestellen", "", "Manuel", t, false);
      const a4 = A("Beispiel: Montage Einbauschrank", "Beispiel Familie Muster", "Simon", null, false,
        { erledigt: true, erledigt_am: ago(5), erledigt_von: "Simon" });
      const S = (aid, text, done, i) => ({ id: uuid(), aufgabe_id: aid, text, erledigt: done, erledigt_von: done ? "Simon" : null,
        erledigt_am: done ? ago(20) : null, sortierung: i, erstellt_am: ago(25) });
      db = {
        aufgaben: [a1, a2, a3, a4],
        schritte: [S(a2.id, "Schleifen", true, 1), S(a2.id, "Grundieren", true, 2), S(a2.id, "Zwischenschliff", false, 3), S(a2.id, "Decklack", false, 4)],
        eintraege: [
          { id: uuid(), aufgabe_id: a2.id, text: "Grundierung ist drauf, muss über Nacht trocknen.", von: "Simon", am: ago(3) },
          { id: uuid(), aufgabe_id: a4.id, text: "✓ Erledigt – Schrank steht, Kunde zufrieden.", von: "Simon", am: ago(5) }
        ],
        team: [{ name: "Manuel", sortierung: 1 }, { name: "Marco", sortierung: 2 }, { name: "Simon", sortierung: 3 }]
      };
      lsSet(K, db);
    }
    const save = () => lsSet(K, db);
    const k = t => KEY[t] || "id";
    let unlocked = !isPriv || !!lsGet(K + "-offen", false);
    return {
      async hasSession() { return unlocked; }, async login() { unlocked = true; lsSet(K + "-offen", true); }, async logout() { unlocked = !isPriv; lsSet(K + "-offen", false); },
      async uid() { return isPriv ? "vorschau-privat" : null; }, unsubscribe() { },
      async loadAll() { return JSON.parse(JSON.stringify(db)); },
      async insert(t, row) { db[t].push(row); save(); },
      async update(t, key, patch) { const r = db[t].find(x => x[k(t)] === key); if (r) Object.assign(r, patch); save(); },
      async remove(t, key) {
        db[t] = db[t].filter(x => x[k(t)] !== key);
        if (t === "aufgaben") { db.schritte = db.schritte.filter(x => x.aufgabe_id !== key); db.eintraege = db.eintraege.filter(x => x.aufgabe_id !== key); }
        save();
      },
      subscribe(cb, onStatus) { onStatus && onStatus("SUBSCRIBED"); }
    };
  }

  const teamStore = DEMO ? demoStore() : supaStore();
  // „Mein Büro“: eigener Zugang, Einträge sieht nur dieser Zugang (Datenbank-Regel privat_fuer = eigene ID)
  const privStore = DEMO ? demoStore("sws-aufgaben-vorschau-privat", true)
    : supaStore({ storageKey: "sws-auth-privat", email: CFG.privatEmail || "manuel.buero@schwarzwald-schreinerei.de", channel: "schreinerei-privat" });
  let store = teamStore, privUid = null;
  const BEREICHE = ["Aufmaß", "Produktion", "Montage", "Büro", "Sonstiges"];
  const BER_CLS = { "Aufmaß": "b-aufmass", "Produktion": "b-prod", "Montage": "b-mont", "Büro": "b-buero", "Sonstiges": "b-sonst" };

  // ---------- Zustand ----------
  const S = { aufgaben: new Map(), schritte: new Map(), eintraege: new Map(), team: [] };
  let me = lsGet("sws-ich", "");
  const ui = Object.assign({ view: "offen", person: "alle", bereich: "alle", group: "projekt", search: "", sum: null }, lsGet("sws-ansicht", {}));
  ui.search = ""; ui.sum = null; ui.space = "team";
  const inSpace = a => ui.space === "privat" ? !!a.privat_fuer : !a.privat_fuer;
  let openId = null;

  function setAll(d) {
    S.aufgaben = new Map(d.aufgaben.map(r => [r.id, r]));
    S.schritte = new Map(d.schritte.map(r => [r.id, r]));
    S.eintraege = new Map(d.eintraege.map(r => [r.id, r]));
    S.team = d.team.slice().sort((a, b) => a.sortierung - b.sortierung);
  }
  function applyChange(t, type, row, old) {
    if (t === "team") {
      if (type === "DELETE") S.team = S.team.filter(x => x.name !== (old && old.name));
      else { S.team = S.team.filter(x => x.name !== row.name); S.team.push(row); S.team.sort((a, b) => a.sortierung - b.sortierung); }
    } else {
      const m = S[t];
      if (type === "DELETE") {
        const id = old && old.id; m.delete(id);
        if (t === "aufgaben") { for (const [k, v] of S.schritte) if (v.aufgabe_id === id) S.schritte.delete(k); for (const [k, v] of S.eintraege) if (v.aufgabe_id === id) S.eintraege.delete(k); }
      } else m.set(row.id, Object.assign({}, m.get(row.id) || {}, row));
    }
    scheduleRender();
  }

  // Änderung sofort anzeigen, dann speichern; bei Fehler neu laden.
  async function mut(t, type, rowOrKey, patch) {
    const k = KEY[t] || "id";
    if (type === "INSERT") applyChange(t, "INSERT", rowOrKey);
    else if (type === "UPDATE") { const cur = t === "team" ? S.team.find(x => x.name === rowOrKey) : S[t].get(rowOrKey); applyChange(t, "UPDATE", Object.assign({}, cur, patch)); }
    else applyChange(t, "DELETE", null, { [k]: rowOrKey });
    try {
      if (type === "INSERT") await store.insert(t, rowOrKey);
      else if (type === "UPDATE") await store.update(t, rowOrKey, patch);
      else await store.remove(t, rowOrKey);
    } catch (e) {
      console.error(e);
      toast(navigator.onLine ? "Konnte nicht gespeichert werden. Bitte nochmal versuchen." : "Keine Verbindung – Änderung nicht gespeichert.");
      reload();
    }
  }

  async function reload() {
    try { setAll(await store.loadAll()); scheduleRender(); }
    catch (e) {
      console.error(e);
      if (e && /JWT|auth|401|token/i.test(String(e.message || e.code || ""))) { showLogin(); return; }
      status("Daten können gerade nicht geladen werden – Verbindung prüfen.");
    }
  }

  // ---------- Ansichten ----------
  function show(view) {
    $("loginView").hidden = view !== "login";
    $("whoView").hidden = view !== "who";
    $("mainView").hidden = view !== "main";
    $("meBtn").hidden = view !== "main";
    $("menuBtn").hidden = view !== "main";
  }
  function status(msg) { $("status").textContent = msg || ""; $("status").hidden = !msg; }
  let toastT;
  function toast(msg, actionLabel, action) {
    const t = $("toast"); t.textContent = msg; t.classList.toggle("act", !!action);
    if (action) { const b = el("button", "", actionLabel); b.onclick = () => { t.classList.remove("show"); action(); }; t.appendChild(b); }
    t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), action ? 6000 : 2800);
  }

  function showLogin() { show("login"); setTimeout(() => $("teamCode").focus(), 50); }
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("loginMsg").textContent = ""; $("loginBtn").disabled = true;
    try { await store.login($("teamCode").value); $("teamCode").value = ""; await start(); }
    catch (err) {
      const wrong = err && (err.status === 400 || /invalid login/i.test(err.message || ""));
      $("loginMsg").textContent = wrong ? "Der Team-Code stimmt nicht." :
        (navigator.onLine ? "Anmelden hat gerade nicht geklappt – bitte nochmal versuchen." : "Keine Internetverbindung.");
    }
    $("loginBtn").disabled = false;
  });

  function showWho() {
    show("who");
    const box = $("whoList"); box.innerHTML = "";
    S.team.forEach(p => { const b = el("button", "", p.name); b.type = "button"; b.onclick = () => setMe(p.name); box.appendChild(b); });
  }
  $("whoForm").addEventListener("submit", e => { e.preventDefault(); const n = $("whoInput").value.trim(); if (n) setMe(n); });
  function setMe(n) { me = n; lsSet("sws-ich", n); show("main"); render(); }

  // ---------- Start ----------
  async function start() {
    if (DEMO) status("Vorschau-Modus: Beispieldaten, nur auf diesem Gerät gespeichert.");
    if (!(await store.hasSession())) { showLogin(); return; }
    await reload();
    store.subscribe(applyChange, st => {
      if (DEMO) return;
      if (st === "SUBSCRIBED") status(navigator.onLine ? "" : "Offline – Änderungen werden erst mit Verbindung gespeichert.");
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") status("Live-Abgleich unterbrochen – wird neu verbunden …");
    });
    if (!me) showWho(); else { show("main"); render(); }
  }
  window.addEventListener("online", () => { if (!DEMO) status(""); reload(); });
  window.addEventListener("offline", () => status("Offline – Änderungen werden erst mit Verbindung gespeichert."));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !$("mainView").hidden) reload(); });

  // ---------- Team / Mein Büro ----------
  async function switchSpace(sp) {
    if (sp === ui.space) return;
    if (sp === "privat" && !(await privStore.hasSession())) { openPrivLogin(); return; }
    closeSheet(); store.unsubscribe && store.unsubscribe();
    store = sp === "privat" ? privStore : teamStore; ui.space = sp; ui.sum = null;
    if (sp === "privat") privUid = await privStore.uid();
    await reload();
    store.subscribe(applyChange, () => { });
    render();
  }
  function openPrivLogin() { $("privModal").hidden = false; $("privMsg").textContent = ""; $("privCode").value = ""; setTimeout(() => $("privCode").focus(), 50); }
  $("privCancel").onclick = () => { $("privModal").hidden = true; };
  $("privForm").addEventListener("submit", async e => {
    e.preventDefault(); $("privMsg").textContent = "";
    try { await privStore.login($("privCode").value); $("privModal").hidden = true; await switchSpace("privat"); }
    catch (err) { const wrong = err && (err.status === 400 || /invalid login/i.test(err.message || "")); $("privMsg").textContent = wrong ? "Das Passwort stimmt nicht." : "Anmelden hat nicht geklappt – Verbindung prüfen."; }
  });
  $("spaceTeam").onclick = () => switchSpace("team");
  $("spacePriv").onclick = () => switchSpace("privat");
  $("lockBtn").onclick = async () => { await switchSpace("team"); await privStore.logout(); toast("Mein Büro ist gesperrt."); };

  // ---------- Hauptliste ----------
  let rTimer;
  function scheduleRender() { cancelAnimationFrame(rTimer); rTimer = requestAnimationFrame(render); }

  function stepsOf(id) { return [...S.schritte.values()].filter(s => s.aufgabe_id === id).sort((a, b) => a.sortierung - b.sortierung || a.erstellt_am.localeCompare(b.erstellt_am)); }
  function logOf(id) { return [...S.eintraege.values()].filter(s => s.aufgabe_id === id).sort((a, b) => b.am.localeCompare(a.am)); }

  function bereichMatch(a) { return ui.bereich === "alle" || (ui.bereich === "_ohne" ? !a.bereich : a.bereich === ui.bereich); }
  function personMatch(a) {
    if (ui.space === "privat") return true;
    if (ui.person === "alle") return true;
    if (ui.person === "meine") return a.zustaendig === me;
    if (ui.person === "_ohne") return !a.zustaendig;
    return a.zustaendig === ui.person;
  }
  function sumMatch(a) {
    if (!ui.sum) return true;
    const t = today();
    if (ui.sum === "dringend") return a.dringend;
    if (ui.sum === "ueberfaellig") return a.faellig && a.faellig < t;
    if (ui.sum === "heute") return a.faellig === t;
    return true;
  }

  function render() {
    if ($("mainView").hidden) { if (openId) renderSheet(); return; }
    $("meName").textContent = me || "?"; $("meDot").textContent = initials(me);
    const names = S.team.map(p => p.name);
    // Auswahllisten
    fillSelect($("addWer"), names, $("addWer").value || "");
    const projekte = [...new Set([...S.aufgaben.values()].filter(inSpace).map(a => a.projekt).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
    const dl = $("projektListe"); dl.innerHTML = ""; projekte.forEach(p => { const o = el("option"); o.value = p; dl.appendChild(o); });
    // Personen-Chips
    const chips = $("personChips"); chips.innerHTML = "";
    [["alle", "Alle"], ["meine", "Meine"]].concat(names.filter(n => n !== me).map(n => [n, n])).concat([["_ohne", "Ohne"]]).forEach(([v, l]) => {
      const b = el("button", "chip" + (ui.person === v ? " on" : ""), l); b.type = "button";
      b.onclick = () => { ui.person = v; saveUi(); render(); }; chips.appendChild(b);
    });
    // Bereich-Chips
    const bc = $("bereichChips"); bc.innerHTML = "";
    [["alle", "Alle Bereiche"]].concat(BEREICHE.map(b => [b, b])).forEach(([v, l]) => {
      const b = el("button", "chip" + (v !== "alle" ? " " + BER_CLS[v] : "") + (ui.bereich === v ? " on" : ""), l); b.type = "button";
      b.onclick = () => { ui.bereich = ui.bereich === v && v !== "alle" ? "alle" : v; saveUi(); render(); }; bc.appendChild(b);
    });
    $("personChips").hidden = ui.space === "privat"; $("addWer").hidden = ui.space === "privat";
    $("spaceTeam").classList.toggle("on", ui.space === "team"); $("spacePriv").classList.toggle("on", ui.space === "privat");
    $("spaceBar").hidden = !(DEMO || me === (CFG.privatName || "Manuel"));
    $("lockBtn").hidden = ui.space !== "privat";
    document.body.classList.toggle("privat", ui.space === "privat");
    document.querySelectorAll(".seg button[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === ui.view));
    $("groupBy").value = ui.group;

    const all = [...S.aufgaben.values()].filter(a => inSpace(a) && bereichMatch(a));
    const open = all.filter(a => !a.erledigt && personMatch(a));
    const t = today();
    // Überblick
    const sums = [["offen", "Offen", open.length, ""], ["dringend", "Dringend", open.filter(a => a.dringend).length, "urgent"],
      ["ueberfaellig", "Überfällig", open.filter(a => a.faellig && a.faellig < t).length, "late"],
      ["heute", "Heute fällig", open.filter(a => a.faellig === t).length, "today"]];
    const sumBox = $("summary"); sumBox.innerHTML = "";
    sums.forEach(([k, label, n, cls]) => {
      const b = el("button", "sum " + cls + (ui.sum === k || (k === "offen" && !ui.sum && ui.view === "offen") ? " active" : ""));
      b.type = "button"; b.appendChild(el("b", "", String(n))); b.appendChild(el("span", "", label));
      b.onclick = () => { ui.view = "offen"; ui.sum = (k === "offen" || ui.sum === k) ? null : k; render(); };
      sumBox.appendChild(b);
    });

    // Liste
    const q = ui.search.trim().toLowerCase();
    let items = all.filter(a => (ui.view === "erledigt" ? a.erledigt : !a.erledigt) && personMatch(a) && (ui.view === "erledigt" || sumMatch(a)) &&
      (!q || (a.titel + " " + a.projekt + " " + (a.ort || "") + " " + a.notiz + " " + a.zustaendig).toLowerCase().includes(q)));
    if (ui.view === "offen") items.sort((a, b) => (b.dringend - a.dringend) || ((a.faellig || "9999") .localeCompare(b.faellig || "9999")) || b.erstellt_am.localeCompare(a.erstellt_am));
    else items = items.sort((a, b) => (b.erledigt_am || "").localeCompare(a.erledigt_am || "")).slice(0, 300);

    const groups = new Map();
    const bucket = a => {
      if (ui.group === "projekt") return a.projekt || "Ohne Projekt";
      if (ui.group === "person") return a.zustaendig || "Nicht zugewiesen";
      if (ui.view === "erledigt") {
        const d = a.erledigt_am ? dayStr(new Date(a.erledigt_am)) : "";
        if (d === t) return "Heute erledigt"; if (d === addDays(t, -1)) return "Gestern"; if (d >= addDays(t, -7)) return "Letzte 7 Tage"; return "Früher";
      }
      if (!a.faellig) return "Ohne Datum";
      if (a.faellig < t) return "Überfällig"; if (a.faellig === t) return "Heute"; if (a.faellig === addDays(t, 1)) return "Morgen";
      if (a.faellig <= addDays(t, 7)) return "Nächste 7 Tage"; return "Später";
    };
    items.forEach(a => { const k = bucket(a); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
    let keys = [...groups.keys()];
    const fixedOrder = ["Überfällig", "Heute", "Morgen", "Nächste 7 Tage", "Später", "Ohne Datum", "Heute erledigt", "Gestern", "Letzte 7 Tage", "Früher"];
    if (ui.group === "datum") keys.sort((a, b) => fixedOrder.indexOf(a) - fixedOrder.indexOf(b));
    else if (ui.group === "person") keys.sort((a, b) => (a === me ? -1 : b === me ? 1 : 0) || (a === "Nicht zugewiesen") - (b === "Nicht zugewiesen") || a.localeCompare(b, "de"));
    else keys.sort((a, b) => (a === "Ohne Projekt") - (b === "Ohne Projekt") || a.localeCompare(b, "de"));

    const list = $("list"); list.innerHTML = "";
    if (!items.length) {
      const e = el("div", "empty");
      if (ui.view === "erledigt") { e.appendChild(el("b", "", "Noch nichts erledigt")); e.appendChild(document.createTextNode("Abgehakte Aufgaben erscheinen hier.")); }
      else if (ui.space === "privat" && !q && !ui.sum && ui.bereich === "alle") { e.appendChild(el("b", "", "Mein Büro ist leer")); e.appendChild(document.createTextNode("Hier trägst du ein, was nur du sehen sollst – z. B. Rechnungen, Angebote, Anrufe. Die Meister sehen das nicht.")); }
      else if (q || ui.sum || ui.person !== "alle" || ui.bereich !== "alle") { e.appendChild(el("b", "", "Nichts gefunden")); e.appendChild(document.createTextNode("Für diesen Filter gibt es keine offenen Aufgaben.")); }
      else { e.appendChild(el("b", "", "Alles erledigt")); e.appendChild(document.createTextNode("Oben eintragen, was zu tun ist – mit dem Mikrofon geht's auch per Sprache.")); }
      list.appendChild(e);
    }
    keys.forEach(k => {
      const g = el("section", "group"), h = el("h2", "", k); h.appendChild(el("span", "n", String(groups.get(k).length))); g.appendChild(h);
      const cards = el("div", "cards"); groups.get(k).forEach(a => cards.appendChild(card(a))); g.appendChild(cards); list.appendChild(g);
    });
    if (openId) renderSheet();
  }

  function fillSelect(sel, names, value) {
    const keep = value; sel.innerHTML = "";
    const o0 = el("option", "", "– niemand –"); o0.value = ""; sel.appendChild(o0);
    const all = names.slice(); if (keep && !all.includes(keep)) all.push(keep);
    all.forEach(n => { const o = el("option", "", n); o.value = n; sel.appendChild(o); });
    sel.value = keep;
  }

  function card(a) {
    const c = el("article", "card" + (a.dringend && !a.erledigt ? " urgent" : "") + (a.erledigt ? " done" : ""));
    c.tabIndex = 0; c.setAttribute("role", "button");
    const chk = el("button", "check" + (a.erledigt ? " on" : "")); chk.type = "button";
    chk.setAttribute("aria-label", a.erledigt ? "Wieder öffnen" : "Abhaken");
    chk.onclick = e => { e.stopPropagation(); quickToggle(a.id); };
    c.appendChild(chk);
    const m = el("div", "c-main"); m.appendChild(el("div", "c-title", a.titel));
    const meta = el("div", "c-meta");
    if (a.erledigt) meta.appendChild(el("span", "tag ok", "✓ " + (a.erledigt_von || "") + " · " + fmtWhen(a.erledigt_am)));
    else {
      if (a.bereich) meta.appendChild(el("span", "tag ber " + (BER_CLS[a.bereich] || ""), a.bereich));
      if (a.dringend) meta.appendChild(el("span", "tag urgent", "Dringend"));
      const due = fmtSpan(a); if (due) meta.appendChild(el("span", "tag " + due.cls, due.text + (a.uhrzeit ? ", " + a.uhrzeit + " Uhr" : "")));
      if (a.ort) meta.appendChild(el("span", "tag", "📍 " + a.ort));
    }
    if (a.projekt && ui.group !== "projekt") meta.appendChild(el("span", "tag", a.projekt));
    if (a.zustaendig && ui.group !== "person") { const w = el("span", "tag who"); w.appendChild(el("span", "av", initials(a.zustaendig))); w.appendChild(document.createTextNode(a.zustaendig)); meta.appendChild(w); }
    if (meta.childNodes.length) m.appendChild(meta);
    const st = stepsOf(a.id);
    if (st.length) {
      const done = st.filter(s => s.erledigt).length, p = el("div", "c-progress"), bar = el("div", "bar"), i = el("i");
      i.style.width = Math.round(done / st.length * 100) + "%"; bar.appendChild(i); p.appendChild(bar); p.appendChild(el("span", "", done + " von " + st.length + " Schritten"));
      m.appendChild(p);
    }
    const last = logOf(a.id)[0];
    if (last) m.appendChild(el("div", "c-last", (last.von ? last.von + ": " : "") + last.text + " · " + fmtWhen(last.am)));
    c.appendChild(m);
    c.onclick = () => openSheet(a.id);
    c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSheet(a.id); } };
    return c;
  }

  // ---------- Aktionen ----------
  // Auf dem Handy die Zusatzfelder erst zeigen, wenn man etwas einträgt
  $("addTitle").addEventListener("focus", () => $("addForm").classList.add("open"));
  $("addForm").addEventListener("focusout", () => setTimeout(() => {
    if (!$("addForm").contains(document.activeElement) && !$("addTitle").value) $("addForm").classList.remove("open");
  }, 150));
  // ---------- Schnelleingabe: ein Satz → Projekt, Aufgabe, Person, Datum, dringend ----------
  // z. B. „Familie Müller Küchenfronten bestellen bis Freitag Marco dringend“
  const WDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const W = "[A-Za-zÄÖÜäöüß0-9\\-]";
  function nextWeekday(wd, forceNext) {
    const d = new Date(); let diff = (wd - d.getDay() + 7) % 7; if (diff === 0 || forceNext) diff += diff === 0 ? 7 : 0; if (forceNext && diff < 7 && (wd - d.getDay() + 7) % 7 !== 0) diff += 0;
    d.setDate(d.getDate() + diff); return dayStr(d);
  }
  // Typische Aufgaben-Wörter: hier endet ein Kundenname („Achim und Nathalie Gerber | Rechnung Fenster erstellen“)
  const TASKWORD = /^(?:[A-ZÄÖÜa-zäöüß\-]*(?:rechnung|angebot|aufma(?:ß|ss)|fenster|tür|türe|tuer|tuere|schrank|schränke|küche|kueche|treppe|möbel|moebel|regal|tisch|bank|laden|läden|boden|böden|decke|zeichnung|bestellung|montage|lieferung|termin|leiste|leisten|platte|platten|front|fronten|beschlag|beschläge|glas|verglasung|kalkulation|reklamation|nacharbeit|material|holz|wand|verkleidung|bad|garderobe|bett|theke|tor|kostenvoranschlag|auftrag|auftragsbestätigung|abnahme|besprechung|anruf|mail|e-mail|planung|plan|pläne|muster|probe|einbau|reparatur|wartung|insektenschutz|rollladen|raffstore|jalousie|markise|parkett|dielen|sockel|sims)|Angebot|Rechnung)$/i;
  const NAMESTOP = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|neue|neuer|neues|neuen|alte|alter|altes|bitte|noch|dann|danach|morgen|heute|mit|zum|zur|beim|im|am|an|auf|von|vom|bis|nach|ohne|wegen|alle|alles|nochmal|wieder|schnell|ich|wir|er|sie|es)$/i;
  // Liest Namen ab dem Anfang von str: großgeschriebene Wörter, verbunden mit „und“/„&“. Stoppt an Aufgaben-Wörtern.
  function takeName(str, allowPrefix) {
    const toks = str.trim().split(/\s+/); const out = []; let i = 0, stopTask = false;
    if (allowPrefix && toks[0] && /^(?:familie|fam\.|firma|fa\.|herr|frau|eheleute)$/i.test(toks[0])) out.push(toks[i++]);
    for (; i < toks.length && out.length < 7; i++) {
      const w = toks[i].replace(/[,.:;!]+$/, ""), punct = w !== toks[i];
      if (/^(?:und|&|u\.)$/i.test(w) && out.length) { out.push(w); continue; }
      if (!/^[A-ZÄÖÜ]/.test(w) || NAMESTOP.test(w)) break;
      if (TASKWORD.test(w)) { stopTask = true; break; }
      out.push(w);
      if (punct) { i++; break; }
    }
    while (out.length && /^(?:und|&|u\.)$/i.test(out[out.length - 1])) { out.pop(); i--; }
    const named = out.filter(w => !/^(?:und|&|u\.|familie|fam\.|firma|fa\.|herr|frau|eheleute)$/i.test(w));
    if (!named.length) return null;
    return { name: out.join(" "), rest: toks.slice(i).join(" ").replace(/^[,.:;]\s*/, ""), stopTask, atEnd: i >= toks.length };
  }
  function parseQuick(raw) {
    let t = " " + raw.replace(/\s+/g, " ").trim() + " ";
    const r = { projekt: "", zustaendig: "", faellig: "", faellig_ab: "", uhrzeit: "", ort: "", bereich: "", dringend: false };
    // Bereich aus Stichworten (Wörter bleiben in der Aufgabe stehen)
    const low = raw.toLowerCase();
    if (/aufma(ß|ss)|ausmessen|aufmessen|vermessen|nachmessen/.test(low)) r.bereich = "Aufmaß";
    else if (/montier|montage|einbau|einbauen|einsetzen|\bsetzen\b|einstellen|einhängen|einhaengen|anschlagen|aufbauen|liefern|lieferung|anliefern/.test(low)) r.bereich = "Montage";
    else if (/fertig(en|ung)|zuschneid|zuschnitt|lackier|\bölen\b|oelen|schleif|bekant|kanten|bohren|leimen|verleimen|furnier|fräsen|fraesen|hobeln|beizen|grundier|produktion|produzieren|cnc|werkstatt/.test(low)) r.bereich = "Produktion";
    else if (/angebot|rechnung|abschlag|bestell|anrufen|telefon|e-mail|\bmail\b|nachfassen|nachkalkul|abrechn|zeichnung|zeichnen|\bplanen\b|büro|buero/.test(low)) r.bereich = "Büro";
    const cut = re => { const m = t.match(re); if (m) t = t.replace(m[0], " "); return m; };
    const PRE = "(?:\\s(?:bis|am|ab|zum|spätestens|spaetestens|bis zum|für|fuer))?";
    // dringend
    if (cut(/\s(dringend|sofort|asap|eilig|eilt|wichtig)(?=[\s,.!])/i)) r.dringend = true;
    // Uhrzeit: „10 Uhr“, „10:30“, „10.30 Uhr“, „um 10“
    let m;
    if ((m = cut(/\s(?:um|ab|gegen)?\s?(\d{1,2})(?:[:.](\d{2}))?\s?uhr(?=[\s,.!])/i)) || (m = cut(/\s(?:um|ab|gegen)\s(\d{1,2})(?::(\d{2}))?(?=[\s,.!])/i)) || (m = cut(/\s(\d{1,2}):(\d{2})(?=[\s,.!])/))) {
      const h = Number(m[1]), mi = Number(m[2] || 0); if (h < 24 && mi < 60) r.uhrzeit = pad(h) + ":" + pad(mi);
    }
    // Zeitraum: „vom 1.12. bis 5.12.“, „zwischen Montag und Mittwoch“, „KW 49“, „diese/nächste Woche“, „ab Montag“
    const DTOK = "(\\d{1,2}\\.\\d{1,2}\\.?(?:\\d{2,4})?|heute|morgen|übermorgen|uebermorgen|(?:nächsten\\s|naechsten\\s|kommenden\\s)?(?:" + WDAYS.join("|") + "))";
    const tokDate = tok => {
      tok = tok.toLowerCase().trim(); let mm;
      if ((mm = tok.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/))) { const y = mm[3] ? (mm[3].length === 2 ? 2000 + Number(mm[3]) : Number(mm[3])) : new Date().getFullYear(); let d = y + "-" + pad(Number(mm[2])) + "-" + pad(Number(mm[1])); if (!mm[3] && d < today()) d = (y + 1) + d.slice(4); return d; }
      if (tok === "heute") return today(); if (tok === "morgen") return addDays(today(), 1); if (/^(ü|ue)bermorgen$/.test(tok)) return addDays(today(), 2);
      const nx = /^(nächsten|naechsten|kommenden)\s/.test(tok), wd = WDAYS.indexOf(tok.replace(/^\S+\s/, nx ? "" : "$&").replace(/^(nächsten|naechsten|kommenden)\s/, ""));
      if (wd < 0) return ""; const d = new Date(); let diff = (wd - d.getDay() + 7) % 7; if (diff === 0) diff = 7; if (nx && diff < 7) diff += 7; d.setDate(d.getDate() + diff); return dayStr(d);
    };
    const mondayOf = dstr => { const d = new Date(dstr + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dayStr(d); };
    if ((m = cut(new RegExp("\\s(?:vom|von|zwischen)\\s" + DTOK + "\\s(?:bis(?:\\szum)?|und|-|–)\\s" + DTOK + "(?=[\\s,.])", "i"))) || (m = cut(new RegExp("\\s" + DTOK + "\\s?(?:bis|–|-)\\s?" + DTOK + "(?=[\\s,.])", "i")))) {
      const a = tokDate(m[1]), b = tokDate(m[2]); if (a && b) { r.faellig_ab = a <= b ? a : b; r.faellig = a <= b ? b : a; }
    } else if ((m = cut(/\s(?:in\s(?:der\s)?)?(?:kw|kalenderwoche)\s?(\d{1,2})(?=[\s,.])/i))) {
      const kw = Number(m[1]), y = new Date().getFullYear(); const jan4 = new Date(y, 0, 4); const mon = new Date(jan4); mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (kw - 1) * 7);
      let ab = dayStr(mon); if (ab < mondayOf(today())) { const j = new Date(y + 1, 0, 4); const mo = new Date(j); mo.setDate(j.getDate() - ((j.getDay() + 6) % 7) + (kw - 1) * 7); ab = dayStr(mo); }
      r.faellig_ab = ab; r.faellig = addDays(ab, 4);
    } else if ((m = cut(new RegExp(PRE + "\\s(?:in\\s)?(?:der\\s)?(?:nächsten|naechsten|kommenden|nächste|naechste|kommende)\\s?woche(?=[\\s,.])", "i")))) {
      const ab = addDays(mondayOf(today()), 7); r.faellig_ab = ab; r.faellig = addDays(ab, 4);
    } else if ((m = cut(new RegExp(PRE + "\\s(?:diese|dieser)\\s?woche(?=[\\s,.])", "i")))) {
      r.faellig_ab = today(); r.faellig = addDays(mondayOf(today()), 4) < today() ? today() : addDays(mondayOf(today()), 4);
    } else if ((m = cut(new RegExp("\\s(?:ab|frühestens|fruehestens)\\s" + DTOK + "(?=[\\s,.])", "i")))) {
      r.faellig_ab = tokDate(m[1]);
    }
    // Datum
    if (r.faellig) { /* schon durch Zeitraum gesetzt */ }
    else if ((m = cut(new RegExp(PRE + "\\s(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{2,4})?(?=[\\s,.])", "i")))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : new Date().getFullYear();
      let d = y + "-" + pad(Number(m[2])) + "-" + pad(Number(m[1])); if (!m[3] && d < today()) d = (y + 1) + d.slice(4); r.faellig = d;
    } else if ((m = cut(new RegExp(PRE + "\\s(übermorgen|uebermorgen)(?=[\\s,.])", "i")))) r.faellig = addDays(today(), 2);
    else if ((m = cut(new RegExp(PRE + "\\s(heute)(?=[\\s,.])", "i")))) r.faellig = today();
    else if ((m = cut(new RegExp(PRE + "\\s(morgen)(?=[\\s,.])", "i")))) r.faellig = addDays(today(), 1);
    else if ((m = cut(new RegExp(PRE + "\\s(?:in\\s)?(\\d+)\\s(tagen|tage|tag)(?=[\\s,.])", "i")))) r.faellig = addDays(today(), Number(m[1]));
    else if ((m = cut(new RegExp(PRE + "\\s(?:ende der woche|wochenende)(?=[\\s,.])", "i")))) r.faellig = nextWeekday(5);
    else if ((m = cut(new RegExp(PRE + "\\s(?:nächste|naechste|kommende)\\s?woche(?=[\\s,.])", "i")))) { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); r.faellig = dayStr(d); }
    else if ((m = cut(new RegExp(PRE + "\\s(?:(nächsten|naechsten|kommenden)\\s)?(" + WDAYS.join("|") + ")(?=[\\s,.])", "i")))) {
      const wd = WDAYS.indexOf(m[2].toLowerCase()); const d = new Date(); let diff = (wd - d.getDay() + 7) % 7; if (diff === 0) diff = 7; if (m[1] && diff < 7) diff += 7; d.setDate(d.getDate() + diff); r.faellig = dayStr(d);
    }
    // Ort: Straße + Hausnummer (+ Ort) oder „in/Ort/Adresse X“
    const STR = "[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\\-]*(?:straße|strasse|str\\.|weg|gasse|platz|ring|allee|steig|halde|matte|hof)";
    if ((m = cut(new RegExp("(?:\\s(?:in der|in|an der|ort|adresse))?\\s(" + STR + "\\s\\d+\\s?[a-zA-Z]?(?:,?\\s(?:\\d{5}\\s)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\\-]+)?)(?=[\\s,.!])")))) r.ort = m[1].replace(/\s+/g, " ").trim();
    else if ((m = cut(/\s(?:[oO]rt|[aA]dresse)\s([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+(?:\s[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+)?)(?=[\s,.!])/))) r.ort = m[1];
    else if ((m = cut(/\s(?:in|nach)\s((?:der|dem)\s)?([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+(?:\s(?:im|am|an der)\s[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]+)?)(?=[\s,.!])/))) r.ort = m[2];
    if (r.uhrzeit && !r.faellig) { const n = new Date(); r.faellig = (pad(n.getHours()) + ":" + pad(n.getMinutes())) < r.uhrzeit ? today() : addDays(today(), 1); }
    // Person (aus dem Team)
    if ((m = cut(/\s(?:für|fuer)\s(?:mich|mir)(?=[\s,.])/i))) r.zustaendig = me;
    if (!r.zustaendig) for (const p of S.team.map(x => x.name).sort((a, b) => b.length - a.length)) {
      if ((m = cut(new RegExp("(?:\\s(?:für|fuer|an|durch|von|macht))?\\s" + reEsc(p) + "(?=[\\s,.!])", "i")))) { r.zustaendig = p; break; }
    }
    // Füllwörter aus gesprochenen Sätzen („Simon soll das erledigen und planen“, „bitte“)
    const VERB = "(?:erledigen|machen|übernehmen|uebernehmen|planen|einplanen|kümmern|kuemmern|einteilen|organisieren)";
    t = t.replace(new RegExp("\\s(?:soll|sollte|muss|müsste|muesste|kann|könnte|koennte|darf|möchte)(?:\\s(?:sich|das|es|dies|darum|drum|bitte|noch|dann|mal|auch))*\\s" + VERB + "(?:\\s(?:und|oder|bzw\\.?)\\s" + VERB + ")*(?=[\\s,.!])", "gi"), " ");
    t = t.replace(new RegExp("\\s(?:und|bitte)\\s" + VERB + "(?=[\\s,.!]*$)", "i"), " ");
    t = t.replace(/\s(?:bitte|mal)(?=[\s,.!])/gi, " ");
    t = t.replace(/(\s[.!?])+(?=\s*$)/, " ").replace(/\.\s+\./g, ".");
    // Projekt/Kunde: bekanntes Projekt, „X: Aufgabe“, Stichwort oder „Familie/Firma/Herr/Frau X“
    const known = [...new Set([...S.aufgaben.values()].map(a => a.projekt).filter(Boolean))].sort((a, b) => b.length - a.length);
    for (const pj of known) {
      if ((m = cut(new RegExp("(?:\\s(?:bei|für|fuer|projekt|kunde|kundin|baustelle))?\\s" + reEsc(pj) + "(?=[\\s,.:!-])", "i")))) { r.projekt = pj; break; }
    }
    if (!r.projekt && (m = t.match(/^\s*([^:]{2,40}?)\s*[:–]\s+(.+)$/))) { r.projekt = m[1].trim().replace(/^(?:bei|projekt|kunde|kundin|baustelle)\s+/i, ""); t = " " + m[2] + " "; }
    // Stichwort „Kunde/bei/Projekt/Baustelle/für“ + Name (auch mehrteilig: „Kunde Achim und Nathalie Gerber“)
    if (!r.projekt && (m = t.match(/\s(?:[bB]ei|[pP]rojekt|[kK]unde|[kK]undin|[kK]unden|[bB]austelle|[fF]ür|[fF]uer)\s(.*)$/))) {
      const nm = takeName(m[1], true);
      if (nm) { r.projekt = nm.name; t = t.slice(0, m.index) + " " + nm.rest + " "; }
    }
    if (!r.projekt && (m = cut(new RegExp("\\s((?:familie|fam\\.|firma|fa\\.|herr|frau)\\s[A-ZÄÖÜ]" + W + "+)(?=[\\s,.:!])", "i")))) r.projekt = m[1];
    // Aufzählung mit Kommas („Aufmaß, Haustür, Weber“): letzter Name-Teil = Kunde
    if (!r.projekt) {
      const segs = t.split(",").map(x => x.trim()).filter(Boolean);
      if (segs.length >= 2 && /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]*(?:\s[A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-]*)?$/.test(segs[segs.length - 1])) { r.projekt = segs.pop(); t = " " + segs.join(" ") + " "; }
    }
    // „Gerüstbau Becker, Innentüre setzen …“: Name(n) vor dem ersten Komma = Kunde
    if (!r.projekt && (m = t.match(/^\s*((?:[A-ZÄÖÜ][A-Za-zÄÖÜäöüß&.\-]*)(?:\s(?:[A-ZÄÖÜ&][A-Za-zÄÖÜäöüß&.\-]*|GmbH|KG|AG|e\.K\.)){0,3})\s*,\s*(.*[a-zäöüß].*)$/))) { r.projekt = m[1].trim(); t = " " + m[2] + " "; }
    // Gesprochen ohne Komma, Name vorne: „Nathalie und Achim Gerber Rechnung Fenster erstellen“
    if (!r.projekt) {
      const nm = takeName(t, true);
      if (nm && nm.stopTask && nm.rest) { r.projekt = nm.name; t = " " + nm.rest + " "; }
    }
    // Gesprochen ohne Komma: „Gerüstbau Becker Innentüre setzen“ → ab 3 großgeschriebenen Wörtern am Anfang sind alle bis auf das letzte der Kunde
    if (!r.projekt && (m = t.match(/^\s*((?:[A-ZÄÖÜ][A-Za-zÄÖÜäöüß&.\-]*\s){3,5})(.*)$/))) {
      const words = m[1].trim().split(/\s+/), last = words.pop();
      if (/[a-zäöüß]/.test(m[2])) { r.projekt = words.join(" "); t = " " + last + " " + m[2] + " "; }
    }
    // Name hinten: „Aufmaß Haustür Weber“, „Abschlagsrechnung Gerüstbau Becker“
    if (!r.projekt) {
      const toks = t.trim().replace(/[,.!]+$/, "").split(/\s+/); let j = toks.length;
      while (j > 0 && (/^(?:und|&)$/i.test(toks[j - 1]) || (/^[A-ZÄÖÜ]/.test(toks[j - 1]) && !TASKWORD.test(toks[j - 1]) && !NAMESTOP.test(toks[j - 1])))) j--;
      while (j < toks.length && /^(?:und|&)$/i.test(toks[j])) j++;
      if (j > 0 && j < toks.length && toks.length - j <= 5 && TASKWORD.test(toks[j - 1].replace(/[,.]$/, ""))) { r.projekt = toks.slice(j).join(" "); t = " " + toks.slice(0, j).join(" ") + " "; }
    }
    if (t.split(",").length > 2) t = t.replace(/,/g, " ");
    if (r.projekt) r.projekt = r.projekt.replace(/^fam\.\s/i, "Familie ").replace(/^(\w)/, c => c.toUpperCase());
    // Aufgabe aufräumen
    let titel = t.replace(/\s+/g, " ").replace(/\s([,.!])/g, "$1").trim()
      .replace(/^(?:[,.:\-–]\s*)+/, "").replace(/(?:\s*[,.:\-–])+$/, "").replace(/\.\s+(?=[a-zäöü])/g, " ")
      .replace(/^(?:und|bei|für|fuer|an|bis|am|zum|noch)\s+/i, "").replace(/\s+(?:und|bei|für|fuer|an|bis|am|zum)$/i, "").trim();
    if (titel) titel = titel[0].toUpperCase() + titel.slice(1);
    r.titel = titel || raw.trim();
    return r;
  }
  const manual = { projekt: false, ort: false, wer: false, ab: false, faellig: false, zeit: false, dringend: false, bereich: false };
  const auto = { projekt: "", ort: "", wer: "", ab: "", faellig: "", zeit: "", dringend: false, bereich: "" };
  [["addBereich", "bereich"], ["addOrt", "ort"], ["addProjekt", "projekt"], ["addWer", "wer"], ["addAb", "ab"], ["addFaellig", "faellig"], ["addZeit", "zeit"], ["addDringend", "dringend"]].forEach(([id, k]) =>
    $(id).addEventListener("change", () => { manual[k] = true; showParse(); }));
  let parsed = null;
  function showParse() {
    const raw = $("addTitle").value, box = $("addParse");
    parsed = raw.trim() ? parseQuick(raw) : null;
    const setF = (k, id, v) => { if (manual[k]) return; const f = $(id); if (k === "dringend") { if (f.checked === auto[k]) f.checked = !!v; } else if (f.value === auto[k] || !f.value) { if (k === "wer" && v && ![...f.options].some(o => o.value === v)) { const o = el("option", "", v); o.value = v; f.appendChild(o); } f.value = v || ""; } auto[k] = k === "dringend" ? !!v : (v || ""); };
    setF("bereich", "addBereich", parsed && parsed.bereich); setF("projekt", "addProjekt", parsed && parsed.projekt); setF("ort", "addOrt", parsed && parsed.ort); setF("wer", "addWer", parsed && parsed.zustaendig);
    setF("ab", "addAb", parsed && parsed.faellig_ab); setF("faellig", "addFaellig", parsed && parsed.faellig); setF("zeit", "addZeit", parsed && parsed.uhrzeit); setF("dringend", "addDringend", parsed && parsed.dringend);
    box.innerHTML = "";
    if (!parsed) { box.hidden = true; return; }
    const parts = [];
    if (parsed.bereich) parts.push(["Bereich", parsed.bereich]);
    if (parsed.projekt) parts.push(["Projekt", parsed.projekt]);
    if (parsed.ort) parts.push(["Ort", parsed.ort]);
    if (parsed.zustaendig) parts.push(["Zuständig", parsed.zustaendig]);
    if (parsed.faellig_ab) { const f = fmtSpan({ faellig_ab: parsed.faellig_ab, faellig: parsed.faellig }); parts.push(["Zeitraum", f ? f.text : parsed.faellig_ab]); }
    else if (parsed.faellig) { const f = fmtDue(parsed.faellig); parts.push(["Fällig", (f ? f.text : parsed.faellig) + (parsed.uhrzeit ? ", " + parsed.uhrzeit + " Uhr" : "")]); }
    if (parsed.dringend) parts.push(["", "Dringend"]);
    box.hidden = !parts.length;
    if (!parts.length) return;
    box.appendChild(el("span", "ap-l", "Erkannt:"));
    box.appendChild(el("span", "ap-t", "„" + parsed.titel + "“"));
    parts.forEach(([k, v]) => box.appendChild(el("span", "tag" + (v === "Dringend" ? " urgent" : ""), (k ? k + ": " : "") + v)));
  }
  $("addTitle").addEventListener("input", showParse);
  function resetQuick() { Object.keys(manual).forEach(k => manual[k] = false); auto.projekt = auto.ort = auto.wer = auto.ab = auto.faellig = auto.zeit = auto.bereich = ""; auto.dringend = false; parsed = null; $("addParse").hidden = true; }

  $("addForm").addEventListener("submit", e => {
    e.preventDefault();
    const raw = $("addTitle").value.trim();
    if (!raw) { $("addTitle").focus(); return; }
    const titel = (parsed && parsed.titel) || raw;
    const ts = nowIso();
    const newId = uuid();
    mut("aufgaben", "INSERT", {
      id: newId, titel, projekt: $("addProjekt").value.trim(), ort: $("addOrt").value.trim(), bereich: $("addBereich").value,
      privat_fuer: ui.space === "privat" ? privUid : null, zustaendig: $("addWer").value,
      faellig: $("addFaellig").value || null, faellig_ab: $("addAb").value || null, uhrzeit: $("addFaellig").value ? ($("addZeit").value || "") : "", dringend: $("addDringend").checked, notiz: "",
      erledigt: false, erledigt_am: null, erledigt_von: null, erstellt_am: ts, erstellt_von: me, geaendert_am: ts
    });
    const hadTime = $("addFaellig").value && $("addZeit").value;
    $("addTitle").value = ""; $("addDringend").checked = false; $("addFaellig").value = ""; $("addAb").value = ""; $("addZeit").value = ""; $("addProjekt").value = ""; $("addOrt").value = ""; $("addBereich").value = ""; $("addWer").value = ""; resetQuick();
    if (ui.view !== "offen") { ui.view = "offen"; }
    if (hadTime) toast("Termin eingetragen", "In Outlook eintragen", () => openOutlook(S.aufgaben.get(newId)));
    else toast("Aufgabe eingetragen");
    $("addTitle").focus();
  });

  function setDone(id, done, note) {
    const ts = nowIso();
    mut("aufgaben", "UPDATE", id, done ? { erledigt: true, erledigt_am: ts, erledigt_von: me, geaendert_am: ts }
      : { erledigt: false, erledigt_am: null, erledigt_von: null, geaendert_am: ts });
    const text = done ? "✓ Erledigt" + (note ? " – " + note : "") : "↺ Wieder geöffnet";
    mut("eintraege", "INSERT", { id: uuid(), aufgabe_id: id, text, von: me, am: ts });
  }
  function quickToggle(id) {
    const a = S.aufgaben.get(id); if (!a) return;
    const done = !a.erledigt; setDone(id, done);
    if (done) toast("„" + a.titel + "“ erledigt", "Rückgängig", () => setDone(id, false));
  }

  // ---------- Detail ----------
  function openSheet(id) {
    openId = id; $("sheet").hidden = false; $("scrim").hidden = false; resetDeleteBtn();
    renderSheet(true);
  }
  function closeSheet() { openId = null; $("sheet").hidden = true; $("scrim").hidden = true; stopMic(); }
  $("dClose").onclick = closeSheet; $("scrim").onclick = closeSheet;
  document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("doneModal").hidden) $("doneModal").hidden = true; else if (!$("menuModal").hidden) $("menuModal").hidden = true; else if (openId) closeSheet(); } });

  function setVal(id, v) { const f = $(id); if (document.activeElement !== f && f.value !== (v || "")) f.value = v || ""; }
  function renderSheet(first) {
    const a = S.aufgaben.get(openId);
    if (!a) { closeSheet(); if (!first) toast("Die Aufgabe wurde gelöscht."); return; }
    $("dCheck").className = "check big" + (a.erledigt ? " on" : "");
    setVal("dTitel", a.titel); autoGrow($("dTitel"));
    setVal("dProjekt", a.projekt); setVal("dOrt", a.ort || ""); $("routeBtn").hidden = !a.ort; setVal("dFaellig", a.faellig || ""); if (document.activeElement !== $("dBereich")) $("dBereich").value = a.bereich || ""; setVal("dAb", a.faellig_ab || ""); setVal("dZeit", a.uhrzeit || ""); setVal("dNotiz", a.notiz);
    $("calRow").hidden = !(a.faellig || a.faellig_ab);
    if (document.activeElement !== $("dWer")) fillSelect($("dWer"), S.team.map(p => p.name), a.zustaendig || "");
    $("dDringend").checked = !!a.dringend;
    $("dDone").hidden = !a.erledigt;
    $("dDone").textContent = a.erledigt ? "✓ Erledigt von " + (a.erledigt_von || "?") + " · " + fmtWhen(a.erledigt_am) : "";
    $("dDoneBtn").textContent = a.erledigt ? "Wieder öffnen" : "Als erledigt abhaken";
    $("dDoneBtn").className = a.erledigt ? "btn big" : "btn primary big";
    // Schritte
    const st = stepsOf(a.id), done = st.filter(s => s.erledigt).length;
    $("dStepCount").textContent = st.length ? done + " von " + st.length : "";
    $("dProgress").hidden = !st.length; $("dProgress").firstChild.style.width = st.length ? Math.round(done / st.length * 100) + "%" : "0";
    const ul = $("dSteps"); ul.innerHTML = "";
    st.forEach(s => {
      const li = el("li", "step" + (s.erledigt ? " done" : ""));
      const c = el("button", "check" + (s.erledigt ? " on" : "")); c.type = "button"; c.setAttribute("aria-label", "Schritt abhaken");
      c.onclick = () => toggleStep(s.id);
      li.appendChild(c); li.appendChild(el("span", "", s.text));
      if (s.erledigt) li.appendChild(el("small", "", (s.erledigt_von || "") + " · " + fmtWhen(s.erledigt_am)));
      const x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Schritt löschen"); x.onclick = () => mut("schritte", "DELETE", s.id);
      li.appendChild(x); ul.appendChild(li);
    });
    // Verlauf
    const log = $("dLog"); log.innerHTML = "";
    logOf(a.id).forEach(e => {
      const li = el("li", /^[✓↺]/.test(e.text) ? "sys" : ""), h = el("div", "lh");
      h.appendChild(el("span", "", (e.von || "?") + " · " + fmtWhen(e.am)));
      if (e.von === me) { const x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", "Eintrag löschen"); x.onclick = () => mut("eintraege", "DELETE", e.id); h.appendChild(x); }
      li.appendChild(h); li.appendChild(el("div", "lt", e.text)); log.appendChild(li);
    });
    $("dMeta").textContent = "Angelegt von " + (a.erstellt_von || "?") + " · " + fmtWhen(a.erstellt_am) +
      (a.geaendert_am && a.geaendert_am !== a.erstellt_am ? " · zuletzt geändert " + fmtWhen(a.geaendert_am) : "");
  }
  function autoGrow(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
  function patchOpen(p) { if (!openId) return; p.geaendert_am = nowIso(); mut("aufgaben", "UPDATE", openId, p); }

  $("dTitel").addEventListener("input", e => autoGrow(e.target));
  $("dTitel").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } });
  $("dTitel").addEventListener("change", e => { const v = e.target.value.trim(); if (v) patchOpen({ titel: v }); else renderSheet(); });
  $("dProjekt").addEventListener("change", e => patchOpen({ projekt: e.target.value.trim() }));
  $("dWer").addEventListener("change", e => patchOpen({ zustaendig: e.target.value }));
  $("dFaellig").addEventListener("change", e => patchOpen({ faellig: e.target.value || null }));
  $("dAb").addEventListener("change", e => patchOpen({ faellig_ab: e.target.value || null }));
  $("dBereich").addEventListener("change", e => patchOpen({ bereich: e.target.value }));
  $("dZeit").addEventListener("change", e => patchOpen({ uhrzeit: e.target.value || "" }));
  $("dOrt").addEventListener("change", e => patchOpen({ ort: e.target.value.trim() }));
  $("routeBtn").onclick = () => { const a = S.aufgaben.get(openId); if (a && a.ort) window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(a.ort), "_blank", "noopener"); };

  // ---------- Kalender (Outlook / .ics) ----------
  function calTimes(a) {
    if (!a.uhrzeit || (a.faellig_ab && a.faellig_ab !== a.faellig)) { const s0 = a.faellig_ab || a.faellig, e0 = a.faellig || a.faellig_ab; return { allDay: true, s0, e0, start: new Date(s0 + "T00:00:00"), end: new Date(addDays(e0, 1) + "T00:00:00") }; }
    const st = new Date(a.faellig + "T" + a.uhrzeit + ":00"); return { allDay: false, start: st, end: new Date(st.getTime() + 60 * 60000) };
  }
  function localIso(d) { const o = -d.getTimezoneOffset(), sg = o >= 0 ? "+" : "-"; return dayStr(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":00" + sg + pad(Math.floor(Math.abs(o) / 60)) + ":" + pad(Math.abs(o) % 60); }
  const calSubject = a => a.titel + (a.projekt ? " – " + a.projekt : "") + (a.zustaendig ? " (" + a.zustaendig + ")" : "");
  const calBody = a => [a.zustaendig ? "Zuständig: " + a.zustaendig : "", a.notiz || "", "Aus der Aufgaben-App der Schwarzwald Schreinerei"].filter(Boolean).join("\n");
  function openOutlook(a) {
    if (!a || !(a.faellig || a.faellig_ab)) return;
    const t = calTimes(a), q = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: calSubject(a), body: calBody(a),
      startdt: t.allDay ? t.s0 : localIso(t.start), enddt: t.allDay ? addDays(t.e0, 1) : localIso(t.end) });
    if (t.allDay) q.set("allday", "true");
    if (a.ort || a.projekt) q.set("location", a.ort || a.projekt);
    window.open("https://outlook.office.com/calendar/0/deeplink/compose?" + q.toString(), "_blank", "noopener");
  }
  function downloadIcs(a) {
    if (!a || !(a.faellig || a.faellig_ab)) return;
    const t = calTimes(a), utc = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const escI = x => String(x || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Schwarzwald Schreinerei//Aufgaben//DE", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + a.id + "@schwarzwald-schreinerei", "DTSTAMP:" + utc(new Date()),
      t.allDay ? "DTSTART;VALUE=DATE:" + t.s0.replace(/-/g, "") : "DTSTART:" + utc(t.start),
      t.allDay ? "DTEND;VALUE=DATE:" + addDays(t.e0, 1).replace(/-/g, "") : "DTEND:" + utc(t.end),
      "SUMMARY:" + escI(calSubject(a)), "DESCRIPTION:" + escI(calBody(a))];
    if (a.ort || a.projekt) lines.push("LOCATION:" + escI(a.ort || a.projekt));
    lines.push("END:VEVENT", "END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const link = el("a"); link.href = URL.createObjectURL(blob); link.download = (calSubject(a).replace(/[\\/:*?"<>|]+/g, "").slice(0, 60) || "Termin") + ".ics";
    document.body.appendChild(link); link.click(); setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 800);
  }
  $("calOutlook").onclick = () => openOutlook(S.aufgaben.get(openId));
  $("calIcs").onclick = () => downloadIcs(S.aufgaben.get(openId));
  $("dDringend").addEventListener("change", e => patchOpen({ dringend: e.target.checked }));
  $("dNotiz").addEventListener("change", e => patchOpen({ notiz: e.target.value }));
  $("dCheck").onclick = () => { const a = S.aufgaben.get(openId); if (a && a.erledigt) setDone(openId, false); else openDoneModal(); };
  $("dDoneBtn").onclick = () => { const a = S.aufgaben.get(openId); if (a && a.erledigt) setDone(openId, false); else openDoneModal(); };

  function toggleStep(id) {
    const s = S.schritte.get(id); if (!s) return;
    const done = !s.erledigt;
    mut("schritte", "UPDATE", id, done ? { erledigt: true, erledigt_von: me, erledigt_am: nowIso() } : { erledigt: false, erledigt_von: null, erledigt_am: null });
    const st = stepsOf(s.aufgabe_id), a = S.aufgaben.get(s.aufgabe_id);
    if (done && st.length && st.every(x => x.erledigt) && a && !a.erledigt) toast("Alle Teilschritte erledigt.", "Aufgabe abhaken", () => setDone(a.id, true));
  }
  $("stepForm").addEventListener("submit", e => {
    e.preventDefault(); const v = $("stepInput").value.trim(); if (!v || !openId) return;
    const st = stepsOf(openId);
    mut("schritte", "INSERT", { id: uuid(), aufgabe_id: openId, text: v, erledigt: false, erledigt_von: null, erledigt_am: null,
      sortierung: st.length ? Math.max(...st.map(s => s.sortierung)) + 1 : 1, erstellt_am: nowIso() });
    $("stepInput").value = ""; $("stepInput").focus();
  });
  $("logForm").addEventListener("submit", e => {
    e.preventDefault(); const v = $("logInput").value.trim(); if (!v || !openId) return;
    mut("eintraege", "INSERT", { id: uuid(), aufgabe_id: openId, text: v, von: me, am: nowIso() });
    $("logInput").value = ""; autoGrow($("logInput"));
  });
  $("logInput").addEventListener("input", e => autoGrow(e.target));
  $("logInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("logForm").requestSubmit(); } });

  let delPending = false, delT;
  function resetDeleteBtn() { delPending = false; $("dDelete").textContent = "Aufgabe löschen"; $("dDelete").classList.remove("confirm"); }
  $("dDelete").onclick = () => {
    if (!delPending) { delPending = true; $("dDelete").textContent = "Wirklich löschen?"; $("dDelete").classList.add("confirm"); clearTimeout(delT); delT = setTimeout(resetDeleteBtn, 4000); return; }
    const a = S.aufgaben.get(openId); const id = openId; closeSheet(); resetDeleteBtn();
    mut("aufgaben", "DELETE", id); toast("Gelöscht: " + (a ? a.titel : ""));
  };

  // Erledigt mit Notiz
  function openDoneModal() {
    const a = S.aufgaben.get(openId); if (!a) return;
    $("doneTitle").textContent = a.titel; $("doneNote").value = ""; $("doneModal").hidden = false;
    setTimeout(() => $("doneNote").focus(), 50);
  }
  $("doneCancel").onclick = () => { $("doneModal").hidden = true; stopMic(); };
  $("doneForm").addEventListener("submit", e => {
    e.preventDefault(); stopMic();
    setDone(openId, true, $("doneNote").value.trim()); $("doneModal").hidden = true; toast("Erledigt");
  });

  // ---------- Filter ----------
  document.querySelectorAll(".seg button[data-view]").forEach(b => b.onclick = () => { ui.view = b.dataset.view; ui.sum = null; saveUi(); render(); });
  $("groupBy").onchange = e => { ui.group = e.target.value; saveUi(); render(); };
  $("search").oninput = e => { ui.search = e.target.value; render(); };
  function saveUi() { lsSet("sws-ansicht", { view: ui.view, person: ui.person, bereich: ui.bereich, group: ui.group }); }

  // ---------- Menü ----------
  $("menuBtn").onclick = () => { $("teamEdit").hidden = true; $("homeHelp").hidden = true; $("menuModal").hidden = false; };
  $("meBtn").onclick = () => showWho();
  $("menuClose").onclick = () => { $("menuModal").hidden = true; $("micTest").hidden = true; stopMicTest(); };
  $("mWho").onclick = () => { $("menuModal").hidden = true; showWho(); };
  $("mLogout").onclick = async () => { $("menuModal").hidden = true; await store.logout(); if (!DEMO) showLogin(); else toast("Im Vorschau-Modus gibt es kein Abmelden."); };
  // Mikrofon-Test: zeigt, ob der Browser Ton vom Mikrofon bekommt und welches Gerät er nimmt
  let micStream = null, micRaf = 0, micCtx = null;
  function stopMicTest() { cancelAnimationFrame(micRaf); if (micStream) micStream.getTracks().forEach(t => t.stop()); micStream = null; if (micCtx) { try { micCtx.close(); } catch (e) { } micCtx = null; } }
  async function runMicTest(deviceId) {
    const box = $("micTest");
    stopMicTest(); $("micLevel").style.width = "0%";
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
      const track = micStream.getAudioTracks()[0];
      $("micDev").textContent = "Gerät: " + (track && track.label ? track.label : "unbekannt") + (SR ? "" : " · Achtung: Dieser Browser kann keine Spracheingabe.");
      // Liste aller Mikrofone (Namen gibt es erst nach der Freigabe)
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "audioinput");
      const sel = $("micSel"), cur = track && track.getSettings ? track.getSettings().deviceId : "";
      sel.innerHTML = ""; devs.forEach(d => { const o = document.createElement("option"); o.value = d.deviceId; o.textContent = d.label || "Mikrofon"; if (d.deviceId === cur) o.selected = true; sel.appendChild(o); });
      sel.hidden = devs.length < 2;
      micCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (micCtx.state === "suspended") await micCtx.resume();
      const an = micCtx.createAnalyser(); an.fftSize = 512;
      micCtx.createMediaStreamSource(micStream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => { if (!micCtx) return; an.getByteTimeDomainData(buf); let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128)); $("micLevel").style.width = Math.min(100, mx * 1.6) + "%"; if (!box.hidden) micRaf = requestAnimationFrame(loop); else stopMicTest(); };
      loop();
    } catch (err) {
      const n = err && err.name;
      $("micDev").textContent = n === "NotAllowedError" ? "Mikrofon ist für diese Seite blockiert – beim Schloss-Symbol neben der Adresse bzw. in den Windows-Datenschutzeinstellungen erlauben."
        : n === "NotFoundError" ? "Kein Mikrofon gefunden – Headset anstecken und in Windows unter Sound → Eingabe auswählen."
        : n === "NotReadableError" ? "Das Mikrofon wird gerade von einem anderen Programm belegt (z. B. Teams, Jabra-Software) – das Programm schließen und nochmal testen."
        : "Mikrofon konnte nicht gestartet werden (" + (n || err) + ").";
    }
  }
  $("micSel").onchange = e => runMicTest(e.target.value);
  $("mMic").onclick = () => {
    const box = $("micTest"); if (!box.hidden) { box.hidden = true; stopMicTest(); return; }
    box.hidden = false; $("homeHelp").hidden = true; $("teamEdit").hidden = true; $("micDev").textContent = "Wird gestartet …";
    runMicTest();
  };
  $("mHome").onclick = () => { $("homeHelp").hidden = !$("homeHelp").hidden; $("teamEdit").hidden = true; };
  $("mTeam").onclick = () => { $("teamEdit").hidden = !$("teamEdit").hidden; $("homeHelp").hidden = true; renderTeam(); };
  function renderTeam() {
    const ul = $("teamList"); ul.innerHTML = "";
    S.team.forEach(p => {
      const li = el("li"); li.appendChild(el("span", "", p.name));
      const x = el("button", "x", "×"); x.type = "button"; x.setAttribute("aria-label", p.name + " entfernen");
      let armed = false;
      x.onclick = () => { if (!armed) { armed = true; x.textContent = "Entfernen?"; x.style.fontSize = "13px"; setTimeout(() => { armed = false; x.textContent = "×"; x.style.fontSize = ""; }, 3000); return; }
        mut("team", "DELETE", p.name); setTimeout(renderTeam, 50); };
      li.appendChild(x); ul.appendChild(li);
    });
  }
  $("teamForm").addEventListener("submit", e => {
    e.preventDefault(); const n = $("teamInput").value.trim(); if (!n || S.team.some(p => p.name === n)) return;
    mut("team", "INSERT", { name: n, sortierung: S.team.length ? Math.max(...S.team.map(p => p.sortierung)) + 1 : 1 });
    $("teamInput").value = ""; setTimeout(renderTeam, 50);
  });

  // App installieren (Android/PC)
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
  $("installBtn").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("installBtn").hidden = true; };

  // ---------- Spracheingabe ----------
  // Hört durchgehend zu (auch bei kurzen Pausen), zeigt den Text live an,
  // endet mit „Fertig“ oder nach 3 s Stille. Danach wird der Satz einsortiert.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ERR = {
    "not-allowed": "Mikrofon ist blockiert – beim Schloss-Symbol neben der Adresse erlauben bzw. in Windows unter Datenschutz → Mikrofon.",
    "service-not-allowed": "Spracheingabe ist in diesem Browser gesperrt – Chrome oder Edge verwenden oder Windows-Taste + H.",
    "audio-capture": "Kein Mikrofon gefunden – ist ein Mikrofon/Headset angeschlossen und in Windows als Eingabe gewählt?",
    "network": "Spracheingabe braucht Internet – Verbindung prüfen.",
    "language-not-supported": "Deutsch wird hier für die Spracheingabe nicht unterstützt."
  };
  const L = { rec: null, btn: null, target: null, base: "", orig: "", finalTxt: "", interim: "", active: false, heard: false, silenceT: null, startT: 0, fatal: false };
  function setTargetText() {
    let txt = (L.finalTxt + " " + L.interim).replace(/\s+/g, " ").trim();
    if (txt && !L.base) txt = txt[0].toUpperCase() + txt.slice(1);
    L.target.value = L.base + txt;
    if (L.target.tagName === "TEXTAREA") autoGrow(L.target);
    $("listenText").textContent = txt || "…";
    if (L.target.id === "addTitle") L.target.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function armSilence() {
    clearTimeout(L.silenceT);
    L.silenceT = setTimeout(() => finishMic(), L.heard ? 3000 : 9000);
  }
  function startRec() {
    const rec = new SR(); L.rec = rec;
    rec.lang = "de-DE"; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
    rec.onresult = ev => {
      let fin = "", inter = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) fin += " " + r[0].transcript; else inter += " " + r[0].transcript;
      }
      if (fin) L.finalTxt = (L.finalTxt + " " + fin).trim();
      L.interim = inter.trim();
      if ((fin + inter).trim()) L.heard = true;
      setTargetText(); armSilence();
    };
    rec.onerror = ev => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      L.fatal = true; toast(ERR[ev.error] || ("Spracheingabe nicht möglich (" + ev.error + "). Tipp am PC: Windows-Taste + H."));
    };
    rec.onend = () => {
      // Manche Browser beenden nach kurzer Pause von selbst – dann einfach weiterhören
      if (L.active && !L.fatal && Date.now() - L.startT < 120000) {
        if (L.interim) { L.finalTxt = (L.finalTxt + " " + L.interim).trim(); L.interim = ""; }
        try { startRec(); return; } catch (e) { }
      }
      if (L.active) finishMic(L.fatal);
    };
    rec.start();
  }
  function beginMic(btn) {
    const target = $(btn.dataset.mic);
    Object.assign(L, { btn, target, orig: target.value, base: target.value ? target.value.replace(/\s+$/, "") + " " : "",
      finalTxt: "", interim: "", active: true, heard: false, fatal: false, startT: Date.now() });
    btn.classList.add("rec");
    $("listenText").textContent = "…"; $("listenBar").hidden = false;
    try { startRec(); armSilence(); }
    catch (err) { L.active = false; btn.classList.remove("rec"); $("listenBar").hidden = true; toast("Spracheingabe konnte nicht starten. Tipp am PC: Windows-Taste + H."); }
  }
  function finishMic(cancel) {
    if (!L.active) return;
    L.active = false; clearTimeout(L.silenceT);
    try { L.rec && L.rec.stop(); } catch (e) { }
    if (L.interim) { L.finalTxt = (L.finalTxt + " " + L.interim).trim(); L.interim = ""; }
    const t = L.target;
    if (cancel === true) { t.value = L.orig; if (t.id === "addTitle") t.dispatchEvent(new Event("input", { bubbles: true })); }
    else {
      setTargetText();
      if (!L.heard && !L.fatal) toast("Nichts gehört – Mikrofon prüfen und direkt nach dem Klick lossprechen.");
      if (["dNotiz", "dTitel"].includes(t.id)) t.dispatchEvent(new Event("change"));
    }
    L.btn.classList.remove("rec"); $("listenBar").hidden = true; L.rec = null;
    t.focus();
  }
  function stopMic() { if (L.active) finishMic(); }
  $("listenDone").onclick = () => finishMic();
  $("listenCancel").onclick = () => finishMic(true);
  document.addEventListener("click", e => {
    const b = e.target.closest(".mic"); if (!b) return;
    e.preventDefault();
    if (!SR) { toast("Spracheingabe geht in diesem Browser nicht – Chrome, Edge oder Safari verwenden, oder die Diktierfunktion der Tastatur (am PC: Windows-Taste + H)."); $(b.dataset.mic).focus(); return; }
    if (L.active) { const same = L.btn === b; finishMic(); if (same) return; }
    beginMic(b);
  });

  // ---------- los ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
  setInterval(() => { if (!$("mainView").hidden && !openId) scheduleRender(); }, 60000); // "vor x Min." aktuell halten
  start();
})();
