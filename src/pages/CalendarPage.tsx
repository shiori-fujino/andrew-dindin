// 최종_통파일.jpg  (진짜는 TSX임 ㅋㅋ)
// CalendarPage (月曆總覽) - 新版用 review_metrics(1..5) 當主要評分
// - DB 저장은 ISO: YYYY-MM-DD (date_iso text)로 계속 가는 게 정답
//   표시(UI)만 호주식으로 바꾸고 싶으면 아래 formatAUDate() 쓰면 됨.
// - 旧 reviews 的「評語/留言」는 절대 안 지움: Legacy 區塊로 그대로 보여줌.
// - LineChart 축 1..5로 변경 (0..5로 그리지만 점수는 1..5)
// - Calendar 셀: ⭐平均 + 🐮🐷🐔🐟🥡 + MENU/RATED/LEGACY 상태

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabase";

type MealRow = {
  date_iso: string; // YYYY-MM-DD (store)
  main: string | null;
  rice: string | null;
  side: string | null;
  dessert: string | null;
  main_category: "beef" | "pork" | "chicken" | "fish" | "takeaway" | null;
  juno_note: string | null;
};

type LegacyReviewRow = {
  date_iso: string; // YYYY-MM-DD
  main_rating: number | null; // old (0..10) maybe
  main_comment: string | null;
  side_rating: number | null; // old (0..10) maybe
  side_comment: string | null;
  dessert_rating: number | null; // old (0..10) maybe
  dessert_comment: string | null;
};

type Section = "main" | "side" | "dessert";

type MetricRow = {
  date_iso: string; // YYYY-MM-DD text
  section: Section;
  metric_key: string;
  score: number; // 1..5 (new)
  note: string | null;
};

type MetricSummary = {
  avg: number | null; // 1..5
  sectionAvg: Partial<Record<Section, number>>;
  top: Array<{ section: Section; metric_key: string; score: number }>;
  bottom: Array<{ section: Section; metric_key: string; score: number }>;
  count: number;
};

