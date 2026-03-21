import React, { useRef, useEffect, useState } from 'react';
import { Send, Activity, BrainCircuit, Loader2 } from 'lucide-react';
import type { Message, DecalData, Point3D } from '../types';
import { chatWithAssistant } from '../lib/groq';

interface ChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addDecal: (decal: Omit<DecalData, 'id'>) => void;
  hoveredZone: string | null;
  activePoint: { point: Point3D; normal: Point3D } | null;
  isDiagnosing: boolean;
}

export function ChatPanel({
  messages,
  setMessages,
  addDecal,
  hoveredZone,
  activePoint,
  isDiagnosing,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isDiagnosing]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isDiagnosing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input },
    ];

    const aiResponse = await chatWithAssistant(apiMessages);

    const aiMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: aiResponse,
    };

    setMessages((prev) => [...prev, aiMessage]);

    // Optional heatmap marker on AI response
    if (
      aiResponse.toLowerCase().includes('inflammation') ||
      aiResponse.toLowerCase().includes('heatmap')
    ) {
      if (activePoint) {
        addDecal({
          position: activePoint.point,
          normal: activePoint.normal,
          label: 'Inflammation Heatmap',
          type: 'heatmap',
          size: 4,
          color: '#ff2200',
          opacity: 0.4,
        });
      }
    }

    setIsLoading(false);
  };

  const busy = isLoading || isDiagnosing;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <BrainCircuit color="var(--accent-cyan)" size={28} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className={`pulse-indicator ${busy ? 'pulse-active' : ''}`} />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Diagnostic AI</h2>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            {isDiagnosing
              ? 'Analyzing marked regions…'
              : hoveredZone
              ? `Hovering: ${hoveredZone}`
              : 'Awaiting region selection…'}
          </p>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !isDiagnosing && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '2rem' }}>
            <Activity size={48} style={{ opacity: 0.2, margin: '0 auto 1rem', display: 'block' }} />
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6 }}>
              Paint the affected region on the 3D model using <strong style={{ color: 'var(--accent-cyan)' }}>Start Draw</strong>, then press <strong style={{ color: 'var(--accent-purple)' }}>End Draw &amp; Diagnose</strong> to receive a single combined diagnosis.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
            <div className="message-label">
              {msg.role === 'assistant' ? 'AI Diagnostician' : 'Patient (You)'}
            </div>
            <div
              dangerouslySetInnerHTML={{
                __html: msg.content.replace(/\n/g, '<br/>'),
              }}
            />
          </div>
        ))}

        {/* Diagnosing spinner — appears while App is doing the batch AI call */}
        {isDiagnosing && (
          <div className="message ai diagnosing-msg">
            <div className="message-label">AI Diagnostician</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={16} className="spin-icon" />
              <span style={{ opacity: 0.7 }}>Analysing all marked regions…</span>
            </div>
          </div>
        )}

        {/* Manual chat loading dots */}
        {isLoading && !isDiagnosing && (
          <div className="message ai">
            <div className="message-label">AI Diagnostician</div>
            <div className="typing-dots">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={endOfMessagesRef} />
      </div>

      <div className="chat-input-container">
        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isDiagnosing
                ? 'Diagnosing drawn region…'
                : 'Describe symptoms or ask a follow-up…'
            }
            disabled={busy}
          />
          <button type="submit" className="chat-submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 size={18} className="spin-icon" /> : <Send size={18} />}
          </button>
        </form>
      </div>
    </div>
  );
}
