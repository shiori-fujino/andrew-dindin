// AndrewPage.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);
await supabase.auth.signInWithPassword({
  email: "your@email.com",
  password: "yourpassword"
});

// Fixed “today” for your world-building (you can switch to real today later)
const TODAY_ISO = "2026-03-04";
const SUM30_ISO = "2026-07-25";

// Given: today is 4w4d
const GA_WEEKS = 4;
const GA_DAYS = 4;

type LogRow = {
  id: number;
  log_date: string; // YYYY-MM-DD
  mood: number; // 1..5
  cravings: string[] | null;
  note: string | null;
};

function parseISODateUTC(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatISODateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysISO(iso: string, days: number) {
  const t = parseISODateUTC(iso).getTime() + days * 86400000;
  return formatISODateUTC(new Date(t));
}
function daysBetweenISO(a: string, b: string) {
  return Math.round(
    (parseISODateUTC(b).getTime() - parseISODateUTC(a).getTime()) / 86400000
  );
}
function clampMood(n: number) {
  return Math.max(1, Math.min(5, n));
}
function cleanTags(input: string) {
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return Array.from(new Set(parts));
}

const moodColor = (m: number | null | undefined) => {
  // simple & readable (no fancy palette wars)
  if (!m) return "#ffffff"; // no log
  if (m === 1) return "#ff6b6b"; // red
  if (m === 2) return "#ffa94d"; // orange
  if (m === 3) return "#ffd43b"; // yellow
  if (m === 4) return "#69db7c"; // green
  return "#38d9a9"; // super green for 5
};

export default function AndrewPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // editor (for your daily entry)
  const [logDate, setLogDate] = useState(TODAY_ISO);
  const [mood, setMood] = useState<number>(3);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  async function loadFeed() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("preg_log")
      .select("id,log_date,mood,cravings,note")
      .order("log_date", { ascending: false })
      .limit(400);

    if (error) {
      setMsg(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as LogRow[]);
    }
    setLoading(false);
  }

  async function loadForDate(dateISO: string) {
    setMsg(null);
    setLogDate(dateISO);

    const { data, error } = await supabase
      .from("preg_log")
      .select("id,log_date,mood,cravings,note")
      .eq("log_date", dateISO)
      .maybeSingle();

    if (error) return setMsg(error.message);

    if (data) {
      const r = data as LogRow;
      setMood(clampMood(Number(r.mood)));
      setTags((r.cravings ?? []).map(String));
      setNote(r.note ?? "");
    } else {
      setMood(3);
      setTags([]);
      setNote("");
    }
  }

  async function save() {
    setMsg(null);

    const payload = {
      log_date: logDate,
      mood: clampMood(mood),
      cravings: tags,
      note: note,
    };

    // If your table is UNIQUE(log_date) (single-user), this works.
    // If it’s UNIQUE(user_id, log_date), DB needs auth.uid() to fill user_id.
    const { error } = await supabase.from("preg_log").upsert(payload as any, {
      onConflict: "log_date",
    });

    if (error) return setMsg(error.message);

    setMsg("Saved.");
    await loadFeed();
  }

  useEffect(() => {
    loadFeed();
  }, []);

  // ---- derived: counters
  const sum30DDay = useMemo(() => daysBetweenISO(TODAY_ISO, SUM30_ISO), []);
  const dueISO = useMemo(() => {
    const ga = GA_WEEKS * 7 + GA_DAYS; // 32
    const remaining = 280 - ga; // 248
    return addDaysISO(TODAY_ISO, remaining);
  }, []);
  const dueDDay = useMemo(() => daysBetweenISO(TODAY_ISO, dueISO), [dueISO]);

  // ---- streak (Duolingo brain)
  const streak = useMemo(() => {
    const set = new Set(rows.map((r) => r.log_date));
    let cur = TODAY_ISO;
    let s = 0;
    while (set.has(cur)) {
      s += 1;
      cur = addDaysISO(cur, -1);
    }
    return s;
  }, [rows]);

  const bestStreak = useMemo(() => {
    const set = new Set(rows.map((r) => r.log_date));
    if (set.size === 0) return 0;

    // compute streaks across all logged days
    const dates = Array.from(set).sort(); // ascending
    let best = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = dates[i - 1];
      const cur = dates[i];
      if (daysBetweenISO(prev, cur) === 1) run += 1;
      else run = 1;
      if (run > best) best = run;
    }
    return best;
  }, [rows]);

  // ---- craving cloud
  const cravingCloud = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.cravings ?? []) {
        const k = (t ?? "").trim().toLowerCase();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [rows]);

  // ---- heatmap (GitHub-ish): last N weeks ending TODAY
  const HEATMAP_WEEKS = 16; // adjust: 12, 16, 20...
  const heatmap = useMemo(() => {
    // map date -> mood
    const byDate = new Map<string, number>();
    rows.forEach((r) => byDate.set(r.log_date, clampMood(Number(r.mood))));

    // Align start to Monday for nicer columns (Mon..Sun rows)
    // We’ll render rows as Mon..Sun (7 rows), columns = weeks.
    const end = parseISODateUTC(TODAY_ISO);
    // find Monday of the week containing end
    const day = (end.getUTCDay() + 6) % 7; // convert Sun(0) -> 6, Mon(1)->0
    const endMonday = new Date(end.getTime() - day * 86400000);

    const startMonday = new Date(endMonday.getTime() - (HEATMAP_WEEKS - 1) * 7 * 86400000);

    const columns: { weekStartISO: string; days: { iso: string; mood?: number }[] }[] = [];
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const weekStart = new Date(startMonday.getTime() + w * 7 * 86400000);
      const weekStartISO = formatISODateUTC(weekStart);
      const daysArr: { iso: string; mood?: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(weekStart.getTime() + d * 86400000);
        const iso = formatISODateUTC(dt);
        // only color up to TODAY (don’t color future)
        const isFuture = daysBetweenISO(TODAY_ISO, iso) > 0;
        daysArr.push({
          iso,
          mood: isFuture ? undefined : byDate.get(iso),
        });
      }
      columns.push({ weekStartISO, days: daysArr });
    }

    return columns;
  }, [rows]);

  function addTag() {
    const newTags = cleanTags(tagInput);
    if (!newTags.length) return;
    setTags((prev) => Array.from(new Set([...prev, ...newTags])));
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <div style={S.title}>Preg Log</div>
          <div style={S.sub}>Data + diary. Public read. One log per day.</div>
        </div>

        <div style={S.headerRight}>
          <Pill>🔥 Streak <b>{streak}</b></Pill>
          <Pill>🏆 Best <b>{bestStreak}</b></Pill>
          <Pill>🏃 SUM 30 D-{Math.max(0, sum30DDay)}</Pill>
          <Pill>👶 Due D-{Math.max(0, dueDDay)} <span style={{ opacity: 0.7 }}>({dueISO})</span></Pill>
        </div>
      </header>

      {msg && <div style={S.msg}>{msg}</div>}

      {/* Pregnancy progress */}
      <section style={S.card}>
        <div style={S.cardTitle}>Pregnancy</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>
            Week {GA_WEEKS} Day {GA_DAYS}
          </div>
          <div style={{ opacity: 0.75 }}>
            {GA_WEEKS * 7 + GA_DAYS} / 280 days
          </div>
        </div>

        <div style={S.progressOuter}>
          <div
            style={{
              ...S.progressInner,
              width: `${((GA_WEEKS * 7 + GA_DAYS) / 280) * 100}%`,
            }}
          />
        </div>
      </section>

      {/* Heatmap */}
      <section style={S.card}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Mood heatmap</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: 0.75 }}>
            <LegendDot color="#ffffff" label="no log" />
            <LegendDot color={moodColor(1)} label="1" />
            <LegendDot color={moodColor(2)} label="2" />
            <LegendDot color={moodColor(3)} label="3" />
            <LegendDot color={moodColor(4)} label="4" />
            <LegendDot color={moodColor(5)} label="5" />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridAutoFlow: "column", gap: 6 }}>
            {heatmap.map((col) => (
              <div key={col.weekStartISO} style={{ display: "grid", gap: 6 }}>
                {col.days.map((d) => {
                  const c = d.mood ? moodColor(d.mood) : "#ffffff";
                  const border = d.mood ? "#e9ecef" : "#f1f3f5";
                  return (
                    <div
                      key={d.iso}
                      title={`${d.iso}${d.mood ? ` mood ${d.mood}` : ""}`}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        background: c,
                        border: `1px solid ${border}`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Craving cloud */}
      <section style={S.card}>
        <div style={S.cardTitle}>Craving cloud</div>
        {cravingCloud.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No cravings yet.</div>
        ) : (
          <div style={S.wrap}>
            {cravingCloud.map(([tag, count]) => (
              <span key={tag} style={S.pill}>
                {tag} <span style={{ opacity: 0.65 }}>({count})</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Today editor */}
      <section style={S.card}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Today log</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="date"
              value={logDate}
              onChange={(e) => loadForDate(e.target.value)}
              style={{ ...S.input, width: 160 }}
            />
            <button style={S.btn} onClick={save}>
              Save
            </button>
          </div>
        </div>

        <div style={S.grid}>
          <div style={S.label}>Mood</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input
              type="range"
              min={1}
              max={5}
              value={mood}
              onChange={(e) => setMood(clampMood(Number(e.target.value)))}
              style={{ width: 240 }}
            />
            <div style={{ fontWeight: 900, width: 16 }}>{mood}</div>
          </div>

          <div style={S.label}>Cravings</div>
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder='type + Enter (or commas): "dumpling, mango"'
                style={S.input}
              />
              <button style={S.btn} onClick={addTag}>
                Add
              </button>
            </div>

            <div style={{ ...S.wrap, marginTop: 10 }}>
              {tags.length === 0 ? (
                <span style={{ opacity: 0.7 }}>No tags.</span>
              ) : (
                tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag(t)}
                    style={S.pillBtn}
                    title="Remove"
                  >
                    {t} <span style={{ opacity: 0.65 }}>×</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ ...S.label, alignSelf: "start", paddingTop: 6 }}>Note</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="blog note..."
            style={{ ...S.input, minHeight: 140, resize: "vertical" }}
          />
        </div>
      </section>

      {/* Timeline */}
      <section style={S.card}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Timeline</div>
          <button style={S.btn} onClick={loadFeed} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div style={{ opacity: 0.7, marginTop: 10 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 10 }}>No entries yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {rows.map((r) => (
              <article key={r.id} style={S.post}>
                <div style={S.rowBetween}>
                  <div style={{ fontWeight: 900 }}>{r.log_date}</div>
                  <span style={S.badge}>mood {r.mood}/5</span>
                </div>

                {r.cravings && r.cravings.length > 0 && (
                  <div style={{ ...S.wrap, marginTop: 8 }}>
                    {r.cravings.map((t) => (
                      <span key={t} style={S.pill}>{t}</span>
                    ))}
                  </div>
                )}

                {r.note && (
                  <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {r.note}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span style={S.badge}>{children}</span>;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 4,
          background: color,
          border: "1px solid #e9ecef",
          display: "inline-block",
        }}
      />
      <span>{label}</span>
    </span>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 920, margin: "0 auto", padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" },
  headerRight: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  title: { fontSize: 22, fontWeight: 950 },
  sub: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  card: { marginTop: 14, padding: 14, border: "1px solid #eee", borderRadius: 16, background: "white" },
  cardTitle: { fontWeight: 900 },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  msg: { marginTop: 12, padding: 10, borderRadius: 12, background: "#fff3cd", border: "1px solid #ffe69c" },
  btn: { padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", cursor: "pointer", fontWeight: 800 },
  input: { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #ddd", background: "white", boxSizing: "border-box" },
  badge: { padding: "6px 10px", borderRadius: 999, border: "1px solid #eee", background: "#fafafa", fontSize: 12, whiteSpace: "nowrap" },
  pill: { padding: "6px 10px", borderRadius: 999, border: "1px solid #eee", background: "#fafafa", fontSize: 13 },
  pillBtn: { padding: "6px 10px", borderRadius: 999, border: "1px solid #eee", background: "#fafafa", fontSize: 13, cursor: "pointer" },
  wrap: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
  grid: { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center", marginTop: 12 },
  label: { opacity: 0.75, fontWeight: 800 },
  post: { padding: 12, border: "1px solid #eee", borderRadius: 14 },
  progressOuter: { marginTop: 10, background: "#f1f3f5", height: 10, borderRadius: 999, overflow: "hidden" },
  progressInner: { height: "100%", background: "#69db7c", borderRadius: 999 },
};