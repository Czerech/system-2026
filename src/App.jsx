import { useState, useEffect, useRef, useMemo } from "react";
import {
  CalendarCheck, Scale, Trophy, PiggyBank, Library as LibraryIcon,
  Plus, Check, Star, Trash2, Search, AlertTriangle, Lock, Unlock,
  Download, Upload, LogOut, History
} from "lucide-react";
import { supabase } from "./supabaseClient";

/* ————— Tokens ————— */
const T = {
  paper: "#EFF1EC",
  card: "#FFFFFF",
  ink: "#1F261E",
  muted: "#79806F",
  line: "#DCDFD4",
  accent: "#E85D1F",   // pomarańcz zwiftowy
  done: "#3D6B4F",     // zieleń "zaliczone"
  danger: "#B3402E",
};
const font = "'Archivo', system-ui, sans-serif";

/* ————— Daty ————— */
const SEASON_START = new Date(2026, 6, 13); // pon 13.07.2026
const TOTAL_WEEKS = 24;
const START_WEIGHT = 116.5;
const GOAL_WEIGHT = 99.9;

function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function mondayOf(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtPL(d) {
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

/* ————— Model tygodnia ————— */
const emptyWeek = () => ({
  wydatki: false, dom: false, awaryjny: false,
});

// sesje aktywności: date + opcjonalnie time (godzina), zawsze minutes (czas trwania).
// mode "count" — próg to liczba sesji w tygodniu; mode "minutes" — próg to suma minut.
const SESSION_GOALS = {
  sila: { label: "Siłownia", mode: "count", threshold: 2, sub: "min 2 sesje/tydz. · target 3", withTime: true },
  rower: { label: "Rower", mode: "count", threshold: 1, sub: "min 1 sesja/tydz. · target 2", withTime: true },
  figurki: { label: "Figurki", mode: "minutes", threshold: 45, sub: "sesje malowania · cel 45 min/tydz.", withTime: false },
  czytanie: { label: "Czytanie", mode: "minutes", threshold: 60, sub: "czytanie / audiobook · cel 60 min/tydz.", withTime: false },
  rozwoj: { label: "Rozwój", mode: "minutes", threshold: 120, sub: "nauka / kursy · cel 120 min/tydz.", withTime: false },
};
const SESSION_LABELS = Object.fromEntries(Object.entries(SESSION_GOALS).map(([k, g]) => [k, g.label]));
// taski codzienne (7/7 w tygodniu, żeby tydzień się liczył)
const DAILY_TASKS = [
  { key: "duolingo", label: "Duolingo" },
  { key: "proszki", label: "Proszki" },
];

function weekDayKeys(weekKey) {
  const monday = fromKey(weekKey);
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(monday, i)));
}
function sessionsInWeek(data, weekKey, category) {
  const days = weekDayKeys(weekKey);
  return data.sessions.filter((s) => s.category === category && days.includes(s.date));
}
function sessionsMinutesInWeek(data, weekKey, category) {
  return sessionsInWeek(data, weekKey, category).reduce((sum, s) => sum + s.minutes, 0);
}
function sessionGoalValue(data, weekKey, category) {
  const g = SESSION_GOALS[category];
  return g.mode === "count" ? sessionsInWeek(data, weekKey, category).length : sessionsMinutesInWeek(data, weekKey, category);
}
function dailyDoneCountWeek(data, weekKey, task) {
  return weekDayKeys(weekKey).filter((dk) => data.dailies[dk]?.[task]).length;
}
function dailyAllWeek(data, weekKey, task) {
  return dailyDoneCountWeek(data, weekKey, task) === 7;
}

function isFullWeek(data, weekKey) {
  const w = data.weeks[weekKey] || emptyWeek();
  if (w.awaryjny) return false;
  return (
    w.wydatki && w.dom &&
    Object.keys(SESSION_GOALS).every((cat) => sessionGoalValue(data, weekKey, cat) >= SESSION_GOALS[cat].threshold) &&
    DAILY_TASKS.every((t) => dailyAllWeek(data, weekKey, t.key))
  );
}

const DEFAULT_DATA = {
  v: 2,
  weights: {},          // 'YYYY-MM-DD' -> kg
  weeks: {},            // 'YYYY-MM-DD' (poniedziałek) -> week obj
  dailies: {},          // 'YYYY-MM-DD' -> { duolingo, proszki }
  sessions: [],         // [{id, category: figurki|czytanie|rozwoj, minutes, date}]
  counters: {
    figPaintedSinceBuy: 0, figPaintedTotal: 0,
    booksFinished: 0, bookCreditsSpent: 0,
    currentModel: "", modelsDone: 0,
  },
  funds: { transferred: 0 },
  library: [],          // {id,type,title,status,rating,added}
};

const STORAGE_KEY = "system-2026-v1";

function mergeWithDefaults(parsed) {
  return {
    ...DEFAULT_DATA,
    ...parsed,
    counters: { ...DEFAULT_DATA.counters, ...(parsed.counters || {}) },
    funds: { ...DEFAULT_DATA.funds, ...(parsed.funds || {}) },
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return DEFAULT_DATA;
  }
}

