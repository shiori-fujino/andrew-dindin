import { useMemo, useState } from "react";

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

export default function AndrewPage() {
  const dateISO = useMemo(() => getDateFromQuery(), []);
  const [mainRating, setMainRating] = useState(3);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md p-5 space-y-4">
        <header className="pt-2 space-y-1">
          <div className="text-xs opacity-70">/andrew</div>
          <h1 className="text-2xl font-bold">Andrew 리뷰 ⭐</h1>
          <p className="text-sm opacity-70">오늘({dateISO}) 메뉴 보고 별점만 찍기</p>
        </header>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
          <div className="text-sm opacity-70">메뉴는 다음 단계에서 자동으로 불러오게 할 거야.</div>

          <div className="font-semibold">메인 만족도</div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMainRating(n)}
                className={`text-3xl leading-none ${
                  n <= mainRating ? "opacity-100" : "opacity-30"
                }`}
              >
                ⭐
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => alert("저장은 다음 단계에서 Supabase 붙이면 됨 ✅")}
            className="w-full rounded-xl py-3 font-semibold border border-emerald-600 bg-emerald-500/10 active:scale-[0.99]"
          >
            저장 ✅
          </button>
        </div>
      </div>
    </div>
  );
}
