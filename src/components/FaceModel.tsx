import { useMemo, useRef } from 'react';
import { useGLTF, Decal, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { DecalData, Point3D } from '../types';
import { getNearestMarker } from '../lib/facialMarkers';


interface FaceModelProps {
  decals: DecalData[];
  onFaceDown: (point: Point3D, normal: Point3D, zone: string) => void;
  onFaceMove: (point: Point3D, normal: Point3D, zone: string) => void;
  onFaceUp: () => void;
  hoveredZone: string | null;
  setHoveredZone: (zone: string | null) => void;
  setHoveredCoords: (c: string | null) => void;
  setLockedCoords: React.Dispatch<React.SetStateAction<string | null>>;
  isDrawMode: boolean;
  isDrawingActive: boolean;
  // ── Visualization toggles ───────────────────────────────────────────
  showTest3D: boolean;
  showMuscles: boolean;
}

/**
 * ACTUAL LeePerrySmith.glb geometry bounds (from console log):
 *   Y: -3.97 → +3.97   (total ~7.94)
 *   X: -4.28 → +4.28
 *   Z: -2.59 → ~+2.55  (approx, nose tip positive Z)
 *
 * The user's anatomical table (Y: -1.6→2.4 etc.) describes a NORMALIZED space
 * where the model total height ≈ 4.0. Scale factor to real geom ≈ 1.99×.
 *
 * We normalize all coordinates to [0,1] internally so the classifier is
 * scale-independent and always correct regardless of GLB import scale.
 *
 * Normalized coordinate system:
 *   normY:  0 = chin/base,  1 = crown
 *   normX: -1 = model right, 0 = center, +1 = model left
 *   normZ:  0 = back of skull, 1 = nose tip (front)
 *
 * Surface region boundaries in normY space (derived from user table):
 *   Crown/Scalp:    normY > 0.88
 *   Forehead:       normY 0.70–0.88   (user Y 1.2–2.4, base -1.6, total 4.0 → (1.2+1.6)/4=0.70)
 *   Supraorbital:   normY 0.63–0.70   (user Y 0.9–1.2 → (0.9+1.6)/4=0.625)
 *   Eye region:     normY 0.55–0.63   (user Y 0.6–0.9 → (0.6+1.6)/4=0.55)
 *   Mid-face/Nose:  normY 0.40–0.55   (user Y 0.0–0.6 → (0.0+1.6)/4=0.40)
 *   Lips/Mouth:     normY 0.25–0.40   (user Y -0.6–0.0 → (-0.6+1.6)/4=0.25)
 *   Jaw/Chin:       normY 0.10–0.25   (user Y -1.2–-0.6 → (-1.2+1.6)/4=0.10)
 *   Neck:           normY 0.00–0.10   (user Y -1.6–-1.2)
 *
 * Front/back determination:
 *   normZ > 0.72 = front face (user Z > 0.5 → (0.5+1.0)/2.2=0.68)
 *   normZ < 0.55 = back/lateral
 */

// Actual geometry bounds — seeded with real values from console log, precision-updated on load
const faceBounds = {
  minY: -3.97, maxY: 3.97,
  minX: -4.28, maxX: 4.28,
  minZ: -2.59, maxZ:  2.55,  // maxZ estimated; corrected on load
};
let boundsInitialized = false;

/**
 * Classify a raw LOCAL-SPACE intersection point into an anatomical zone.
 * Uses verified geometry-space thresholds: geo_Y = (user_Y - 0.4) × 1.985
 */

function getFacialZone(y: number, x: number, z: number): string {
  return getNearestMarker(x, y, z);
}

const MUSCLE_REGIONS = [
  { name: 'Frontalis', pos: [0, 2.2, 1.2], rot: [0,0,0], size: 2.5, color: '#ff5500' },
  { name: 'Orbicularis Oculi L', pos: [-1.2, 0.8, 1.6], rot: [0,0.5,0], size: 1.2, color: '#ff0055' },
  { name: 'Orbicularis Oculi R', pos: [1.2, 0.8, 1.6], rot: [0,-0.5,0], size: 1.2, color: '#ff0055' },
  { name: 'Zygomaticus L', pos: [-1.8, -0.2, 1.4], rot: [0,0.8,0], size: 1.0, color: '#ffaa00' },
  { name: 'Zygomaticus R', pos: [1.8, -0.2, 1.4], rot: [0,-0.8,0], size: 1.0, color: '#ffaa00' },
  { name: 'Masseter L', pos: [-2.2, -1.8, 0.8], rot: [0,1.2,0], size: 1.5, color: '#aa55ff' },
  { name: 'Masseter R', pos: [2.2, -1.8, 0.8], rot: [0,-1.2,0], size: 1.5, color: '#aa55ff' },
  { name: 'Platysma', pos: [-0.53, -1.59, 0.57], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#00aaff' },
  { name: 'Trapezius R', pos: [-2.77, -2.28, -0.17], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#ffcc00' },
  { name: 'Trapezius L', pos: [2.77, -2.28, -0.17], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#ffcc00' },
  { name: 'Scalenus', pos: [2.34, -3.21, 0.70], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#00ffaa' },
  { name: 'Sternum', pos: [0.11, -3.49, 0.94], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#ffffff' },
  { name: 'Thyroid Cartilage', pos: [-0.07, -1.01, 1.04], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#ff8888' },
  { name: 'Thyroid Gland', pos: [-0.09, -1.21, 0.93], rot: [-0.11, 0.05, 0.005], size: 2.59, color: '#ff4444' },
];


function getDecalRotation(normal: Point3D): [number, number, number] {
  const n = new THREE.Vector3(normal.x, normal.y, normal.z).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return [e.x, e.y, e.z];
}

export function FaceModel({
  decals,
  onFaceDown,
  onFaceMove,
  onFaceUp,
  setHoveredZone,
  setHoveredCoords,
  setLockedCoords,
  isDrawMode,
  isDrawingActive,
  showTest3D,
  showMuscles,
}: FaceModelProps) {
  const { scene } = useGLTF('/LeePerrySmith.glb');
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useTexture('/Map-COL.jpg');

  const texturedMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.FrontSide,
    });
  }, [texture]);

  const transparentTexturedMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.1,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.3, // Reduced opacity for muscle visualization
    });
  }, [texture]);

  const geometry = useMemo(() => {
    let geo: THREE.BufferGeometry | null = null;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !geo) {
        geo = (child as THREE.Mesh).geometry;
        geo.computeBoundingBox();
        const box = geo.boundingBox;
        if (box && !boundsInitialized) {
          boundsInitialized = true;
          faceBounds.minY = box.min.y;
          faceBounds.maxY = box.max.y;
          faceBounds.minX = box.min.x;
          faceBounds.maxX = box.max.x;
          faceBounds.minZ = box.min.z;
          faceBounds.maxZ = box.max.z;
          console.log('[FaceModel] actual bounds:', JSON.stringify(faceBounds));
        }
      }
    });
    return geo;
  }, [scene]);

  const glassMaterial = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#fff0e6'),
      transmission: 0.96,
      opacity: 1,
      metalness: 0.0,
      roughness: 0.05,
      ior: 1.45,
      thickness: 0.5,
      transparent: true,
      depthWrite: false,
      sheen: 0.6,
      sheenColor: new THREE.Color('#ffb3a1'),
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
      side: THREE.DoubleSide,
    });
  }, []);

  if (!geometry) return null;

  const getLocalPoint = (e: ThreeEvent<PointerEvent>): THREE.Vector3 =>
    e.object.worldToLocal(e.point.clone());

  const getFaceNormal = (e: ThreeEvent<PointerEvent>): THREE.Vector3 | null =>
    e.face ? e.face.normal.clone().normalize() : null;

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const lp = getLocalPoint(e);
    const ln = getFaceNormal(e);
    if (!ln) return;

    if (isDrawMode && isDrawingActive) {
      const zone = getFacialZone(lp.y, lp.x, lp.z);
      onFaceDown({ x: lp.x, y: lp.y, z: lp.z }, { x: ln.x, y: ln.y, z: ln.z }, zone);
    } else if (!isDrawMode && typeof setLockedCoords === 'function') {
      const coordsStr = `[X:${lp.x.toFixed(2)} Y:${lp.y.toFixed(2)} Z:${lp.z.toFixed(2)}]`;
      setLockedCoords((prev: string | null) => prev === coordsStr ? null : coordsStr);
    }
  };

  const handlePointerUp = () => {
    if (!isDrawMode || !isDrawingActive) return;
    onFaceUp();
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const lp = getLocalPoint(e);
    const zone = getFacialZone(lp.y, lp.x, lp.z);
    setHoveredZone(zone);
    if (!isDrawingActive) {
      setHoveredCoords(`[X:${lp.x.toFixed(2)} Y:${lp.y.toFixed(2)} Z:${lp.z.toFixed(2)}]`);
    }
    document.body.style.cursor = isDrawMode ? (isDrawingActive ? 'crosshair' : 'cell') : 'grab';
    if (isDrawMode && isDrawingActive && e.buttons === 1) {
      e.stopPropagation();
      const ln = getFaceNormal(e);
      if (!ln) return;
      onFaceMove({ x: lp.x, y: lp.y, z: lp.z }, { x: ln.x, y: ln.y, z: ln.z }, zone);
    }
  };

  const handlePointerOut = () => {
    document.body.style.cursor = 'auto';
    setHoveredZone(null);
    setHoveredCoords(null);
  };

  const modelH = faceBounds.maxY - faceBounds.minY;

  const currentMaterial = useMemo(() => {
    if (showTest3D) {
      return glassMaterial;
    }
    if (showMuscles) {
      return transparentTexturedMaterial;
    }
    return texturedMaterial;
  }, [showTest3D, showMuscles, glassMaterial, transparentTexturedMaterial, texturedMaterial]);

  return (
    <group dispose={null} scale={2}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={currentMaterial}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      >
        {decals.map((decal) => {
          const dynamicSize = (decal.size || 0.4) * (modelH * 0.082);
          return (
            <Decal
              key={decal.id}
              position={[decal.position.x, decal.position.y, decal.position.z]}
              rotation={getDecalRotation(decal.normal)}
              scale={[dynamicSize, dynamicSize, dynamicSize]}
            >
              <meshBasicMaterial
                color={decal.color || '#ff3300'}
                transparent
                opacity={decal.opacity || 0.88}
                depthTest={false}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-10}
              />
            </Decal>
          );
        })}

        {/* ── Muscle Visualization Overlay ──────────────────────────────── */}
        {showMuscles && MUSCLE_REGIONS.map((m, i) => (
          <Decal key={`muscle-${i}`} position={m.pos as any} rotation={m.rot as any} scale={[m.size, m.size, m.size]}>
            <meshBasicMaterial 
              color={m.color} 
              transparent 
              opacity={0.3} 
              depthTest={false}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-20}
            />
          </Decal>
        ))}
      </mesh>
    </group>
  );
}

useGLTF.preload('/LeePerrySmith.glb');