/* ————— Główny komponent ————— */
export default function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("tydzien");
  const [saved, setSaved] = useState(true);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncState, setSyncState] = useState("idle"); // idle | syncing | synced | offline
  const [syncReady, setSyncReady] = useState(false);
  const saveTimer = useRef(null);
  const firstRender = useRef(true);
  const applyingRemote = useRef(false);

  /* sesja logowania */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setSyncReady(false); return; }
  }, [session]);

  /* pobranie danych z chmury po zalogowaniu */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setSyncReady(false);
    supabase.from("user_data").select("data").eq("user_id", session.user.id).maybeSingle()
      .then(({ data: row, error }) => {
        if (cancelled) return;
        if (row && row.data) {
          applyingRemote.current = true;
          setData(mergeWithDefaults(row.data));
        } else if (!error) {
          supabase.from("user_data").upsert({ user_id: session.user.id, data });
        }
        setSyncReady(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  /* nasłuch zmian z innych urządzeń */
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`user_data_${session.user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "user_data", filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          if (!payload.new || !payload.new.data) return;
          const merged = mergeWithDefaults(payload.new.data);
          setData((prev) => {
            if (JSON.stringify(merged) === JSON.stringify(prev)) return prev;
            applyingRemote.current = true;
            return merged;
          });
        })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session?.user?.id]);

  /* zapis lokalny (zawsze) + synchronizacja w chmurze (gdy zalogowany) */
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSaved(false);
    clearTimeout(saveTimer.current);
    const skipRemoteThisRound = applyingRemote.current;
    applyingRemote.current = false;
    saveTimer.current = setTimeout(async () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setSaved(true);
      } catch {
        setSaved(false);
      }
      if (session && syncReady && !skipRemoteThisRound) {
        setSyncState("syncing");
        const { error } = await supabase.from("user_data").upsert({ user_id: session.user.id, data });
        setSyncState(error ? "offline" : "synced");
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data, session, syncReady]);

  /* ponowna próba synchronizacji po powrocie sieci */
  useEffect(() => {
    if (!session || !syncReady) return;
    const retry = async () => {
      setSyncState("syncing");
      const { error } = await supabase.from("user_data").upsert({ user_id: session.user.id, data });
      setSyncState(error ? "offline" : "synced");
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [session, syncReady, data]);

  const stats = useMemo(() => computeStats(data), [data]);

  const tabs = [
    { id: "tydzien", label: "Tydzień", icon: CalendarCheck },
    { id: "waga", label: "Waga", icon: Scale },
    { id: "cele", label: "Cele", icon: Trophy },
    { id: "fundusze", label: "Fundusze", icon: PiggyBank },
    { id: "biblioteka", label: "Biblioteka", icon: LibraryIcon },
    { id: "historia", label: "Historia", icon: History },
  ];

  if (authLoading) return null;
  if (!session) return <AuthGate />;

  const syncLabel = { idle: null, syncing: "synchronizowanie…", synced: "zsynchronizowano", offline: "brak sieci — zapisano lokalnie" }[syncState];

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: font }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        input, textarea, select { font-family: inherit; }
        button { font-family: inherit; cursor: pointer; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .num { font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* Nagłówek */}
      <header style={{ padding: "16px 16px 8px", display: "flex", alignItems: "baseline", justifyContent: "space-between", maxWidth: 560, margin: "0 auto" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: T.accent, textTransform: "uppercase" }}>System 2026</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Życie poza pracą</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
          <div style={{ fontSize: 11, color: saved ? T.muted : T.accent, fontWeight: 600 }}>{saved ? "zapisano" : "zapisywanie…"}</div>
          {syncLabel && <div style={{ fontSize: 10, color: syncState === "offline" ? T.danger : T.muted, fontWeight: 600 }}>{syncLabel}</div>}
          <button onClick={() => supabase.auth.signOut()}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: T.muted, fontSize: 10, fontWeight: 700, padding: 0 }}>
            <LogOut size={11} /> Wyloguj
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "8px 16px 96px" }}>
        {tab === "tydzien" && <WeekTab data={data} setData={setData} stats={stats} />}
        {tab === "waga" && <WeightTab data={data} setData={setData} stats={stats} />}
        {tab === "cele" && <GoalsTab data={data} setData={setData} stats={stats} />}
        {tab === "fundusze" && <FundsTab data={data} setData={setData} stats={stats} />}
        {tab === "biblioteka" && <LibraryTab data={data} setData={setData} />}
        {tab === "historia" && <HistoryTab data={data} setData={setData} />}
      </main>

      {/* Dolna nawigacja */}
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.card, borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "space-around", padding: "6px 4px calc(6px + env(safe-area-inset-bottom))", zIndex: 20 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} aria-label={t.label}
              style={{ flex: 1, background: "none", border: "none", padding: "6px 0 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? T.accent : T.muted }}>
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 800 : 600 }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* ————— Logowanie ————— */
function AuthGate() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError("Nieprawidłowy email lub hasło.");
  };

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: T.accent, textTransform: "uppercase" }}>System 2026</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Zaloguj się</div>
        </div>
        <Card style={{ padding: 18 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <input type="email" required autoFocus placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
              style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 15 }} />
            <input type="password" required placeholder="Hasło" value={password} onChange={(e) => setPassword(e.target.value)}
              style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 15 }} />
            {error && <div style={{ fontSize: 12.5, color: T.danger, fontWeight: 600 }}>{error}</div>}
            <button type="submit" disabled={loading || !email.trim() || !password}
              style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 14, opacity: loading || !email.trim() || !password ? 0.6 : 1 }}>
              {loading ? "Logowanie…" : "Zaloguj"}
            </button>
          </div>
        </Card>
      </form>
    </div>
  );
}

/* ————— Statystyki pochodne ————— */
function computeStats(data) {
  const today = new Date();
  const curMonday = mondayOf(today);
  const startMonday = mondayOf(SEASON_START);

  // tygodnie sezonu do dziś
  const elapsed = [];
  for (let d = new Date(startMonday); d <= curMonday; d = addDays(d, 7)) elapsed.push(toKey(d));

  const weekObjs = elapsed.map((k) => ({ key: k, w: data.weeks[k] || emptyWeek() }));
  const nonEmergency = weekObjs.filter((x) => !x.w.awaryjny);
  const fullWeeks = nonEmergency.filter((x) => isFullWeek(data, x.key)).length;
  const pct = nonEmergency.length ? Math.round((100 * fullWeeks) / nonEmergency.length) : 0;

  // seria siłowa (od bieżącego tygodnia wstecz; bieżący nie przerywa, awaryjne pauzują)
  let streak = 0;
  for (let i = weekObjs.length - 1; i >= 0; i--) {
    const { key, w } = weekObjs[i];
    const isCurrent = i === weekObjs.length - 1;
    if (w.awaryjny) continue;
    if (sessionGoalValue(data, key, "sila") >= SESSION_GOALS.sila.threshold) streak++;
    else if (isCurrent) continue;
    else break;
  }

  // średnie tygodniowe wagi
  const byWeek = {};
  Object.entries(data.weights).forEach(([k, v]) => {
    const mk = toKey(mondayOf(fromKey(k)));
    (byWeek[mk] = byWeek[mk] || []).push(v);
  });
  const weeklyAvgs = Object.entries(byWeek)
    .map(([k, arr]) => ({ key: k, avg: arr.reduce((a, b) => a + b, 0) / arr.length, n: arr.length }))
    .sort((a, b) => (a.key < b.key ? -1 : 1));

  const latestAvg = weeklyAvgs.length ? weeklyAvgs[weeklyAvgs.length - 1].avg : null;
  const minAvg = weeklyAvgs.length ? Math.min(...weeklyAvgs.map((x) => x.avg)) : null;
  const kgLost = minAvg !== null ? Math.max(0, Math.floor(START_WEIGHT - minAvg)) : 0;

  // projekcja na koniec roku (trend z ostatnich 3 średnich tygodniowych)
  let projection = null;
  if (weeklyAvgs.length >= 2) {
    const last = weeklyAvgs.slice(-3);
    const slope = (last[last.length - 1].avg - last[0].avg) / (last.length - 1); // kg/tydzień
    const weeksLeft = Math.max(0, Math.round((new Date(2026, 11, 28) - mondayOf(fromKey(weeklyAvgs[weeklyAvgs.length - 1].key))) / (7 * 864e5)));
    projection = latestAvg + slope * weeksLeft;
  }

  const bonus = fullWeeks * 100 + kgLost * 200;

  return { curMondayKey: toKey(curMonday), elapsedCount: elapsed.length, nonEmergencyCount: nonEmergency.length, fullWeeks, pct, streak, weeklyAvgs, latestAvg, minAvg, kgLost, projection, bonus };
}

/* ————— Wspólne UI ————— */
function Card({ children, style }) {
  return <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: 14, marginBottom: 12, ...style }}>{children}</div>;
}
function SectionTitle({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted, margin: "4px 2px 8px" }}>{children}</div>;
}
function Bar({ value, max, color = T.accent }) {
  const pct = Math.max(0, Math.min(100, (100 * value) / max));
  return (
    <div style={{ height: 8, background: T.paper, borderRadius: 99, overflow: "hidden", border: `1px solid ${T.line}` }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width .3s" }} />
    </div>
  );
}
/* ————— TYDZIEŃ ————— */
function WeekTab({ data, setData, stats }) {
  const [offset, setOffset] = useState(0); // 0 = bieżący
  const monday = addDays(mondayOf(new Date()), offset * 7);
  const mk = toKey(monday);
  const w = data.weeks[mk] || emptyWeek();
  const startMk = toKey(mondayOf(SEASON_START));
  const beforeSeason = mk < startMk;

  const upd = (patch) =>
    setData((d) => ({ ...d, weeks: { ...d.weeks, [mk]: { ...(d.weeks[mk] || emptyWeek()), ...patch } } }));

  const full = isFullWeek(data, mk);
  const toggles = [
    { key: "wydatki", label: "Wydatki zapisane (15 min)" },
    { key: "dom", label: "Sprzątanie + 1 zadanie z backlogu" },
  ];
  const sessionGoalKeys = Object.keys(SESSION_GOALS);

  return (
    <div>
      {/* nawigacja tygodni + status */}
      <Card style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <button onClick={() => setOffset(offset - 1)} style={{ border: `1px solid ${T.line}`, background: T.card, borderRadius: 10, padding: "6px 12px", fontWeight: 700 }}>‹</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{fmtPL(monday)} – {fmtPL(addDays(monday, 6))}</div>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{offset === 0 ? "bieżący tydzień" : offset < 0 ? `${-offset} tyg. temu` : "przyszły"}</div>
          </div>
          <button onClick={() => setOffset(offset + 1)} disabled={offset >= 0} style={{ border: `1px solid ${T.line}`, background: T.card, borderRadius: 10, padding: "6px 12px", fontWeight: 700, opacity: offset >= 0 ? 0.3 : 1 }}>›</button>
        </div>
        {beforeSeason ? (
          <div style={{ fontSize: 12, color: T.muted }}>Przed startem sezonu (13.07).</div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", padding: "5px 10px", borderRadius: 8, textTransform: "uppercase", background: w.awaryjny ? T.paper : full ? T.done : "#F3E8DF", color: w.awaryjny ? T.muted : full ? "#fff" : T.accent, border: w.awaryjny ? `1px dashed ${T.muted}` : "none" }}>
              {w.awaryjny ? "awaryjny" : full ? "Zaliczony" : "w toku"}
            </span>
            <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, fontWeight: 600 }}>
              <input type="checkbox" checked={w.awaryjny} onChange={(e) => upd({ awaryjny: e.target.checked })} />
              tydzień awaryjny
            </label>
          </div>
        )}
      </Card>

      <SectionTitle>Codziennie</SectionTitle>
      <Card>
        {DAILY_TASKS.map((t, i) => (
          <div key={t.key}>
            <DailyRow label={t.label} task={t.key} weekKey={mk} data={data} setData={setData} />
            {i < DAILY_TASKS.length - 1 && <Divider />}
          </div>
        ))}
      </Card>

      <SectionTitle>Minimum tygodniowe</SectionTitle>
      <Card>
        {sessionGoalKeys.map((key) => (
          <div key={key}>
            <SessionGoalRow label={SESSION_GOALS[key].label} sub={SESSION_GOALS[key].sub} category={key}
              mode={SESSION_GOALS[key].mode} threshold={SESSION_GOALS[key].threshold} withTime={SESSION_GOALS[key].withTime}
              weekKey={mk} data={data} setData={setData} />
            <Divider />
          </div>
        ))}
        {toggles.map((t, i) => (
          <div key={t.key}>
            <ToggleRow label={t.label} checked={w[t.key]} onChange={(v) => upd({ [t.key]: v })} />
            {i < toggles.length - 1 && <Divider />}
          </div>
        ))}
      </Card>

      <SectionTitle>Sezon</SectionTitle>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>Tygodnie zaliczone</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 900 }}>{stats.fullWeeks}<span style={{ fontSize: 14, color: T.muted, fontWeight: 700 }}> / {TOTAL_WEEKS}</span></div>
        </div>
        <Bar value={stats.fullWeeks} max={TOTAL_WEEKS} color={T.done} />
        <div style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>
          Skuteczność dotąd: <b className="num" style={{ color: stats.pct >= 80 ? T.done : T.accent }}>{stats.pct}%</b> (cel ≥80%, tygodnie awaryjne nie liczą się do mianownika)
        </div>
      </Card>
    </div>
  );
}
function Row({ label, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}
function ToggleRow({ label, checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", background: "none", border: "none", textAlign: "left" }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: T.ink }}>{label}</span>
      <span style={{ width: 26, height: 26, borderRadius: 8, border: `2px solid ${checked ? T.done : T.line}`, background: checked ? T.done : T.card, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {checked && <Check size={16} color="#fff" strokeWidth={3} />}
      </span>
    </button>
  );
}
function Divider() {
  return <div style={{ height: 1, background: T.line }} />;
}

const DAY_LETTERS = ["P", "W", "Ś", "C", "P", "S", "N"];

function DailyRow({ label, task, weekKey, data, setData }) {
  const days = weekDayKeys(weekKey);
  const today = toKey(new Date());
  const doneCount = dailyDoneCountWeek(data, weekKey, task);
  const toggle = (dk, checked) =>
    setData((d) => ({
      ...d,
      dailies: { ...d.dailies, [dk]: { duolingo: false, proszki: false, ...(d.dailies[dk] || {}), [task]: checked } },
    }));

  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
        <span className="num" style={{ fontSize: 12, fontWeight: 800, color: doneCount === 7 ? T.done : T.muted }}>{doneCount} / 7</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {days.map((dk, i) => {
          const checked = !!data.dailies[dk]?.[task];
          const future = dk > today;
          return (
            <button key={dk} disabled={future} onClick={() => toggle(dk, !checked)}
              aria-label={`${label} ${dk}`}
              style={{
                flex: 1, height: 34, borderRadius: 8, fontSize: 10.5, fontWeight: 800,
                border: `1.5px solid ${checked ? T.done : T.line}`,
                background: checked ? T.done : T.card, color: checked ? "#fff" : T.muted,
                opacity: future ? 0.35 : 1,
              }}>
              {DAY_LETTERS[i]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function SessionGoalRow({ label, sub, category, weekKey, data, setData, mode, threshold, withTime }) {
  const [adding, setAdding] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [dateKey, setDateKey] = useState(toKey(new Date()));
  const [time, setTime] = useState(nowTime());

  const done = sessionGoalValue(data, weekKey, category);
  const complete = done >= threshold;
  const unit = mode === "count" ? (threshold === 1 ? "sesja" : "sesje") : "min";

  const add = () => {
    const n = parseInt(minutes, 10);
    if (!n || n <= 0) return;
    const item = { id: Date.now() + "" + Math.random().toString(36).slice(2, 6), category, minutes: n, date: dateKey, ...(withTime && time ? { time } : {}) };
    setData((d) => ({ ...d, sessions: [item, ...d.sessions] }));
    setMinutes("");
    setAdding(false);
  };

  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{sub}</div>
        </div>
        <span className="num" style={{ fontSize: 11, fontWeight: 900, padding: "5px 9px", borderRadius: 8, flexShrink: 0, background: complete ? T.done : "#F3E8DF", color: complete ? "#fff" : T.accent }}>
          {done} / {threshold} {unit}
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Bar value={done} max={threshold} color={complete ? T.done : T.accent} />
      </div>
      {!adding ? (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 8, background: "none", border: "none", color: T.accent, fontWeight: 800, fontSize: 12.5, padding: 0 }}>
          + Dodaj sesję
        </button>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)}
            style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px", fontSize: 13, flex: "0 0 auto" }} />
          {withTime && (
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px", fontSize: 13, flex: "0 0 auto" }} />
          )}
          <input type="number" inputMode="numeric" placeholder="min" value={minutes} onChange={(e) => setMinutes(e.target.value)}
            style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "8px 10px", fontSize: 14, width: 62, minWidth: 0 }} />
          <ActionBtn onClick={add} disabled={!minutes}>Dodaj</ActionBtn>
          <ActionBtn variant="ghost" onClick={() => setAdding(false)}>Anuluj</ActionBtn>
        </div>
      )}
    </div>
  );
}

/* ————— Wykres wagi ————— */
function WeightChart({ points }) {
  // points: [{date:'YYYY-MM-DD', value:number}] posortowane rosnąco
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const W = 640, H = 200;
  const padL = 38, padR = 10, padT = 16, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const firstPointDate = points.length ? fromKey(points[0].date) : null;
  const domainStart = firstPointDate && firstPointDate < SEASON_START ? firstPointDate : SEASON_START;
  const domainEnd = today > domainStart ? today : addDays(domainStart, 1);
  const span = Math.max(domainEnd - domainStart, 864e5);

  const xOf = (d) => padL + ((d - domainStart) / span) * plotW;
  const allVals = [START_WEIGHT, GOAL_WEIGHT, ...points.map((p) => p.value)];
  const yMax = Math.max(...allVals) + 1;
  const yMin = Math.min(...allVals) - 1;
  const yOf = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  const pts = points.map((p) => ({ ...p, x: xOf(fromKey(p.date)), y: yOf(p.value) }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const showDots = pts.length <= 40;

  const handleMove = (e) => {
    if (!svgRef.current || pts.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let nearest = 0, nearestDist = Infinity;
    pts.forEach((p, i) => {
      const dist = Math.abs(p.x - px);
      if (dist < nearestDist) { nearestDist = dist; nearest = i; }
    });
    setHover(nearest);
  };

  const hp = hover !== null ? pts[hover] : null;

  if (points.length === 0) return <Empty>Brak pomiarów. Pierwszy wpis poniżej.</Empty>;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        <line x1={padL} x2={W - padR} y1={yOf(START_WEIGHT)} y2={yOf(START_WEIGHT)} stroke={T.line} strokeWidth="1.5" strokeDasharray="4 3" />
        <text x={padL} y={yOf(START_WEIGHT) - 4} fontSize="9" fontWeight="700" fill={T.muted}>start {START_WEIGHT} kg</text>
        <line x1={padL} x2={W - padR} y1={yOf(GOAL_WEIGHT)} y2={yOf(GOAL_WEIGHT)} stroke={T.done} strokeWidth="1.5" strokeDasharray="4 3" />
        <text x={padL} y={yOf(GOAL_WEIGHT) - 4} fontSize="9" fontWeight="700" fill={T.done}>cel {GOAL_WEIGHT} kg</text>

        {pts.length > 0 && <path d={pathD} fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {showDots && pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === hover ? 4.5 : 2.5} fill={T.accent} />
        ))}
        {hp && <line x1={hp.x} x2={hp.x} y1={padT} y2={H - padB} stroke={T.muted} strokeWidth="1" strokeDasharray="2 2" />}
        {!showDots && hp && <circle cx={hp.x} cy={hp.y} r="4.5" fill={T.accent} />}

        <text x={padL} y={H - 4} fontSize="9" fontWeight="600" fill={T.muted}>{fmtPL(domainStart)}</text>
        <text x={W - padR} y={H - 4} fontSize="9" fontWeight="600" fill={T.muted} textAnchor="end">dziś</text>
      </svg>
      {hp && (
        <div style={{
          position: "absolute", left: `${(hp.x / W) * 100}%`, top: 0, transform: "translateX(-50%)",
          background: T.ink, color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 8px",
          borderRadius: 6, pointerEvents: "none", whiteSpace: "nowrap",
        }}>
          {fmtPL(fromKey(hp.date))} · {hp.value.toFixed(1)} kg
        </div>
      )}
    </div>
  );
}

/* ————— WAGA ————— */
function WeightTab({ data, setData, stats }) {
  const [dateKey, setDateKey] = useState(toKey(new Date()));
  const [val, setVal] = useState("");

  const save = () => {
    const num = parseFloat(String(val).replace(",", "."));
    if (!num || num < 50 || num > 250) return;
    setData((d) => ({ ...d, weights: { ...d.weights, [dateKey]: num } }));
    setVal("");
  };
  const entries = Object.entries(data.weights).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 10);
  const cur = stats.latestAvg;
  const progress = cur !== null ? Math.max(0, Math.min(1, (START_WEIGHT - cur) / (START_WEIGHT - GOAL_WEIGHT))) : 0;

  return (
    <div>
      <Card style={{ padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted }}>Średnia bieżącego tygodnia</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0 10px" }}>
          <span className="num" style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1 }}>
            {cur !== null ? cur.toFixed(1) : "—"}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.muted }}>kg · cel &lt;{GOAL_WEIGHT}</span>
        </div>
        <Bar value={progress * 100} max={100} color={T.accent} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, fontWeight: 700, marginTop: 6 }}>
          <span className="num">{START_WEIGHT} kg</span>
          <span className="num">{GOAL_WEIGHT} kg</span>
        </div>
        {stats.projection !== null && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: T.muted }}>
            Projekcja na koniec roku przy obecnym trendzie:{" "}
            <b className="num" style={{ color: stats.projection < GOAL_WEIGHT ? T.done : T.accent }}>{stats.projection.toFixed(1)} kg</b>
          </div>
        )}
      </Card>

      <SectionTitle>Wykres — pomiary dzienne</SectionTitle>
      <Card>
        <WeightChart points={Object.entries(data.weights).map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1))} />
      </Card>

      <SectionTitle>Wykres — średnie tygodniowe</SectionTitle>
      <Card>
        <WeightChart points={stats.weeklyAvgs.map((wk) => ({ date: wk.key, value: wk.avg }))} />
      </Card>

      <SectionTitle>Dzisiejszy pomiar</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)}
            style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 8px", fontSize: 14, flex: "0 0 auto", background: T.card, color: T.ink }} />
          <input type="number" inputMode="decimal" step="0.1" placeholder="kg" value={val} onChange={(e) => setVal(e.target.value)}
            style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 16, width: "100%", minWidth: 0 }} />
          <button onClick={save} style={{ background: T.ink, color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 800, fontSize: 14 }}>Zapisz</button>
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>Rano, po toalecie, przed jedzeniem. Liczy się średnia tygodniowa, nie pojedynczy dzień.</div>
      </Card>

      <SectionTitle>Średnie tygodniowe</SectionTitle>
      <Card>
        {stats.weeklyAvgs.length === 0 && <Empty>Brak pomiarów. Pierwszy wpis powyżej.</Empty>}
        {stats.weeklyAvgs.slice(-6).reverse().map((wk, i, arr) => {
          const next = arr[i + 1];
          const delta = next ? wk.avg - next.avg : null;
          return (
            <div key={wk.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${T.line}` : "none" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>tydz. {fmtPL(fromKey(wk.key))} <span style={{ fontSize: 11 }}>({wk.n} pom.)</span></div>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                {delta !== null && (
                  <span className="num" style={{ fontSize: 12, fontWeight: 800, color: delta <= -0.4 ? T.done : delta < 0 ? T.muted : T.danger }}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </span>
                )}
                <span className="num" style={{ fontSize: 17, fontWeight: 800 }}>{wk.avg.toFixed(1)}</span>
              </div>
            </div>
          );
        })}
        {stats.weeklyAvgs.length > 0 && (
          <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>Spadek &lt;0,4 kg/tydz. przez 2 tygodnie z rzędu → na check-inie patrzymy na pt–nd.</div>
        )}
      </Card>

      <SectionTitle>Ostatnie pomiary</SectionTitle>
      <Card>
        {entries.length === 0 && <Empty>Pusto.</Empty>}
        {entries.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < entries.length - 1 ? `1px solid ${T.line}` : "none" }}>
            <span style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>{fmtPL(fromKey(k))}</span>
            <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="num" style={{ fontWeight: 800 }}>{v.toFixed(1)} kg</span>
              <button onClick={() => setData((d) => { const w = { ...d.weights }; delete w[k]; return { ...d, weights: w }; })}
                style={{ background: "none", border: "none", color: T.muted, padding: 4 }} aria-label="usuń"><Trash2 size={15} /></button>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ fontSize: 13, color: T.muted, padding: "6px 0" }}>{children}</div>;
}

