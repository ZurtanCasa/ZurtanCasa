"use client";
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hola, soy el CEO IA de ZurtanCasa. Puedo consultarte datos de ventas, ads, locales y más. ¿Qué querés saber?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.content) {
        setMessages([...newMessages, { role: "assistant", content: data.content }]);
      } else {
        setMessages([...newMessages, { role: "assistant", content: "Error al procesar la consulta." }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error de conexión. Revisá que ANTHROPIC_API_KEY esté configurada." }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-avatar">{msg.role === "user" ? "👤" : "🧠"}</div>
            <div className="chat-bubble">
              <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{msg.content}</pre>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg assistant">
            <div className="chat-avatar">🧠</div>
            <div className="chat-bubble">
              <span className="text-muted">Analizando datos...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          ref={textareaRef}
          className="chat-input"
          rows={2}
          placeholder="Preguntá algo… ej: ¿Cómo vamos vs el breakeven este mes? ¿Qué campañas están funcionando?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="chat-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
          Enviar
        </button>
      </div>
    </div>
  );
}
