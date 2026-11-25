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
  function supaStore() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "sws-auth" }
    });
    let channel = null;
    const chk = r => { if (r.error) throw r.error; return r.data; };
    return {
      async hasSession() { const { data } = await sb.auth.getSession(); return !!data.session; },
      async login(code) { const r = await sb.auth.signInWithPassword({ email: CFG.teamEmail, password: code }); if (r.error) throw r.error; },
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
      async insert(t, row) { chk(await sb.from(t).insert(row)); },
      async update(t, k, patch) { chk(await sb.from(t).update(patch).eq(KEY[t] || "id", k)); },
      async remove(t, k) { chk(await sb.from(t).delete().eq(KEY[t] || "id", k)); },
      subscribe(cb, onStatus) {
        if (channel) sb.removeChannel(channel);
        channel = sb.channel("schreinerei-aufgaben");
        TABLES.forEach(t => channel.on("postgres_changes", { event: "*", schema: "public", table: t },
          p => cb(t, p.eventType, p.new, p.old)));
        channel.subscribe(st => onStatus && onStatus(st));
      }
    };
  }

  function demoStore() {
    const K = "sws-aufgaben-vorschau";
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
    return {
      async hasSession() { return true; }, async login() { }, async logout() { },
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

  const store = DEMO ? demoStore() : supaStore();

  // ---------- Zustand ----------
  const S = { aufgaben: new Map(), schritte: new Map(), eintraege: new Map(), team: [] };
  let me = lsGet("sws-ich", "");
  const ui = Object.assign({ view: "offen", person: "alle", group: "projekt", search: "", sum: null }, lsGet("sws-ansicht", {}));
  ui.search = ""; ui.sum = null;
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

  // ---------- Hauptliste ----------
  let rTimer;
  function scheduleRender() { cancelAnimationFrame(rTimer); rTimer = requestAnimationFrame(render); }

  function stepsOf(id) { return [...S.schritte.values()].filter(s => s.aufgabe_id === id).sort((a, b) => a.sortierung - b.sortierung || a.erstellt_am.localeCompare(b.erstellt_am)); }
  function logOf(id) { return [...S.eintraege.values()].filter(s => s.aufgabe_id === id).sort((a, b) => b.am.localeCompare(a.am)); }

  function personMatch(a) {
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
    const projekte = [...new Set([...S.aufgaben.values()].map(a => a.projekt).filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));
    const dl = $("projektListe"); dl.innerHTML = ""; projekte.forEach(p => { const o = el("option"); o.value = p; dl.appendChild(o); });
    // Personen-Chips
    const chips = $("personChips"); chips.innerHTML = "";
    [["alle", "Alle"], ["meine", "Meine"]].concat(names.filter(n => n !== me).map(n => [n, n])).concat([["_ohne", "Ohne"]]).forEach(([v, l]) => {
      const b = el("button", "chip" + (ui.person === v ? " on" : ""), l); b.type = "button";
      b.onclick = () => { ui.person = v; saveUi(); render(); }; chips.appendChild(b);
    });
    document.querySelectorAll(".seg button").forEach(b => b.classList.toggle("on", b.dataset.view === ui.view));
    $("groupBy").value = ui.group;

    const all = [...S.aufgaben.values()];
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
      (!q || (a.titel + " " + a.projekt + " " + a.notiz + " " + a.zustaendig).toLowerCase().includes(q)));
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
      else if (q || ui.sum || ui.person !== "alle") { e.appendChild(el("b", "", "Nichts gefunden")); e.appendChild(document.createTextNode("Für diesen Filter gibt es keine offenen Aufgaben.")); }
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
      if (a.dringend) meta.appendChild(el("span", "tag urgent", "Dringend"));
      const due = fmtDue(a.faellig); if (due) meta.appendChild(el("span", "tag " + due.cls, due.text));
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
  $("addForm").addEventListener("submit", e => {
    e.preventDefault();
    const titel = $("addTitle").value.trim();
    if (!titel) { $("addTitle").focus(); return; }
    const ts = nowIso();
    mut("aufgaben", "INSERT", {
      id: uuid(), titel, projekt: $("addProjekt").value.trim(), zustaendig: $("addWer").value,
      faellig: $("addFaellig").value || null, dringend: $("addDringend").checked, notiz: "",
      erledigt: false, erledigt_am: null, erledigt_von: null, erstellt_am: ts, erstellt_von: me, geaendert_am: ts
    });
    $("addTitle").value = ""; $("addDringend").checked = false; $("addFaellig").value = "";
    if (ui.view !== "offen") { ui.view = "offen"; }
    toast("Aufgabe eingetragen");
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
    setVal("dProjekt", a.projekt); setVal("dFaellig", a.faellig || ""); setVal("dNotiz", a.notiz);
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
  document.querySelectorAll(".seg button").forEach(b => b.onclick = () => { ui.view = b.dataset.view; ui.sum = null; saveUi(); render(); });
  $("groupBy").onchange = e => { ui.group = e.target.value; saveUi(); render(); };
  $("search").oninput = e => { ui.search = e.target.value; render(); };
  function saveUi() { lsSet("sws-ansicht", { view: ui.view, person: ui.person, group: ui.group }); }

  // ---------- Menü ----------
  $("menuBtn").onclick = () => { $("teamEdit").hidden = true; $("homeHelp").hidden = true; $("menuModal").hidden = false; };
  $("meBtn").onclick = () => showWho();
  $("menuClose").onclick = () => $("menuModal").hidden = true;
  $("mWho").onclick = () => { $("menuModal").hidden = true; showWho(); };
  $("mLogout").onclick = async () => { $("menuModal").hidden = true; await store.logout(); if (!DEMO) showLogin(); else toast("Im Vorschau-Modus gibt es kein Abmelden."); };
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
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recBtn = null, recTarget = null, recBase = "";
  function stopMic() { if (rec) { try { rec.stop(); } catch (e) { } } }
  document.addEventListener("click", e => {
    const b = e.target.closest(".mic"); if (!b) return;
    e.preventDefault();
    if (!SR) { toast("Spracheingabe geht in diesem Browser nicht – bitte das Mikrofon auf der Tastatur benutzen."); $(b.dataset.mic).focus(); return; }
    if (rec && recBtn === b) { stopMic(); return; }
    stopMic();
    const target = $(b.dataset.mic);
    rec = new SR(); rec.lang = "de-DE"; rec.interimResults = true; rec.continuous = false;
    recBtn = b; recTarget = target; recBase = target.value ? target.value.replace(/\s+$/, "") + " " : "";
    b.classList.add("rec");
    rec.onresult = ev => {
      let txt = ""; for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
      txt = txt.trim(); if (txt && !recBase) txt = txt[0].toUpperCase() + txt.slice(1);
      recTarget.value = recBase + txt; if (recTarget.tagName === "TEXTAREA") autoGrow(recTarget);
    };
    rec.onerror = ev => {
      const m = {
        "not-allowed": "Mikrofon ist blockiert – beim Schloss-Symbol neben der Adresse erlauben bzw. in Windows unter Datenschutz → Mikrofon.",
        "service-not-allowed": "Spracheingabe ist in diesem Browser gesperrt – Chrome oder Edge verwenden oder Windows-Taste + H.",
        "audio-capture": "Kein Mikrofon gefunden – ist ein Mikrofon/Headset angeschlossen?",
        "network": "Spracheingabe braucht Internet – Verbindung prüfen.",
        "no-speech": "Nichts gehört – nochmal versuchen und direkt lossprechen.",
        "language-not-supported": "Deutsch wird hier für die Spracheingabe nicht unterstützt."
      };
      if (ev.error !== "aborted") toast(m[ev.error] || ("Spracheingabe nicht möglich (" + ev.error + "). Tipp am PC: Windows-Taste + H."));
    };
    rec.onend = () => {
      b.classList.remove("rec");
      const t = recTarget; rec = null; recBtn = null; recTarget = null;
      if (t && ["dNotiz", "dTitel"].includes(t.id)) t.dispatchEvent(new Event("change"));
      if (t) t.focus();
    };
    try { rec.start(); } catch (err) { b.classList.remove("rec"); rec = null; }
  });

  // ---------- los ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => { });
  setInterval(() => { if (!$("mainView").hidden && !openId) scheduleRender(); }, 60000); // "vor x Min." aktuell halten
  start();
})();