/* ————— CELE / ODBLOKOWANIA ————— */
function GoalsTab({ data, setData, stats }) {
  const c = data.counters;
  const setC = (patch) => setData((d) => ({ ...d, counters: { ...d.counters, ...patch } }));

  const backlogBooks = data.library.filter((it) => (it.type === "książka" || it.type === "manga") && it.status === "backlog").length;
  const ratio = backlogBooks > 10 ? 2 : 1;
  const credits = c.booksFinished - c.bookCreditsSpent;
  const canBuyBook = credits >= ratio;

  const bikeUnlocked = stats.latestAvg !== null && stats.latestAvg < GOAL_WEIGHT;

  return (
    <div>
      <UnlockCard
        title="Drobny sprzęt sportowy"
        sub="gryf, hantle, akcesoria do ~1500 zł · 8 kolejnych tygodni z min. siłowym"
        unlocked={stats.streak >= 8}
        footer={`seria: ${stats.streak} / 8 tygodni`}
      >
        <Bar value={stats.streak} max={8} color={stats.streak >= 8 ? T.done : T.accent} />
      </UnlockCard>

      <UnlockCard
        title="Nowy rower"
        sub={`nagroda za średnią tygodniową < ${GOAL_WEIGHT} kg · research wolno, zakup nie`}
        unlocked={bikeUnlocked}
        footer={stats.latestAvg !== null ? `obecna średnia: ${stats.latestAvg.toFixed(1)} kg` : "brak pomiarów wagi"}
      >
        <Bar value={stats.latestAvg !== null ? START_WEIGHT - stats.latestAvg : 0} max={START_WEIGHT - GOAL_WEIGHT} color={bikeUnlocked ? T.done : T.accent} />
      </UnlockCard>

      <UnlockCard
        title="Zakup figurek"
        sub="nowy zakup po pomalowaniu 5 od poprzedniego"
        unlocked={c.figPaintedSinceBuy >= 5}
        footer={`pomalowane od zakupu: ${c.figPaintedSinceBuy} / 5 · łącznie w sezonie: ${c.figPaintedTotal} / 25`}
      >
        <Bar value={c.figPaintedSinceBuy} max={5} color={c.figPaintedSinceBuy >= 5 ? T.done : T.accent} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <ActionBtn onClick={() => setC({ figPaintedSinceBuy: c.figPaintedSinceBuy + 1, figPaintedTotal: c.figPaintedTotal + 1 })}>+1 pomalowana</ActionBtn>
          <ActionBtn disabled={c.figPaintedSinceBuy < 5} variant="ghost"
            onClick={() => setC({ figPaintedSinceBuy: 0 })}>Kupuję → reset</ActionBtn>
        </div>
      </UnlockCard>

      <UnlockCard
        title="Zakup książki"
        sub={`zasada ${ratio}:1${ratio === 2 ? " (backlog >10 — zaostrzona)" : ""} · skończona odblokowuje zakup`}
        unlocked={canBuyBook}
        footer={`kredyty: ${credits} · skończone: ${c.booksFinished} / 20 · backlog na półce: ${backlogBooks}`}
      >
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <ActionBtn onClick={() => setC({ booksFinished: c.booksFinished + 1 })}>+1 skończona</ActionBtn>
          <ActionBtn disabled={!canBuyBook} variant="ghost"
            onClick={() => setC({ bookCreditsSpent: c.bookCreditsSpent + ratio })}>Kupuję (−{ratio})</ActionBtn>
        </div>
      </UnlockCard>

      <UnlockCard
        title="Nowy model do składania"
        sub="nowy po ukończeniu poprzedniego · model z Helą liczy się wspólnie"
        unlocked={!c.currentModel}
        footer={c.modelsDone > 0 ? `ukończone modele: ${c.modelsDone}` : null}
      >
        {c.currentModel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>W toku: {c.currentModel}</div>
            <ActionBtn onClick={() => setC({ currentModel: "", modelsDone: c.modelsDone + 1 })}>Ukończony</ActionBtn>
          </div>
        ) : (
          <ModelInput onStart={(name) => setC({ currentModel: name })} />
        )}
      </UnlockCard>
    </div>
  );
}
function UnlockCard({ title, sub, unlocked, footer, children }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
          <div style={{ fontSize: 11.5, color: T.muted, fontWeight: 600, marginTop: 2 }}>{sub}</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: unlocked ? T.done : T.muted, flexShrink: 0, marginTop: 2 }}>
          {unlocked ? <Unlock size={14} /> : <Lock size={14} />}
          {unlocked ? "otwarte" : "zamknięte"}
        </span>
      </div>
      {children}
      {footer && <div className="num" style={{ fontSize: 12, color: T.muted, fontWeight: 700, marginTop: 8 }}>{footer}</div>}
    </Card>
  );
}
function ActionBtn({ children, onClick, disabled, variant }) {
  const ghost = variant === "ghost";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ flex: 1, padding: "10px 8px", borderRadius: 10, fontWeight: 800, fontSize: 13, border: ghost ? `1.5px solid ${disabled ? T.line : T.ink}` : "none", background: ghost ? "transparent" : disabled ? T.line : T.ink, color: ghost ? (disabled ? T.muted : T.ink) : "#fff", opacity: disabled ? 0.6 : 1 }}>
      {children}
    </button>
  );
}
function ModelInput({ onStart }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa nowego modelu"
        style={{ flex: 1, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 14, minWidth: 0 }} />
      <ActionBtn disabled={!name.trim()} onClick={() => { onStart(name.trim()); setName(""); }}>Start</ActionBtn>
    </div>
  );
}

