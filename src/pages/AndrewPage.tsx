import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

type MealRow = {
  date_iso: string;
  main: string;
  rice: string;
  side: string;
  dessert: string;
};

type ReviewRow = {
  date_iso: string;
  main_rating: number;
  main_comment: string | null;
  side_rating: number;
  side_comment: string | null;
  dessert_rating: number;
  dessert_comment: string | null;
};

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

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-xl leading-none active:scale-95 ${
            n <= value ? "opacity-100" : "opacity-30"
          }`}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

export default function AndrewPage() {
  const initialDate = useMemo(() => getDateFromQuery(), []);
  const [dateISO, setDateISO] = useState(initialDate);

  const [meal, setMeal] = useState<MealRow | null>(null);
  const [loadingMeal, setLoadingMeal] = useState(true);

  const [mainRating, setMainRating] = useState(3);
  const [mainComment, setMainComment] = useState("");
  const [sideRating, setSideRating] = useState(3);
  const [sideComment, setSideComment] = useState("");
  const [dessertRating, setDessertRating] = useState(3);
  const [dessertComment, setDessertComment] = useState("");

  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<MealRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  async function loadHistory() {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert")
      .order("date_iso", { ascending: false })
      .limit(14);

    if (!error && data) setHistory(data as MealRow[]);
    setLoadingHistory(false);
  }

  async function loadMealAndReview(date: string) {
    setLoadingMeal(true);

    const mealRes = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert")
      .eq("date_iso", date)
      .maybeSingle();

    if (!mealRes.error && mealRes.data) {
      setMeal(mealRes.data as MealRow);
    } else {
      setMeal(null);
    }

    const reviewRes = await supabase
      .from("reviews")
      .select(
        "date_iso,main_rating,main_comment,side_rating,side_comment,dessert_rating,dessert_comment"
      )
      .eq("date_iso", date)
      .maybeSingle();

    if (!reviewRes.error && reviewRes.data) {
      const r = reviewRes.data as ReviewRow;
      setMainRating(r.main_rating);
      setMainComment(r.main_comment ?? "");
      setSideRating(r.side_rating);
      setSideComment(r.side_comment ?? "");
      setDessertRating(r.dessert_rating);
      setDessertComment(r.dessert_comment ?? "");
    } else {
      setMainRating(3);
      setMainComment("");
      setSideRating(3);
      setSideComment("");
      setDessertRating(3);
      setDessertComment("");
    }

    setLoadingMeal(false);
  }

  useEffect(() => {
    loadHistory();
    loadMealAndReview(dateISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onChangeDate(next: string) {
    setDateISO(next);
    setQueryDate(next);
    await loadMealAndReview(next);
  }

  async function saveReview() {
    if (!meal) {
      alert("這天沒有菜單，請 Juno 先去 /juno 輸入～");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("reviews").upsert({
      date_iso: dateISO,
      main_rating: mainRating,
      main_comment: mainComment.trim() || null,
      side_rating: sideRating,
      side_comment: sideComment.trim() || null,
      dessert_rating: dessertRating,
      dessert_comment: dessertComment.trim() || null,
    });
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("저장 완료 ✅");
  }

  const card =
    "rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md p-5 space-y-4">
        <header className="pt-2 space-y-1">
          <div className="text-xs opacity-70">/andrew</div>
          <h1 className="text-2xl font-bold">Andrew的点评专区 📝</h1>
          <p className="text-sm opacity-70">你越毒舌，我越进步。来吧～</p>
        </header>

        <div className={card}>
          <label className="block">
            <div className="text-sm font-semibold mb-1">日期</div>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => onChangeDate(e.target.value)}
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>
        </div>

        <div className={card}>
          {loadingMeal ? (
            <div className="text-sm opacity-70">加载中…</div>
          ) : !meal ? (
            <div className="text-sm opacity-70">
              이 날짜 메뉴가 없음. Juno가 `/juno`에서 저장해야 함.
            </div>
          ) : (
            <>
              <div className="font-semibold">老公，今晚吃得好吗 ？</div>
              <ul className="list-disc pl-5 text-sm opacity-90 space-y-1">
                <li>蛋白质: {meal.main}</li>
                <li>主食（碳水): {meal.rice}</li>
                <li>蔬菜: {meal.side}</li>
                <li>甜点: {meal.dessert}</li>
              </ul>
            </>
          )}
        </div>

        <div className={card}>
          <div className="font-semibold">1) 蛋白质</div>
          <Stars value={mainRating} onChange={setMainRating} />
          <textarea
            className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            rows={2}
            placeholder="备注（可选）示例: 肉如果再软一点就满分啦！"
            value={mainComment}
            onChange={(e) => setMainComment(e.target.value)}
          />
        </div>

        <div className={card}>
          <div className="font-semibold">2) 蔬菜</div>
          <Stars value={sideRating} onChange={setSideRating} />
          <textarea
            className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            rows={2}
            placeholder="备注（可选）示例: 感觉今天少了一点点用心…下次加一勺爱好吗？"
            value={sideComment}
            onChange={(e) => setSideComment(e.target.value)}
          />
        </div>

        <div className={card}>
          <div className="font-semibold">3) 甜点</div>
          <Stars value={dessertRating} onChange={setDessertRating} />
          <textarea
            className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            rows={2}
            placeholder="备注（可选）示例: 我不喜欢！！下次不要再做啦～"
            value={dessertComment}
            onChange={(e) => setDessertComment(e.target.value)}
          />
        </div>

        <button
          onClick={saveReview}
          disabled={saving}
          className={`w-full rounded-xl py-4 font-semibold border border-emerald-600 bg-emerald-500/10 active:scale-[0.99] ${
            saving ? "opacity-60" : ""
          }`}
        >
          {saving ? "保存中…" : "保存一下 ✅"}
        </button>

        <div className={card}>
          <div className="font-semibold">最近14天菜单记录</div>
          {loadingHistory ? (
            <div className="text-sm opacity-70">加载中…</div>
          ) : history.length === 0 ? (
            <div className="text-sm opacity-70">暂无内容。</div>
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
