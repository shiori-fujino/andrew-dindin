// PregLogPage.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient, type Session } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ----- Fixed timeline inputs (per your note)
const TODAY_ISO = "2026-03-04";        // today (Sydney) for consistent counters
const SUM30_DATE_ISO = "2026-07-25";   // SUM 30 event date
const GA_WEEKS = 4;
const GA_DAYS = 4;                    // 4w4d on TODAY

type PregLogRow = {
  id: number;
  log_date: string; // YYYY-MM-DD
  mood: number;     // 1..5
  cravings: string[] | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  user_id?: string; // if your table has it (owner write)
};

function parseISODate(iso: string) {
  // Treat as UTC midnight to avoid timezone off-by-one issues.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function formatISODate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysBetween(aISO: string, bISO: string) {
  const a = parseISODate(aISO).getTime();
  const b = parseISODate(bISO).getTime();
  return Math.round((b - a) / 86400000);
}
function addDays(iso: string, days: number) {
  const t = parseISODate(iso).getTime() + days * 86400000;
  return formatISODate(new Date(t));
}
function clampMood(n: number) {
  return Math.max(1, Math.min(5, n));
}
function cleanTags(input: string) {
  // split by comma, trim, lower, unique
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export default function PregLogPage() {
  // --- auth (admin only)
  const [session, setSession] = useState<Session | null>(null);
  const signedIn = !!session;

  // --- public feed
  const [rows, setRows] = useState<PregLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // --- editor
  const [logDate, setLogDate] = useState(TODAY_ISO);
  const [mood, setMood] = useState<number>(3);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // --- admin sign-in UI (tiny)
  const [showAdmin, setShowAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  // ---- counters
  const sum30DDay = useMemo(() => daysBetween(TODAY_ISO, SUM30_DATE_ISO), []);
  const dueISO = useMemo(() => {
    const gaDays = GA_WEEKS * 7 + GA_DAYS; // 32
    const remaining = 280 - gaDays;        // 248
    return addDays(TODAY_ISO, remaining);
  }, []);
  const dueDDay = useMemo(() => daysBetween(TODAY_ISO, dueISO), [dueISO]);

  // ---- craving cloud
  const cravingCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.cravings ?? []) {
        const k = (t ?? "").trim().toLowerCase();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 24);
  }, [rows]);

  // ---- streak (Duolingo vibe)
  const streak = useMemo(() => {
    const set = new Set(rows.map((r) => r.log_date));
    let cur = TODAY_ISO;
    let s = 0;
    while (set.has(cur)) {
      s += 1;
      cur = addDays(cur, -1);
    }
    return s;
  }, [rows]);

  async function loadFeed() {
    setLoading(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("preg_log")
      .select("*")
      .order("log_date", { ascending: false })
      .limit(240);

    if (error) {
      setMsg(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as PregLogRow[]);
    }
    setLoading(false);
  }

  async function loadMyDraft(dateISO: string) {
    setMsg(null);
    setLogDate(dateISO);

    // If you’re not signed in, just reset editor to blank for that date
    if (!signedIn) {
      setMood(3);
      setTags([]);
      setNote("");
      return;
    }

    // If your RLS blocks reading own-only, this still works because you can read public anyway.
    const { data, error } = await supabase
      .from("preg_log")
      .select("*")
      .eq("log_date", dateISO)
      .maybeSingle();

    if (error) return setMsg(error.message);

    if (data) {
      const r = data as PregLogRow;
      setMood(clampMood(Number(r.mood)));
      setTags((r.cravings ?? []).map((x) => String(x)));
      setNote(r.note ?? "");
    } else {
      setMood(3);
      setTags([]);
      setNote("");
    }
  }

  async function save() {
    setMsg(null);
    if (!signedIn) return setMsg("Admin only: sign in to write.");

    const payload = {
      log_date: logDate,
      mood: clampMood(Number(mood)),
      cravings: tags,
      note: note,
      // user_id is default auth.uid() in your table; leaving it out is fine.
    };

    // If your schema is UNIQUE(user_id, log_date), upsert might require user_id in conflict.
    // If you kept UNIQUE(log_date) only (single-user table), this is perfect.
    // For safety, try both patterns: first (user_id,log_date), fallback (log_date).
    let errorMessage: string | null = null;

    const up1 = await supabase.from("preg_log").upsert(payload as any, {
      onConflict: "user_id,log_date",
    });
    if (up1.error) {
      const up2 = await supabase.from("preg_log").upsert(payload as any, {
        onConflict: "log_date",
      });
      if (up2.error) errorMessage = up2.error.message;
    }

    if (errorMessage) return setMsg(errorMessage);

    await loadFeed();
    setMsg("Saved.");
  }

  // ---- auth wiring
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    loadFeed();
  }, []);

  async function sendCode() {
    setMsg(null);
    const e = email.trim();
    if (!e) return setMsg("Enter email.");

    // Supabase will email a link; in many setups it also includes a code.
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) setMsg(error.message);
    else setMsg("Email sent. Use the code (or click the link).");
  }

  async function verifyCode() {
    setMsg(null);
    const e = email.trim();
    const c = code.trim();
    if (!e || !c) return setMsg("Enter email + code.");

    const { error } = await supabase.auth.verifyOtp({
      email: e,
      token: c,
      type: "email",
    });

    if (error) setMsg(error.message);
    else {
      setMsg("Signed in.");
      setShowAdmin(false);
      await loadMyDraft(logDate);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMsg("Signed out.");
  }

  function addTagsFromInput() {
    const newTags = cleanTags(tagInput);
    if (!newTags.length) return;
    const next = Array.from(new Set([...tags, ...newTags]));
    setTags(next);
    setTagInput("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Preg Log</div>
          <div style={styles.sub}>
            Public read. Admin write. One log per day.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={styles.badge}>
            Streak: <b>{streak}</b>
          </div>
          <div style={styles.badge}>
            SUM 30 D-{Math.max(0, sum30DDay)}
          </div>
          <div style={styles.badge}>
            Due D-{Math.max(0, dueDDay)} <span style={{ opacity: 0.7 }}>({dueISO})</span>
          </div>

          {signedIn ? (
            <button style={styles.btn} onClick={signOut}>
              Sign out
            </button>
          ) : (
            <button style={styles.btn} onClick={() => setShowAdmin((v) => !v)}>
              Admin
            </button>
          )}
        </div>
      </header>

      {msg && <div style={styles.msg}>{msg}</div>}

      {/* Admin box (tiny) */}
      {showAdmin && !signedIn && (
        <section style={styles.card}>
          <div style={styles.cardTitle}>Admin sign-in (email OTP)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8 }}>
            <input
              style={styles.input}
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="code (if provided)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn} onClick={sendCode}>Send</button>
              <button style={styles.btn} onClick={verifyCode}>Verify</button>
            </div>
          </div>
          <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
            Tip: if code is missing, just click the email link in the same browser.
          </div>
        </section>
      )}

      {/* Craving cloud */}
      <section style={styles.card}>
        <div style={styles.cardTitle}>Craving cloud</div>
        {cravingCounts.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No cravings yet.</div>
        ) : (
          <div style={styles.wrap}>
            {cravingCounts.map(([tag, count]) => (
              <span key={tag} style={styles.pill}>
                {tag} <span style={{ opacity: 0.65 }}>({count})</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Editor */}
      <section style={styles.card}>
        <div style={styles.rowBetween}>
          <div style={styles.cardTitle}>Today’s entry</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="date"
              style={{ ...styles.input, width: 160 }}
              value={logDate}
              onChange={(e) => loadMyDraft(e.target.value)}
            />
            <button style={{ ...styles.btn, opacity: signedIn ? 1 : 0.5 }} onClick={save} disabled={!signedIn}>
              Save
            </button>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.label}>Mood</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="range"
              min={1}
              max={5}
              value={mood}
              onChange={(e) => setMood(clampMood(Number(e.target.value)))}
              disabled={!signedIn}
              style={{ width: 240 }}
            />
            <div style={{ fontWeight: 800, width: 18 }}>{mood}</div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              {mood === 1 ? "super bad" : mood === 5 ? "super good" : ""}
            </div>
          </div>

          <div style={styles.label}>Cravings</div>
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={styles.input}
                placeholder='type + Enter (or commas): "dumpling, pho"'
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTagsFromInput();
                  }
                }}
                disabled={!signedIn}
              />
              <button style={{ ...styles.btn, opacity: signedIn ? 1 : 0.5 }} onClick={addTagsFromInput} disabled={!signedIn}>
                Add
              </button>
            </div>
            <div style={{ ...styles.wrap, marginTop: 10 }}>
              {tags.length === 0 ? (
                <span style={{ opacity: 0.7 }}>No tags.</span>
              ) : (
                tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => removeTag(t)}
                    disabled={!signedIn}
                    style={{
                      ...styles.pillBtn,
                      cursor: signedIn ? "pointer" : "default",
                      opacity: signedIn ? 1 : 0.6,
                    }}
                    title={signedIn ? "Remove" : ""}
                  >
                    {t} <span style={{ opacity: 0.65 }}>×</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ ...styles.label, alignSelf: "start", paddingTop: 6 }}>Note</div>
          <textarea
            style={{ ...styles.input, minHeight: 140, resize: "vertical" }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="blog note..."
            disabled={!signedIn}
          />
        </div>

        {!signedIn && (
          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
            Reading is public. Writing is admin-only.
          </div>
        )}
      </section>

      {/* Feed */}
      <section style={styles.card}>
        <div style={styles.rowBetween}>
          <div style={styles.cardTitle}>Timeline</div>
          <button style={styles.btn} onClick={loadFeed} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div style={{ opacity: 0.7, marginTop: 8 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ opacity: 0.7, marginTop: 8 }}>No entries yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {rows.map((r) => (
              <article key={r.id} style={styles.post}>
                <div style={styles.rowBetween}>
                  <div style={{ fontWeight: 800 }}>{r.log_date}</div>
                  <div style={styles.badge}>mood {r.mood}/5</div>
                </div>

                {r.cravings && r.cravings.length > 0 && (
                  <div style={{ ...styles.wrap, marginTop: 8 }}>
                    {r.cravings.map((t) => (
                      <span key={t} style={styles.pill}>{t}</span>
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

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 900,
    margin: "0 auto",
    padding: 16,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    flexWrap: "wrap",
  },
  title: { fontSize: 22, fontWeight: 900 },
  sub: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  card: {
    marginTop: 14,
    padding: 14,
    border: "1px solid #eee",
    borderRadius: 16,
    background: "white",
  },
  cardTitle: { fontWeight: 900, marginBottom: 10 },
  msg: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    background: "#fff3cd",
    border: "1px solid #ffe69c",
  },
  btn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    cursor: "pointer",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "white",
    boxSizing: "border-box",
  },
  badge: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #eee",
    background: "#fafafa",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #eee",
    background: "#fafafa",
    fontSize: 13,
  },
  pillBtn: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #eee",
    background: "#fafafa",
    fontSize: 13,
  },
  wrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  rowBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  grid: {
    display: "grid",
    gridTemplateColumns: "120px 1fr",
    gap: 12,
    alignItems: "center",
  },
  label: { opacity: 0.75, fontWeight: 700 },
  post: {
    padding: 12,
    border: "1px solid #eee",
    borderRadius: 14,
  },
};