import React, { useRef, useEffect, useState } from 'react';
import { Send, Activity, BrainCircuit, Loader2, Brush, Eye, Play, StopCircle, Trash2, Layers, ChevronDown, ChevronUp, Download } from 'lucide-react';
import type { Message, DecalData, Point3D } from '../types';
import { chatWithAssistant } from '../lib/groq';
import { playAISpeech } from '../lib/elevenlabs';
import { CATEGORY_META, type OrganCategory } from './HeadOrgans';

interface ChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addDecal: (decal: Omit<DecalData, 'id'>) => void;
  hoveredZone: string | null;
  activePoint: { point: Point3D; normal: Point3D } | null;
  isDiagnosing: boolean;

  // New control props
  isDrawMode: boolean;
  setIsDrawMode: (v: boolean) => void;
  isDrawingActive: boolean;
  setIsDrawingActive: (v: boolean) => void;
  handleStartDraw: () => void;
  handleEndDraw: () => void;
  handleClear: () => void;
  hasDecals: boolean;
  
  showOrgans: boolean;
  setShowOrgans: React.Dispatch<React.SetStateAction<boolean>>;
  organPanelOpen: boolean;
  setOrganPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeCategories: Set<OrganCategory>;
  toggleCategory: (c: OrganCategory) => void;
  toggleAll: () => void;
  allCategories: OrganCategory[];
}

export function ChatPanel({
  messages,
  setMessages,
  addDecal,
  hoveredZone,
  activePoint,
  isDiagnosing,

  isDrawMode,
  setIsDrawMode,
  isDrawingActive,
  setIsDrawingActive,
  handleStartDraw,
  handleEndDraw,
  handleClear,
  hasDecals,
  
  showOrgans,
  setShowOrgans,
  organPanelOpen,
  setOrganPanelOpen,
  activeCategories,
  toggleCategory,
  toggleAll,
  allCategories,
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

    const systemPrompt = "You are a highly structured clinical AI assistant. Always format your responses using HTML tags (<h3>, <strong>, <ul>, <li>, <p>). Do not use markdown like asterisks. Make your response look like a structured clinical document where appropriate. Be concise and empathetic.";
    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: input },
    ];

    const aiResponse = await chatWithAssistant(apiMessages);
    playAISpeech(aiResponse);

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
  const allOn = activeCategories.size === allCategories.length;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-title">
          <div style={{ background: 'rgba(255, 116, 92, 0.1)', padding: '8px', borderRadius: '10px' }}>
            <BrainCircuit color="var(--accent-cyan)" size={28} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className={`pulse-indicator ${busy ? 'pulse-active' : ''}`} />
              <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 700, color: '#1a1a1a' }}>Diagnostic AI</h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
              {isDiagnosing
                ? 'Analyzing marked regions…'
                : hoveredZone
                ? `Hovering: ${hoveredZone}`
                : 'Awaiting region selection…'}
            </p>
          </div>
          <button
            className="btn-text-toggle"
            onClick={() => window.print()}
            title="Export Chat to PDF"
            style={{ padding: '0.5rem', background: 'rgba(255, 116, 92, 0.1)', borderRadius: '8px' }}
          >
            <Download size={18} />
          </button>
        </div>

        {/* Control Bar integrated into Chat Header */}
        <div className="control-bar">
          <div className="control-row">
            <div className="mode-switch">
              <button
                className={`mode-btn ${isDrawMode ? 'active' : ''}`}
                onClick={() => { setIsDrawMode(true); setIsDrawingActive(false); }}
              >
                <Brush size={14} /> Paint
              </button>
              <button
                className={`mode-btn ${!isDrawMode ? 'active' : ''}`}
                onClick={() => { setIsDrawMode(false); setIsDrawingActive(false); }}
              >
                <Eye size={14} /> View
              </button>
            </div>

            <div className="organ-toggle-group">
              <button
                className={`organ-toggle-btn ${showOrgans ? 'active' : ''}`}
                onClick={() => { setShowOrgans((v) => !v); setOrganPanelOpen(showOrgans ? false : organPanelOpen); }}
                title="Show / hide internal anatomy"
              >
                <Layers size={14} /> Anatomy {showOrgans ? 'ON' : 'OFF'}
              </button>
              {showOrgans && (
                <button
                  className="organ-filter-btn"
                  onClick={() => setOrganPanelOpen((v) => !v)}
                  title="Filter organ categories"
                >
                  {organPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>
          </div>

          <div className="control-row">
            {isDrawMode && (
              <div className="draw-controls">
                {!isDrawingActive ? (
                  <button className="btn-start" onClick={handleStartDraw} disabled={isDiagnosing}>
                    <Play size={14} /> Start Draw
                  </button>
                ) : (
                  <button className="btn-end" onClick={handleEndDraw}>
                    <StopCircle size={14} /> End Draw &amp; Diagnose
                  </button>
                )}
                <button className="btn-clear" onClick={handleClear} disabled={!hasDecals}>
                  <Trash2 size={14} /> Clear
                </button>
              </div>
            )}

            <div className="status-strip">
              {isDrawingActive && <span className="status-dot drawing" />}
              {isDiagnosing && <span className="status-dot diagnosing" />}
              <span className="status-text">
                {isDiagnosing
                  ? 'Diagnosing…'
                  : isDrawingActive
                  ? 'Drawing active'
                  : showOrgans
                  ? `${activeCategories.size} layer${activeCategories.size !== 1 ? 's' : ''} visible`
                  : isDrawMode
                  ? 'Press Start Draw'
                  : 'Rotate to inspect'}
              </span>
            </div>
          </div>

          {showOrgans && organPanelOpen && (
            <div className="organ-filter-panel">
              <div className="organ-filter-header">
                <span>Anatomical Layers</span>
                <button className="btn-text-toggle" onClick={toggleAll}>
                  {allOn ? 'Hide All' : 'Show All'}
                </button>
              </div>
              <div className="organ-filter-grid">
                {allCategories.map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const on = activeCategories.has(cat);
                  return (
                    <button
                      key={cat}
                      className={`organ-filter-chip ${on ? 'on' : 'off'}`}
                      style={{ '--chip-color': meta.color } as React.CSSProperties}
                      onClick={() => toggleCategory(cat)}
                    >
                      <span className="chip-dot" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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

        {isDiagnosing && (
          <div className="message ai diagnosing-msg">
            <div className="message-label">AI Diagnostician</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={16} className="spin-icon" />
              <span style={{ opacity: 0.8 }}>Analysing all marked regions…</span>
            </div>
          </div>
        )}

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
