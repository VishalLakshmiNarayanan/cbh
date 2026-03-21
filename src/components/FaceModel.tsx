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

/** Normalize a raw local coordinate to [0,1] range on each axis. */
function normalize(y: number, x: number, z: number) {
  const totalY = faceBounds.maxY - faceBounds.minY;
  const totalX = faceBounds.maxX - faceBounds.minX;
  const totalZ = faceBounds.maxZ - faceBounds.minZ;
  return {
    normY: (y - faceBounds.minY) / totalY,       // 0=base, 1=crown
    normX: (x - (faceBounds.minX + totalX / 2)) / (totalX / 2), // -1 to +1 symmetric
    normZ: (z - faceBounds.minZ) / totalZ,        // 0=back, 1=front
  };
}

/**
 * Classify a LOCAL-SPACE intersection point into an anatomical zone.
 * Works entirely in normalized [0,1] space — scale-independent.
 */
function getFacialZone(y: number, x: number, z: number): string {
  const { normY, normX, normZ } = normalize(y, x, z);
  const absX = Math.abs(normX);
  const isRight = normX > 0;

  // Front face:  normZ > 0.70  (face surface starts here)
  // Side/ear:    0.50 < normZ ≤ 0.70
  // Back:        normZ ≤ 0.50
  const isBack  = normZ < 0.50;

  // ── CROWN & SCALP  (normY > 0.88) ───────────────────────────────────────
  if (normY > 0.88) {
    if (isBack) {
      if (absX < 0.22) return 'Posterior Vertex / Occiput';
      if (absX < 0.58) return isRight ? 'Right Occipital Scalp' : 'Left Occipital Scalp';
      return isRight ? 'Right Temporal Scalp' : 'Left Temporal Scalp';
    }
    if (absX < 0.22) return 'Crown / Vertex';
    if (absX < 0.58) return isRight ? 'Right Parietal Scalp' : 'Left Parietal Scalp';
    return isRight ? 'Right Temporal Scalp' : 'Left Temporal Scalp';
  }

  // ── FOREHEAD  (normY 0.70–0.88) ─────────────────────────────────────────
  if (normY > 0.70) {
    if (isBack) {
      if (absX < 0.22) return 'Occipital (Upper)';
      if (absX < 0.58) return isRight ? 'Right Occipital' : 'Left Occipital';
      return isRight ? 'Right Mastoid / Temporal Bone' : 'Left Mastoid / Temporal Bone';
    }
    if (absX < 0.20) return 'Central Forehead';
    if (absX < 0.45) return isRight ? 'Right Forehead' : 'Left Forehead';
    if (absX < 0.70) return isRight ? 'Right Temple' : 'Left Temple';
    return isRight ? 'Right Temporal Fossa' : 'Left Temporal Fossa';
  }

  // ── SUPRAORBITAL / BROW  (normY 0.63–0.70) ──────────────────────────────
  if (normY > 0.63) {
    if (isBack) {
      if (absX < 0.22) return 'Mid Occipital / Inion';
      if (absX < 0.58) return isRight ? 'Right Posterior Parietal' : 'Left Posterior Parietal';
      return isRight ? 'Right Mastoid Region' : 'Left Mastoid Region';
    }
    if (absX < 0.16) return 'Glabella (Between Brows)';
    if (absX < 0.40) return isRight ? 'Right Supraorbital Ridge' : 'Left Supraorbital Ridge';
    if (absX < 0.62) {
      return (normZ > 0.75)
        ? (isRight ? 'Right Lateral Orbit' : 'Left Lateral Orbit')
        : (isRight ? 'Right Temple' : 'Left Temple');
    }
    return isRight ? 'Right Zygomatic Arch / Temple' : 'Left Zygomatic Arch / Temple';
  }

  // ── EYE REGION  (normY 0.55–0.63) ───────────────────────────────────────
  if (normY > 0.55) {
    if (isBack) {
      if (absX < 0.22) return 'Lower Occipital';
      if (absX < 0.55) return isRight ? 'Right Suboccipital' : 'Left Suboccipital';
      return isRight ? 'Right Posterior Neck (Upper)' : 'Left Posterior Neck (Upper)';
    }
    if (absX < 0.16) return 'Nasal Bridge / Nasion';
    if (absX < 0.30) return isRight ? 'Right Medial Canthus' : 'Left Medial Canthus';
    if (absX < 0.52) {
      return (normZ > 0.75)
        ? (isRight ? 'Right Eyelid / Orbital' : 'Left Eyelid / Orbital')
        : (isRight ? 'Right Periorbital' : 'Left Periorbital');
    }
    if (absX < 0.72) return isRight ? 'Right Lateral Canthus' : 'Left Lateral Canthus';
    return isRight ? 'Right Temporal Region' : 'Left Temporal Region';
  }

  // ── NOSE & MID-FACE  (normY 0.40–0.55) ──────────────────────────────────
  if (normY > 0.40) {
    if (isBack) {
      if (absX < 0.22) return 'Nuchal / C1–C2 Region';
      if (absX < 0.55) return isRight ? 'Right Posterior Neck' : 'Left Posterior Neck';
      return isRight ? 'Right Trapezius (Upper)' : 'Left Trapezius (Upper)';
    }
    // Nose tip: normZ near 1.0, absX < 0.20
    if (normZ > 0.85 && absX < 0.20) {
      return normY > 0.48 ? 'Nose Bridge / Dorsum' : 'Nasal Tip';
    }
    if (absX < 0.22) return isRight ? 'Right Nasal Sidewall / Ala' : 'Left Nasal Sidewall / Ala';
    if (absX < 0.50) return isRight ? 'Right Cheek / Maxillary' : 'Left Cheek / Maxillary';
    if (absX < 0.72) return isRight ? 'Right Zygomatic / Cheekbone' : 'Left Zygomatic / Cheekbone';
    return isRight ? 'Right Ear / Auricular' : 'Left Ear / Auricular';
  }

  // ── LIPS / MOUTH  (normY 0.25–0.40) ─────────────────────────────────────
  if (normY > 0.25) {
    if (isBack) {
      if (absX < 0.22) return 'Cervical Spine (C3–C4)';
      if (absX < 0.55) return isRight ? 'Right Sternocleidomastoid' : 'Left Sternocleidomastoid';
      return isRight ? 'Right Posterior Neck' : 'Left Posterior Neck';
    }
    if (absX < 0.18) {
      return normY > 0.33 ? 'Philtrum (Upper Lip)' : 'Oral Commissure / Lips';
    }
    if (absX < 0.40) return isRight ? 'Right Buccal / Cheek' : 'Left Buccal / Cheek';
    if (absX < 0.65) return isRight ? 'Right Masseter / Jaw' : 'Left Masseter / Jaw';
    return isRight ? 'Right Mandibular Angle' : 'Left Mandibular Angle';
  }

  // ── JAW / CHIN  (normY 0.10–0.25) ───────────────────────────────────────
  if (normY > 0.10) {
    if (isBack) {
      if (absX < 0.22) return 'Cervical Spine (C4–C5)';
      if (absX < 0.55) return isRight ? 'Right SCM / Neck' : 'Left SCM / Neck';
      return isRight ? 'Right Posterior Neck' : 'Left Posterior Neck';
    }
    if (absX < 0.25) {
      return normY > 0.18 ? 'Mentalis / Chin' : 'Mental Protuberance (Chin Tip)';
    }
    if (absX < 0.50) return isRight ? 'Right Chin / Submental' : 'Left Chin / Submental';
    return isRight ? 'Right Parotid / Mandible' : 'Left Parotid / Mandible';
  }

  // ── NECK  (normY 0.00–0.10) ──────────────────────────────────────────────
  if (normY > 0.00) {
    if (isBack) {
      if (absX < 0.25) return 'Posterior Neck / Nuchal';
      if (absX < 0.58) return isRight ? 'Right Posterior Neck / Trapezius' : 'Left Posterior Neck / Trapezius';
      return isRight ? 'Right Upper Trapezius' : 'Left Upper Trapezius';
    }
    if (absX < 0.22) return 'Anterior Neck / Thyroid';
    if (absX < 0.55) return isRight ? 'Right Sternocleidomastoid' : 'Left Sternocleidomastoid';
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
      color: new THREE.Color('#b8e8ff'),
      transmission: 0.96,
      opacity: 1,
      metalness: 0.0,
      roughness: 0.05,
      ior: 1.45,
      thickness: 0.5,
      transparent: true,
      depthWrite: false,
      sheen: 0.4,
      sheenColor: new THREE.Color('#00f3ff'),
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
