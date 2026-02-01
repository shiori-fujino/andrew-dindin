import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

type MealRow = {
  date_iso: string;
  main: string;
  rice: string;
  side: string;
  dessert: string;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function JunoPage() {
  const [dateISO, setDateISO] = useState(() => todayISO());
  const [main, setMain] = useState("");
  const [rice, setRice] = useState("잡곡밥");
  const [side, setSide] = useState("");
  const [dessert, setDessert] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState<MealRow[]>([]);

  const andrewLink = useMemo(() => {
    return `${window.location.origin}/andrew?date=${dateISO}`;
  }, [dateISO]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(andrewLink);
      alert("남편 링크 복사 완료 ✅");
    } catch {
      prompt("복사 안 되면 이 링크를 복사해서 보내:", andrewLink);
    }
  }

  async function loadMeal(date: string) {
    const { data, error } = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert")
      .eq("date_iso", date)
      .maybeSingle();

    if (!error && data) {
      setMain(data.main ?? "");
      setRice(data.rice ?? "잡곡밥");
      setSide(data.side ?? "");
      setDessert(data.dessert ?? "");
    } else {
      setMain("");
      setRice("잡곡밥");
      setSide("");
      setDessert("");
    }
  }

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

  useEffect(() => {
    loadHistory();
    loadMeal(dateISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onChangeDate(next: string) {
    setDateISO(next);
    await loadMeal(next);
  }

  async function saveMeal() {
    if (!main.trim() || !side.trim() || !dessert.trim()) {
      alert("메인/사이드/디저트는 입력해줘 😇");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("meals").upsert({
      date_iso: dateISO,
      main: main.trim(),
      rice: rice.trim() || "잡곡밥",
      side: side.trim(),
      dessert: dessert.trim(),
    });
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadHistory();
    alert("메뉴 저장 완료 ✅");
  }

  const card =
    "rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md p-5 space-y-4">
        <header className="pt-2 space-y-1">
          <div className="text-xs opacity-70">/juno</div>
          <h1 className="text-2xl font-bold">Juno 메뉴 🍱</h1>
          <p className="text-sm opacity-70">날짜 선택 → 메뉴 저장 → 남편 링크 복사</p>
        </header>

        <div className={card}>
          <label className="block">
            <div className="text-sm font-semibold mb-1">날짜</div>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => onChangeDate(e.target.value)}
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">메인</div>
            <input
              value={main}
              onChange={(e) => setMain(e.target.value)}
              placeholder="불고기"
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">밥</div>
            <input
              value={rice}
              onChange={(e) => setRice(e.target.value)}
              placeholder="잡곡밥"
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">사이드</div>
            <input
              value={side}
              onChange={(e) => setSide(e.target.value)}
              placeholder="야채스틱 + 쌈장"
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">디저트</div>
            <input
              value={dessert}
              onChange={(e) => setDessert(e.target.value)}
              placeholder="과일"
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={saveMeal}
            disabled={saving}
            className={`w-full rounded-xl py-3 font-semibold border border-emerald-600 bg-emerald-500/10 active:scale-[0.99] ${
              saving ? "opacity-60" : ""
            }`}
          >
            {saving ? "저장중..." : "메뉴 저장 ✅"}
          </button>

          <button
            type="button"
            onClick={copyLink}
            className="w-full rounded-xl py-3 font-semibold border border-zinc-700 bg-zinc-950/40 active:scale-[0.99]"
          >
            남편 링크 복사
          </button>

          <div className="text-xs opacity-60 break-all">링크: {andrewLink}</div>
        </div>

        <div className={card}>
          <div className="font-semibold">최근 메뉴 (14일)</div>
          {loadingHistory ? (
            <div className="text-sm opacity-70">불러오는중…</div>
          ) : history.length === 0 ? (
            <div className="text-sm opacity-70">아직 없음. 첫 메뉴 저장 ㄱㄱ</div>
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
