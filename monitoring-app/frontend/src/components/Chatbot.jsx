import React, { useState, useRef, useEffect } from "react";
import { sendChatMessage } from "../api";

const INITIAL_MESSAGES = [
  {
    role: "assistant",
    content: `👋 **Welcome to SentinelOpsAI SRE Copilot!**

I am your intelligent Site Reliability Engineering assistant connected directly to cluster telemetry, Prometheus metrics, Falco runtime security, and the Qdrant vector knowledge base.

**How can I assist you today?**
• Diagnose active incidents & root causes
• Explain Kubernetes error codes (\`137\`, \`CrashLoopBackOff\`)
• Interpret Falco security violations & API server calls
• Query grounded SRE remediation runbooks
• Check circuit breaker status & safety guardrails`,
    timestamp: new Date().toLocaleTimeString(),
    suggestions: [
      "Summarize active incidents",
      "Why is the backend pod restarting?",
      "Explain the Falco security violation",
      "Explain OOMKilled exit code 137",
      "Check circuit breaker status",
    ],
  },
];

export default function Chatbot({ onNavigateTab }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg = {
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendChatMessage(query, historyPayload);

      const botMsg = {
        role: "assistant",
        content: res.reply || "Diagnostic completed.",
        timestamp: new Date().toLocaleTimeString(),
        suggestions: res.suggestions || [],
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorMsg = {
        role: "assistant",
        content: `⚠️ Failed to query SRE Copilot: ${err.message}. Please check if the monitoring backend gateway is running on port 3002.`,
        timestamp: new Date().toLocaleTimeString(),
        suggestions: ["Check cluster status", "Summarize active incidents"],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
  };

  const renderContent = (content) => {
    // Simple markdown code block renderer
    const parts = content.split(/(```[\s\S]*?```)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.slice(3, -3).trim().split("\n");
        const lang = lines[0].match(/^[a-z]+$/) ? lines[0] : "";
        const code = (lang ? lines.slice(1) : lines).join("\n");
        return (
          <div key={idx} className="chat-code-block">
            <div className="chat-code-header">
              <span className="mono">{lang || "bash"}</span>
              <button
                type="button"
                className="chat-copy-btn"
                onClick={() => copyToClipboard(code)}
                title="Copy code"
              >
                📋 Copy
              </button>
            </div>
            <pre className="mono">{code}</pre>
          </div>
        );
      }
      return (
        <span key={idx} style={{ whiteSpace: "pre-wrap" }}>
          {part}
        </span>
      );
    });
  };

  return (
    <div className="chatbot-container glass-panel">
      {/* Chatbot Header */}
      <div className="chatbot-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="chatbot-avatar">🤖</div>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>
              SentinelOpsAI SRE Copilot
            </div>
            <div style={{ fontSize: "11.5px", color: "var(--cyan-400)", display: "flex", alignItems: "center", gap: "5px" }}>
              <span className="live-dot" />
              Connected to Telemetry & Qdrant Vector Knowledge
            </div>
          </div>
        </div>

        <button
          className="refresh-btn"
          style={{ fontSize: "12px", padding: "5px 10px" }}
          onClick={() => setMessages(INITIAL_MESSAGES)}
          title="Clear Conversation History"
        >
          🗑️ Clear
        </button>
      </div>

      {/* Messages Stream */}
      <div className="chatbot-messages">
        {messages.map((m, idx) => (
          <div key={idx} className={`chat-bubble-row ${m.role}`}>
            {m.role === "assistant" && <div className="chat-avatar-mini">🤖</div>}
            <div className={`chat-bubble ${m.role}`}>
              <div className="chat-bubble-content">{renderContent(m.content)}</div>
              <div className="chat-time">{m.timestamp}</div>

              {/* Suggestion Chips */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="chat-suggestions">
                  {m.suggestions.map((sug, sIdx) => (
                    <button
                      key={sIdx}
                      type="button"
                      className="chat-suggestion-chip"
                      onClick={() => handleSend(sug)}
                    >
                      {sug} ↗
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble-row assistant">
            <div className="chat-avatar-mini">🤖</div>
            <div className="chat-bubble assistant">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-secondary)" }}>
                <span className="spinner" />
                <span style={{ fontSize: "12.5px" }}>Analyzing telemetry & querying vector runbooks...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Form */}
      <div className="chatbot-input-bar">
        <textarea
          className="chatbot-textarea search-input"
          placeholder="Ask SRE Copilot anything (e.g. 'Why did backend pod crash?', 'How to fix OOMKilled exit code 137?')..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button
          className="btn-ai"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          style={{ padding: "10px 18px", alignSelf: "flex-end" }}
        >
          {loading ? <span className="spinner" /> : "Send ➔"}
        </button>
      </div>
    </div>
  );
}
