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

// Live telemetry for the camera viewport (rotations and zoom scalar)
export function CameraMetricsUpdater() {
  const { camera } = useThree();
  useFrame(() => {
    const el = document.getElementById('camera-metrics-text');
    if (el) {
      const rotX = (camera.rotation.x * (180 / Math.PI)).toFixed(1);
      const rotY = (camera.rotation.y * (180 / Math.PI)).toFixed(1);
      const rotZ = (camera.rotation.z * (180 / Math.PI)).toFixed(1);
      const dist = camera.position.length().toFixed(2);
      el.innerText = `Scale (Dist): ${dist} | Rot: [X:${rotX}° Y:${rotY}° Z:${rotZ}°]`;
    }
  });
  return null;
}

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as OrganCategory[];
const normalizeDialogText = (text: string) => text.replace(/—/g, '-');
const ANATOMY_LAYER_SCALE = 1.9;
const ANATOMY_LAYER_POSITION: [number, number, number] = [0, 0.08, -0.08];

function App() {
  const [decals, setDecals] = useState<DecalData[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<string | null>(null);
  const [lockedCoords, setLockedCoords] = useState<string | null>(null);
  const [activePoint, setActivePoint] = useState<{ point: Point3D; normal: Point3D } | null>(null);
  
  // ── Show Test 3D toggle ──
  const [showTest3D, setShowTest3D] = useState(false);

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

  const handleOrganClick = async (organName: string) => {
    if (isDiagnosing) return;
    
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: 'user',
        content: `[Patient Interaction: Inspected ${organName} 3D structure]`,
      },
    ]);
    setIsDiagnosing(true);

    const prompt = `System Instructions for MedBot:
The patient has specifically clicked on the ${organName} 3D anatomical model for a detailed inspection.
Acting as MedBot, provide a very concise, warm spoken response about the ${organName}. 
Mention one common healthy habit or one potential symptom associated with the ${organName}, and ask a short follow-up question.
Keep it to exactly 3 sentences maximum for the subtitle reader.`;

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      const assistantMessage: Message = { id: Date.now().toString(), role: 'assistant', content: response };
      setMessages((prev) => [...prev, assistantMessage]);
      playAISpeech(response);
    } catch (error) {
      console.error('Diagnosis failed:', error);
    } finally {
      setIsDiagnosing(false);
    }
  };

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

    const prompt = `System Instructions for MedBot:
A patient has just drawn over the following anatomical regions on a 3D head model: ${zoneText}.

You are MedBot, an interactive and friendly AI diagnostic avatar. The text you return will be immediately spoken aloud to the patient and displayed as simple, clean subtitles. 

DO NOT generate long clinical reports, lists, or HTML. People do not want to read blocks of text.
Instead, speak directly to the patient in a warm, concise manner. Briefly share your primary diagnostic thought based on those regions, and then ask ONE targeted follow-up question to narrow down the condition. 

Keep your entire response to a maximum of 3 to 4 short, spoken sentences.`;

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

        {/* Camera Metrics UI locked to top-right of 3D frame overlay */}
        <div className="camera-metrics-panel">
          <strong style={{ color: 'var(--accent-cyan)' }}>Live Camera Telemetry</strong>
          <div id="camera-metrics-text">Awaiting render state...</div>
        </div>



        {/* Zone pill */}
        {(hoveredZone || hoveredCoords || lockedCoords) && (
          <div className="zone-pill" style={{ flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={12} color={lockedCoords ? '#4169E1' : 'var(--accent-cyan)'} />
              <span style={{ fontWeight: 600 }}>{hoveredZone || 'Unknown Region'}</span>
              {hoveredCoords && !lockedCoords && <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>{hoveredCoords}</span>}
            </div>
            {lockedCoords && (
              <div style={{ fontSize: '0.75rem', color: '#4169E1', fontWeight: 700, background: 'rgba(65, 105, 225, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                LOCKED: {lockedCoords}
              </div>
            )}
            {lockedCoords && <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>(Click again in View mode to unlock)</div>}
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
        <Canvas camera={{ position: [0, 0, 12], fov: 35 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <ambientLight intensity={1.2} />
          <spotLight position={[5, 10, 5]} intensity={2.0} penumbra={1} castShadow angle={0.2} />
          <pointLight position={[-5, -5, 5]} intensity={1.5} color="#4169E1" />
          <pointLight position={[0, 0, 8]} intensity={1.0} color="#ffffff" />
          <CameraMetricsUpdater />

          {/* The LeePerrySmith head with decals, scaled ×2 */}
          <FaceModel
            decals={decals}
            onFaceDown={handleFaceDown}
            onFaceMove={handleFaceMove}
            onFaceUp={handleFaceUp}
            hoveredZone={hoveredZone}
            setHoveredZone={setHoveredZone}
            setHoveredCoords={setHoveredCoords}
            setLockedCoords={setLockedCoords}
            isDrawMode={isDrawMode}
            isDrawingActive={isDrawingActive}
            showTest3D={showTest3D}
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
            minDistance={2}
            maxDistance={40}
            makeDefault
          />
          <ContactShadows position={[0, -5, 0]} opacity={0.3} scale={15} blur={2.5} far={4} color="#4169E1" />
        </Canvas>
      </div>

      <ChatPanel
        messages={messages}
        setMessages={setMessages}
        addDecal={addDecal}
        hoveredZone={hoveredZone}
        hoveredCoords={hoveredCoords}
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
        showTest3D={showTest3D}
        setShowTest3D={setShowTest3D}
      />
    </div>
  );
}

export default App;
