/**
 * HeadOrgans.tsx — Internal anatomy for LeePerrySmith.glb
 *
 * COORDINATE SYSTEM (user's original table — x1 scale):
 *   The parent <group scale={2}> in App.tsx handles the ×2 render scaling.
 *   So coordinates here are in the USER's logical space:
 *
 *   Y: -1.6 (shoulder base) → +2.4 (crown)
 *   X: -1.3 (right) → +1.3 (left)
 *   Z: -1.0 (back of skull) → +1.2 (nose tip)
 *
 * SURFACE BOUNDARIES (from user's verified table):
 *   Forehead:   Y  1.2→2.4,  Z 0.50→1.10
 *   Eyes:       Y  0.6→1.2,  Z 0.70→1.00,  X ≈ ±0.50
 *   Nose:       Y  0.0→0.8,  Z 0.80→1.20  (tip = Z 1.2)
 *   Cheeks:     Y -0.2→0.6,  Z 0.40→0.90
 *   Lips/Mouth: Y -0.6→0.0,  Z 0.70→1.10
 *   Jaw/Chin:   Y -1.2→-0.6, Z 0.50→1.00
 *   Neck:       Y -1.6→-1.2  (front Z ≈ 0.10→0.50)
 *
 * INTERNAL PLACEMENT RULES:
 *   - All organs must have Z ≤ surface_Z − 0.15 to stay INSIDE the mesh
 *   - Brain is deepest: Z center ≈ −0.05 (between nose tip and back of skull)
 *   - No organ may extend outside the model silhouette in X or Y
 *   - Max safe radii: brain ≈0.44, temporal lobe ≈0.28, eye ≈0.095
 *   - Neck organs (thyroid etc): X within ±0.25, Z within 0.00→0.28
 */

