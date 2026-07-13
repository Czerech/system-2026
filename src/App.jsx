import { useState, useEffect, useRef, useMemo } from "react";
import {
  CalendarCheck, Scale, Trophy, PiggyBank, Library as LibraryIcon,
  Plus, Minus, Check, Star, Trash2, Search, AlertTriangle, Lock, Unlock,
  Download, Upload
} from "lucide-react";

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
const START_WEIGHT = 115;
const GOAL_WEIGHT = 100;

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
  sila: 0, rower: 0, figurki: false, czytanie: false, duolingo: false,
  wydatki: false, dom: false, rozwoj: 0, awaryjny: false,
});
const isFullWeek = (w) =>
  w.sila >= 2 && w.rower >= 1 && w.figurki && w.czytanie && w.duolingo &&
  w.wydatki && w.dom && w.rozwoj >= 2;

const DEFAULT_DATA = {
  v: 1,
  weights: {},          // 'YYYY-MM-DD' -> kg
  weeks: {},            // 'YYYY-MM-DD' (poniedziałek) -> week obj
  counters: {
    figPaintedSinceBuy: 0, figPaintedTotal: 0,
    booksFinished: 0, bookCreditsSpent: 0,
    currentModel: "", modelsDone: 0,
  },
  funds: { transferred: 0 },
  library: [],          // {id,type,title,status,rating,added}
};

const STORAGE_KEY = "system-2026-v1";

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_DATA;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DATA,
      ...parsed,
      counters: { ...DEFAULT_DATA.counters, ...(parsed.counters || {}) },
      funds: { ...DEFAULT_DATA.funds, ...(parsed.funds || {}) },
    };
  } catch {
    return DEFAULT_DATA;
  }
}

/* ————— Główny komponent ————— */
export default function App() {
  const [data, setData] = useState(loadData);
  const [tab, setTab] = useState("tydzien");
  const [saved, setSaved] = useState(true);
  const saveTimer = useRef(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setSaved(true);
      } catch {
        setSaved(false);
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  const stats = useMemo(() => computeStats(data), [data]);

  const tabs = [
    { id: "tydzien", label: "Tydzień", icon: CalendarCheck },
    { id: "waga", label: "Waga", icon: Scale },
    { id: "cele", label: "Cele", icon: Trophy },
    { id: "fundusze", label: "Fundusze", icon: PiggyBank },
    { id: "biblioteka", label: "Biblioteka", icon: LibraryIcon },
  ];

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
        <div style={{ fontSize: 11, color: saved ? T.muted : T.accent, fontWeight: 600 }}>{saved ? "zapisano" : "zapisywanie…"}</div>
      </header>

      <main style={{ maxWidth: 560, margin: "0 auto", padding: "8px 16px 96px" }}>
        {tab === "tydzien" && <WeekTab data={data} setData={setData} stats={stats} />}
        {tab === "waga" && <WeightTab data={data} setData={setData} stats={stats} />}
        {tab === "cele" && <GoalsTab data={data} setData={setData} stats={stats} />}
        {tab === "fundusze" && <FundsTab data={data} setData={setData} stats={stats} />}
        {tab === "biblioteka" && <LibraryTab data={data} setData={setData} />}
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
  const fullWeeks = nonEmergency.filter((x) => isFullWeek(x.w)).length;
  const pct = nonEmergency.length ? Math.round((100 * fullWeeks) / nonEmergency.length) : 0;

  // seria siłowa (od bieżącego tygodnia wstecz; bieżący nie przerywa, awaryjne pauzują)
  let streak = 0;
  for (let i = weekObjs.length - 1; i >= 0; i--) {
    const { w } = weekObjs[i];
    const isCurrent = i === weekObjs.length - 1;
    if (w.awaryjny) continue;
    if (w.sila >= 2) streak++;
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
function Stepper({ value, onChange, min = 0, max = 9 }) {
  const btn = { width: 34, height: 34, borderRadius: 10, border: `1px solid ${T.line}`, background: T.card, display: "flex", alignItems: "center", justifyContent: "center", color: T.ink };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button style={btn} onClick={() => onChange(Math.max(min, value - 1))} aria-label="mniej"><Minus size={16} /></button>
      <div className="num" style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 17 }}>{value}</div>
      <button style={btn} onClick={() => onChange(Math.min(max, value + 1))} aria-label="więcej"><Plus size={16} /></button>
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

  const full = isFullWeek(w);
  const toggles = [
    { key: "figurki", label: "Figurki — 1 sesja ≥45 min" },
    { key: "czytanie", label: "Czytanie — 3×20 min / audiobook" },
    { key: "duolingo", label: "Duolingo 7/7" },
    { key: "wydatki", label: "Wydatki zapisane (15 min)" },
    { key: "dom", label: "Sprzątanie + 1 zadanie z backlogu" },
  ];

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

      <SectionTitle>Minimum tygodniowe</SectionTitle>
      <Card>
        <Row label="Siłownia" sub="min 2 · target 3">
          <Stepper value={w.sila} onChange={(v) => upd({ sila: v })} />
        </Row>
        <Divider />
        <Row label="Rower" sub="min 1 · target 2">
          <Stepper value={w.rower} onChange={(v) => upd({ rower: v })} />
        </Row>
        <Divider />
        <Row label="Rozwój (h)" sub="min 2 h">
          <Stepper value={w.rozwoj} onChange={(v) => upd({ rozwoj: v })} max={20} />
        </Row>
        <Divider />
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
        sub="nagroda za średnią tygodniową < 100 kg · research wolno, zakup nie"
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
        setData({
          ...DEFAULT_DATA,
          ...parsed,
          counters: { ...DEFAULT_DATA.counters, ...(parsed.counters || {}) },
          funds: { ...DEFAULT_DATA.funds, ...(parsed.funds || {}) },
        });
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
