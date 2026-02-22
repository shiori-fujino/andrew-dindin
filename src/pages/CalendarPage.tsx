import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";

type MealRow = {
  date_iso: string; // YYYY-MM-DD
  main: string | null;
  rice: string | null;
  side: string | null;
  dessert: string | null;
  main_category: "beef" | "pork" | "chicken" | "fish" | "takeaway" | null;
  juno_note: string | null;
};

type ReviewRow = {
  date_iso: string; // YYYY-MM-DD
  main_rating: number | null; // 0..10
  main_comment: string | null;
  side_rating: number | null; // 0..10
  side_comment: string | null;
  dessert_rating: number | null; // 0..10
  dessert_comment: string | null;
};

type DayData = {
  meal?: MealRow;
  review?: ReviewRow;
  avg?: number | null; // 0..10
};

function mainEmoji(cat: MealRow["main_category"]) {
  switch (cat) {
    case "beef":
      return "🐮";
    case "pork":
      return "🐷";
    case "chicken":
      return "🐔";
    case "fish":
      return "🐟";
    case "takeaway":
      return "🥡";
    default:
      return "";
  }
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function clamp0to10(n: number) {
  return Math.max(0, Math.min(10, n));
}

function computeAvg(review?: ReviewRow): number | null {
  if (!review) return null;
  const vals = [review.main_rating, review.side_rating, review.dessert_rating].filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v)
  );
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(avg * 10) / 10;
}

function buildMonthGrid(monthDate: Date) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);

  const leading = start.getDay(); // Sunday=0
  const daysInMonth = end.getDate();

  const cells: Array<{ iso: string | null; dayNum: number | null }> = [];

  for (let i = 0; i < leading; i++) cells.push({ iso: null, dayNum: null });

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(start.getFullYear(), start.getMonth(), day);
    cells.push({ iso: toISODate(d), dayNum: day });
  }

  while (cells.length < 42) cells.push({ iso: null, dayNum: null });

  return { cells, daysInMonth };
}

function buildDailyAvgSeries(monthCursor: Date, dayMap: Record<string, DayData>) {
  const start = startOfMonth(monthCursor);
  const end = endOfMonth(monthCursor);
  const daysInMonth = end.getDate();

  const points: Array<{ day: number; iso: string; avg: number | null }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(start.getFullYear(), start.getMonth(), day);
    const iso = toISODate(d);
    const avg = dayMap[iso]?.avg ?? null;
    points.push({ day, iso, avg: typeof avg === "number" ? avg : null });
  }

  return points;
}

