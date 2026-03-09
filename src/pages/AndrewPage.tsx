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
  title: string | null;
  mood: number; // 1..5
  cravings: string[] | null;
  note: string | null;
};

function formatISODateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return isMobile;
}

const moodColor = (m: number | null | undefined) => {
  if (!m) return "#ffffff";
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

function deriveTitle(title: string | null, note: string | null) {
  const tt = (title ?? "").trim();
  if (tt) return tt.length > 60 ? tt.slice(0, 57) + "…" : tt;

  const t = (note ?? "").trim();
  if (!t) return "Untitled";
  const firstLine = t.split("\n")[0].trim();
  return firstLine.length > 60 ? firstLine.slice(0, 57) + "…" : firstLine;
}

function MobileField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={S.mobileField}>
      <div style={S.mobileFieldLabel}>{label}</div>
      <div style={S.mobileFieldValue}>{value}</div>
    </div>
  );
}

export default function AndrewPage() {
  const isMobile = useIsMobile();

  const [todayISO, setTodayISO] = useState(() => formatISODateLocal(new Date()));

  useEffect(() => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const ms = next.getTime() - now.getTime();

    const t = window.setTimeout(() => {
      setTodayISO(formatISODateLocal(new Date()));
    }, ms + 1000);

    return () => window.clearTimeout(t);
  }, [todayISO]);

  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [logDate, setLogDate] = useState(todayISO);
  const [title, setTitle] = useState("");
  const [mood, setMood] = useState<number>(3);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user?.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadFeed() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("preg_log")
      .select("id,log_date,title,mood,cravings,note")
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
      .select("id,log_date,title,mood,cravings,note")
      .eq("log_date", dateISO)
      .maybeSingle();

    if (error) return setMsg(error.message);

    if (data) {
      const r = data as LogRow;
      setMood(clampMood(Number(r.mood)));
      setTags((r.cravings ?? []).map(String));
      setTitle(r.title ?? "");
      setNote(r.note ?? "");
    } else {
      setMood(3);
      setTags([]);
      setTitle("");
      setNote("");
    }
  }

  async function save() {
    setMsg(null);

    const payload = {
      log_date: logDate,
      title: title.trim() || null,
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

  async function handleLogin() {
    setMsg(null);

    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setMsg("Enter email and password.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    setAuthPassword("");
    setMsg("Logged in.");
  }

  async function handleLogout() {
    setMsg(null);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMsg(error.message);
      return;
    }

    setMsg("Logged out.");
  }
async function handleSetPassword() {
  setMsg(null);

  if (!newPassword.trim()) {
    setMsg("Enter a password.");
    return;
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    setMsg(error.message);
    return;
  }

  setNewPassword("");
  setMsg("Password set.");
}
  useEffect(() => {
    loadFeed();
    loadForDate(todayISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO]);

  const gaDays = useMemo(
    () => Math.max(0, daysBetweenISO(LMP_ISO, todayISO)),
    [todayISO]
  );
  const GA_WEEKS = useMemo(() => Math.floor(gaDays / 7), [gaDays]);
  const GA_DAYS = useMemo(() => gaDays % 7, [gaDays]);

  const sum30DDay = useMemo(
    () => daysBetweenISO(todayISO, SUM30_ISO),
    [todayISO]
  );
  const dueISO = useMemo(() => addDaysISO(LMP_ISO, 280), []);
  const dueDDay = useMemo(
    () => daysBetweenISO(todayISO, dueISO),
    [todayISO, dueISO]
  );

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
    const dates = Array.from(set).sort();
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

  const cravingCloud = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.cravings ?? []) {
        const k = (t ?? "").trim().toLowerCase();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [rows]);

  const HEATMAP_WEEKS = 16;
  const heatmap = useMemo(() => {
    const byDate = new Map<string, number>();
    rows.forEach((r) => byDate.set(r.log_date, clampMood(Number(r.mood))));

    const end = parseISODateUTC(todayISO);
    const day = (end.getUTCDay() + 6) % 7;
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
    <div style={{ ...S.page, padding: isMobile ? 12 : 20 }}>
      <header style={S.header}>
        <div style={S.headerTitleRow}>
          <div>
            <div style={S.title}>Pregnancy Log</div>
            <div style={S.sub}>Data + diary. Public read. One log per day.</div>
          </div>
        </div>

        {isMobile ? (
          <div style={S.mobileStatsGrid}>
            <MobileField label="Current Streak" value={streak} />
            <MobileField label="Best Streak" value={bestStreak} />
            <MobileField label="SUM 30" value={`D-${Math.max(0, sum30DDay)}`} />
            <MobileField
              label="Due"
              value={`D-${Math.max(0, dueDDay)} (${formatDateAU(dueISO)})`}
            />
            <MobileField
              label="GA"
              value={`Week ${GA_WEEKS} Day ${GA_DAYS}`}
            />
            <MobileField
              label="Today"
              value={`${todayISO} (${formatDateAU(todayISO)})`}
            />
          </div>
        ) : (
          <table style={S.statsTable}>
            <thead>
              <tr>
                <th style={S.statsTh}>Current Streak</th>
                <th style={S.statsTh}>Best Streak</th>
                <th style={S.statsTh}>SUM 30</th>
                <th style={S.statsTh}>Due</th>
                <th style={S.statsTh}>GA</th>
                <th style={S.statsTh}>Today</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={S.statsTd}>{streak}</td>
                <td style={S.statsTd}>{bestStreak}</td>
                <td style={S.statsTd}>D-{Math.max(0, sum30DDay)}</td>
                <td style={S.statsTd}>
                  D-{Math.max(0, dueDDay)} ({formatDateAU(dueISO)})
                </td>
                <td style={S.statsTd}>
                  Week {GA_WEEKS} Day {GA_DAYS}
                </td>
                <td style={S.statsTd}>
                  {todayISO} ({formatDateAU(todayISO)})
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </header>

      {msg && <div style={S.msg}>{msg}</div>}

      <section style={S.section}>
        <div style={S.sectionTitle}>Pregnancy Progress</div>
        <div style={S.sectionBody}>
          {isMobile ? (
            <div style={S.mobileStatsGrid}>
              <MobileField label="LMP" value={LMP_ISO} />
              <MobileField label="Today" value={todayISO} />
              <MobileField
                label="Gestational Age"
                value={`Week ${GA_WEEKS} Day ${GA_DAYS}`}
              />
              <MobileField label="Due Date" value={dueISO} />
              <MobileField label="Elapsed" value={`${gaDays} / 280 days`} />
              <MobileField label="Display" value={formatDateAU(dueISO)} />
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <tbody>
                  <tr>
                    <th style={S.th}>LMP</th>
                    <td style={S.tdMono}>{LMP_ISO}</td>
                    <th style={S.th}>Today</th>
                    <td style={S.tdMono}>{todayISO}</td>
                    <th style={S.th}>Gestational Age</th>
                    <td style={S.td}>Week {GA_WEEKS} Day {GA_DAYS}</td>
                  </tr>
                  <tr>
                    <th style={S.th}>Due Date</th>
                    <td style={S.tdMono}>{dueISO}</td>
                    <th style={S.th}>Elapsed</th>
                    <td style={S.td}>{gaDays} / 280 days</td>
                    <th style={S.th}>Display</th>
                    <td style={S.td}>{formatDateAU(dueISO)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={S.progressWrap}>
            <div
              style={{
                ...S.progressBar,
                width: `${Math.min(100, (gaDays / 280) * 100)}%`,
              }}
            />
            <div style={S.progressLabel}>
              {gaDays} / 280 days ({Math.round((gaDays / 280) * 100)}%)
            </div>
          </div>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.sectionTitle}>Mood Heatmap</div>
        <div style={S.sectionBody}>
          <div style={{ marginBottom: 10, fontSize: 12, color: "#6b7280" }}>
            1 = worst • 5 = best • blank = no log
          </div>

          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridAutoFlow: "column", gap: 2 }}>
              {heatmap.map((col) => (
                <div key={col.weekStartISO} style={{ display: "grid", gap: 2 }}>
                  {col.days.map((d) => {
                    const c = d.mood ? moodColor(d.mood) : "#ffffff";
                    return (
                      <div
                        key={d.iso}
                        title={`${formatDateAU(d.iso)}${
                          d.mood ? ` mood ${d.mood}` : ""
                        }`}
                        style={{
                          width: isMobile ? 12 : 16,
                          height: isMobile ? 12 : 16,
                          background: c,
                          border: "1px solid #d1d5db",
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={S.section}>
        <div style={S.sectionTitle}>Top Cravings</div>
        <div style={S.sectionBody}>
          {cravingCloud.length === 0 ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>No cravings yet.</div>
          ) : isMobile ? (
            <div style={S.mobileList}>
              {cravingCloud.map(([tag, count]) => (
                <div key={tag} style={S.mobileListRow}>
                  <div style={S.mobileListPrimary}>{tag}</div>
                  <div style={S.mobileListSecondary}>{count}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Craving</th>
                    <th style={S.th}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {cravingCloud.map(([tag, count]) => (
                    <tr key={tag}>
                      <td style={S.td}>{tag}</td>
                      <td style={S.tdMono}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section style={S.section}>
        <div
          style={{
            ...S.sectionTitle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: 8,
          }}
        >
          <span>Timeline</span>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr 1fr" : "auto auto auto auto",
              gap: 6,
              alignItems: "center",
              width: isMobile ? "100%" : undefined,
            }}
          >
            <button
              style={{ ...S.btnSm, width: isMobile ? "100%" : undefined }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </button>

            <button
              style={{ ...S.btnSm, width: isMobile ? "100%" : undefined }}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
            >
              Next
            </button>

            <button
              style={{
                ...S.btnSm,
                width: isMobile ? "100%" : undefined,
                gridColumn: isMobile ? "1 / -1" : undefined,
              }}
              onClick={loadFeed}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>

            <span
              style={{
                fontSize: 11,
                color: "#6b7280",
                whiteSpace: "nowrap",
                textAlign: isMobile ? "center" : "left",
                gridColumn: isMobile ? "1 / -1" : undefined,
              }}
            >
              Page {page} / {pageCount}
            </span>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          {loading ? (
            <div style={{ padding: 12, color: "#6b7280" }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 12, color: "#6b7280" }}>No entries yet.</div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Mood</th>
                  <th style={S.th}>Title</th>
                  <th style={S.th}>Cravings</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const selected = activeId === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setActiveId(r.id)}
                      style={{
                        ...(selected ? S.selectedRow : {}),
                        cursor: "pointer",
                      }}
                    >
                      <td style={S.tdMono}>{formatDateAU(r.log_date)}</td>
                      <td style={S.td}>
                        {moodEmoji(r.mood)} {r.mood}/5
                      </td>
                      <td style={S.td}>{deriveTitle(r.title, r.note)}</td>
                      <td style={S.td}>
                        <div style={S.tagsInline}>
                          {(r.cravings ?? []).length === 0 ? (
                            <span style={{ color: "#9ca3af" }}>-</span>
                          ) : (
                            (r.cravings ?? []).map((t) => (
                              <span key={t} style={S.tagCell}>
                                {t}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section style={S.section}>
        <div style={S.sectionTitle}>Entry Detail</div>
        <div style={S.sectionBody}>
          {!activePost ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              Select a row from Timeline.
            </div>
          ) : isMobile ? (
            <div style={S.mobileDetailWrap}>
              <MobileField
                label="Date"
                value={formatDateAU(activePost.log_date)}
              />
              <MobileField
                label="Title"
                value={
                  activePost.title || (
                    <span style={{ color: "#6b7280" }}>Untitled</span>
                  )
                }
              />
              <MobileField
                label="Mood"
                value={`${moodEmoji(activePost.mood)} ${activePost.mood}/5`}
              />
              <MobileField
                label="Cravings"
                value={
                  (activePost.cravings ?? []).length ? (
                    <div style={S.tagsInline}>
                      {activePost.cravings!.map((t) => (
                        <span key={t} style={S.tagCell}>
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: "#6b7280" }}>None</span>
                  )
                }
              />
              <MobileField
                label="Note"
                value={
                  <div style={S.noteBox}>
                    {activePost.note || (
                      <span style={{ color: "#6b7280" }}>No note.</span>
                    )}
                  </div>
                }
              />
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <tbody>
                  <tr>
                    <th style={S.th}>Date</th>
                    <td style={S.tdMono}>{formatDateAU(activePost.log_date)}</td>
                    <th style={S.th}>Mood</th>
                    <td style={S.td}>
                      {moodEmoji(activePost.mood)} {activePost.mood}/5
                    </td>
                  </tr>
                  <tr>
                    <th style={S.th}>Title</th>
                    <td style={S.td} colSpan={3}>
                      {activePost.title || (
                        <span style={{ color: "#6b7280" }}>Untitled</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th style={S.th}>Cravings</th>
                    <td style={S.td} colSpan={3}>
                      {(activePost.cravings ?? []).length ? (
                        <div style={S.tagsInline}>
                          {activePost.cravings!.map((t) => (
                            <span key={t} style={S.tagCell}>
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: "#6b7280" }}>None</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th style={S.th}>Note</th>
                    <td style={S.td} colSpan={3}>
                      <div style={S.noteBox}>
                        {activePost.note || (
                          <span style={{ color: "#6b7280" }}>No note.</span>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section style={S.section}>
        <div
          style={{
            ...S.sectionTitle,
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: 8,
          }}
        >
          <span>Data Entry</span>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexDirection: isMobile ? "column" : "row",
              width: isMobile ? "100%" : undefined,
            }}
          >
            <input
              type="date"
              value={logDate}
              onChange={(e) => loadForDate(e.target.value)}
              style={{
                ...S.smallInput,
                width: isMobile ? "100%" : 160,
              }}
            />
            <button
              style={{ ...S.btnPrimary, width: isMobile ? "100%" : undefined }}
              onClick={save}
            >
              Save
            </button>
          </div>
        </div>

        <div
          style={{
            ...S.editorGrid,
            gridTemplateColumns: isMobile ? "1fr" : "140px 1fr",
          }}
        >
          <div style={S.editorLabel}>Log Date</div>
          <div style={S.editorField}>
            <input
              type="date"
              value={logDate}
              onChange={(e) => loadForDate(e.target.value)}
              style={{
                ...S.input,
                maxWidth: isMobile ? "100%" : 180,
              }}
            />
          </div>

          <div style={S.editorLabel}>Title</div>
          <div style={S.editorField}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="write a title..."
              style={S.input}
              maxLength={120}
            />
          </div>

          <div style={S.editorLabel}>Mood</div>
          <div style={S.editorField}>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: isMobile ? "stretch" : "center",
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <input
                type="range"
                min={1}
                max={5}
                value={mood}
                onChange={(e) => setMood(clampMood(Number(e.target.value)))}
                style={{ width: isMobile ? "100%" : 260 }}
              />
              <div style={{ fontWeight: 700 }}>
                {mood} {moodEmoji(mood)}
              </div>
            </div>
          </div>

          <div style={S.editorLabel}>Cravings</div>
          <div style={S.editorField}>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 10,
                flexDirection: isMobile ? "column" : "row",
              }}
            >
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="dumpling, mango"
                style={S.input}
              />
              <button
                style={{ ...S.btnSm, width: isMobile ? "100%" : undefined }}
                onClick={addTag}
              >
                Add
              </button>
            </div>

            <div style={S.tagsInline}>
              {tags.length === 0 ? (
                <span style={{ color: "#6b7280" }}>No tags</span>
              ) : (
                tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag(t)}
                    style={{
                      ...S.btnSm,
                      padding: "4px 8px",
                      fontWeight: 500,
                    }}
                    title="Remove"
                  >
                    {t} ×
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={S.editorLabel}>Note</div>
          <div style={S.editorField}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="write..."
              style={{
                ...S.input,
                minHeight: isMobile ? 180 : 220,
                resize: "vertical",
                fontFamily: `ui-monospace, SFMono-Regular, Menlo, monospace`,
                lineHeight: 1.5,
              }}
            />
          </div>
        </div>
      </section>

      <section style={S.section}>
  <div style={S.sectionTitle}>Access</div>

  <div style={S.sectionBody}>
    {!sessionEmail ? (
      <div style={S.authBox}>


        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            placeholder="email"
            autoComplete="email"
            style={S.input}
          />

          <input
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            placeholder="password"
            autoComplete="current-password"
            style={S.input}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLogin();
              }
            }}
          />

          <button
            style={{ ...S.btnPrimary, width: isMobile ? "100%" : 110 }}
            onClick={handleLogin}
            type="button"
          >
            Log in
          </button>
        </div>
      </div>
    ) : (
      <div style={S.authBox}>
        <div style={S.authStatusRow}>
          <span style={S.authMuted}>Signed in as</span>
          <strong>{sessionEmail}</strong>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="set password once (optional)"
            autoComplete="new-password"
            style={S.input}
          />

          <button
            style={{ ...S.btnPrimary, width: isMobile ? "100%" : 150 }}
            onClick={handleSetPassword}
            type="button"
          >
            Set Password
          </button>
        </div>

        <button
          style={{ ...S.btnSm, width: isMobile ? "100%" : 120 }}
          onClick={handleLogout}
          type="button"
        >
          Log out
        </button>
      </div>
    )}
  </div>
</section>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: 20,
    fontFamily: `"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif`,
    background: "#f3f4f6",
    color: "#111827",
    minHeight: "100vh",
  },

  header: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 8,
    marginBottom: 12,
  },

  headerTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "end",
    gap: 12,
    borderBottom: "1px solid #d1d5db",
    paddingBottom: 8,
  },

  title: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: 0,
  },

  sub: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },

  statsTable: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#ffffff",
    fontSize: 13,
  },

  statsTh: {
    textAlign: "left",
    fontWeight: 600,
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#374151",
    whiteSpace: "nowrap",
  },

  statsTd: {
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    background: "#ffffff",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },

  section: {
    marginTop: 16,
    background: "#ffffff",
    border: "1px solid #d1d5db",
  },

  sectionTitle: {
    padding: "10px 12px",
    fontWeight: 700,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    borderBottom: "1px solid #d1d5db",
    background: "#f9fafb",
    color: "#374151",
  },

  sectionBody: {
    padding: 12,
  },

  msg: {
    marginTop: 12,
    padding: "10px 12px",
    background: "#fff7e6",
    border: "1px solid #f0c36d",
    color: "#7c5700",
    fontSize: 13,
  },

  btnPrimary: {
    padding: "8px 12px",
    borderRadius: 0,
    border: "1px solid #1f2937",
    background: "#1f2937",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  },

  btnSm: {
    padding: "4px 8px",
    borderRadius: 0,
    border: "1px solid #9ca3af",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
    lineHeight: 1.2,
    minHeight: 28,
  },

  btnGhostSm: {
    padding: "4px 8px",
    borderRadius: 0,
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: 12,
    lineHeight: 1.2,
    minHeight: 28,
    color: "#4b5563",
  },

  input: {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 0,
    border: "1px solid #9ca3af",
    background: "#ffffff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 13,
  },

  smallInput: {
    padding: "6px 8px",
    borderRadius: 0,
    border: "1px solid #9ca3af",
    background: "#ffffff",
    boxSizing: "border-box",
    outline: "none",
    fontSize: 13,
  },

  progressWrap: {
    marginTop: 10,
    border: "1px solid #d1d5db",
    height: 18,
    background: "#f9fafb",
    position: "relative",
    overflow: "hidden",
  },

  progressBar: {
    height: "100%",
    background: "#9ec5b8",
  },

  progressLabel: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "#111827",
    pointerEvents: "none",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    background: "#fff",
  },

  th: {
    textAlign: "left",
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    fontWeight: 700,
    color: "#374151",
    whiteSpace: "nowrap",
  },

  td: {
    padding: "8px 10px",
    border: "1px solid #e5e7eb",
    verticalAlign: "top",
  },

  tdMono: {
    padding: "8px 10px",
    border: "1px solid #e5e7eb",
    verticalAlign: "top",
    fontVariantNumeric: "tabular-nums",
    fontFamily: `ui-monospace, SFMono-Regular, Menlo, monospace`,
    whiteSpace: "nowrap",
  },

  selectedRow: {
    background: "#eef6f3",
  },

  tagsInline: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },

  tagCell: {
    display: "inline-block",
    padding: "2px 6px",
    border: "1px solid #d1d5db",
    background: "#f9fafb",
    fontSize: 12,
  },

  editorGrid: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    borderTop: "1px solid #d1d5db",
    borderLeft: "1px solid #d1d5db",
  },

  editorLabel: {
    padding: "10px 12px",
    borderRight: "1px solid #d1d5db",
    borderBottom: "1px solid #d1d5db",
    background: "#f9fafb",
    fontWeight: 700,
    fontSize: 13,
  },

  editorField: {
    padding: "10px 12px",
    borderRight: "1px solid #d1d5db",
    borderBottom: "1px solid #d1d5db",
    background: "#fff",
  },

  noteBox: {
    minHeight: 120,
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    fontSize: 14,
  },

  mobileStatsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    borderTop: "1px solid #d1d5db",
    borderLeft: "1px solid #d1d5db",
    background: "#fff",
  },

  mobileField: {
    borderRight: "1px solid #d1d5db",
    borderBottom: "1px solid #d1d5db",
    padding: "10px 12px",
    background: "#fff",
  },

  mobileFieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: "#6b7280",
    marginBottom: 4,
  },

  mobileFieldValue: {
    fontSize: 13,
    color: "#111827",
    lineHeight: 1.45,
    wordBreak: "break-word",
  },

  mobileList: {
    display: "grid",
    borderTop: "1px solid #d1d5db",
    borderLeft: "1px solid #d1d5db",
  },

  mobileListRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 12,
    alignItems: "center",
    padding: "10px 12px",
    borderRight: "1px solid #d1d5db",
    borderBottom: "1px solid #d1d5db",
    background: "#fff",
  },

  mobileListPrimary: {
    fontSize: 13,
    color: "#111827",
    wordBreak: "break-word",
  },

  mobileListSecondary: {
    fontSize: 13,
    color: "#374151",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },

  mobileDetailWrap: {
    display: "grid",
    gap: 0,
    borderTop: "1px solid #d1d5db",
    borderLeft: "1px solid #d1d5db",
  },

  authBox: {
    display: "grid",
    gap: 10,
  },

  authStatusRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },

  authMuted: {
    fontSize: 12,
    color: "#6b7280",
  },
};