/* ————— FUNDUSZE ————— */
function FundsTab({ data, setData, stats }) {
  const due = stats.bonus;
  const transferred = data.funds.transferred || 0;
  const toTransfer = Math.max(0, due - transferred);
  const [resetArm, setResetArm] = useState(false);
  const fileRef = useRef(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-2026-backup-${toKey(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importData = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== "object" || !("weeks" in parsed)) throw new Error("bad file");
        setData(mergeWithDefaults(parsed));
      } catch {
        alert("Nieprawidłowy plik backupu.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <Card style={{ padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted }}>Bonusy Dream Car — należne</div>
        <div className="num" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.02em", margin: "4px 0 10px" }}>{due} zł</div>
        <div style={{ fontSize: 13, color: T.muted, display: "grid", gap: 4 }}>
          <div className="num">tygodnie z pełnym minimum: <b style={{ color: T.ink }}>{stats.fullWeeks}</b> × 100 zł = <b style={{ color: T.ink }}>{stats.fullWeeks * 100} zł</b></div>
          <div className="num">kilogramy w dół (potwierdzone średnią): <b style={{ color: T.ink }}>{stats.kgLost}</b> × 200 zł = <b style={{ color: T.ink }}>{stats.kgLost * 200} zł</b></div>
        </div>
      </Card>

      <Card>
        <Row label="Przelane dotąd" sub="suma bonusów faktycznie wpłaconych na subkonto">
          <input type="number" inputMode="numeric" value={transferred}
            onChange={(e) => setData((d) => ({ ...d, funds: { ...d.funds, transferred: Math.max(0, parseInt(e.target.value || "0", 10)) } }))}
            className="num"
            style={{ width: 110, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 15, fontWeight: 800, textAlign: "right" }} />
        </Row>
        <Divider />
        <Row label="Do przelania">
          <span className="num" style={{ fontSize: 20, fontWeight: 900, color: toTransfer > 0 ? T.accent : T.done }}>{toTransfer} zł</span>
        </Row>
      </Card>

      <Card>
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Kolejność stałych przelewów po wypłacie: <b style={{ color: T.ink }}>emerytura → działka → dream car</b>.
          Kwoty ustalamy po sierpniowym baseline wydatków — bonusy powyżej są niezależne i działają od dziś.
        </div>
      </Card>

      <SectionTitle>Dane</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn variant="ghost" onClick={exportData}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={14} /> Eksport JSON</span>
          </ActionBtn>
          <ActionBtn variant="ghost" onClick={() => fileRef.current && fileRef.current.click()}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Import</span>
          </ActionBtn>
          <input ref={fileRef} type="file" accept="application/json" onChange={importData} style={{ display: "none" }} />
        </div>
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>
          Dane żyją w tej przeglądarce (localStorage). Raz na tydzień, przy check-inie, zrób eksport — to Twój backup i sposób przeniesienia danych na inne urządzenie.
        </div>
      </Card>

      <Card style={{ borderStyle: "dashed" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: resetArm ? 8 : 0 }}>
          <AlertTriangle size={15} color={T.muted} />
          <button onClick={() => setResetArm(!resetArm)} style={{ background: "none", border: "none", color: T.muted, fontSize: 12.5, fontWeight: 700, padding: 0 }}>
            {resetArm ? "Anuluj" : "Reset wszystkich danych aplikacji"}
          </button>
        </div>
        {resetArm && (
          <button onClick={() => { localStorage.removeItem(STORAGE_KEY); window.location.reload(); }}
            style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1.5px solid ${T.danger}`, background: "transparent", color: T.danger, fontWeight: 800, fontSize: 13 }}>
            Potwierdzam — usuń wszystko bezpowrotnie
          </button>
        )}
      </Card>
    </div>
  );
}

/* ————— BIBLIOTEKA ————— */
const TYPES = ["figurka", "książka", "audiobook", "manga", "model", "film", "serial"];
const STATUSES = ["backlog", "w toku", "ukończone"];

function LibraryTab({ data, setData }) {
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("wszystko");
  const [fStatus, setFStatus] = useState("wszystko");
  const [adding, setAdding] = useState(false);
  const [nTitle, setNTitle] = useState("");
  const [nType, setNType] = useState("figurka");
  const [nStatus, setNStatus] = useState("backlog");
  const [confirmDel, setConfirmDel] = useState(null);

  const add = () => {
    if (!nTitle.trim()) return;
    const item = { id: Date.now() + "" + Math.random().toString(36).slice(2, 6), title: nTitle.trim(), type: nType, status: nStatus, rating: 0, added: toKey(new Date()) };
    setData((d) => ({ ...d, library: [item, ...d.library] }));
    setNTitle("");
  };
  const updItem = (id, patch) => setData((d) => ({ ...d, library: d.library.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));
  const del = (id) => setData((d) => ({ ...d, library: d.library.filter((it) => it.id !== id) }));

  const filtered = data.library.filter((it) =>
    (fType === "wszystko" || it.type === fType) &&
    (fStatus === "wszystko" || it.status === fStatus) &&
    (!q || it.title.toLowerCase().includes(q.toLowerCase()))
  );

  const counts = STATUSES.map((s) => [s, data.library.filter((i) => i.status === s).length]);

  return (
    <div>
      <Card style={{ display: "flex", gap: 14, justifyContent: "space-around", padding: "12px 8px" }}>
        {counts.map(([s, n]) => (
          <div key={s} style={{ textAlign: "center" }}>
            <div className="num" style={{ fontSize: 22, fontWeight: 900 }}>{n}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: T.muted }}>{s}</div>
          </div>
        ))}
      </Card>

      {/* dodawanie */}
      <Card>
        {!adding ? (
          <button onClick={() => setAdding(true)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: T.ink, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={16} /> Dodaj pozycję
          </button>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <input value={nTitle} onChange={(e) => setNTitle(e.target.value)} placeholder="Tytuł / nazwa" autoFocus
              style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 12px", fontSize: 15 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={nType} onChange={(e) => setNType(e.target.value)} style={selStyle}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <select value={nStatus} onChange={(e) => setNStatus(e.target.value)} style={selStyle}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <ActionBtn onClick={add} disabled={!nTitle.trim()}>Dodaj</ActionBtn>
              <ActionBtn variant="ghost" onClick={() => setAdding(false)}>Zamknij</ActionBtn>
            </div>
          </div>
        )}
      </Card>

      {/* szukaj + filtry */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
        <Search size={16} color={T.muted} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj…" style={{ border: "none", outline: "none", fontSize: 14, width: "100%", background: "transparent" }} />
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4 }}>
        {["wszystko", ...TYPES].map((t) => (
          <Chip key={t} active={fType === t} onClick={() => setFType(t)}>{t}</Chip>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
        {["wszystko", ...STATUSES].map((s) => (
          <Chip key={s} active={fStatus === s} onClick={() => setFStatus(s)}>{s}</Chip>
        ))}
      </div>

      {/* lista */}
      <Card>
        {filtered.length === 0 && <Empty>{data.library.length === 0 ? "Biblioteka pusta — dodaj pierwszą pozycję powyżej." : "Brak wyników dla filtrów."}</Empty>}
        {filtered.map((it, i) => (
          <div key={it.id} style={{ padding: "10px 0", borderBottom: i < filtered.length - 1 ? `1px solid ${T.line}` : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, overflowWrap: "anywhere" }}>{it.title}</div>
                <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{it.type}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <button onClick={() => {
                  const idx = STATUSES.indexOf(it.status);
                  updItem(it.id, { status: STATUSES[(idx + 1) % STATUSES.length] });
                }} style={{ fontSize: 11, fontWeight: 800, padding: "5px 9px", borderRadius: 8, border: "none", background: it.status === "ukończone" ? T.done : it.status === "w toku" ? T.accent : T.paper, color: it.status === "backlog" ? T.muted : "#fff" }}>
                  {it.status}
                </button>
                {confirmDel === it.id ? (
                  <button onClick={() => del(it.id)} style={{ background: T.danger, color: "#fff", border: "none", borderRadius: 8, padding: "5px 8px", fontSize: 11, fontWeight: 800 }}>na pewno?</button>
                ) : (
                  <button onClick={() => setConfirmDel(it.id)} style={{ background: "none", border: "none", color: T.muted, padding: 4 }} aria-label="usuń"><Trash2 size={15} /></button>
                )}
              </div>
            </div>
            {it.status === "ukończone" && (
              <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => updItem(it.id, { rating: it.rating === n ? 0 : n })} style={{ background: "none", border: "none", padding: 2 }} aria-label={`ocena ${n}`}>
                    <Star size={16} fill={it.rating >= n ? T.accent : "none"} color={it.rating >= n ? T.accent : T.line} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </Card>
      {data.library.length > 0 && (
        <div style={{ fontSize: 11.5, color: T.muted, textAlign: "center", marginTop: 4 }}>
          {data.library.length} pozycji łącznie
        </div>
      )}
    </div>
  );
}
const selStyle = { flex: 1, border: `1px solid ${T.line}`, borderRadius: 10, padding: "10px 8px", fontSize: 14, background: T.card, color: T.ink };
function Chip({ children, active, onClick }) {
  return (
    <button onClick={onClick} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 99, fontSize: 12, fontWeight: 800, border: `1.5px solid ${active ? T.ink : T.line}`, background: active ? T.ink : T.card, color: active ? "#fff" : T.muted }}>
      {children}
    </button>
  );
}

/* ————— HISTORIA ————— */
const SESSION_CATEGORIES = Object.keys(SESSION_GOALS);
const CHART_WEEKS = 8;

function HistoryTab({ data, setData }) {
  const [filter, setFilter] = useState("wszystko");

  const curMonday = mondayOf(new Date());
  const weekKeys = Array.from({ length: CHART_WEEKS }, (_, i) => toKey(addDays(curMonday, (i - (CHART_WEEKS - 1)) * 7)));

  const chartData = weekKeys.map((k) => {
    const total = filter === "wszystko"
      ? SESSION_CATEGORIES.reduce((sum, c) => sum + sessionsMinutesInWeek(data, k, c), 0)
      : sessionsMinutesInWeek(data, k, filter);
    return { key: k, minutes: total };
  });
  const maxMinutes = Math.max(1, ...chartData.map((x) => x.minutes));

  const sessions = data.sessions
    .filter((s) => filter === "wszystko" || s.category === filter)
    .slice()
    .sort((a, b) => {
      const ak = `${a.date} ${a.time || "00:00"}`;
      const bk = `${b.date} ${b.time || "00:00"}`;
      return ak === bk ? 0 : ak < bk ? 1 : -1;
    });

  const del = (id) => setData((d) => ({ ...d, sessions: d.sessions.filter((s) => s.id !== id) }));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 4 }}>
        <Chip active={filter === "wszystko"} onClick={() => setFilter("wszystko")}>wszystko</Chip>
        {SESSION_CATEGORIES.map((c) => (
          <Chip key={c} active={filter === c} onClick={() => setFilter(c)}>{SESSION_LABELS[c]}</Chip>
        ))}
      </div>

      <SectionTitle>Minuty na tydzień</SectionTitle>
      <Card>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
          {chartData.map((x) => (
            <div key={x.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
              <div className="num" style={{ fontSize: 9.5, fontWeight: 700, color: T.muted }}>{x.minutes || ""}</div>
              <div style={{ width: "100%", height: 90, background: T.paper, borderRadius: 5, overflow: "hidden", display: "flex", alignItems: "flex-end", border: `1px solid ${T.line}` }}>
                <div style={{ width: "100%", height: `${(x.minutes / maxMinutes) * 100}%`, background: x.key === toKey(curMonday) ? T.accent : T.muted, opacity: x.key === toKey(curMonday) ? 1 : 0.55 }} />
              </div>
              <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>{fmtPL(fromKey(x.key))}</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle>Zdarzenia</SectionTitle>
      <Card>
        {sessions.length === 0 && <Empty>Brak zalogowanych sesji dla tego filtra.</Empty>}
        {sessions.map((s, i) => (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < sessions.length - 1 ? `1px solid ${T.line}` : "none" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{SESSION_LABELS[s.category]}</div>
              <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{fmtPL(fromKey(s.date))}{s.time ? `, ${s.time}` : ""}</div>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="num" style={{ fontWeight: 800 }}>{s.minutes} min</span>
              <button onClick={() => del(s.id)} style={{ background: "none", border: "none", color: T.muted, padding: 4 }} aria-label="usuń"><Trash2 size={15} /></button>
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