function LineChart({
  points,
  height = 140,
}: {
  points: Array<{ day: number; iso: string; avg: number | null }>;
  height?: number;
}) {
  const width = 520;
  const padL = 26;
  const padR = 10;
  const padT = 12;
  const padB = 22;

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const n = points.length;
  const xForIndex = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const yForValue = (v: number) => padT + ((10 - clamp0to10(v)) / 10) * innerH;

  const valid = points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => typeof p.avg === "number");

  const pathD = valid
    .map((p, k) => {
      const x = xForIndex(p.i);
      const y = yForValue(p.avg as number);
      return `${k === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const hasAny = valid.length > 0;
  const yTicks = [10, 5, 0];

  return (
    <div className="w-full border border-white/20 bg-zinc-950">
      <div className="px-3 py-2 border-b border-white/20 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-200">Daily average (0–10)</div>
        <div className="text-xs text-zinc-500">{hasAny ? `${valid.length} day(s)` : "No data"}</div>
      </div>

      <div className="p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-[140px] block">
          <rect x="0" y="0" width={width} height={height} fill="transparent" />

          {yTicks.map((t) => {
            const y = yForValue(t);
            return (
              <g key={t}>
                <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.45)">
                  {t}
                </text>
              </g>
            );
          })}

          <line
            x1={padL}
            y1={height - padB}
            x2={width - padR}
            y2={height - padB}
            stroke="rgba(255,255,255,0.20)"
            strokeWidth="1"
          />

          {hasAny && <path d={pathD} fill="none" stroke="rgba(251,191,36,0.85)" strokeWidth="2" />}

          {valid.map((p) => {
            const x = xForIndex(p.i);
            const y = yForValue(p.avg as number);
            const label = `${p.iso}: ${clamp0to10(p.avg as number).toFixed(1)}/10`;
            return (
              <g key={p.iso}>
                <circle cx={x} cy={y} r="3.5" fill="rgba(251,191,36,0.95)" />
                <title>{label}</title>
              </g>
            );
          })}

          {(() => {
            const last = points.length;
            const tickDays = Array.from(new Set([1, 15, last].filter((d) => d >= 1 && d <= last)));
            return tickDays.map((day) => {
              const i = day - 1;
              const x = xForIndex(i);
              return (
                <text key={day} x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.45)">
                  {day}
                </text>
              );
            });
          })()}
        </svg>

        {!hasAny && <div className="text-xs text-zinc-500 pt-2">No reviews yet for this month. Andrew is “busy”.</div>}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(false);
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});
  const [selectedISO, setSelectedISO] = useState<string | null>(isoToday());

  const { cells, daysInMonth } = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

  const monthLabel = useMemo(() => {
    const fmt = new Intl.DateTimeFormat("en-AU", { year: "numeric", month: "long" });
    return fmt.format(monthCursor);
  }, [monthCursor]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const start = startOfMonth(monthCursor);
        const end = endOfMonth(monthCursor);

        const fromISO = toISODate(start);
        const toISO = toISODate(end);

        const mealsQ = supabase
          .from("meals")
          .select("date_iso, main, rice, side, dessert, main_category, juno_note")
          .gte("date_iso", fromISO)
          .lte("date_iso", toISO);

        const reviewsQ = supabase
          .from("reviews")
          .select("date_iso, main_rating, main_comment, side_rating, side_comment, dessert_rating, dessert_comment")
          .gte("date_iso", fromISO)
          .lte("date_iso", toISO);

        const [mealsRes, reviewsRes] = await Promise.all([mealsQ, reviewsQ]);

        if (mealsRes.error) throw mealsRes.error;
        if (reviewsRes.error) throw reviewsRes.error;

        const next: Record<string, DayData> = {};

        (mealsRes.data ?? []).forEach((m: MealRow) => {
          next[m.date_iso] = { ...(next[m.date_iso] ?? {}), meal: m };
        });

        (reviewsRes.data ?? []).forEach((r: ReviewRow) => {
          next[r.date_iso] = { ...(next[r.date_iso] ?? {}), review: r };
        });

        Object.keys(next).forEach((iso) => {
          next[iso].avg = computeAvg(next[iso].review);
        });

        setDayMap(next);

        if (selectedISO) {
          const sel = parseISODate(selectedISO);
          if (sel.getMonth() !== monthCursor.getMonth() || sel.getFullYear() !== monthCursor.getFullYear()) {
            setSelectedISO(toISODate(start));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthCursor]);

  const selectedData = selectedISO ? dayMap[selectedISO] : undefined;

  const weekLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dailySeries = useMemo(() => buildDailyAvgSeries(monthCursor, dayMap), [monthCursor, dayMap]);

  return (
    <div className="w-screen h-screen bg-black text-zinc-100 overflow-hidden">
      <div className="w-full h-full p-4 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-semibold">Dinner Calendar</h1>
            <p className="text-sm text-zinc-400">
              {monthLabel} · {daysInMonth} days
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100"
              onClick={() => setMonthCursor((d) => addMonths(d, -1))}
            >
              ←
            </button>
            <button
              className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100"
              onClick={() => setMonthCursor(startOfMonth(new Date()))}
            >
              This month
            </button>
            <button
              className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100"
              onClick={() => setMonthCursor((d) => addMonths(d, +1))}
            >
              →
            </button>
          </div>
        </div>

        {/* Line chart */}
        <div className="shrink-0 mb-4">
          <LineChart points={dailySeries} />
        </div>

        {/* Calendar */}
        <div className="border border-white/20 bg-zinc-950 flex flex-col shrink-0">
          <div className="grid grid-cols-7 text-xs font-semibold text-zinc-400 border-b border-white/20">
            {weekLabels.map((w) => (
              <div key={w} className="px-2 py-2">
                {w}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 grid-rows-6 gap-px bg-white/20">
            {cells.map((cell, idx) => {
              const iso = cell.iso;
              const isSelected = iso && selectedISO === iso;
              const isToday = iso === isoToday();
              const data = iso ? dayMap[iso] : undefined;

              const hasMeal = !!data?.meal;
              const hasReview = !!data?.review;
              const avg = data?.avg;

              const emoji = hasMeal ? mainEmoji(data?.meal?.main_category ?? null) : "";

              return (
                <button
                  key={idx}
                  disabled={!iso}
                  onClick={() => iso && setSelectedISO(iso)}
                  className={[
                    "aspect-square w-full p-2 text-left relative transition select-none",
                    "bg-zinc-950 text-zinc-100 hover:bg-zinc-900",
                    !iso ? "opacity-20 cursor-default" : "",
                    isSelected ? "outline outline-2 outline-amber-300/70" : "outline-none",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold tabular-nums">{cell.dayNum ?? ""}</div>

                    {isToday && (
                      <span className="text-[10px] px-1.5 py-0.5 border border-white/30 bg-white/5 text-zinc-200">
                        Today
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-2xl">{emoji}</div>

                    {hasReview && avg != null ? (
                      <div className="text-xs font-semibold tabular-nums text-amber-200">
                        {clamp0to10(avg).toFixed(1)}
                      </div>
                    ) : hasMeal ? (
                      <div className="text-xs text-zinc-400">UN</div>
                    ) : (
                      <div className="text-xs text-zinc-700">—</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {loading && <div className="text-sm text-zinc-400 p-3 border-t border-white/20">Loading month…</div>}
        </div>

        {/* Details */}
        <div className="border border-white/20 bg-zinc-950 mt-4">
          <div className="p-4 border-b border-white/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedISO ?? "Select a day"}</h2>
                <p className="text-sm text-zinc-400">{selectedData?.avg != null ? `Avg ⭐ ${selectedData.avg}` : "No rating yet"}</p>
              </div>

              {selectedISO && (
                <div className="flex gap-2">
                  <Link
                    className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100 text-sm"
                    to={`/juno?date=${selectedISO}`}
                  >
                    Open Juno
                  </Link>
                  <Link
                    className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100 text-sm"
                    to={`/andrew?date=${selectedISO}`}
                  >
                    Open Andrew
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-b border-white/20">
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Dinner note 📝</h3>

            {selectedData?.meal?.juno_note && selectedData.meal.juno_note.trim().length > 0 ? (
              <div className="text-sm text-zinc-100 whitespace-pre-wrap">{selectedData.meal.juno_note}</div>
            ) : (
              <div className="text-sm text-zinc-400">No note. Juno is currently clinically unbothered.</div>
            )}
          </div>

          <div className="p-4 space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Menu</h3>
              {selectedData?.meal ? (
                <div className="text-sm space-y-1 text-zinc-100">
                  <div>
                    <span className="text-zinc-400">Main:</span> {selectedData.meal.main || "—"}
                  </div>
                  <div>
                    <span className="text-zinc-400">Rice:</span> {selectedData.meal.rice || "—"}
                  </div>
                  <div>
                    <span className="text-zinc-400">Side:</span> {selectedData.meal.side || "—"}
                  </div>
                  <div>
                    <span className="text-zinc-400">Dessert:</span> {selectedData.meal.dessert || "—"}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">No menu logged.</div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Ratings & Comments</h3>
              {selectedData?.review ? (
                <div className="text-sm space-y-5 text-zinc-100">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-zinc-400">Main:</span>
                      <span className="tabular-nums">{selectedData.review.main_rating ?? "—"}/10</span>
                    </div>
                    {selectedData.review.main_comment && <div className="mt-1 text-zinc-300">“{selectedData.review.main_comment}”</div>}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-zinc-400">Side:</span>
                      <span className="tabular-nums">{selectedData.review.side_rating ?? "—"}/10</span>
                    </div>
                    {selectedData.review.side_comment && <div className="mt-1 text-zinc-300">“{selectedData.review.side_comment}”</div>}
                  </div>

                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-zinc-400">Dessert:</span>
                      <span className="tabular-nums">{selectedData.review.dessert_rating ?? "—"}/10</span>
                    </div>
                    {selectedData.review.dessert_comment && <div className="mt-1 text-zinc-300">“{selectedData.review.dessert_comment}”</div>}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">No review yet. Andrew is “busy”.</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