type DayData = {
  meal?: MealRow;
  legacy?: LegacyReviewRow; // old comments
  metrics?: MetricSummary; // new metrics summary
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
  return toISODate(d);
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clamp0to5(n: number) {
  return Math.max(0, Math.min(5, n));
}

// 표시용: AU 스타일 DD/MM/YYYY (원하면 UI에만 적용)
// 저장/쿼리는 ISO로 유지해야 함.
function formatAUDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
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

// --- Metrics summary helpers ---
function summarizeMetrics(rows: MetricRow[] | undefined): MetricSummary {
  if (!rows || rows.length === 0) {
    return { avg: null, sectionAvg: {}, top: [], bottom: [], count: 0 };
  }

  const scores = rows
    .map((r) => (typeof r.score === "number" ? clamp(r.score, 1, 5) : null))
    .filter((v): v is number => v != null);

  const avg =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

  const sectionBuckets: Record<Section, number[]> = { main: [], side: [], dessert: [] };
  for (const r of rows) {
    const s = clamp(r.score, 1, 5);
    sectionBuckets[r.section].push(s);
  }

  const sectionAvg: Partial<Record<Section, number>> = {};
  (Object.keys(sectionBuckets) as Section[]).forEach((sec) => {
    const arr = sectionBuckets[sec];
    if (arr.length) sectionAvg[sec] = Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  });

  const sorted = [...rows]
    .map((r) => ({ section: r.section, metric_key: r.metric_key, score: clamp(r.score, 1, 5) }))
    .sort((a, b) => b.score - a.score);

  const top = sorted.slice(0, 2);
  const bottom = [...sorted].reverse().slice(0, 1);

  return { avg, sectionAvg, top, bottom, count: rows.length };
}

function starsText(score: number) {
  const n = clamp(Math.round(score), 1, 5);
  return "⭐".repeat(n) + "☆".repeat(5 - n);
}

// --- Daily series for chart ---
function buildDailyAvgSeries(monthCursor: Date, dayMap: Record<string, DayData>) {
  const start = startOfMonth(monthCursor);
  const end = endOfMonth(monthCursor);
  const daysInMonth = end.getDate();

  const points: Array<{ day: number; iso: string; avg: number | null }> = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(start.getFullYear(), start.getMonth(), day);
    const iso = toISODate(d);
    const avg = dayMap[iso]?.metrics?.avg ?? null;
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
  const yForValue = (v: number) => padT + ((5 - clamp0to5(v)) / 5) * innerH;

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
  const yTicks = [5, 3, 1];

  return (
    <div className="w-full border border-white/20 bg-zinc-950">
      <div className="px-3 py-2 border-b border-white/20 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-200">每日平均（1–5⭐）</div>
        <div className="text-xs text-zinc-500">{hasAny ? `${valid.length} 天` : "本月還沒評分"}</div>
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
            const label = `${formatAUDate(p.iso)}：${clamp0to5(p.avg as number).toFixed(1)}/5`;
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

        {!hasAny && <div className="text-xs text-zinc-500 pt-2">這個月還沒有評分紀錄。</div>}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] px-2 py-1 border border-white/20 bg-white/5 text-zinc-200">{children}</span>;
}

export default function CalendarPage() {
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(false);
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});
  const [selectedISO, setSelectedISO] = useState<string | null>(isoToday());

  const { cells, daysInMonth } = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

  const monthLabel = useMemo(() => {
    // 台灣/中文月份顯示
    const fmt = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" });
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

        // Legacy (old comments) keep!
        const legacyQ = supabase
          .from("reviews")
          .select("date_iso, main_rating, main_comment, side_rating, side_comment, dessert_rating, dessert_comment")
          .gte("date_iso", fromISO)
          .lte("date_iso", toISO);

        // New metrics (1..5)
        const metricsQ = supabase
          .from("review_metrics")
          .select("date_iso, section, metric_key, score, note")
          .gte("date_iso", fromISO)
          .lte("date_iso", toISO);

        const [mealsRes, legacyRes, metricsRes] = await Promise.all([mealsQ, legacyQ, metricsQ]);

        if (mealsRes.error) throw mealsRes.error;
        if (legacyRes.error) throw legacyRes.error;
        if (metricsRes.error) throw metricsRes.error;

        const next: Record<string, DayData> = {};

        (mealsRes.data ?? []).forEach((m: MealRow) => {
          next[m.date_iso] = { ...(next[m.date_iso] ?? {}), meal: m };
        });

        (legacyRes.data ?? []).forEach((r: LegacyReviewRow) => {
          next[r.date_iso] = { ...(next[r.date_iso] ?? {}), legacy: r };
        });

        // group metrics by date
        const byDate: Record<string, MetricRow[]> = {};
        (metricsRes.data ?? []).forEach((row: MetricRow) => {
          const iso = row.date_iso;
          if (!byDate[iso]) byDate[iso] = [];
          byDate[iso].push(row);
        });

        Object.keys(byDate).forEach((iso) => {
          next[iso] = { ...(next[iso] ?? {}), metrics: summarizeMetrics(byDate[iso]) };
        });

        setDayMap(next);

        // keep selection within month
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

  const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];

  const dailySeries = useMemo(() => buildDailyAvgSeries(monthCursor, dayMap), [monthCursor, dayMap]);

  const selectedTitle = selectedISO ? formatAUDate(selectedISO) : "請選一天";

  const statusForDay = (iso: string): "EMPTY" | "MENU" | "RATED" | "LEGACY" => {
    const d = dayMap[iso];
    const hasMeal = !!d?.meal;
    const hasMetrics = (d?.metrics?.count ?? 0) > 0 && d?.metrics?.avg != null;
    const hasLegacy = !!d?.legacy && !!(d.legacy.main_comment || d.legacy.side_comment || d.legacy.dessert_comment);

    if (hasMetrics) return "RATED";
    if (hasMeal && hasLegacy) return "LEGACY";
    if (hasMeal) return "MENU";
    return "EMPTY";
  };

  return (
    <div className="w-screen h-screen bg-black text-zinc-100 overflow-hidden">
      <div className="w-full h-full p-4 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
          <div>
            <h1 className="text-xl font-semibold">晚餐月曆</h1>
            <p className="text-sm text-zinc-400">
              {monthLabel} · {daysInMonth} 天
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100"
              onClick={() => setMonthCursor((d) => addMonths(d, -1))}
              aria-label="上一個月"
            >
              ←
            </button>
            <button
              className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100"
              onClick={() => setMonthCursor(startOfMonth(new Date()))}
              aria-label="回到本月"
            >
              本月
            </button>
            <button
              className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100"
              onClick={() => setMonthCursor((d) => addMonths(d, +1))}
              aria-label="下一個月"
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
              const emoji = hasMeal ? mainEmoji(data?.meal?.main_category ?? null) : "";

              const metricsAvg = data?.metrics?.avg ?? null;
              const st = iso ? statusForDay(iso) : "EMPTY";

              // 표시 텍스트
              const corner =
                st === "RATED"
                  ? metricsAvg != null
                    ? `⭐ ${clamp0to5(metricsAvg).toFixed(1)}`
                    : "⭐"
                  : st === "LEGACY"
                  ? "LEGACY"
                  : st === "MENU"
                  ? "MENU"
                  : "—";

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

                    {isToday ? (
                      <span className="text-[10px] px-1.5 py-0.5 border border-white/30 bg-white/5 text-zinc-200">
                        今天
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500">{""}</span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-2xl">{emoji}</div>

                    <div
                      className={[
                        "text-xs font-semibold tabular-nums",
                        st === "RATED" ? "text-amber-200" : st === "LEGACY" ? "text-zinc-300" : "text-zinc-500",
                      ].join(" ")}
                      title={iso ? `${formatAUDate(iso)} · ${st}` : ""}
                    >
                      {corner}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {loading && <div className="text-sm text-zinc-400 p-3 border-t border-white/20">載入本月資料中…</div>}
        </div>

        {/* Details */}
        <div className="border border-white/20 bg-zinc-950 mt-4">
          <div className="p-4 border-b border-white/20">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedTitle}</h2>

                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedISO && (() => {
                    const st = statusForDay(selectedISO);
                    if (st === "RATED") return <Chip>已評分</Chip>;
                    if (st === "LEGACY") return <Chip>舊留言(保留)</Chip>;
                    if (st === "MENU") return <Chip>只有菜單</Chip>;
                    return <Chip>空白</Chip>;
                  })()}

                  {selectedData?.metrics?.avg != null && <Chip>平均 ⭐ {selectedData.metrics.avg.toFixed(1)}/5</Chip>}
                  {selectedData?.meal?.main_category && <Chip>{mainEmoji(selectedData.meal.main_category)} 主菜</Chip>}
                </div>
              </div>

              {selectedISO && (
                <div className="flex gap-2">
                  <Link
                    className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100 text-sm"
                    to={`/juno?date=${selectedISO}`}
                  >
                    打開 Juno
                  </Link>
                  <Link
                    className="px-3 py-1.5 border border-white/20 bg-white/5 hover:bg-white/10 text-zinc-100 text-sm"
                    to={`/andrew?date=${selectedISO}`}
                  >
                    打開 Andrew
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Juno note */}
          <div className="p-4 border-b border-white/20">
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">今日小劇場 📝</h3>

            {selectedData?.meal?.juno_note && selectedData.meal.juno_note.trim().length > 0 ? (
              <div className="text-sm text-zinc-100 whitespace-pre-wrap">{selectedData.meal.juno_note}</div>
            ) : (
              <div className="text-sm text-zinc-400">沒有備註。</div>
            )}
          </div>

          <div className="p-4 space-y-8">
            {/* Menu */}
            <section>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">菜單</h3>
              {selectedData?.meal ? (
                <div className="text-sm space-y-1 text-zinc-100">
                  <div>
                    <span className="text-zinc-400">蛋白質：</span> {selectedData.meal.main || "—"}
                  </div>
                  <div>
                    <span className="text-zinc-400">主食：</span> {selectedData.meal.rice || "—"}
                  </div>
                  <div>
                    <span className="text-zinc-400">蔬菜：</span> {selectedData.meal.side || "—"}
                  </div>
                  <div>
                    <span className="text-zinc-400">甜點：</span> {selectedData.meal.dessert || "—"}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">今天沒有記錄菜單。</div>
              )}
            </section>

            {/* New metrics summary */}
            <section>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">新版細項評分（1–5⭐）</h3>

              {selectedData?.metrics?.avg != null ? (
                <div className="space-y-4">
                  <div className="text-sm text-zinc-100">
                    <span className="text-zinc-400">今日平均：</span>
                    <span className="font-semibold text-amber-200"> {selectedData.metrics.avg.toFixed(1)}/5</span>
                    <span className="ml-2 text-zinc-400">{starsText(selectedData.metrics.avg)}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedData.metrics.sectionAvg.main != null && (
                      <Chip>🥩 {selectedData.metrics.sectionAvg.main.toFixed(1)}/5</Chip>
                    )}
                    {selectedData.metrics.sectionAvg.side != null && (
                      <Chip>🥬 {selectedData.metrics.sectionAvg.side.toFixed(1)}/5</Chip>
                    )}
                    {selectedData.metrics.sectionAvg.dessert != null && (
                      <Chip>🍰 {selectedData.metrics.sectionAvg.dessert.toFixed(1)}/5</Chip>
                    )}
                    <Chip>項目數 {selectedData.metrics.count}</Chip>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border border-white/20 bg-white/5 p-3">
                      <div className="text-xs text-zinc-400 mb-2">表現最好 TOP</div>
                      {selectedData.metrics.top.length ? (
                        <div className="space-y-2 text-sm">
                          {selectedData.metrics.top.map((t, i) => (
                            <div key={`${t.section}.${t.metric_key}.${i}`} className="flex items-center justify-between">
                              <span className="text-zinc-200">
                                {t.section === "main" ? "🥩" : t.section === "side" ? "🥬" : "🍰"} {t.metric_key}
                              </span>
                              <span className="text-amber-200">{starsText(t.score)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-500">還沒有資料。</div>
                      )}
                    </div>

                    <div className="border border-white/20 bg-white/5 p-3">
                      <div className="text-xs text-zinc-400 mb-2">最需要加油 FLOP</div>
                      {selectedData.metrics.bottom.length ? (
                        <div className="space-y-2 text-sm">
                          {selectedData.metrics.bottom.map((t, i) => (
                            <div key={`${t.section}.${t.metric_key}.${i}`} className="flex items-center justify-between">
                              <span className="text-zinc-200">
                                {t.section === "main" ? "🥩" : t.section === "side" ? "🥬" : "🍰"} {t.metric_key}
                              </span>
                              <span className="text-zinc-300">{starsText(t.score)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-zinc-500">還沒有資料。</div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-zinc-500">
                    小提醒：metric_key 顯示的是「資料鍵」。想顯示中文名稱的話，可以做一個 key→label 對照表（我也可以幫你做）。
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">今天還沒有新版細項評分。</div>
              )}
            </section>

            {/* Legacy comments */}
            <section>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">舊版評語（保留）🗄️</h3>

              {selectedData?.legacy ? (
                <div className="text-sm space-y-4 text-zinc-100">
                  <div className="border border-white/20 bg-white/5 p-3">
                    <div className="text-xs text-zinc-400 mb-2">Main</div>
                    {selectedData.legacy.main_comment ? (
                      <div className="text-zinc-200 whitespace-pre-wrap">“{selectedData.legacy.main_comment}”</div>
                    ) : (
                      <div className="text-zinc-500">（沒有留言）</div>
                    )}
                  </div>

                  <div className="border border-white/20 bg-white/5 p-3">
                    <div className="text-xs text-zinc-400 mb-2">Side</div>
                    {selectedData.legacy.side_comment ? (
                      <div className="text-zinc-200 whitespace-pre-wrap">“{selectedData.legacy.side_comment}”</div>
                    ) : (
                      <div className="text-zinc-500">（沒有留言）</div>
                    )}
                  </div>

                  <div className="border border-white/20 bg-white/5 p-3">
                    <div className="text-xs text-zinc-400 mb-2">Dessert</div>
                    {selectedData.legacy.dessert_comment ? (
                      <div className="text-zinc-200 whitespace-pre-wrap">“{selectedData.legacy.dessert_comment}”</div>
                    ) : (
                      <div className="text-zinc-500">（沒有留言）</div>
                    )}
                  </div>

                  <div className="text-xs text-zinc-500">
                    這裡是你們以前的系統留下的評語，完全不會被覆蓋或刪掉。
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">沒有舊評語。</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}