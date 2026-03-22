import { useState, useRef, useCallback, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { FaceModel } from './components/FaceModel';
import { ChatPanel } from './components/ChatPanel';

import type { DecalData, Message, Point3D } from './types';
import { chatWithAssistant } from './lib/groq';
import { playAISpeech, initAudio } from './lib/elevenlabs';
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

function IntroCameraAnimation({
  controlsRef,
  onComplete,
}: {
  controlsRef: RefObject<any>;
  onComplete: () => void;
}) {
  const { camera } = useThree();
  const elapsedRef = useRef(0);
  const startPosition = useRef(new THREE.Vector3(0, 0, 21.61));
  const endPosition = useRef(new THREE.Vector3(0, 0, 30.95));
  const startTarget = useRef(new THREE.Vector3(0, 0.08, 0));
  const endTarget = useRef(new THREE.Vector3(0, 0, 0));
  const duration = 1.8;

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const progress = Math.min(elapsedRef.current / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(startPosition.current, endPosition.current, eased);

    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startTarget.current, endTarget.current, eased);
      controlsRef.current.update();
    } else {
      camera.lookAt(endTarget.current);
    }

    if (progress >= 1) {
      onComplete();
    }
  });

  return null;
}



function TestBrownEyeballs({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/brown_eyeball_free.glb');
  
  // Manually clone the scene tree so we can safely render multiple distinct instances symmetrically
  const rightEye = useRef(scene.clone(true)).current;
  const leftEye = useRef(scene.clone(true)).current;

  return (
    <group onPointerDown={(e) => { e.stopPropagation(); onClick('Eyeballs'); }}>
      <primitive object={rightEye} position={[-0.70, 1.68, 1.95]} scale={0.2} />
      <primitive object={leftEye} position={[0.57, 1.65, 1.93]} scale={0.2} />
    </group>
  );
}

function TestBrain({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/human-brain.glb');
  const brain = useRef(scene.clone(true)).current;
  return (
    <primitive 
      object={brain} 
      position={[-0.10, 2.35, 0.15]} 
      rotation={[0, Math.PI * 1.5, 0]} 
      scale={1.55} 
      onPointerDown={(e: any) => { e.stopPropagation(); onClick('Brain'); }}
    />
  );
}

function TestLarynx({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/anatomy_of_the_larynx.glb');
  const larynx = useRef(scene.clone(true)).current;
  return (
    <primitive 
      object={larynx} 
      position={[0, -1.75, -0.85]} 
      rotation={[0, 0, 0]} 
      scale={0.02} 
      onPointerDown={(e: any) => { e.stopPropagation(); onClick('Larynx'); }}
    />
  );
}

function TestTongue({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/tongue.glb');
  const tongue = useRef(scene.clone(true)).current;
  return (
    <primitive 
      object={tongue} 
      position={[-0.09, 0.15, 0.55]} 
      rotation={[-6.3, 0.4, 0]} 
      scale={0.015} 
      onPointerDown={(e: any) => { e.stopPropagation(); onClick('Tongue'); }}
    />
  );
}

function App() {
  const [decals, setDecals] = useState<DecalData[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<string | null>(null);
  const [lockedCoords, setLockedCoords] = useState<string | null>(null);
  const [activePoint, setActivePoint] = useState<{ point: Point3D; normal: Point3D } | null>(null);
  
  // ── Show Test 3D toggle ──
  const [showTest3D, setShowTest3D] = useState(false);
  const [isIntroAnimating, setIsIntroAnimating] = useState(true);
  const orbitControlsRef = useRef<any>(null);

  // ── Draw mode state ───────────────────────────────────────────────────
  const [isDrawMode, setIsDrawMode] = useState(true);
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

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

    const prompt = `System Instructions for Agnos:
The patient has specifically clicked on the ${organName} 3D anatomical model for a detailed inspection.
Acting as Agnos, provide a very concise, warm spoken response about the ${organName}. 
Mention one common healthy habit or one potential symptom associated with the ${organName}, and ask a short follow-up question.
Keep it to exactly 3 sentences maximum for the subtitle reader.`;

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      await initAudio(); 
      await playAISpeech(response); // Await for sync
      const assistantMessage: Message = { id: Date.now().toString(), role: 'assistant', content: response };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Diagnosis failed:', error);
    } finally {
      setIsDiagnosing(false);
    }
  };

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

    const prompt = `System Instructions for Agnos:
A patient has just drawn over the following anatomical regions on a 3D head model: ${zoneText}.

You are Agnos, an interactive and friendly AI diagnostic avatar. The text you return will be immediately spoken aloud to the patient and displayed as simple, clean subtitles. 

DO NOT generate long clinical reports, lists, or HTML. People do not want to read blocks of text.
Instead, speak directly to the patient in a warm, concise manner. Briefly share your primary diagnostic thought based on those regions, and then ask ONE targeted follow-up question to narrow down the condition. 

Keep your entire response to a maximum of 3 to 4 short, spoken sentences.`;

    const apiMessages = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      await initAudio(); 
      await playAISpeech(response); // Await for sync
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

  const printTimestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="app-container">
      <div className="canvas-container">
        <div className="print-only-report-header">
          <div className="print-report-meta">{printTimestamp}</div>
          <div className="print-report-brand">
            <h1>AGNOS AI</h1>
            <p>Diagnostic Image Report</p>
          </div>
        </div>

        {/* Title */}
        <div className="canvas-overlay-ui">
          <h1 className="title">AGNOS AI</h1>
          <p className="subtitle">Advanced 3D Diagnosis System v3.0</p>
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
              <MapPin size={12} color={lockedCoords ? '#ff3624' : 'var(--accent-cyan)'} />
              <span style={{ fontWeight: 600 }}>{hoveredZone || 'Unknown Region'}</span>
              {hoveredCoords && !lockedCoords && <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>{hoveredCoords}</span>}
            </div>
            {lockedCoords && (
              <div style={{ fontSize: '0.75rem', color: '#ff3624', fontWeight: 700, background: 'rgba(255, 54, 36, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                LOCKED: {lockedCoords}
              </div>
            )}
            {lockedCoords && <div style={{ fontSize: '0.65rem', opacity: 0.5 }}>(Click again in View mode to unlock)</div>}
          </div>
        )}

        {/* Instruction overlay */}
        {decals.length === 0 && !isDrawingActive && (
          <div className="instruction-overlay">
            <h3>Select a Region to Diagnose</h3>
            <p>
              Switch to <strong>Paint</strong> mode → <strong>Start Draw</strong> → drag over the affected area.
              <br />
              Or enable <strong>Test 3D</strong> to reveal internal structures.
            </p>
          </div>
        )}

        {/* ── 3D Canvas ────────────────────────────────────────────────── */}
        <Canvas camera={{ position: [0, 0, 30.95], fov: 35 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <ambientLight intensity={1.2} />
          <spotLight position={[5, 10, 5]} intensity={2.0} penumbra={1} castShadow angle={0.2} />
          <pointLight position={[-5, -5, 5]} intensity={1.5} color="#ffa092" />
          <pointLight position={[0, 0, 8]} intensity={1.0} color="#ffffff" />
          {isIntroAnimating && (
            <IntroCameraAnimation
              controlsRef={orbitControlsRef}
              onComplete={() => setIsIntroAnimating(false)}
            />
          )}
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

          {showTest3D && (
            <group scale={2}>
              <TestBrownEyeballs onClick={handleOrganClick} />
              <TestBrain onClick={handleOrganClick} />
              <TestLarynx onClick={handleOrganClick} />
              <TestTongue onClick={handleOrganClick} />
            </group>
          )}



          <Environment preset="city" />
          <OrbitControls
            ref={orbitControlsRef}
            enablePan={false}
            enableZoom={true}
            enabled={!isDrawingActive && !isIntroAnimating}
            minDistance={2}
            maxDistance={40}
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
        showTest3D={showTest3D}
        setShowTest3D={setShowTest3D}
      />
    </div>
  );
}

export default App;
