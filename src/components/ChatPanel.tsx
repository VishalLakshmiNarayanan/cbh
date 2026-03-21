import React, { useRef, useEffect, useState } from 'react';
import { Send, Loader2, Brush, Eye, Play, StopCircle, Trash2, Layers, ChevronDown, ChevronUp, Download, Mic } from 'lucide-react';
import type { Message, DecalData, Point3D } from '../types';
import { chatWithAssistant } from '../lib/groq';
import { playAISpeech } from '../lib/elevenlabs';
import { CATEGORY_META, type OrganCategory } from './HeadOrgans';

interface ChatPanelProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addDecal: (decal: Omit<DecalData, 'id'>) => void;
  hoveredZone: string | null;
  hoveredCoords: string | null;
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

function RunningSubtitle({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!text) {
      setVisible(false);
      return;
    }
    
    setVisible(true);
    setDisplayed('');
    
    const words = text.split(' ');
    let index = 0;
    
    const CHUNK_SIZE = 14; // About 2 lines of text
    const intervalId = setInterval(() => {
      index++;
      // Determine the current 2-line 'page'
      const chunkStart = Math.floor((index - 1) / CHUNK_SIZE) * CHUNK_SIZE;
      
      setDisplayed(words.slice(chunkStart, index).join(' '));
      if (index >= words.length) {
        clearInterval(intervalId);
      }
    }, 320); // Roughly matches ElevenLabs reading cadence per word
    
    // Clear out the caption completely after roughly 12 seconds
    const totalTime = (words.length * 320) + 12000;
    const timeoutId = setTimeout(() => {
      setVisible(false);
    }, totalTime);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [text]);

  if (!visible || !displayed) return <p className="intro-text">Awaiting diagnostic input... Paint an area and I will analyze it.</p>;

  return <p dangerouslySetInnerHTML={{ __html: displayed.replace(/\n/g, '<br/>') }} />;
}

export function ChatPanel({
  messages,
  setMessages,
  addDecal,
  hoveredZone,
  hoveredCoords,
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
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isDiagnosing]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        let currentFinal = '';
        let currentInterim = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            currentFinal += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }
        
        if (currentFinal) {
          transcriptRef.current = (transcriptRef.current + ' ' + currentFinal).trim();
        }
        
        setInput((transcriptRef.current + ' ' + currentInterim).trim());
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          isListeningRef.current = false;
          setIsListening(false);
        }
        console.error('Speech recognition error', event.error);
      };
      
      recognitionRef.current.onend = () => {
        // Chrome cuts the mic automatically after a few seconds of silence.
        // If the user hasn't explicitly clicked "off", cleanly auto-restart the engine!
        if (isListeningRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            isListeningRef.current = false;
            setIsListening(false);
          }
        } else {
          setIsListening(false);
        }
      };
    }
  }, []);

  const toggleListen = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isListeningRef.current) {
      isListeningRef.current = false;
      setIsListening(false);
      recognitionRef.current?.stop();
    } else {
      try {
        // Start appending to whatever is currently in the text box
        transcriptRef.current = input;
        isListeningRef.current = true;
        setIsListening(true);
        recognitionRef.current?.start();
      } catch (e) {
        console.error('Microphone access issue', e);
        isListeningRef.current = false;
        setIsListening(false);
      }
    }
  };

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

    const systemPrompt = "You are MedBot, an interactive diagnostic AI avatar. Your text is immediately read aloud to the user and appears as subtitles. NEVER give long explanations, bullet lists, or HTML. Keep responses extremely short, conversational, and direct, exactly like a spoken script. Ask only ONE targeted question at a time if necessary. Maximum 3 sentences and strictly plain text.";
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
  const latestAIMessage = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-title">
          <div className="medbot-avatar-wrap">
            <img src="/medbot.png" alt="MedBot" className="medbot-avatar" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div className={`pulse-indicator ${busy ? 'pulse-active' : ''}`} />
              <h2 style={{ fontSize: '1.3rem', margin: 0, fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.3px' }}>MedBot AI</h2>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 0 0', fontWeight: 500 }}>
              {isDiagnosing
                ? 'Analyzing marked regions…'
                : (hoveredZone || hoveredCoords)
                ? `Hovering: ${hoveredZone || 'Unknown Region'} ${hoveredCoords ? hoveredCoords : ''}`
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

      <div className="medbot-voice-agent">
        <div className="voice-agent-avatar-wrap">
          <img src="/medbot.png" alt="MedBot Avatar" />
          {busy && <div className="voice-agent-pulse" />}
        </div>
        
        <div className="voice-agent-subtitle">
          {isDiagnosing ? (
            <p className="thinking-text">MedBot is analyzing anatomical regions...</p>
          ) : isLoading ? (
            <p className="thinking-text">MedBot is thinking...</p>
          ) : latestAIMessage ? (
            <RunningSubtitle text={latestAIMessage.content} />
          ) : (
            <p className="intro-text">Hello! I am MedBot. Paint the affected region on the 3D model, and I will analyze it for you.</p>
          )}
        </div>
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
          <button 
            type="button" 
            className={`chat-mic ${isListening ? 'listening' : ''}`}
            onClick={toggleListen}
            disabled={busy || !recognitionRef.current}
            title={isListening ? "Click to stop dictation" : "Dictate with Microphone"}
          >
            {isListening ? <StopCircle size={18} /> : <Mic size={18} />}
          </button>
          <button type="submit" className="chat-submit" disabled={busy || !input.trim()}>
            {busy ? <Loader2 size={18} className="spin-icon" /> : <Send size={18} />}
          </button>
        </form>
      </div>

      {/* ── Print Only Diagnosis Log ── */}
      <div className="print-only-diagnosis">
        <h2>MedBot Diagnostic Report</h2>
        <hr style={{ margin: '1rem 0' }} />
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: '1rem' }}>
            <strong style={{ color: m.role === 'assistant' ? 'var(--accent-cyan)' : '#333' }}>
              {m.role === 'assistant' ? 'MedBot Diagnosis:' : 'Patient Input:'}
            </strong>
            <p style={{ marginTop: '0.4rem', lineHeight: '1.5' }} dangerouslySetInnerHTML={{ __html: m.content.replace(/\n/g, '<br/>') }} />
          </div>
        ))}
      </div>
    </div>
  );
}