import React, { useState, useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// ─── Category definitions ────────────────────────────────────────────────────
export type OrganCategory =
  | 'brain'
  | 'eye'
  | 'sinus'
  | 'oral'
  | 'nerve'
  | 'vascular'
  | 'gland'
  | 'spine'
  | 'respiratory';

export const CATEGORY_META: Record<OrganCategory, { label: string; color: string }> = {
  brain:       { label: 'Brain',       color: '#ff9eb5' },
  eye:         { label: 'Eyes',        color: '#a8d8ff' },
  sinus:       { label: 'Sinuses',     color: '#87ceeb' },
  oral:        { label: 'Oral',        color: '#ff8c69' },
  nerve:       { label: 'Nerves',      color: '#ffe066' },
  vascular:    { label: 'Vascular',    color: '#ff6060' },
  gland:       { label: 'Glands',      color: '#ffc8a0' },
  spine:       { label: 'Spine',       color: '#e8e8cc' },
  respiratory: { label: 'Respiratory', color: '#88ddcc' },
};

type OrganDef = {
  id: string;
  label: string;
  category: OrganCategory;
  color: string;
  emissive?: string;
  opacity: number;
  position: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  shape: 'sphere' | 'cylinder' | 'box';
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radialSegments?: number;
  width?: number;
  boxHeight?: number;
  depth?: number;
  description: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// ORGANS — all positions in USER'S LOGICAL SPACE (×1 scale)
//
// Parent group in App.tsx has scale={2}, so these values map directly
// to the user's coordinate table.
//
// MAXIMUM SAFE DIMENSIONS to stay inside GLB at each level:
//   Crown (Y≈2.2):     X ±0.55, Z -0.55→0.65
//   Forehead (Y≈1.5):  X ±0.60, Z -0.45→0.70
//   Eye level (Y≈0.9): X ±0.60, Z -0.30→0.75
//   Nose level (Y≈0.4):X ±0.50, Z -0.20→0.80
//   Mouth (Y≈-0.3):    X ±0.50, Z -0.15→0.70
//   Jaw (Y≈-0.9):      X ±0.45, Z -0.10→0.65
//   Neck (Y≈-1.4):     X ±0.30, Z -0.20→0.35
// ─────────────────────────────────────────────────────────────────────────────
const ORGANS: OrganDef[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // BRAIN  —  Skull interior
  //   Skull interior (forehead surface Z≈0.70, inner wall Z≈0.50):
  //   Brain center: Y≈1.65 (mid between Y 0.88–2.40 inner), Z≈-0.05
  //   Safe radius: 0.44 (fits Y 1.21–2.09, Z -0.49–0.39 ✓)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'cerebrum',
    label: 'Cerebrum',
    category: 'brain',
    color: '#ff9eb5',
    emissive: '#3d0010',
    opacity: 0.48,
    position: [0, 1.65, -0.05],
    scale: [1.00, 0.90, 0.88],
    radius: 0.44,
    shape: 'sphere',
    description: 'Largest brain region — controls cognition, motor & sensory functions',
  },
  {
    id: 'left-temporal-lobe',
    label: 'Left Temporal Lobe',
    category: 'brain',
    color: '#ff6a8a',
    emissive: '#3d0010',
    opacity: 0.42,
    // Lateral of cerebrum, inside temporal bone; X≈-0.50, Y≈1.38, Z≈0.02
    position: [-0.50, 1.38, 0.02],
    scale: [0.52, 0.60, 0.78],
    radius: 0.28,
    shape: 'sphere',
    description: 'Processes auditory info, language & memory',
  },
  {
    id: 'right-temporal-lobe',
    label: 'Right Temporal Lobe',
    category: 'brain',
    color: '#ff6a8a',
    emissive: '#3d0010',
    opacity: 0.42,
    position: [0.50, 1.38, 0.02],
    scale: [0.52, 0.60, 0.78],
    radius: 0.28,
    shape: 'sphere',
    description: 'Processes auditory info, language & facial recognition',
  },
  {
    id: 'cerebellum',
    label: 'Cerebellum',
    category: 'brain',
    color: '#e8607a',
    emissive: '#3d0010',
    opacity: 0.52,
    // Posterior inferior — back of skull: Y≈1.10, Z≈-0.62
    position: [0, 1.10, -0.62],
    scale: [0.85, 0.55, 0.62],
    radius: 0.30,
    shape: 'sphere',
    description: 'Controls balance, coordination & fine motor movement',
  },
  {
    id: 'brainstem',
    label: 'Brain Stem',
    category: 'brain',
    color: '#c93050',
    emissive: '#3d0010',
    opacity: 0.70,
    // Connects brain to cervical spine — Y≈0.72 center, Z≈-0.30
    position: [0, 0.72, -0.30],
    radiusTop: 0.075, radiusBottom: 0.058, height: 0.42, radialSegments: 16,
    shape: 'cylinder',
    description: 'Controls breathing, heart rate & basic autonomic functions',
  },
  {
    id: 'hypothalamus',
    label: 'Hypothalamus',
    category: 'brain',
    color: '#ffb8cc',
    emissive: '#2a0010',
    opacity: 0.70,
    // Base of brain, just above pituitary; Y≈1.28, Z≈0.08
    position: [0, 1.28, 0.08],
    radius: 0.075,
    shape: 'sphere',
    description: 'Regulates body temperature, hunger, thirst & hormones',
  },
  {
    id: 'pineal-gland',
    label: 'Pineal Gland',
    category: 'gland',
    color: '#ffcc88',
    emissive: '#221100',
    opacity: 0.85,
    // Deep center brain; Y≈1.55, Z≈-0.18
    position: [0, 1.55, -0.18],
    radius: 0.040,
    shape: 'sphere',
    description: 'Produces melatonin — regulates sleep-wake cycles',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PITUITARY GLAND
  //   Sella turcica base of brain; Y≈1.18, Z≈0.10
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'pituitary-gland',
    label: 'Pituitary Gland',
    category: 'gland',
    color: '#ffaa44',
    emissive: '#221100',
    opacity: 0.90,
    position: [0, 1.18, 0.10],
    scale: [1, 0.70, 0.85],
    radius: 0.050,
    shape: 'sphere',
    description: 'Master endocrine gland — regulates hormones body-wide',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EYES  —  inside orbital sockets
  //   Eye surface: Y 0.6–1.2, Z 0.70–1.00, X≈±0.50
  //   Eyeball center: Z ≈ 0.58 (just behind surface), radius ≈ 0.095
  //   Iris: Z ≈ 0.68 (front of eyeball)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-eyeball',
    label: 'Left Eyeball',
    category: 'eye',
    color: '#dff4ff',
    emissive: '#001533',
    opacity: 0.92,
    position: [-0.50, 0.90, 0.58],
    radius: 0.095,
    shape: 'sphere',
    description: 'Globe of the eye — contains lens, retina & vitreous humor',
  },
  {
    id: 'right-eyeball',
    label: 'Right Eyeball',
    category: 'eye',
    color: '#dff4ff',
    emissive: '#001533',
    opacity: 0.92,
    position: [0.50, 0.90, 0.58],
    radius: 0.095,
    shape: 'sphere',
    description: 'Globe of the eye — contains lens, retina & vitreous humor',
  },
  {
    id: 'left-iris',
    label: 'Left Iris',
    category: 'eye',
    color: '#3388cc',
    emissive: '#001a44',
    opacity: 0.95,
    position: [-0.50, 0.90, 0.68],
    scale: [1, 1, 0.20],
    radius: 0.050,
    shape: 'sphere',
    description: 'Pigmented ring controlling pupil size and light entry',
  },
  {
    id: 'right-iris',
    label: 'Right Iris',
    category: 'eye',
    color: '#3388cc',
    emissive: '#001a44',
    opacity: 0.95,
    position: [0.50, 0.90, 0.68],
    scale: [1, 1, 0.20],
    radius: 0.050,
    shape: 'sphere',
    description: 'Pigmented ring controlling pupil size and light entry',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // OPTIC NERVES & CHIASM
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'optic-chiasm',
    label: 'Optic Chiasm',
    category: 'nerve',
    color: '#ffd700',
    emissive: '#332200',
    opacity: 0.82,
    // Crossing point mid-base of brain; Y≈1.10, Z≈0.18
    position: [0, 1.10, 0.18],
    scale: [0.70, 0.25, 0.35],
    radius: 0.060,
    shape: 'sphere',
    description: 'Crossing point of optic nerves at base of brain',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SINUSES  —  air cavities inside facial skeleton
  //   Keep Z well BELOW surface to stay inside skull
  //   Frontal: behind brow Y≈1.38, Z≈0.38 (surface forehead Z≈0.70)
  //   Ethmoid: between eyes Y≈1.00, Z≈0.38
  //   Sphenoid: deep central Y≈1.10, Z≈0.02
  //   Maxillary: behind cheeks (cheek surface Z≈0.6), interior Z≈0.30
  //   Nasal: behind nose Y≈0.38, Z≈0.50
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'frontal-sinus',
    label: 'Frontal Sinus',
    category: 'sinus',
    color: '#aaddff',
    emissive: '#001a33',
    opacity: 0.42,
    position: [0, 1.38, 0.38],
    scale: [0.88, 0.35, 0.48],
    radius: 0.18,
    shape: 'sphere',
    description: 'Air-filled cavity in the frontal bone — common site of sinusitis',
  },
  {
    id: 'ethmoid-sinus',
    label: 'Ethmoid Sinus',
    category: 'sinus',
    color: '#99ccee',
    emissive: '#001a33',
    opacity: 0.42,
    position: [0, 1.00, 0.38],
    scale: [0.38, 0.50, 0.32],
    radius: 0.115,
    shape: 'sphere',
    description: 'Honeycomb air cells between eyes & nose bridge',
  },
  {
    id: 'sphenoid-sinus',
    label: 'Sphenoid Sinus',
    category: 'sinus',
    color: '#77bbee',
    emissive: '#001a33',
    opacity: 0.40,
    position: [0, 1.10, 0.02],
    scale: [0.68, 0.42, 0.50],
    radius: 0.138,
    shape: 'sphere',
    description: 'Deep sinus in the sphenoid bone — near pituitary gland',
  },
  {
    id: 'left-maxillary-sinus',
    label: 'Left Maxillary Sinus',
    category: 'sinus',
    color: '#88ccff',
    emissive: '#001a33',
    opacity: 0.42,
    // Cheek surface Z≈0.60; sinus interior Z≈0.30, X≈-0.40
    position: [-0.40, 0.18, 0.30],
    scale: [0.65, 0.88, 0.55],
    radius: 0.155,
    shape: 'sphere',
    description: 'Largest paranasal sinus — drains into the nasal cavity',
  },
  {
    id: 'right-maxillary-sinus',
    label: 'Right Maxillary Sinus',
    category: 'sinus',
    color: '#88ccff',
    emissive: '#001a33',
    opacity: 0.42,
    position: [0.40, 0.18, 0.30],
    scale: [0.65, 0.88, 0.55],
    radius: 0.155,
    shape: 'sphere',
    description: 'Largest paranasal sinus — drains into the nasal cavity',
  },
  {
    id: 'nasal-cavity',
    label: 'Nasal Cavity',
    category: 'sinus',
    color: '#ffb8a0',
    emissive: '#330800',
    opacity: 0.48,
    // Behind nose bridge; Z≈0.50 (nose surface Z≈0.80+), Y≈0.38
    position: [0, 0.38, 0.50],
    scale: [0.28, 0.52, 0.40],
    radius: 0.120,
    shape: 'sphere',
    description: 'Air passage filtering & humidifying inhaled air',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ORAL ANATOMY  —  inside mouth cavity
  //   Mouth surface: Y -0.6–0.0, Z 0.70–1.10
  //   Interior: Z≈0.42–0.56
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'tongue',
    label: 'Tongue',
    category: 'oral',
    color: '#dd3030',
    emissive: '#330000',
    opacity: 0.70,
    // Mouth interior; Y≈-0.22, Z≈0.45 — well inside
    position: [0, -0.22, 0.45],
    scale: [0.65, 0.28, 0.75],
    radius: 0.165,
    shape: 'sphere',
    description: 'Muscular organ for taste, chewing & speech',
  },
  {
    id: 'hard-palate',
    label: 'Hard Palate',
    category: 'oral',
    color: '#ffccaa',
    emissive: '#220800',
    opacity: 0.60,
    // Roof of mouth; Y≈-0.05, Z≈0.48
    position: [0, -0.05, 0.48],
    width: 0.48, boxHeight: 0.030, depth: 0.28,
    shape: 'box',
    description: 'Bony roof of the mouth separating oral & nasal cavities',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INNER EAR  —  inside temporal bone
  //   Temporal bone lateral extent: X ≈ ±0.62 at Y≈1.05
  //   Inner ear: X≈±0.60, Y≈1.05, Z≈-0.02 (just inside temporal bone)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-inner-ear',
    label: 'Left Inner Ear',
    category: 'nerve',
    color: '#ffcc55',
    emissive: '#332200',
    opacity: 0.78,
    position: [-0.60, 1.05, -0.02],
    radius: 0.068,
    shape: 'sphere',
    description: 'Contains cochlea & semicircular canals — hearing & balance',
  },
  {
    id: 'right-inner-ear',
    label: 'Right Inner Ear',
    category: 'nerve',
    color: '#ffcc55',
    emissive: '#332200',
    opacity: 0.78,
    position: [0.60, 1.05, -0.02],
    radius: 0.068,
    shape: 'sphere',
    description: 'Contains cochlea & semicircular canals — hearing & balance',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SALIVARY GLANDS
  //   Parotid: in front of ear — X≈±0.58, Y≈0.18, Z≈0.25
  //   (model width at Y≈0.18 is about X ±0.65 max)
  //   Submandibular: under jaw — X≈±0.32, Y≈-0.68, Z≈0.22
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-parotid',
    label: 'Left Parotid Gland',
    category: 'gland',
    color: '#ffbb80',
    emissive: '#221100',
    opacity: 0.55,
    // Narrowed X to 0.50 (was 0.58) and reduced radius to 0.085
    position: [-0.50, 0.18, 0.22],
    scale: [0.40, 0.50, 0.38],
    radius: 0.085,
    shape: 'sphere',
    description: 'Largest salivary gland — in front of & below the ear',
  },
  {
    id: 'right-parotid',
    label: 'Right Parotid Gland',
    category: 'gland',
    color: '#ffbb80',
    emissive: '#221100',
    opacity: 0.55,
    position: [0.50, 0.18, 0.22],
    scale: [0.40, 0.50, 0.38],
    radius: 0.085,
    shape: 'sphere',
    description: 'Largest salivary gland — in front of & below the ear',
  },
  {
    id: 'submandibular-left',
    label: 'Left Submandibular Gland',
    category: 'gland',
    color: '#ffaa66',
    emissive: '#221100',
    opacity: 0.55,
    // Under jaw; jaw surface bottom Y≈-1.2; gland just above at Y≈-0.68
    position: [-0.32, -0.68, 0.22],
    scale: [0.52, 0.38, 0.42],
    radius: 0.095,
    shape: 'sphere',
    description: 'Under the lower jawbone — second largest salivary gland',
  },
  {
    id: 'submandibular-right',
    label: 'Right Submandibular Gland',
    category: 'gland',
    color: '#ffaa66',
    emissive: '#221100',
    opacity: 0.55,
    position: [0.32, -0.68, 0.22],
    scale: [0.52, 0.38, 0.42],
    radius: 0.095,
    shape: 'sphere',
    description: 'Under the lower jawbone — second largest salivary gland',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MANDIBLE (JAW BONE)
  //   Jaw surface: Y -1.2 to -0.6, Z 0.50–1.00
  //   Bone is interior; Y≈-0.85, Z≈0.52 — keep X narrow (wide flat bone)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'mandible',
    label: 'Mandible (Jaw Bone)',
    category: 'spine',
    color: '#eeeed0',
    emissive: '#111100',
    opacity: 0.45,
    position: [0, -0.85, 0.52],
    scale: [2.00, 0.22, 0.68],
    radius: 0.18,
    shape: 'sphere',
    description: 'Lower jaw bone — the only movable bone of the skull',
  },
  {
    id: 'hyoid-bone',
    label: 'Hyoid Bone',
    category: 'spine',
    color: '#eeeedd',
    emissive: '#111100',
    opacity: 0.75,
    // U-shaped above larynx; Y≈-1.05, Z≈0.22
    // (jaw ends at Y≈-1.2; hyoid is just below)
    position: [0, -1.05, 0.22],
    scale: [0.72, 0.18, 0.32],
    radius: 0.065,
    shape: 'sphere',
    description: 'U-shaped bone above the larynx — anchors tongue muscles',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RESPIRATORY TRACT — inside neck (Y: -1.6 to -1.2)
  //   Neck is narrow: X safe ≈ ±0.25, Z front ≈ 0.05→0.28
  //   Larynx:    Y≈-1.18, Z≈0.20
  //   Trachea:   Y≈-1.40 center, Z≈0.15, height≈0.30
  //   Esophagus: Y≈-1.40 center, Z≈0.02, height≈0.30
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'larynx',
    label: 'Larynx (Voice Box)',
    category: 'respiratory',
    color: '#66ccbb',
    emissive: '#002211',
    opacity: 0.68,
    position: [0, -1.18, 0.20],
    scale: [0.78, 0.55, 0.60],
    radius: 0.110,
    shape: 'sphere',
    description: 'Voice box — contains vocal cords; controls sound production',
  },
  {
    id: 'trachea',
    label: 'Trachea',
    category: 'respiratory',
    color: '#88ddcc',
    emissive: '#002211',
    opacity: 0.60,
    position: [0, -1.42, 0.15],
    radiusTop: 0.048, radiusBottom: 0.048, height: 0.26, radialSegments: 12,
    shape: 'cylinder',
    description: 'Windpipe — conducts air between larynx and lungs',
  },
  {
    id: 'esophagus',
    label: 'Esophagus',
    category: 'respiratory',
    color: '#886655',
    emissive: '#110500',
    opacity: 0.55,
    position: [0, -1.42, 0.02],
    radiusTop: 0.038, radiusBottom: 0.038, height: 0.26, radialSegments: 10,
    shape: 'cylinder',
    description: 'Food passage from throat to stomach — behind trachea',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // THYROID GLAND — butterfly shape in front of neck
  //   Below larynx; Y≈-1.35, Z≈0.20, X narrow ±0.22
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'thyroid',
    label: 'Thyroid Gland',
    category: 'gland',
    color: '#ff9966',
    emissive: '#221100',
    opacity: 0.68,
    position: [0, -1.35, 0.20],
    scale: [1.15, 0.30, 0.42],
    radius: 0.130,
    shape: 'sphere',
    description: 'Butterfly-shaped neck gland — regulates metabolism & energy',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VASCULAR  —  carotid arteries & jugular veins (carotid sheath)
  //   Neck interior: X≈±0.15 (carotid), X≈±0.24 (jugular)
  //   Center Y≈-1.15 (mid neck), height≈0.70 (Y from -0.80 to -1.50)
  //   Z≈0.05–0.10 (anterior to spine, posterior to trachea)
  //   Vessels MUST stay within neck width (X safe ≤ ±0.28)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-carotid',
    label: 'Left Carotid Artery',
    category: 'vascular',
    color: '#ff4444',
    emissive: '#330000',
    opacity: 0.75,
    // Center Y=-1.06 → spans Y -0.82 to -1.30 (fully inside neck region)
    position: [-0.15, -1.06, 0.06],
    radiusTop: 0.024, radiusBottom: 0.024, height: 0.48, radialSegments: 10,
    shape: 'cylinder',
    description: 'Main artery supplying blood to the brain, face & neck',
  },
  {
    id: 'right-carotid',
    label: 'Right Carotid Artery',
    category: 'vascular',
    color: '#ff4444',
    emissive: '#330000',
    opacity: 0.75,
    position: [0.15, -1.06, 0.06],
    radiusTop: 0.024, radiusBottom: 0.024, height: 0.48, radialSegments: 10,
    shape: 'cylinder',
    description: 'Main artery supplying blood to the brain, face & neck',
  },
  {
    id: 'left-jugular',
    label: 'Left Jugular Vein',
    category: 'vascular',
    color: '#6666ff',
    emissive: '#000033',
    opacity: 0.62,
    position: [-0.24, -1.06, 0.10],
    radiusTop: 0.030, radiusBottom: 0.030, height: 0.48, radialSegments: 10,
    shape: 'cylinder',
    description: 'Drains deoxygenated blood from head & neck to the heart',
  },
  {
    id: 'right-jugular',
    label: 'Right Jugular Vein',
    category: 'vascular',
    color: '#6666ff',
    emissive: '#000033',
    opacity: 0.62,
    position: [0.24, -1.06, 0.10],
    radiusTop: 0.030, radiusBottom: 0.030, height: 0.48, radialSegments: 10,
    shape: 'cylinder',
    description: 'Drains deoxygenated blood from head & neck to the heart',
  },
  {
    id: 'basilar-artery',
    label: 'Basilar Artery',
    category: 'vascular',
    color: '#ff6666',
    emissive: '#330000',
    opacity: 0.70,
    // Up front of brainstem; Y≈0.72 center, Z≈-0.22
    position: [0, 0.72, -0.22],
    radiusTop: 0.018, radiusBottom: 0.018, height: 0.38, radialSegments: 8,
    shape: 'cylinder',
    description: 'Supplies blood to brainstem, cerebellum & posterior brain',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CERVICAL SPINE  —  C1 to C7 vertebrae + spinal cord
  //   Perfectly posterior: Z≈-0.38 (well inside back of neck)
  //   Model back surface: Z≈-0.30 at neck; vertebrae safe at Z≈-0.38
  //   C1 at base of skull: Y≈0.28 (foramen magnum)
  //   Each vertebra steps down 0.24 in Y
  //   C1: Y=0.28, C2: Y=0.04, C3: Y=-0.20, C4: Y=-0.44
  //   C5: Y=-0.68, C6: Y=-0.92, C7: Y=-1.16
  //   Vertebra radius: 0.12 (fits in X ±0.12 — inside neck)
  //   Vertebra height: 0.14
  // ══════════════════════════════════════════════════════════════════════════
  ...Array.from({ length: 7 }, (_, i): OrganDef => ({
    id: `vertebra-c${i + 1}`,
    label: `C${i + 1} Vertebra`,
    category: 'spine',
    color: '#e8e8c8',
    emissive: '#111100',
    opacity: 0.80,
    position: [0, 0.28 - i * 0.24, -0.38],
    radiusTop: 0.12, radiusBottom: 0.12, height: 0.14, radialSegments: 8,
    shape: 'cylinder',
    description: `Cervical vertebra C${i + 1} — part of the protective spinal column`,
  })),

  {
    id: 'spinal-cord',
    label: 'Spinal Cord',
    category: 'nerve',
    color: '#fff0aa',
    emissive: '#332200',
    opacity: 0.68,
    // Through vertebral canal center; Y≈-0.38 center, Z≈-0.38
    // Spans C1 (Y=0.28) to C7 (Y=-1.16), total height≈1.44; center≈-0.44
    position: [0, -0.44, -0.38],
    radiusTop: 0.028, radiusBottom: 0.028, height: 1.44, radialSegments: 8,
    shape: 'cylinder',
    description: 'Runs through vertebral canal — carries nerve signals from brain to body',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TRIGEMINAL NERVES  —  exiting brain at pons level
  //   Y≈1.00, X≈±0.36, Z≈0.12 (inside skull, lateral to brainstem)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'trigeminal-left',
    label: 'Left Trigeminal Nerve (V)',
    category: 'nerve',
    color: '#ffee44',
    emissive: '#332200',
    opacity: 0.65,
    position: [-0.36, 1.00, 0.12],
    scale: [0.40, 0.40, 0.90],
    radius: 0.080,
    shape: 'sphere',
    description: 'Cranial nerve V — facial sensation & chewing motor control',
  },
  {
    id: 'trigeminal-right',
    label: 'Right Trigeminal Nerve (V)',
    category: 'nerve',
    color: '#ffee44',
    emissive: '#332200',
    opacity: 0.65,
    position: [0.36, 1.00, 0.12],
    scale: [0.40, 0.40, 0.90],
    radius: 0.080,
    shape: 'sphere',
    description: 'Cranial nerve V — facial sensation & chewing motor control',
  },
];

// ─── Single organ mesh component ──────────────────────────────────────────────
function OrganMesh({ organ, visible }: { organ: OrganDef; visible: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (hovered) {
      const s = 1.0 + Math.sin(Date.now() * 0.004) * 0.04;
      meshRef.current.scale.set(
        (organ.scale?.[0] ?? 1) * s,
        (organ.scale?.[1] ?? 1) * s,
        (organ.scale?.[2] ?? 1) * s
      );
    } else {
      const target = new THREE.Vector3(
        organ.scale?.[0] ?? 1,
        organ.scale?.[1] ?? 1,
        organ.scale?.[2] ?? 1
      );
      meshRef.current.scale.lerp(target, delta * 6);
    }
  });

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(organ.color),
        emissive: new THREE.Color(organ.emissive ?? '#000000'),
        emissiveIntensity: hovered ? 0.70 : 0.28,
        transparent: true,
        opacity: hovered ? Math.min(organ.opacity + 0.20, 0.96) : organ.opacity,
        roughness: 0.28,
        metalness: 0.04,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organ.color, organ.emissive, organ.opacity, hovered]
  );

  if (!visible) return null;

  const rot = organ.rotation ?? [0, 0, 0];

  const labelY =
    organ.shape === 'cylinder'
      ? (organ.height ?? 0.30) / 2 + 0.08
      : (organ.radius ?? 0.15) + 0.08;

  return (
    <mesh
      ref={meshRef}
      position={organ.position}
      scale={organ.scale ?? [1, 1, 1]}
      rotation={rot as [number, number, number]}
      onPointerEnter={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerLeave={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      renderOrder={1}
    >
      {organ.shape === 'sphere' && <sphereGeometry args={[organ.radius ?? 0.15, 28, 20]} />}
      {organ.shape === 'cylinder' && (
        <cylinderGeometry args={[organ.radiusTop ?? 0.05, organ.radiusBottom ?? 0.05, organ.height ?? 0.30, organ.radialSegments ?? 12]} />
      )}
      {organ.shape === 'box' && (
        <boxGeometry args={[organ.width ?? 0.40, organ.boxHeight ?? 0.03, organ.depth ?? 0.28]} />
      )}
      <primitive object={material} attach="material" />

      {hovered && (
        <Html
          position={[0, labelY, 0]}
          center
          distanceFactor={4}
          zIndexRange={[100, 200]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(8,8,20,0.94)',
            border: `1px solid ${organ.color}`,
            borderRadius: '10px',
            padding: '6px 12px',
            minWidth: '155px',
            maxWidth: '220px',
            boxShadow: `0 0 14px ${organ.color}55`,
            fontFamily: "'Space Grotesk', sans-serif",
            pointerEvents: 'none',
            whiteSpace: 'normal',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: organ.color, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '3px' }}>
              {organ.label}
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>
              {organ.description}
            </div>
            <div style={{ marginTop: '4px', fontSize: '9px', color: CATEGORY_META[organ.category].color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {CATEGORY_META[organ.category].label}
            </div>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
interface HeadOrgansProps {
  visible: boolean;
  activeCategories: Set<OrganCategory>;
}

export function HeadOrgans({ visible, activeCategories }: HeadOrgansProps) {
  if (!visible) return null;
  return (
    <group>
      {ORGANS.map((organ) => (
        <OrganMesh key={organ.id} organ={organ} visible={activeCategories.has(organ.category)} />
      ))}
    </group>
  );
}
