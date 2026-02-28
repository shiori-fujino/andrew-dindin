// 진짜_최종_통파일.jpg (tsx임… 이름만 JPG 컨셉 ㅋㅋ)
// - 全部中文（偏台灣用語）
// - 只使用 1..5 分（星星）
// - 不使用 public.reviews（你說你刪了總評）
// - 只讀 meals、只讀寫 review_metrics
// - 每個 metric 都是 1..5（UI + 存庫）
//   ※ DB 端也要把 review_metrics.score check 改成 1..5（你已同意）

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

type MealRow = {
  date_iso: string;
  main: string;
  side: string;
  dessert: string;
  juno_note?: string | null;
};

type Section = "main" | "side" | "dessert";

type MetricDef = {
  section: Section;
  key: string;
  label: string;
  low?: string; // 1 分說明
  high?: string; // 5 分說明
};

type MetricRow = {
  date_iso: string; // text
  section: Section;
  metric_key: string;
  score: number; // 1..5
  note: string | null;
};

type MetricState = Record<string, number>; // `${section}.${metric_key}` -> 1..5

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDateFromQuery() {
  const url = new URL(window.location.href);
  return url.searchParams.get("date") || todayISO();
}

function setQueryDate(dateISO: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("date", dateISO);
  window.history.replaceState({}, "", url.toString());
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const v = clamp(value, 1, 5);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-9 h-9 flex items-center justify-center leading-none p-0 rounded-lg active:scale-95 ${
            n <= v ? "opacity-100" : "opacity-30"
          }`}
          aria-label={`${n} 星`}
          title={`${n} / 5`}
        >
          <span className="text-[18px] leading-none">⭐</span>
        </button>
      ))}
    </div>
  );
}

// ====== Metrics defs (全中文，台灣口吻) ======
const METRICS: MetricDef[] = [
  // MAIN / 蛋白質
  { section: "main", key: "seasoning", label: "調味(鹹度)", low: "沒味道/太鹹", high: "剛剛好" },
  { section: "main", key: "tenderness", label: "嫩度(咬感)", low: "太硬/爛糊", high: "完美" },
  { section: "main", key: "doneness", label: "熟度", low: "太生/太老", high: "剛好" },
  { section: "main", key: "juiciness", label: "多汁度", low: "乾柴", high: "爆汁" },
  { section: "main", key: "greasiness", label: "油膩感", low: "太膩", high: "乾淨順口" },
  { section: "main", key: "portion", label: "份量", low: "不夠", high: "剛好/滿足" },

  // SIDE / 蔬菜
  { section: "side", key: "freshness", label: "新鮮度", low: "不太行", high: "很新鮮" },
  { section: "side", key: "texture", label: "口感(脆/軟)", low: "怪怪的", high: "剛好" },
  { section: "side", key: "balance", label: "整體平衡", low: "不協調", high: "很順" },
  { section: "side", key: "portion", label: "份量", low: "不夠", high: "剛好/滿足" },

  // DESSERT / 甜點
  { section: "dessert", key: "finish", label: "收尾幸福感", low: "沒感覺", high: "完美收尾" },
];

function mk(section: Section, metric_key: string) {
  return `${section}.${metric_key}`;
}

function defaultMetricState(): MetricState {
  const s: MetricState = {};
  for (const m of METRICS) s[mk(m.section, m.key)] = 3; // 預設中間 3 星
  return s;
}

function MetricBlock({
  title,
  section,
  metrics,
  setMetrics,
}: {
  title: string;
  section: Section;
  metrics: MetricState;
  setMetrics: React.Dispatch<React.SetStateAction<MetricState>>;
}) {
  const list = METRICS.filter((m) => m.section === section);

  return (
    <div className="space-y-3">
      <div className="font-semibold">{title}</div>

      <div className="space-y-3">
        {list.map((m) => {
          const key = mk(m.section, m.key);
          const value = clamp(metrics[key] ?? 3, 1, 5);

          return (
            <div key={key} className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold">{m.label}</div>
                <div className="text-sm opacity-80">{value}/5</div>
              </div>

              <div className="mt-2">
                <Stars
                  value={value}
                  onChange={(nv) => setMetrics((prev) => ({ ...prev, [key]: clamp(nv, 1, 5) }))}
                />
              </div>

              {(m.low || m.high) && (
                <div className="mt-2 text-xs opacity-70 flex justify-between gap-3">
                  <span className="truncate">1 = {m.low ?? "低"}</span>
                  <span className="truncate">5 = {m.high ?? "高"}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AndrewPage() {
  const initialDate = useMemo(() => getDateFromQuery(), []);
  const [dateISO, setDateISO] = useState(initialDate);

  const [meal, setMeal] = useState<MealRow | null>(null);
  const [loadingMeal, setLoadingMeal] = useState(true);

  const [metrics, setMetrics] = useState<MetricState>(() => defaultMetricState());
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<MealRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert, juno_note")
      .order("date_iso", { ascending: false })
      .limit(14);

    if (error) console.warn("loadHistory error:", error.message);
    if (data) setHistory(data as MealRow[]);
    setLoadingHistory(false);
  }

  async function loadMetrics(date: string) {
    setLoadingMetrics(true);

    const { data, error } = await supabase
      .from("review_metrics")
      .select("date_iso,section,metric_key,score,note")
      .eq("date_iso", date);

    if (error) {
      console.warn("loadMetrics error:", error.message);
      setMetrics(defaultMetricState());
      setLoadingMetrics(false);
      return;
    }

    const next = defaultMetricState();
    (data as MetricRow[] | null)?.forEach((r) => {
      next[mk(r.section, r.metric_key)] = clamp(r.score, 1, 5);
    });

    setMetrics(next);
    setLoadingMetrics(false);
  }

  async function loadMeal(date: string) {
    setLoadingMeal(true);

    const mealRes = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert,juno_note")
      .eq("date_iso", date)
      .maybeSingle();

    if (!mealRes.error && mealRes.data) setMeal(mealRes.data as MealRow);
    else setMeal(null);

    setLoadingMeal(false);
  }

  useEffect(() => {
    loadHistory();
    loadMeal(dateISO);
    loadMetrics(dateISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onChangeDate(next: string) {
    setDateISO(next);
    setQueryDate(next);
    await loadMeal(next);
    await loadMetrics(next);
  }

  async function saveMetrics() {
    if (!meal) {
      alert("今天沒有菜單，請 Juno 先去 /juno 輸入～");
      return;
    }

    setSaving(true);

    const metricRows = METRICS.map((m) => ({
      date_iso: dateISO,
      section: m.section,
      metric_key: m.key,
      score: clamp(metrics[mk(m.section, m.key)] ?? 3, 1, 5),
      note: null,
    }));

    const res = await supabase
      .from("review_metrics")
      .upsert(metricRows, { onConflict: "date_iso,section,metric_key" });

    setSaving(false);

    if (res.error) {
      alert("儲存失敗: " + res.error.message);
      return;
    }

    alert("已儲存 ✅");
  }

  const card = "rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md p-5 space-y-4 min-w-0">
        <header className="pt-2 space-y-1">
          <div className="text-xs opacity-70">/andrew</div>
          <h1 className="text-2xl font-bold">Andrew 的評分區 📝</h1>
          <p className="text-sm opacity-70">你越毒舌，我越進步。來吧～</p>
        </header>

        <div className={card}>
          <label className="block">
            <div className="text-sm font-semibold mb-1">日期</div>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => onChangeDate(e.target.value)}
              className="w-full h-12 px-3 rounded-xl bg-zinc-950/60 border border-zinc-800 outline-none"
            />
          </label>
        </div>

        <div className={card}>
          {loadingMeal ? (
            <div className="text-sm opacity-70">載入中…</div>
          ) : !meal ? (
            <div className="text-sm opacity-70">這天沒有菜單。請 Juno 先在 `/juno` 存好。</div>
          ) : (
            <>
              <div className="font-semibold">老公，今天吃得還行嗎？</div>

              {meal?.juno_note?.trim() ? (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="text-sm font-semibold mb-1">今日小劇場</div>
                  <div className="text-sm opacity-90 whitespace-pre-wrap">{meal.juno_note}</div>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
                  <div className="text-sm font-semibold mb-1">今日小劇場</div>
                  <div className="text-sm opacity-70">今天停更。</div>
                </div>
              )}

              <ul className="list-disc pl-5 text-sm opacity-90 space-y-1">
                <li>蛋白質：{meal.main}</li>
                <li>蔬菜：{meal.side}</li>
                <li>甜點：{meal.dessert}</li>
              </ul>
            </>
          )}
        </div>

        <div className={card}>
          {loadingMetrics ? (
            <div className="text-sm opacity-70">載入中（細項）…</div>
          ) : (
            <div className="space-y-6">
              <MetricBlock title="🥩 蛋白質（每項 5 星）" section="main" metrics={metrics} setMetrics={setMetrics} />
              <MetricBlock title="🥬 蔬菜（每項 5 星）" section="side" metrics={metrics} setMetrics={setMetrics} />
              <MetricBlock title="🍰 甜點（每項 5 星）" section="dessert" metrics={metrics} setMetrics={setMetrics} />
            </div>
          )}
        </div>

        <button
          onClick={saveMetrics}
          disabled={saving}
          className={`w-full rounded-xl py-4 font-semibold border border-emerald-600 bg-emerald-500/10 active:scale-[0.99] ${
            saving ? "opacity-60" : ""
          }`}
        >
          {saving ? "儲存中…" : "儲存一下 ✅"}
        </button>

        <div className={card}>
          <div className="font-semibold">最近 14 天菜單</div>
          {loadingHistory ? (
            <div className="text-sm opacity-70">載入中…</div>
          ) : history.length === 0 ? (
            <div className="text-sm opacity-70">暫無內容。</div>
          ) : (
            <div className="space-y-2">
              {history.map((m) => (
                <button
                  key={m.date_iso}
                  onClick={() => onChangeDate(m.date_iso)}
                  className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 active:scale-[0.99]"
                >
                  <div className="text-sm font-semibold">{m.date_iso}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {m.main} · {m.side} · {m.dessert}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}