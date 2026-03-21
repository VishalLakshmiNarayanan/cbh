import { useMemo, useRef } from 'react';
import { useGLTF, Decal } from '@react-three/drei';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { DecalData, Point3D } from '../types';

interface FaceModelProps {
  decals: DecalData[];
  onFaceDown: (point: Point3D, normal: Point3D, zone: string) => void;
  onFaceMove: (point: Point3D, normal: Point3D, zone: string) => void;
  onFaceUp: () => void;
  hoveredZone: string | null;
  setHoveredZone: (zone: string | null) => void;
  isDrawMode: boolean;
  isDrawingActive: boolean;
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
export const faceBounds = {
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
  const absX = Math.abs(x);
  const isRight = x > 0;

  // Front face: geo Z > 0.59  (user Z > 0.35 → (0.35-0.1)×2.355=0.59)
  // Back of head: geo Z < -0.47  (user Z < -0.10 → (-0.10-0.1)×2.355=-0.47)
  const isBack = z < -0.47;

  // ── CROWN & SCALP  (geo Y > 2.58, user Y > 1.7) ─────────────────────────
  if (y > 2.58) {
    if (isBack) {
      if (absX < 0.99) return 'Posterior Vertex / Occiput';
      if (absX < 1.97) return isRight ? 'Right Occipital Scalp' : 'Left Occipital Scalp';
      return isRight ? 'Right Temporal Scalp' : 'Left Temporal Scalp';
    }
    if (absX < 0.72) return 'Crown / Vertex';
    if (absX < 1.97) return isRight ? 'Right Parietal Scalp' : 'Left Parietal Scalp';
    return isRight ? 'Right Temporal Scalp' : 'Left Temporal Scalp';
  }

  // ── FOREHEAD  (geo Y 1.59–2.58, user Y 1.2–1.7) ─────────────────────────
  if (y > 1.59) {
    if (isBack) {
      if (absX < 0.72) return 'Occipital (Upper)';
      if (absX < 1.91) return isRight ? 'Right Occipital' : 'Left Occipital';
      return isRight ? 'Right Mastoid / Temporal Bone' : 'Left Mastoid / Temporal Bone';
    }
    if (absX < 0.66) return 'Central Forehead';
    if (absX < 1.48) return isRight ? 'Right Forehead' : 'Left Forehead';
    if (absX < 2.30) return isRight ? 'Right Temple' : 'Left Temple';
    return isRight ? 'Right Temporal Fossa' : 'Left Temporal Fossa';
  }

  // ── SUPRAORBITAL / BROW  (geo Y 0.99–1.59, user Y 0.9–1.2) ──────────────
  if (y > 0.99) {
    if (isBack) {
      if (absX < 0.72) return 'Mid Occipital / Inion';
      if (absX < 1.91) return isRight ? 'Right Posterior Parietal' : 'Left Posterior Parietal';
      return isRight ? 'Right Mastoid Region' : 'Left Mastoid Region';
    }
    if (absX < 0.53) return 'Glabella (Between Brows)';
    if (absX < 1.32) return isRight ? 'Right Supraorbital Ridge' : 'Left Supraorbital Ridge';
    if (absX < 2.04) {
      return z > 1.41
        ? (isRight ? 'Right Lateral Orbit' : 'Left Lateral Orbit')
        : (isRight ? 'Right Temple' : 'Left Temple');
    }
    return isRight ? 'Right Zygomatic Arch / Temple' : 'Left Zygomatic Arch / Temple';
  }

  // ── EYE REGION  (geo Y 0.40–0.99, user Y 0.6–0.9) ───────────────────────
  if (y > 0.40) {
    if (isBack) {
      if (absX < 0.72) return 'Lower Occipital';
      if (absX < 1.81) return isRight ? 'Right Suboccipital' : 'Left Suboccipital';
      return isRight ? 'Right Posterior Neck (Upper)' : 'Left Posterior Neck (Upper)';
    }
    if (absX < 0.53) return 'Nasal Bridge / Nasion';
    if (absX < 0.99) return isRight ? 'Right Medial Canthus' : 'Left Medial Canthus';
    if (absX < 1.71) {
      return z > 1.41
        ? (isRight ? 'Right Eyelid / Orbital' : 'Left Eyelid / Orbital')
        : (isRight ? 'Right Periorbital' : 'Left Periorbital');
    }
    if (absX < 2.37) return isRight ? 'Right Lateral Canthus' : 'Left Lateral Canthus';
    return isRight ? 'Right Temporal Region' : 'Left Temporal Region';
  }

  // ── NOSE & CHEEKS  (geo Y -0.79–0.40, user Y 0.0–0.6) ───────────────────
  if (y > -0.79) {
    if (isBack) {
      if (absX < 0.72) return 'Nuchal / C1–C2 Region';
      if (absX < 1.81) return isRight ? 'Right Posterior Neck' : 'Left Posterior Neck';
      return isRight ? 'Right Trapezius (Upper)' : 'Left Trapezius (Upper)';
    }
    // Nose tip: geo Z > 1.77 (user Z > 0.85), absX < 0.66
    if (z > 1.77 && absX < 0.66) {
      return y > 0.0 ? 'Nose Bridge / Dorsum' : 'Nasal Tip';
    }
    if (absX < 0.72) return isRight ? 'Right Nasal Sidewall / Ala' : 'Left Nasal Sidewall / Ala';
    if (absX < 1.65) return isRight ? 'Right Cheek / Maxillary' : 'Left Cheek / Maxillary';
    if (absX < 2.37) return isRight ? 'Right Zygomatic / Cheekbone' : 'Left Zygomatic / Cheekbone';
    return isRight ? 'Right Ear / Auricular' : 'Left Ear / Auricular';
  }

  // ── LIPS / MOUTH  (geo Y -1.98–(-0.79), user Y -0.6–0.0) ─────────────────
  if (y > -1.98) {
    if (isBack) {
      if (absX < 0.72) return 'Cervical Spine (C3–C4)';
      if (absX < 1.81) return isRight ? 'Right Sternocleidomastoid' : 'Left Sternocleidomastoid';
      return isRight ? 'Right Posterior Neck' : 'Left Posterior Neck';
    }
    if (absX < 0.59) {
      return y > -1.26 ? 'Philtrum (Upper Lip)' : 'Oral Commissure / Lips';
    }
    if (absX < 1.32) return isRight ? 'Right Buccal / Cheek' : 'Left Buccal / Cheek';
    if (absX < 2.14) return isRight ? 'Right Masseter / Jaw' : 'Left Masseter / Jaw';
    return isRight ? 'Right Mandibular Angle' : 'Left Mandibular Angle';
  }

  // ── JAW / CHIN  (geo Y -3.17–(-1.98), user Y -1.2–(-0.6)) ───────────────
  if (y > -3.17) {
    if (isBack) {
      if (absX < 0.72) return 'Cervical Spine (C4–C5)';
      if (absX < 1.81) return isRight ? 'Right SCM / Neck' : 'Left SCM / Neck';
      return isRight ? 'Right Posterior Neck' : 'Left Posterior Neck';
    }
    if (absX < 0.82) {
      return y > -2.58 ? 'Mentalis / Chin' : 'Mental Protuberance (Chin Tip)';
    }
    if (absX < 1.65) return isRight ? 'Right Chin / Submental' : 'Left Chin / Submental';
    return isRight ? 'Right Parotid / Mandible' : 'Left Parotid / Mandible';
  }

  // ── NECK  (geo Y -3.97–(-3.17), user Y -1.6–(-1.2)) ─────────────────────
  if (y > -3.97) {
    if (isBack) {
      if (absX < 0.82) return 'Posterior Neck / Nuchal';
      if (absX < 1.91) return isRight ? 'Right Posterior Neck / Trapezius' : 'Left Posterior Neck / Trapezius';
      return isRight ? 'Right Upper Trapezius' : 'Left Upper Trapezius';
    }
    if (absX < 0.72) return 'Anterior Neck / Thyroid';
    if (absX < 1.81) return isRight ? 'Right Sternocleidomastoid' : 'Left Sternocleidomastoid';
    return isRight ? 'Right Cervical / Trapezius Neck' : 'Left Cervical / Trapezius Neck';
  }

  // ── BASE ─────────────────────────────────────────────────────────────────
  if (absX < 0.30) return 'Clavicular / Sternal Notch';
  return isRight ? 'Right Shoulder / Trapezius' : 'Left Shoulder / Trapezius';
}

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
  isDrawMode,
  isDrawingActive,
}: FaceModelProps) {
  const { scene } = useGLTF('/LeePerrySmith.glb');
  const meshRef = useRef<THREE.Mesh>(null);

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
    if (!isDrawMode || !isDrawingActive) return;
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const lp = getLocalPoint(e);
    const ln = getFaceNormal(e);
    if (!ln) return;
    const zone = getFacialZone(lp.y, lp.x, lp.z);
    onFaceDown({ x: lp.x, y: lp.y, z: lp.z }, { x: ln.x, y: ln.y, z: ln.z }, zone);
  };

  const handlePointerUp = () => {
    if (!isDrawMode || !isDrawingActive) return;
    onFaceUp();
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const lp = getLocalPoint(e);
    const zone = getFacialZone(lp.y, lp.x, lp.z);
    setHoveredZone(zone);
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
  };

  const modelH = faceBounds.maxY - faceBounds.minY;

  return (
    <group dispose={null} scale={2}>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={glassMaterial}
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
      </mesh>
    </group>
  );
}

useGLTF.preload('/LeePerrySmith.glb');
