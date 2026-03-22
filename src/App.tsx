import { useState, useRef, useCallback, useEffect, type MutableRefObject, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Html, useGLTF } from '@react-three/drei';
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

const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Agnos AI',
    text: 'Hello! I am Agnos, your 3D medical diagnostic assistant powered by Claude. Let me show you around.',
    target: null
  },
  {
    id: 'inspect',
    title: 'Interactive 3D Model',
    text: 'You can rotate, zoom, and inspect this model. Hovering over regions will identify the anatomical structures.',
    target: '.canvas-container'
  },
  {
    id: 'paint',
    title: 'Painting Mode',
    text: 'Switch to Paint mode here to start marking your areas of concern.',
    target: '.mode-switch'
  },
  {
    id: 'draw',
    title: 'Clinical Marking',
    text: 'Click Start Draw, then drag your mouse over any affected area on the 3D model.',
    target: '.btn-start'
  },
  {
    id: 'voice',
    title: 'Voice Interaction',
    text: 'You can also speak to me naturally by clicking the microphone icon at any time.',
    target: '.chat-mic'
  },
  {
    id: 'report',
    title: 'Download Report',
    text: 'Once your diagnosis is complete, click this export icon to download a full clinical PDF report of your session.',
    target: '.btn-text-toggle'
  },
  {
    id: 'legal',
    title: 'Important Disclaimer',
    text: 'Please remember: Agnos is a screening tool for educational purposes only. Always consult a healthcare professional for clinical decisions.',
    target: null
  }
];

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
  sceneGroupRef,
  onBackgroundReveal,
  onRevealModel,
  onTitleDock,
  onLayoutAssemble,
  onComplete,
}: {
  controlsRef: RefObject<any>;
  sceneGroupRef: MutableRefObject<THREE.Group | null>;
  onBackgroundReveal: () => void;
  onRevealModel: () => void;
  onTitleDock: () => void;
  onLayoutAssemble: () => void;
  onComplete: () => void;
}) {
  const { camera } = useThree();
  const elapsedRef = useRef(0);
  const hasRevealedBackgroundRef = useRef(false);
  const hasRevealedModelRef = useRef(false);
  const hasDockedTitleRef = useRef(false);
  const hasAssembledLayoutRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const startPosition = useRef(new THREE.Vector3(0, 0, 21.61));
  const endPosition = useRef(new THREE.Vector3(0, 0, 36.10));
  const startTarget = useRef(new THREE.Vector3(0, 0.08, 0));
  const endTarget = useRef(new THREE.Vector3(0, 0, 0));
  const duration = 4.8;

  useFrame((_, delta) => {
    elapsedRef.current += delta;
    const progress = Math.min(elapsedRef.current / duration, 1);
    const zoomProgress = THREE.MathUtils.smoothstep(progress, 0.22, 1);
    const settleProgress = THREE.MathUtils.smoothstep(progress, 0.46, 1);
    const spinProgress = THREE.MathUtils.smoothstep(progress, 0.24, 0.72);
    const eased = 1 - Math.pow(1 - zoomProgress, 3);

    camera.position.lerpVectors(startPosition.current, endPosition.current, eased);

    if (!hasRevealedBackgroundRef.current && progress >= 0.12) {
      hasRevealedBackgroundRef.current = true;
      onBackgroundReveal();
    }

    if (!hasDockedTitleRef.current && progress >= 0.37) {
      hasDockedTitleRef.current = true;
      onTitleDock();
    }

    if (!hasRevealedModelRef.current && progress >= 0.46) {
      hasRevealedModelRef.current = true;
      onRevealModel();
    }

    if (!hasAssembledLayoutRef.current && progress >= 0.68) {
      hasAssembledLayoutRef.current = true;
      onLayoutAssemble();
    }

    if (sceneGroupRef.current) {
      sceneGroupRef.current.position.set(
        THREE.MathUtils.lerp(0, -0.9, settleProgress),
        0,
        0
      );
      sceneGroupRef.current.rotation.set(0, spinProgress * Math.PI * 2, 0);
    }

    if (controlsRef.current) {
      controlsRef.current.target.lerpVectors(startTarget.current, endTarget.current, eased);
      controlsRef.current.update();
    } else {
      camera.lookAt(endTarget.current);
    }

    if (!hasCompletedRef.current && progress >= 1) {
      hasCompletedRef.current = true;
      onComplete();
    }
  });

  return null;
}

