import { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { FaceModel } from './components/FaceModel';
import { ChatPanel } from './components/ChatPanel';
import { HeadOrgans, CATEGORY_META, type OrganCategory, type OrganSummary } from './components/HeadOrgans';
import type { DecalData, Message, Point3D } from './types';
import { chatWithAssistant } from './lib/groq';
import { playAISpeech } from './lib/elevenlabs';
import { MapPin } from 'lucide-react';

type DrawSession = {
  decalIds: string[];
  zones: Set<string>;
  centroid: Point3D;
  centroidNormal: Point3D;
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as OrganCategory[];
const normalizeDialogText = (text: string) => text.replace(/—/g, '-');
const ANATOMY_LAYER_SCALE = 1.9;
const ANATOMY_LAYER_POSITION: [number, number, number] = [0, 0.08, -0.08];

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
  const [selectedOrgan, setSelectedOrgan] = useState<{
    id: string;
    label: string;
    description: string;
    category: OrganCategory;
  } | null>(null);
  const [hoveredOrgan, setHoveredOrgan] = useState<OrganSummary | null>(null);
  const [animatedDescription, setAnimatedDescription] = useState('');

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
    setSelectedOrgan(null);
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

Provide a highly structured, single clinical triage assessment using exact HTML tags (<h3>, <strong>, <ul>, <li>, <p>). Do NOT use markdown.

Format exactly as follows:
<h3>Clinical Observations</h3>
<p>[Clinical summary of the affected regions]</p>

<h3>Probable Conditions</h3>
<ul>
  <li><strong>[Condition 1]:</strong> [Brief description]</li>
  <li><strong>[Condition 2]:</strong> [Brief description]</li>
</ul>

<h3>Targeted Diagnostic Questions</h3>
<ul>
  <li>[Question 1]</li>
  <li>[Question 2]</li>
</ul>

Be concise, empathetic, and professional. Treat all marked regions as one holistic presentation. Return strictly the requested HTML structure.`;

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      playAISpeech(response);
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
    setSelectedOrgan(null);
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

  // ─── Hover auto-typing dialog ───────────────────────────────────────────
  useEffect(() => {
    if (!hoveredOrgan) {
      setAnimatedDescription('');
      return;
    }
    const description = normalizeDialogText(hoveredOrgan.description);
    let index = 0;
    setAnimatedDescription('');

    const interval = window.setInterval(() => {
      index += 1;
      setAnimatedDescription(description.slice(0, index));
      if (index >= description.length) {
        window.clearInterval(interval);
      }
    }, 30);

    return () => window.clearInterval(interval);
  }, [hoveredOrgan]);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="canvas-container">

        {/* Title */}
        <div className="canvas-overlay-ui">
          <h1 className="title">Diagnostic AI</h1>
          <p className="subtitle">3D Head &amp; Neck Anatomical System v3.0</p>
        </div>



        {/* Zone pill */}
        {hoveredZone && (
          <div className="zone-pill">
            <MapPin size={12} />
            {hoveredZone}
          </div>
        )}

        {/* Selected organ info */}
        {selectedOrgan && (
          <div className="selected-organ-card">
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: CATEGORY_META[selectedOrgan.category].color }}>
              Selected: {selectedOrgan.label}
            </div>
            <div style={{ fontSize: '1.05rem', color: '#f8f9ff', lineHeight: 1.6, marginTop: '0.35rem' }}>
              {selectedOrgan.description}
            </div>
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
          <ambientLight intensity={1.2} />
          <spotLight position={[5, 10, 5]} intensity={2.0} penumbra={1} castShadow angle={0.2} />
          <pointLight position={[-5, -5, 5]} intensity={1.5} color="#ffa092" />
          <pointLight position={[0, 0, 8]} intensity={1.0} color="#ffffff" />

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

          <group scale={ANATOMY_LAYER_SCALE} position={ANATOMY_LAYER_POSITION}>
            <HeadOrgans
              visible={showOrgans}
              activeCategories={activeCategories}
              selectedOrganId={selectedOrgan?.id}
              onSelectOrgan={(organ) => setSelectedOrgan(organ)}
              onHoverOrgan={(organ) => setHoveredOrgan(organ)}
              onUnhoverOrgan={() => setHoveredOrgan(null)}
              hoveredOrganId={hoveredOrgan?.id ?? null}
              hoveredDescription={animatedDescription}
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
          <ContactShadows position={[0, -5, 0]} opacity={0.3} scale={15} blur={2.5} far={4} color="#ffa092" />
        </Canvas>
      </div>

      <ChatPanel
        messages={messages}
        setMessages={setMessages}
        addDecal={addDecal}
        hoveredZone={hoveredZone}
        activePoint={activePoint}
        isDiagnosing={isDiagnosing}
        isDrawMode={isDrawMode}
        setIsDrawMode={setIsDrawMode}
        isDrawingActive={isDrawingActive}
        setIsDrawingActive={setIsDrawingActive}
        handleStartDraw={handleStartDraw}
        handleEndDraw={handleEndDraw}
        handleClear={handleClear}
        hasDecals={decals.length > 0}
        showOrgans={showOrgans}
        setShowOrgans={setShowOrgans}
        organPanelOpen={organPanelOpen}
        setOrganPanelOpen={setOrganPanelOpen}
        activeCategories={activeCategories}
        toggleCategory={toggleCategory}
        toggleAll={toggleAll}
        allCategories={ALL_CATEGORIES}
      />
    </div>
  );
}

export default App;
