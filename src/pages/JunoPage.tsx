import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

type MainCategory = "beef" | "pork" | "chicken" | "fish" | "takeaway" | null;

type MealHistoryRow = {
  date_iso: string;
  main: string;
  rice: string;
  side: string;
  dessert: string;
  main_category: MainCategory;
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
  const [mainCategory, setMainCategory] = useState<MainCategory>(null);
  const [rice, setRice] = useState("잡곡밥");
  const [side, setSide] = useState("");
  const [dessert, setDessert] = useState("");
  const [junoNote, setJunoNote] = useState(""); 
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [history, setHistory] = useState<MealHistoryRow[]>([]);

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

  function labelEmoji(cat: MainCategory) {
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
        return " ";
    }
  }

  async function loadMeal(date: string) {
    const { data, error } = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert,main_category,juno_note")
      .eq("date_iso", date)
      .maybeSingle();

    if (!error && data) {
      setMain(data.main ?? "");
      setMainCategory((data.main_category as MainCategory) ?? null);
      setRice(data.rice ?? "잡곡밥");
      setSide(data.side ?? "");
      setDessert(data.dessert ?? "");
      setJunoNote(data.juno_note ?? "");
    } else {
      setMain("");
      setMainCategory(null);
      setRice("잡곡밥");
      setSide("");
      setDessert("");
      setJunoNote("");
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("meals")
      .select("date_iso,main,rice,side,dessert,main_category")
      .order("date_iso", { ascending: false })
      .limit(14);

      if (!error && data) setHistory((data ?? []) as MealHistoryRow[]);
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
      main_category: mainCategory, 
      rice: rice.trim() || "잡곡밥",
      side: side.trim(),
      dessert: dessert.trim(),
      juno_note: junoNote.trim() || null, 

    });
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    await loadHistory();
    alert("메뉴 저장 완료 ✅");
  }

  // German engineer style: square, gridlines, no rounded
  const card = "border border-zinc-800 bg-zinc-900/30 p-4 space-y-3";
  const input = "w-full bg-zinc-950/60 border border-zinc-800 p-3 outline-none";
  const btn =
    "w-full py-3 font-semibold border border-zinc-700 bg-zinc-950/40 active:scale-[0.99]";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md p-5 space-y-4">
        <header className="pt-2 space-y-1">
          <div className="text-xs opacity-70">/juno</div>
          <h1 className="text-2xl font-bold">Juno 메뉴 🍱</h1>
          <p className="text-sm opacity-70">
            날짜 선택 → 메뉴 저장 → 남편 링크 복사
          </p>
        </header>

        <div className={card}>
          <label className="block">
            <div className="text-sm font-semibold mb-1">날짜</div>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => onChangeDate(e.target.value)}
              className={input}
            />
          </label>

          {/* ✅ Main category buttons */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">메인 종류</div>
            <div className="grid grid-cols-5 gap-px bg-zinc-800">
              {[
                { key: "beef", label: "🐮" },
                { key: "pork", label: "🐷" },
                { key: "chicken", label: "🐔" },
                { key: "fish", label: "🐟" },
                { key: "takeaway", label: "🥡" },
              ].map((x) => {
                const active = mainCategory === (x.key as MainCategory);
                return (
                  <button
                    key={x.key}
                    type="button"
                    onClick={() => setMainCategory(x.key as MainCategory)}
                    className={[
                      "p-3 text-lg bg-zinc-950/60 hover:bg-zinc-900 border border-zinc-800",
                      active ? "outline outline-2 outline-amber-300/70" : "outline-none",
                    ].join(" ")}
                    title={x.key}
                  >
                    {x.label}
                  </button>
                );
              })}
            </div>
            <div className="text-xs opacity-60">
              현재 선택: {labelEmoji(mainCategory)} {mainCategory ?? "(none)"}
            </div>
          </div>

          <label className="block">
            <div className="text-sm font-semibold mb-1">메인</div>
            <input
              value={main}
              onChange={(e) => setMain(e.target.value)}
              placeholder="불고기"
              className={input}
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">밥</div>
            <input
              value={rice}
              onChange={(e) => setRice(e.target.value)}
              placeholder="잡곡밥"
              className={input}
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">사이드</div>
            <input
              value={side}
              onChange={(e) => setSide(e.target.value)}
              placeholder="야채스틱 + 쌈장"
              className={input}
            />
          </label>

          <label className="block">
            <div className="text-sm font-semibold mb-1">디저트</div>
            <input
              value={dessert}
              onChange={(e) => setDessert(e.target.value)}
              placeholder="과일"
              className={input}
            />
          </label>
          <label className="block">
  <div className="text-sm font-semibold mb-1">Dinner Note</div>
  <textarea
    value={junoNote}
    onChange={(e) => setJunoNote(e.target.value)}
    placeholder="예) Andrew sleepy. salt was too much. next time less sauce."
    className={`${input} min-h-[120px]`}
  />
</label>


          <button type="button" onClick={saveMeal} disabled={saving} className={btn}>
            {saving ? "저장중..." : "메뉴 저장 ✅"}
          </button>

          <button type="button" onClick={copyLink} className={btn}>
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
                  className="w-full text-left border border-zinc-800 bg-zinc-950/40 p-3 active:scale-[0.99]"
                >
                  <div className="text-sm font-semibold">
                    {m.date_iso}{" "}
                    <span className="ml-1">{labelEmoji(m.main_category)}</span>
                  </div>
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
