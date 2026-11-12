import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { askCoach } from "../api";

const FIRST = ["치킨 칼로리", "떡볶이 나트륨", "30분 걷기 칼로리", "소주 1병", "나트륨 하루 권장량", "혈당지수가 뭐야?"];

/** 바디쌤 얼굴 (흰 가운 + 안경) */
function CoachFace({ size = 44 }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} aria-hidden="true">
      <circle cx="30" cy="30" r="29" fill="#fff4e6" />
      <path d="M8 60 Q10 42 30 42 Q50 42 52 60 Z" fill="#fff" stroke="#dee2e6" />
      <path d="M26 42 L30 52 L34 42" fill="#74c0fc" />
      <circle cx="30" cy="26" r="13" fill="#f3cba5" />
      <path d="M17 25 Q16 11 30 11 Q44 11 43 25 Q38 17 30 17 Q22 17 17 25 Z" fill="#3b2f2f" />
      <circle cx="25" cy="27" r="3.6" fill="none" stroke="#343a40" strokeWidth="1.4" />
      <circle cx="35" cy="27" r="3.6" fill="none" stroke="#343a40" strokeWidth="1.4" />
      <path d="M28.6 27 L31.4 27" stroke="#343a40" strokeWidth="1.4" />
      <circle cx="25" cy="27" r="1.1" fill="#2b2b2b" /><circle cx="35" cy="27" r="1.1" fill="#2b2b2b" />
      <path d="M26 33 Q30 36 34 33" stroke="#7a3b2e" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Card({ card }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl bg-white text-xs ring-1 ring-line">
      <p className="border-b border-line px-3 py-1.5 font-semibold">{card.title}</p>
      <table className="w-full tabular-nums">
        {card.head && (
          <thead><tr className="text-mute">{card.head.map((h, i) => <th key={i} className="px-3 py-1 text-left font-normal">{h}</th>)}</tr></thead>
        )}
        <tbody>
          {card.rows.map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {r.map((c, j) => <td key={j} className={`px-3 py-1 ${j === 0 ? "text-mute" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {card.note && <p className="border-t border-line px-3 py-1 text-[10px] text-mute">{card.note}</p>}
    </div>
  );
}

export default function Coach({ person }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ from: "coach", text: "안녕하세요, 바디쌤이에요! 음식 영양성분, 운동으로 쓰는 열량, 술 정보, 건강 상식을 물어보세요.", suggestions: FIRST }]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open]);

  async function send(text) {
    const t = text.trim();
    if (!t || busy) return;
    setQ("");
    setMsgs((m) => [...m, { from: "me", text: t }]);
    setBusy(true);
    try {
      const r = await askCoach(t, person.weight_kg, person.sex);
      setMsgs((m) => [...m, { from: "coach", text: r.answer, card: r.card, suggestions: r.suggestions }]);
    } catch {
      setMsgs((m) => [...m, { from: "coach", text: "지금은 답을 가져오지 못했어요. 잠시 후 다시 물어봐 주세요." }]);
    } finally {
      setBusy(false);
    }
  }

  const last = msgs[msgs.length - 1];
  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button key="fab" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
            onClick={() => setOpen(true)} aria-label="바디쌤에게 물어보기"
            className="fixed bottom-24 right-3 z-40 flex items-center gap-2 rounded-full bg-white p-1.5 shadow-xl ring-1 ring-line sm:bottom-5 sm:right-5 sm:pr-4">
            <CoachFace />
            <span className="font-display hidden text-lg sm:inline">바디쌤에게 물어보기</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside key="panel" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 26, stiffness: 240 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-paper shadow-2xl ring-1 ring-line sm:w-[380px]" aria-label="바디쌤 질문 창">
            <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
              <CoachFace size={40} />
              <div className="flex-1">
                <p className="font-display text-xl leading-tight">바디쌤</p>
                <p className="text-[11px] text-mute">식약처 영양 DB · 영양소 섭취기준 기반으로 답해요</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-full px-2 text-xl text-mute hover:text-ink" aria-label="닫기">✕</button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "gap-2"}`}>
                  {m.from === "coach" && <div className="shrink-0"><CoachFace size={30} /></div>}
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.from === "me" ? "bg-brand text-white" : "bg-white ring-1 ring-line"}`}>
                    {m.text}
                    {m.card && <Card card={m.card} />}
                  </div>
                </div>
              ))}
              {busy && <p className="pl-10 text-xs text-mute">찾아보는 중…</p>}
              <div ref={endRef} />
            </div>

            {last?.suggestions?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-t border-line px-4 py-2">
                {last.suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-line hover:bg-brand hover:text-white hover:ring-brand">{s}</button>
                ))}
              </div>
            )}
            <form className="flex gap-2 border-t border-line bg-white p-3" onSubmit={(e) => { e.preventDefault(); send(q); }}>
              <input id="coach-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="예: 김밥 한 줄 칼로리"
                className="flex-1 rounded-full border border-line px-4 py-2 text-sm focus:border-brand focus:outline-none" maxLength={100} />
              <button disabled={busy || !q.trim()} className="rounded-full bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">물어보기</button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