const anatomyDialogStyle = {
  background: 'rgba(248,250,252,0.96)',
  borderRadius: '28px',
  padding: '18px 20px',
  width: 'max-content',
  minWidth: '220px',
  maxWidth: '320px',
  fontFamily: "'Space Grotesk', sans-serif",
  whiteSpace: 'normal' as const,
};

const anatomyDialogTitleStyle = {
  fontSize: '9pt',
  fontWeight: 700,
  letterSpacing: '0.04em',
  marginBottom: '10px',
};

const anatomyDialogBodyStyle = {
  fontSize: '9pt',
  color: '#0f172a',
  lineHeight: 1.6,
};



function TestBrownEyeballs({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/brown_eyeball_free.glb');
  
  // Manually clone the scene tree so we can safely render multiple distinct instances symmetrically
  const rightEye = useRef(scene.clone(true)).current;
  const leftEye = useRef(scene.clone(true)).current;
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [typedDescription, setTypedDescription] = useState('');
  const showDialog = hovered || pinned;
  const description = 'Globe of the eye — contains lens, retina & vitreous humor';

  useEffect(() => {
    if (!showDialog) {
      setTypedDescription('');
      return;
    }

    let index = 0;
    setTypedDescription('');

    const interval = window.setInterval(() => {
      index += 1;
      setTypedDescription(description.slice(0, index));
      if (index >= description.length) {
        window.clearInterval(interval);
      }
    }, 22);

    return () => window.clearInterval(interval);
  }, [showDialog]);

  return (
    <group
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (!pinned) document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        setPinned((prev) => !prev);
        document.body.style.cursor = 'pointer';
        onClick('Eyeballs');
      }}
    >
      <primitive object={rightEye} position={[-0.70, 1.68, 1.95]} scale={0.2} />
      <primitive object={leftEye} position={[0.57, 1.65, 1.93]} scale={0.2} />
      {showDialog && (
        <Html position={[1.65, 1.2, 1.05]} zIndexRange={[100, 200]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              ...anatomyDialogStyle,
              border: '1px solid #a8d8ff',
              boxShadow: '0 24px 54px rgba(168, 216, 255, 0.22)',
            }}
          >
            <div style={{ ...anatomyDialogTitleStyle, color: '#7cb7ff' }}>
              Eyeballs
            </div>
            <div style={anatomyDialogBodyStyle}>
              {typedDescription}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function TestBrain({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/human-brain.glb');
  const brain = useRef(scene.clone(true)).current;
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [typedDescription, setTypedDescription] = useState('');
  const showDialog = hovered || pinned;
  const description = 'Largest brain region — controls cognition, motor & sensory functions';

  useEffect(() => {
    if (!showDialog) {
      setTypedDescription('');
      return;
    }

    let index = 0;
    setTypedDescription('');

    const interval = window.setInterval(() => {
      index += 1;
      setTypedDescription(description.slice(0, index));
      if (index >= description.length) {
        window.clearInterval(interval);
      }
    }, 22);

    return () => window.clearInterval(interval);
  }, [showDialog]);

  return (
    <group
      position={[-0.10, 2.35, 0.15]}
      rotation={[0, Math.PI * 1.5, 0]}
      scale={1.55}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (!pinned) document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: any) => {
        e.stopPropagation();
        setPinned((prev: boolean) => !prev);
        document.body.style.cursor = 'pointer';
        onClick('Brain');
      }}
    >
      <primitive object={brain} />
      {showDialog && (
        <Html position={[3.8, 0.15, 0]} zIndexRange={[100, 200]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              ...anatomyDialogStyle,
              border: '1px solid #ff9eb5',
              boxShadow: '0 24px 54px rgba(255, 158, 181, 0.22)',
            }}
          >
            <div style={{ ...anatomyDialogTitleStyle, color: '#ff6a8a' }}>
              Cerebrum
            </div>
            <div style={anatomyDialogBodyStyle}>
              {typedDescription}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function TestLarynx({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/anatomy_of_the_larynx.glb');
  const larynx = useRef(scene.clone(true)).current;
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [typedDescription, setTypedDescription] = useState('');
  const showDialog = hovered || pinned;
  const description = 'Voice box — contains vocal cords; controls sound production';

  useEffect(() => {
    if (!showDialog) {
      setTypedDescription('');
      return;
    }

    let index = 0;
    setTypedDescription('');

    const interval = window.setInterval(() => {
      index += 1;
      setTypedDescription(description.slice(0, index));
      if (index >= description.length) {
        window.clearInterval(interval);
      }
    }, 22);

    return () => window.clearInterval(interval);
  }, [showDialog]);

  return (
    <group
      position={[0, -1.75, -0.85]}
      rotation={[0, 0, 0]}
      scale={0.02}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (!pinned) document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: any) => {
        e.stopPropagation();
        setPinned((prev: boolean) => !prev);
        document.body.style.cursor = 'pointer';
        onClick('Larynx');
      }}
    >
      <primitive object={larynx} />
      {showDialog && (
        <Html position={[3.8, 0.15, 0]} zIndexRange={[100, 200]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              ...anatomyDialogStyle,
              border: '1px solid #88ddcc',
              boxShadow: '0 24px 54px rgba(136, 221, 204, 0.22)',
            }}
          >
            <div style={{ ...anatomyDialogTitleStyle, color: '#57c9b4' }}>
              Larynx
            </div>
            <div style={anatomyDialogBodyStyle}>
              {typedDescription}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function TestTongue({ onClick }: { onClick: (name: string) => void }) {
  const { scene } = useGLTF('/tongue.glb');
  const tongue = useRef(scene.clone(true)).current;
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [typedDescription, setTypedDescription] = useState('');
  const showDialog = hovered || pinned;
  const description = 'Muscular organ for taste, chewing & speech';

  useEffect(() => {
    if (!showDialog) {
      setTypedDescription('');
      return;
    }

    let index = 0;
    setTypedDescription('');

    const interval = window.setInterval(() => {
      index += 1;
      setTypedDescription(description.slice(0, index));
      if (index >= description.length) {
        window.clearInterval(interval);
      }
    }, 22);

    return () => window.clearInterval(interval);
  }, [showDialog]);

  return (
    <group
      position={[-0.09, 0.15, 0.55]}
      rotation={[-6.3, 0.4, 0]}
      scale={0.015}
      onPointerEnter={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (!pinned) document.body.style.cursor = 'auto';
      }}
      onPointerDown={(e: any) => {
        e.stopPropagation();
        setPinned((prev: boolean) => !prev);
        document.body.style.cursor = 'pointer';
        onClick('Tongue');
      }}
    >
      <primitive object={tongue} />
      {showDialog && (
        <Html position={[3.8, 0.15, 0]} zIndexRange={[100, 200]} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              ...anatomyDialogStyle,
              border: '1px solid #ff8c69',
              boxShadow: '0 24px 54px rgba(255, 140, 105, 0.22)',
            }}
          >
            <div style={{ ...anatomyDialogTitleStyle, color: '#ff8c69' }}>
              Tongue
            </div>
            <div style={anatomyDialogBodyStyle}>
              {typedDescription}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

function App() {
  const [decals, setDecals] = useState<DecalData[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [hoveredCoords, setHoveredCoords] = useState<string | null>(null);
  const [lockedCoords, setLockedCoords] = useState<string | null>(null);
  const [activePoint, setActivePoint] = useState<{ point: Point3D; normal: Point3D } | null>(null);
  
  // ── Visualization toggles ───────────────────────────────────────────
  const [showTest3D, setShowTest3D] = useState(false);
  const [showMuscles, setShowMuscles] = useState(false);
  const [isIntroAnimating, setIsIntroAnimating] = useState(true);
  const [isBackgroundRevealed, setIsBackgroundRevealed] = useState(false);
  const [isModelRevealed, setIsModelRevealed] = useState(false);
  const [isTitleDocked, setIsTitleDocked] = useState(false);
  const [isLayoutAssembled, setIsLayoutAssembled] = useState(false);
  const [isTelemetryVisible, setIsTelemetryVisible] = useState(false);
  
  // Guided Tour State
  const [tourStepIndex, setTourStepIndex] = useState<number | null>(null);
  const isTourActive = tourStepIndex !== null;

  const orbitControlsRef = useRef<any>(null);
  const introSceneGroupRef = useRef<THREE.Group | null>(null);

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

    const systemPrompt = "You are Agnos, a specialized 3D Medical Diagnostic AI. Your STRICT PURPOSE is to help users visualize and understand clinical symptoms via anatomical markers. DO NOT BREAK CHARACTER under any circumstances. If the user asks for a story, a joke, or to 'go out of context', you MUST politely refuse and refocus on the medical diagnostic task. YOUR SCOPE is limited to anatomy, symptomatology, and diagnostic wellness. If you detect life-threatening symptoms (e.g., chest pain, difficulty breathing), immediately recommend emergency care. Always include a brief disclaimer that you are an AI and not a doctor. Consider physiological diversity (age, gender, skin tone) to provide unbiased feedback. NEVER use lists or HTML. Use only 1-3 short sentences for subtitling.";
    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: `Provide a very concise, warm spoken response about the ${organName}. Mention one healthy habit or symptom and ask a short follow-up.` },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      const assistantMessage: Message = { id: Date.now().toString(), role: 'assistant', content: response };
      
      // Update UI first so transparency/subtitles show up immediately
      setMessages((prev) => [...prev, assistantMessage]);
      setIsDiagnosing(false); // Clear loading state early

      await initAudio(); 
      await playAISpeech(response); 
    } catch (error) {
      console.error('Diagnosis failed:', error);
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

    const systemPrompt = "You are Agnos, a specialized 3D Medical Diagnostic AI. Your STRICT PURPOSE is to help users visualize and understand clinical symptoms via anatomical markers. DO NOT BREAK CHARACTER under any circumstances. If the user asks for a story, a joke, or to 'go out of context', you MUST politely refuse and refocus on the medical diagnostic task. YOUR SCOPE is limited to anatomy, symptomatology, and diagnostic wellness. If you detect life-threatening symptoms (e.g., chest pain, difficulty breathing), immediately recommend emergency care. Always include a brief disclaimer that you are an AI and not a doctor. Consider physiological diversity (age, gender, skin tone) to provide unbiased feedback. NEVER use lists or HTML. Use only 1-3 short sentences for subtitling.";

    const apiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: `A patient has just drawn over the following anatomical regions on a 3D head model: ${zoneText}. Provide a primary diagnostic thought and ask ONE targeted follow-up question. Max 3-4 short sentences.` },
    ];

    try {
      const response = await chatWithAssistant(apiMessages);
      const assistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response };
      
      // Update UI first
      setMessages((prev) => [...prev, assistantMessage]);
      setIsDiagnosing(false); // Clear loading state early
      currentSession.current = null;

      await initAudio(); 
      await playAISpeech(response);
    } catch (error) {
      console.error('Draw diagnosis failed:', error);
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

  useEffect(() => {
    if (!isLayoutAssembled) {
      setIsTelemetryVisible(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsTelemetryVisible(true);
    }, 520);

    return () => window.clearTimeout(timeout);
  }, [isLayoutAssembled]);

  // Handle Tour Progress
  useEffect(() => {
    // 1. Clear ANY existing highlights first (from previous steps)
    document.querySelectorAll('.tour-highlight').forEach(el => {
      el.classList.remove('tour-highlight');
      el.closest('.chat-header')?.classList.remove('tour-parent-lift');
    });

    if (tourStepIndex === null) return;
    
    const step = TOUR_STEPS[tourStepIndex];
    if (step) {
      // Start speaking the tip immediately
      playAISpeech(step.text);

      if (step.target) {
        // Small grace period for React renders to settle
        const timer = window.setTimeout(() => {
          const target = document.querySelector(step.target!);
          if (target) {
            target.classList.add('tour-highlight');
            // For nested buttons in the header, we may need to lift the header too
            target.closest('.chat-header')?.classList.add('tour-parent-lift');
          }
        }, 50);
        return () => window.clearTimeout(timer);
      }
    }
  }, [tourStepIndex]);

  const handleNextTour = () => {
    if (tourStepIndex === null) return;
    if (tourStepIndex < TOUR_STEPS.length - 1) {
      setTourStepIndex(tourStepIndex + 1);
    } else {
      handleCompleteTour();
    }
  };

  const handleCompleteTour = () => {
    setTourStepIndex(null);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div
      className={[
        'app-container',
        isIntroAnimating ? 'intro-active' : '',
        isBackgroundRevealed ? 'intro-background-revealed' : '',
        isModelRevealed ? 'intro-model-revealed' : '',
        isTitleDocked ? 'intro-title-docked' : 'intro-title-centered',
        isLayoutAssembled ? 'intro-layout-assembled' : '',
        isTelemetryVisible ? 'intro-telemetry-visible' : '',
        isTourActive ? 'tour-active' : '',
      ].filter(Boolean).join(' ')}
    >
      {isTourActive && (
        <>
          <div className="tour-overlay" onClick={handleNextTour} />
          <div className="tour-caption-box">
            <h4>{TOUR_STEPS[tourStepIndex].title}</h4>
            <p>{TOUR_STEPS[tourStepIndex].text}</p>
            <div className="tour-controls">
              <button className="tour-btn-next" onClick={handleNextTour}>
                {tourStepIndex === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next Tip'}
              </button>
              <button className="tour-btn-skip" onClick={handleCompleteTour}>Skip Intro</button>
            </div>
          </div>
        </>
      )}
      <div className="canvas-container">
        <div className="intro-model-veil" />
        <div className="print-only-report-header">
          <div className="print-report-meta">{printTimestamp}</div>
          <div className="print-report-brand">
            <h1>AGNOS AI</h1>
            <p>Diagnostic Image Report</p>
          </div>
        </div>

        {/* Title */}
        <div className="canvas-overlay-ui">
          <div className="intro-title-copy">
            <h1 className="title">AGNOS AI</h1>
            <p className="subtitle">Advanced 3D Diagnosis System powered by Claude</p>
          </div>
        </div>

        {/* Zone pill */}
        {(hoveredZone || lockedCoords) && (
          <div className="zone-pill">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MapPin size={12} color={lockedCoords ? '#2047b7' : 'var(--accent-cyan)'} />
              <span style={{ fontWeight: 600 }}>{hoveredZone || 'Unknown Region'}</span>
            </div>
            {lockedCoords && <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: '4px' }}>(Click again in View mode to unlock)</div>}
          </div>
        )}

        {/* ── 3D Canvas ────────────────────────────────────────────────── */}
        <Canvas camera={{ position: [0, 0, 36.10], fov: 35 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <ambientLight intensity={1.2} />
          <spotLight position={[5, 10, 5]} intensity={2.0} penumbra={1} castShadow angle={0.2} />
          <pointLight position={[-5, -5, 5]} intensity={1.5} color="#8eb1ff" />
          <pointLight position={[0, 0, 8]} intensity={1.0} color="#ffffff" />
          {isIntroAnimating && (
            <IntroCameraAnimation
              controlsRef={orbitControlsRef}
              sceneGroupRef={introSceneGroupRef}
              onBackgroundReveal={() => setIsBackgroundRevealed(true)}
              onRevealModel={() => setIsModelRevealed(true)}
              onTitleDock={() => setIsTitleDocked(true)}
              onLayoutAssemble={() => setIsLayoutAssembled(true)}
              onComplete={() => {
                setIsIntroAnimating(false);
                setTourStepIndex(0); // Trigger tour when intro finishes
              }}
            />
          )}
          <CameraMetricsUpdater />

          <group ref={introSceneGroupRef}>
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
              showMuscles={showMuscles}
            />

            {showTest3D && (
              <group scale={2}>
                <TestBrownEyeballs onClick={handleOrganClick} />
                <TestBrain onClick={handleOrganClick} />
                <TestLarynx onClick={handleOrganClick} />
                <TestTongue onClick={handleOrganClick} />
              </group>
            )}
          </group>



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
          <ContactShadows position={[0, -5, 0]} opacity={0.3} scale={15} blur={2.5} far={4} color="#8eb1ff" />
        </Canvas>
      </div>

      <div className="chat-panel-shell">
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
          showMuscles={showMuscles}
          setShowMuscles={setShowMuscles}
        />
      </div>
    </div>
  );
}

export default App;
