import { useMemo, useState } from "react";

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

  const shareLink = useMemo(() => {
    // 나중에 Supabase 붙이면 date 대신 UUID/토큰으로 바꿀 예정
    return `${window.location.origin}/andrew?date=${dateISO}`;
  }, [dateISO]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      alert("남편 링크 복사 완료 ✅");
    } catch {
      prompt("복사 안 되면 이 링크를 복사해서 보내:", shareLink);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-md p-5 space-y-4">
        <header className="pt-2 space-y-1">
          <div className="text-xs opacity-70">/juno</div>
          <h1 className="text-2xl font-bold">Juno 메뉴 입력 🍱</h1>
          <p className="text-sm opacity-70">모바일용. 오늘 메뉴 만들고 남편 링크 보내기.</p>
        </header>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
          <label className="block">
            <div className="text-sm font-semibold mb-1">날짜</div>
            <input
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
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
              placeholder="슈가플럼 + 메이플로즈 아몬드"
              className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 p-3 outline-none"
            />
          </label>

          <div className="grid grid-cols-1 gap-2 pt-1">
            <button
              type="button"
              onClick={copyLink}
              className="w-full rounded-xl py-3 font-semibold border border-emerald-600 bg-emerald-500/10 active:scale-[0.99]"
            >
              남편 링크 복사 ✅
            </button>

            <div className="text-xs opacity-60 break-all">
              링크: {shareLink}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm opacity-80">
          히스토리/달력은 다음 단계에서 Supabase 붙이고 바로 넣자.
        </div>
      </div>
    </div>
  );
}
