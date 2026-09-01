import React, { useEffect, useRef, useState } from "react";
import { Bot, User, Send } from "lucide-react";
import { api } from "../api/client";
import { Panel } from "../components/ui";

const SUGGESTIONS = [
  "Why is diesel ON?",
  "Will we have enough energy during tomorrow's storm?",
  "How much fuel can we save?",
  "What is the current energy risk?",
  "What happens if solar falls by 50%?",
];

export default function AdvisorPage() {
  const [messages, setMessages] = useState<{ role: string; text: string; source?: string }[]>([]);
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.advisorHistory().then((h) => {
      const msgs = h.history.flatMap((c: any) => [
        { role: "user", text: c.question },
        { role: "ai", text: c.answer, source: c.source },
      ]);
      setMessages(msgs.length ? msgs : [{ role: "ai", text: "Ask me anything about POLAR-AI's current energy state." }]);
    }).catch(() => {
      setMessages([{ role: "ai", text: "Ask me anything about POLAR-AI's current energy state." }]);
    });
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function ask(question?: string) {
    const text = question || q;
    if (!text.trim()) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setQ("");
    setAsking(true);
    try {
      const res = await api.askAdvisor(text);
      setMessages((m) => [...m, { role: "ai", text: res.answer, source: res.source }]);
    } catch {
      setMessages((m) => [...m, { role: "ai", text: "The advisor service is unreachable right now." }]);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="AI Energy Advisor">
        <p className="text-xs text-polar-dim mb-3">
          Runs fully offline using deterministic calculations from live station state — no external API key required.
          If an optional LLM provider is configured, it phrases answers more naturally but never invents numbers.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="text-xs bg-polar-panel2 hover:bg-white/5 px-3 py-1.5 rounded-full text-polar-dim">
              {s}
            </button>
          ))}
        </div>

        <div className="border border-polar-border rounded-lg p-3 h-[420px] overflow-y-auto space-y-3 bg-polar-bg/40">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`flex items-start gap-2 max-w-[75%] ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === "user" ? "bg-polar-blue/30" : "bg-polar-cyan/20"}`}>
                  {m.role === "user" ? <User size={14} /> : <Bot size={14} className="text-polar-cyan" />}
                </div>
                <div className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-polar-cyan text-black" : "bg-polar-panel2 text-polar-text"}`}>
                  {m.text}
                  {m.source && <div className="text-[10px] opacity-60 mt-1">source: {m.source}</div>}
                </div>
              </div>
            </div>
          ))}
          {asking && <div className="text-xs text-polar-dim pl-9">Thinking...</div>}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 mt-3">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask about diesel, storms, fuel, risk, or a what-if scenario..."
            className="flex-1 bg-polar-panel2 border border-polar-border rounded-lg px-3 py-2 text-sm outline-none focus:border-polar-cyan"
          />
          <button onClick={() => ask()} className="bg-polar-cyan text-black font-semibold rounded-lg px-4 py-2 text-sm flex items-center gap-1">
            <Send size={14} /> Ask
          </button>
        </div>
      </Panel>
    </div>
  );
}
