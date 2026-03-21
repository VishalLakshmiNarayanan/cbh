import { useState, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { FaceModel } from './components/FaceModel';
import { ChatPanel } from './components/ChatPanel';
import { HeadOrgans, CATEGORY_META, type OrganCategory } from './components/HeadOrgans';
import type { DecalData, Message, Point3D } from './types';
import { chatWithAssistant } from './lib/groq';
import { Brush, Eye, Play, StopCircle, Trash2, MapPin, Layers, ChevronDown, ChevronUp } from 'lucide-react';

type DrawSession = {
  decalIds: string[];
  zones: Set<string>;
  centroid: Point3D;
  centroidNormal: Point3D;
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as OrganCategory[];

function App() {
  const [decals, setDecals] = useState<DecalData[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [activePoint, setActivePoint] = useState<{ point: Point3D; normal: Point3D } | null>(null);

  // ── Draw mode state ───────────────────────────────────────────────────
  const [isDrawMode, setIsDrawMode] = useState(true);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  // ── Organs layer state ────────────────────────────────────────────────
  const [showOrgans, setShowOrgans] = useState(false);
  const [organPanelOpen, setOrganPanelOpen] = useState(false);
  const [activeCategories, setActiveCategories] = useState<Set<OrganCategory>>(
    new Set(ALL_CATEGORIES)
  );

  // ── Draw session refs ────────────────────────────────────────────────
  const currentSession = useRef<DrawSession | null>(null);
  const lastDrawTime = useRef<number>(0);
  const isStroking = useRef(false);

  // ─── helpers ───────────────────────────────────────────────────────────
  const addDecal = useCallback((decalData: Omit<DecalData, 'id'>): string => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2);
    const newDecal: DecalData = { ...decalData, id };
    setDecals((prev) => [...prev, newDecal]);
    return id;
  }, []);

  const toggleCategory = (cat: OrganCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const allOn = activeCategories.size === ALL_CATEGORIES.length;
  const toggleAll = () =>
    setActiveCategories(allOn ? new Set() : new Set(ALL_CATEGORIES));

  // ─── Draw lifecycle ────────────────────────────────────────────────────
  const handleStartDraw = () => {
    currentSession.current = {
      decalIds: [],
      zones: new Set(),
      centroid: { x: 0, y: 0, z: 0 },
      centroidNormal: { x: 0, y: 0, z: 1 },
    };
    setIsDrawingActive(true);
  };

  const handleEndDraw = async () => {
    setIsDrawingActive(false);
    isStroking.current = false;

    if (!currentSession.current || currentSession.current.zones.size === 0) return;

    const session = currentSession.current;
    const zonesArray = Array.from(session.zones);
    const zoneText = zonesArray.join(', ');

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: `[Diagnostic Region Marked: ${zoneText}]`,
      },
    ]);
    setIsDiagnosing(true);

    const prompt = `A patient has drawn over the following anatomical regions on a 3D head model: ${zoneText}.

Provide a single, unified clinical triage assessment covering:
1. What conditions are commonly associated with these specific anatomical regions
2. Which region combination is most clinically significant
3. 2-3 targeted diagnostic questions to narrow down the condition

Be concise, empathetic, and clinical. Treat all marked regions as one holistic presentation. Respond in plain text only — no markdown, no asterisks, no bullet symbols.`;

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: response },
      ]);
    } finally {
      setIsDiagnosing(false);
      currentSession.current = null;
    }
  };

  const handleClear = () => {
    setDecals([]);
    currentSession.current = null;
    setIsDrawingActive(false);
    isStroking.current = false;
  };

  // ─── Pointer handlers ─────────────────────────────────────────────────
  const handleFaceDown = useCallback(
    (point: Point3D, normal: Point3D, zone: string) => {
      if (!isDrawingActive || !currentSession.current) return;
      isStroking.current = true;
      setActivePoint({ point, normal });
      currentSession.current.zones.add(zone);

      const s = currentSession.current;
      const count = s.decalIds.length + 1;
      s.centroid = {
        x: (s.centroid.x * (count - 1) + point.x) / count,
        y: (s.centroid.y * (count - 1) + point.y) / count,
        z: (s.centroid.z * (count - 1) + point.z) / count,
      };
      s.centroidNormal = normal;

      const id = addDecal({ position: point, normal, label: zone, type: 'symptom', size: 0.9, color: '#ff3300', opacity: 0.85 });
      currentSession.current.decalIds.push(id);
    },
    [isDrawingActive, addDecal]
  );

  const handleFaceMove = useCallback(
    (point: Point3D, normal: Point3D, zone: string) => {
      if (!isDrawingActive || !isStroking.current || !currentSession.current) return;
      const now = Date.now();
      if (now - lastDrawTime.current < 35) return;
      lastDrawTime.current = now;

      setActivePoint({ point, normal });
      currentSession.current.zones.add(zone);

      const s = currentSession.current;
      const count = s.decalIds.length + 1;
      s.centroid = {
        x: (s.centroid.x * (count - 1) + point.x) / count,
        y: (s.centroid.y * (count - 1) + point.y) / count,
        z: (s.centroid.z * (count - 1) + point.z) / count,
      };

      const id = addDecal({ position: point, normal, label: zone, type: 'symptom', size: 0.7, color: '#ff5500', opacity: 0.65 });
      currentSession.current.decalIds.push(id);
    },
    [isDrawingActive, addDecal]
  );

  const handleFaceUp = useCallback(() => { isStroking.current = false; }, []);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="canvas-container">

        {/* Title */}
        <div className="canvas-overlay-ui">
          <h1 className="title">Diagnostic AI</h1>
          <p className="subtitle">3D Head &amp; Neck Anatomical System v3.0</p>
        </div>

        {/* ── Control Bar ─────────────────────────────────────────────── */}
        <div className="control-bar">
          {/* Mode */}
          <div className="mode-switch">
            <button
              className={`btn mode-btn ${isDrawMode ? 'active' : ''}`}
              onClick={() => { setIsDrawMode(true); setIsDrawingActive(false); }}
            >
              <Brush size={15} /> Paint
            </button>
            <button
              className={`btn mode-btn ${!isDrawMode ? 'active' : ''}`}
              onClick={() => { setIsDrawMode(false); setIsDrawingActive(false); }}
            >
              <Eye size={15} /> View
            </button>
          </div>

          {/* Draw controls */}
          {isDrawMode && (
            <div className="draw-controls">
              {!isDrawingActive ? (
                <button className="btn btn-start" onClick={handleStartDraw} disabled={isDiagnosing}>
                  <Play size={15} /> Start Draw
                </button>
              ) : (
                <button className="btn btn-end" onClick={handleEndDraw}>
                  <StopCircle size={15} /> End Draw &amp; Diagnose
                </button>
              )}
              <button className="btn btn-clear" onClick={handleClear} disabled={decals.length === 0}>
                <Trash2 size={15} /> Clear
              </button>
            </div>
          )}

          {/* Organs toggle */}
          <div className="organ-toggle-group">
            <button
              className={`btn organ-toggle-btn ${showOrgans ? 'active' : ''}`}
              onClick={() => { setShowOrgans((v) => !v); setOrganPanelOpen(showOrgans ? false : organPanelOpen); }}
              title="Show / hide internal anatomy"
            >
              <Layers size={15} /> Anatomy {showOrgans ? 'ON' : 'OFF'}
            </button>
            {showOrgans && (
              <button
                className="btn organ-filter-btn"
                onClick={() => setOrganPanelOpen((v) => !v)}
                title="Filter organ categories"
              >
                {organPanelOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>

          {/* Status strip */}
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

        {/* ── Organ category filter panel ─────────────────────────────── */}
        {showOrgans && organPanelOpen && (
          <div className="organ-filter-panel">
            <div className="organ-filter-header">
              <span>Anatomical Layers</span>
              <button className="btn-text-toggle" onClick={toggleAll}>
                {allOn ? 'Hide All' : 'Show All'}
              </button>
            </div>
            <div className="organ-filter-grid">
              {ALL_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const on = activeCategories.has(cat);
                return (
                  <button
                    key={cat}
                    className={`organ-filter-chip ${on ? 'on' : 'off'}`}
                    style={{
                      '--chip-color': meta.color,
                    } as React.CSSProperties}
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

        {/* Zone pill */}
        {hoveredZone && (
          <div className="zone-pill">
            <MapPin size={12} />
            {hoveredZone}
          </div>
        )}

        {/* Instruction overlay */}
        {decals.length === 0 && !isDrawingActive && !showOrgans && (
          <div className="instruction-overlay">
            <h3>Select a Region to Diagnose</h3>
            <p>
              Switch to <strong>Paint</strong> mode → <strong>Start Draw</strong> → drag over the affected area.
              <br />
              Or enable <strong>Anatomy</strong> to reveal internal structures.
            </p>
          </div>
        )}

        {/* ── 3D Canvas ────────────────────────────────────────────────── */}
        <Canvas camera={{ position: [0, 0, 12], fov: 35 }} gl={{ antialias: true }}>
          <color attach="background" args={['#050505']} />
          <ambientLight intensity={0.6} />
          <spotLight position={[5, 10, 5]} intensity={1.5} penumbra={1} castShadow angle={0.2} />
          <pointLight position={[-5, -5, 5]} intensity={1.5} color="#00f3ff" />
          <pointLight position={[0, 0, 8]} intensity={0.8} color="#ffffff" />

          {/* The LeePerrySmith head with decals, scaled ×2 */}
          <FaceModel
            decals={decals}
            onFaceDown={handleFaceDown}
            onFaceMove={handleFaceMove}
            onFaceUp={handleFaceUp}
            hoveredZone={hoveredZone}
            setHoveredZone={setHoveredZone}
            isDrawMode={isDrawMode}
            isDrawingActive={isDrawingActive}
          />

          {/* Internal organs layer — placed inside a scale={2} group to match FaceModel */}
          <group scale={2}>
            <HeadOrgans
              visible={showOrgans}
              activeCategories={activeCategories}
            />
          </group>

          <Environment preset="city" />
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            enabled={!isDrawingActive}
            minDistance={4}
            maxDistance={25}
            makeDefault
          />
          <ContactShadows position={[0, -5, 0]} opacity={0.5} scale={15} blur={2.5} far={4} color="#00f3ff" />
        </Canvas>
      </div>

      <ChatPanel
        messages={messages}
        setMessages={setMessages}
        addDecal={addDecal}
        hoveredZone={hoveredZone}
        activePoint={activePoint}
        isDiagnosing={isDiagnosing}
      />
    </div>
  );
}

export default App;
