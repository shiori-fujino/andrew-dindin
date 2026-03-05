// AndrewPage.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

const SUM30_ISO = "2026-07-25";
const LMP_ISO = "2026-02-01";

type LogRow = {
  id: number;
  log_date: string; // YYYY-MM-DD
  mood: number; // 1..5
  cravings: string[] | null;
  note: string | null;
};

function formatDateAU(iso: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

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
  if (!m) return "#ffffff"; // no log
  if (m === 1) return "#ff6b6b";
  if (m === 2) return "#ffa94d";
  if (m === 3) return "#ffd43b";
  if (m === 4) return "#69db7c";
  return "#38d9a9";
};

function moodEmoji(m: number) {
  const mm = clampMood(m);
  if (mm === 1) return "😭";
  if (mm === 2) return "😖";
  if (mm === 3) return "😐";
  if (mm === 4) return "🙂";
  return "😈";
}

function deriveTitle(note: string | null) {
  const t = (note ?? "").trim();
  if (!t) return "Untitled";
  const firstLine = t.split("\n")[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine;
}

export default function AndrewPage() {
  // ✅ TODAY that updates daily even if app stays open
  const [todayISO, setTodayISO] = useState(() => formatISODateUTC(new Date()));

  useEffect(() => {
    // Schedule a refresh at next local midnight
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const ms = next.getTime() - now.getTime();

    const t = window.setTimeout(() => {
      setTodayISO(formatISODateUTC(new Date()));
    }, ms + 1000);

    return () => window.clearTimeout(t);
  }, [todayISO]); // re-arm each day

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // editor
  const [logDate, setLogDate] = useState(todayISO);
  const [mood, setMood] = useState<number>(3);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // timeline UX
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<number | null>(null);

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

    const { error } = await supabase.from("preg_log").upsert(payload as any, {
      onConflict: "log_date",
    });

    if (error) return setMsg(error.message);

    setMsg("Saved.");
    await loadFeed();
  }

  // initial load + whenever today changes (midnight), jump editor to today
  useEffect(() => {
    loadFeed();
    loadForDate(todayISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO]);

  // ✅ GA derived from LMP + today (auto updates daily)
  const gaDays = useMemo(
    () => Math.max(0, daysBetweenISO(LMP_ISO, todayISO)),
    [todayISO]
  );
  const GA_WEEKS = useMemo(() => Math.floor(gaDays / 7), [gaDays]);
  const GA_DAYS = useMemo(() => gaDays % 7, [gaDays]);

  // counters (auto updates daily)
  const sum30DDay = useMemo(
    () => daysBetweenISO(todayISO, SUM30_ISO),
    [todayISO]
  );
  const dueISO = useMemo(() => addDaysISO(LMP_ISO, 280), []);
  const dueDDay = useMemo(
    () => daysBetweenISO(todayISO, dueISO),
    [todayISO, dueISO]
  );

  // streak (auto updates daily)
  const streak = useMemo(() => {
    const set = new Set(rows.map((r) => r.log_date));
    let cur = todayISO;
    let s = 0;
    while (set.has(cur)) {
      s += 1;
      cur = addDaysISO(cur, -1);
    }
    return s;
  }, [rows, todayISO]);

  const bestStreak = useMemo(() => {
    const set = new Set(rows.map((r) => r.log_date));
    if (set.size === 0) return 0;
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

  // craving cloud
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

  // heatmap: last N weeks ending today (auto updates daily)
  const HEATMAP_WEEKS = 16;
  const heatmap = useMemo(() => {
    const byDate = new Map<string, number>();
    rows.forEach((r) => byDate.set(r.log_date, clampMood(Number(r.mood))));

    const end = parseISODateUTC(todayISO);
    const day = (end.getUTCDay() + 6) % 7; // Sun->6, Mon->0
    const endMonday = new Date(end.getTime() - day * 86400000);
    const startMonday = new Date(
      endMonday.getTime() - (HEATMAP_WEEKS - 1) * 7 * 86400000
    );

    const columns: {
      weekStartISO: string;
      days: { iso: string; mood?: number }[];
    }[] = [];

    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const weekStart = new Date(startMonday.getTime() + w * 7 * 86400000);
      const weekStartISO = formatISODateUTC(weekStart);
      const daysArr: { iso: string; mood?: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(weekStart.getTime() + d * 86400000);
        const iso = formatISODateUTC(dt);
        const isFuture = daysBetweenISO(todayISO, iso) > 0;
        daysArr.push({ iso, mood: isFuture ? undefined : byDate.get(iso) });
      }
      columns.push({ weekStartISO, days: daysArr });
    }
    return columns;
  }, [rows, todayISO]);

  // timeline: pagination + active
  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
    [rows.length]
  );
  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  const activePost = useMemo(() => {
    if (activeId == null) return null;
    return rows.find((r) => r.id === activeId) ?? null;
  }, [rows, activeId]);

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
      {/* 1) streak / best / sum30 / due date */}
      <header style={S.header}>
        <div>
          <div style={S.title}>Preg Log</div>
          <div style={S.sub}>Data + diary. Public read. One log per day.</div>
        </div>

        <div style={S.headerRight}>
          <Pill>🔥 Streak <b>{streak}</b></Pill>
          <Pill>🏆 Best <b>{bestStreak}</b></Pill>
          <Pill>🏃 SUM 30 D-{Math.max(0, sum30DDay)}</Pill>
          <Pill>
            👶 Due D-{Math.max(0, dueDDay)}{" "}
            <span style={{ opacity: 0.7 }}>({dueISO})</span>
          </Pill>
        </div>
      </header>

      {msg && <div style={S.msg}>{msg}</div>}

      {/* 2) pregnancy progress bar */}
      <section style={S.card}>
        <div style={S.cardTitle}>Pregnancy</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 950 }}>
            Week {GA_WEEKS} Day {GA_DAYS}
          </div>
          <div style={{ opacity: 0.75 }}>{gaDays} / 280 days</div>
        </div>

        <div style={S.progressOuter}>
          <div style={{ ...S.progressInner, width: `${(gaDays / 280) * 100}%` }} />
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          LMP: {LMP_ISO} • Today: {todayISO} ({formatDateAU(todayISO)})
        </div>
      </section>

      {/* 3) mood heatmap */}
      <section style={S.card}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Mood heatmap</div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
              opacity: 0.75,
            }}
          >
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
                      title={`${formatDateAU(d.iso)}${d.mood ? ` mood ${d.mood}` : ""}`}
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

      {/* 4) craving cloud */}
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

      {/* 5) timeline list: date - title - mood, 10 per page + pagination */}
      <section style={S.card}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Timeline</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              style={S.btn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              title="Prev page"
            >
              Prev
            </button>
            <div style={{ fontSize: 12, opacity: 0.75, whiteSpace: "nowrap" }}>
              Page {page} / {pageCount}
            </div>
            <button
              style={S.btn}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              title="Next page"
            >
              Next
            </button>

            <button style={S.btn} onClick={loadFeed} disabled={loading} title="Refresh">
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ opacity: 0.7, marginTop: 10 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 10 }}>No entries yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {pageItems.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                style={{
                  ...S.timelineRow,
                  background: activeId === r.id ? "#f8f9fa" : "white",
                }}
                title="Open (writing is down below)"
              >
                <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 950, width: 130, textAlign: "left" }}>
                    {formatDateAU(r.log_date)}
                  </div>
                  <div style={{ fontWeight: 700, textAlign: "left" }}>
                    {deriveTitle(r.note)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>{moodEmoji(r.mood)}</span>
                  <span style={{ ...S.badge, opacity: 0.9 }}>mood {r.mood}/5</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 6) actual writing part goes way down */}
      <section style={{ ...S.card, opacity: 0.95 }}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Writing (downest)</div>
          {activePost ? (
            <span style={{ ...S.badge, opacity: 0.85 }}>
              {formatDateAU(activePost.log_date)} • {moodEmoji(activePost.mood)}
            </span>
          ) : (
            <span style={{ fontSize: 12, opacity: 0.7 }}>Pick a post above.</span>
          )}
        </div>

        {activePost?.cravings && activePost.cravings.length > 0 && (
          <div style={{ ...S.wrap, marginTop: 10 }}>
            {activePost.cravings.map((t) => (
              <span key={t} style={S.pill}>
                {t}
              </span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
          {activePost?.note ? activePost.note : <span style={{ opacity: 0.7 }}>No note.</span>}
        </div>
      </section>

      {/* editor goes LAST (public doesn't need to see it) */}
      <section style={S.card}>
        <div style={S.rowBetween}>
          <div style={S.cardTitle}>Today log (editor)</div>

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
            <div style={{ fontWeight: 950, width: 32 }}>
              {mood} {moodEmoji(mood)}
            </div>
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
            placeholder="write… (this will show in Writing section when selected)"
            style={{ ...S.input, minHeight: 160, resize: "vertical" }}
          />
        </div>
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
  page: {
    maxWidth: 920,
    margin: "0 auto",
    padding: 18,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    background: "#f6f7f8", // clinic paper
    color: "#121417",
    minHeight: "100vh",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 12px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.75)",
    border: "1px solid rgba(18,20,23,0.08)",
    boxShadow: "0 10px 30px rgba(18,20,23,0.06)",
    backdropFilter: "blur(8px)",
  },

  headerRight: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },

  title: {
    fontSize: 20,
    fontWeight: 900,
    letterSpacing: 0.2,
  },

  sub: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },

  card: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    background: "rgba(255,255,255,0.78)",
    border: "1px solid rgba(18,20,23,0.08)",
    boxShadow: "0 12px 28px rgba(18,20,23,0.05)",
    backdropFilter: "blur(8px)",
  },

  cardTitle: {
    fontWeight: 900,
    letterSpacing: 0.2,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },

  msg: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    background: "rgba(255, 248, 224, 0.9)", // gentle yellow
    border: "1px solid rgba(146, 120, 32, 0.22)",
    color: "#2a2314",
  },

  btn: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(18,20,23,0.14)",
    background: "rgba(255,255,255,0.9)",
    cursor: "pointer",
    fontWeight: 850,
    boxShadow: "0 6px 14px rgba(18,20,23,0.05)",
  },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(18,20,23,0.14)",
    background: "rgba(255,255,255,0.92)",
    boxSizing: "border-box",
    outline: "none",
  },

  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(18,20,23,0.12)",
    background: "rgba(246,247,248,0.9)", // paper chip
    fontSize: 12,
    whiteSpace: "nowrap",
  },

  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(18,20,23,0.12)",
    background: "rgba(246,247,248,0.9)",
    fontSize: 13,
  },

  pillBtn: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(18,20,23,0.12)",
    background: "rgba(246,247,248,0.9)",
    fontSize: 13,
    cursor: "pointer",
  },

  wrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: 12,
    alignItems: "center",
    marginTop: 12,
  },

  label: {
    opacity: 0.75,
    fontWeight: 850,
  },

  progressOuter: {
    marginTop: 10,
    background: "rgba(18,20,23,0.06)",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },

  progressInner: {
    height: "100%",
    background: "#2f6f62", // deep clinic green
    borderRadius: 999,
  },

  timelineRow: {
    width: "100%",
    border: "1px solid rgba(18,20,23,0.10)",
    borderRadius: 16,
    padding: "10px 12px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "rgba(255,255,255,0.88)",
  },
};