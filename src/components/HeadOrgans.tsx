/**
 * HeadOrgans.tsx — Internal anatomy for LeePerrySmith.glb
 *
 * ACTUAL geometry bounds (measured from console):
 *   Y: -3.97 → +3.97   (total 7.94)
 *   X: -4.28 → +4.28   (total 8.56)
 *   Z: -2.59 → +2.55   (total ~5.14)
 *
 * User's anatomical table was in a "logical" space where total Y = 4.0.
 * Scale factor = 7.94 / 4.0 ≈ 1.985 (call it 2.0 for simplicity).
 *
 * CONVERSION: real_coord = user_table_coord × 2.0
 *
 * Organ positions below use REAL geometry coordinates (pre-group-scale={2}).
 * The parent group has scale={2} applied in App.tsx for rendering,
 * but the mesh geometry, raycasting, and worldToLocal all operate
 * in this raw LOCAL geometry space.
 *
 * Surface boundaries in real coordinates:
 *   Forehead   Y  2.4→4.8   Z  1.0→2.2
 *   Eyes       Y  1.2→2.4   Z  1.4→2.0   X ≈ ±1.0
 *   Nose       Y  0.0→1.6   Z  1.6→2.55  (nose tip Z≈2.55)
 *   Cheeks     Y -0.4→1.2   Z  0.8→1.8
 *   Lips/Mouth Y -1.2→0.0   Z  1.4→2.2
 *   Jaw/Chin   Y -2.4→-1.2  Z  1.0→2.0
 *   Neck       Y -3.2→-2.4
 *
 * Internal organs sit 0.3–0.8 units BEHIND the surface in Z.
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

// ─── Organ data type ──────────────────────────────────────────────────────────
type OrganDef = {
  id: string;
  label: string;
  category: OrganCategory;
  color: string;
  emissive?: string;
  opacity: number;
  // position in REAL local geometry coords (user_table × 2)
  position: [number, number, number];
  scale?: [number, number, number];
  rotation?: [number, number, number];
  shape: 'sphere' | 'cylinder' | 'box' | 'torus';
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  radialSegments?: number;
  width?: number;
  depth?: number;
  torusRadius?: number;
  tube?: number;
  description: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate derivation formula used throughout:
//   position[Y] = user_Y × 2
//   position[X] = user_X × 2  (scaled same)
//   position[Z] = user_Z × 2  (nose tip was 1.2 → 2.4; back was -1.0 → -2.0)
//   radius      = user_radius × 2
//   height      = user_height × 2
// ─────────────────────────────────────────────────────────────────────────────
const ORGANS: OrganDef[] = [

  // ══════════════════════════════════════════════════════════════════════════
  // BRAIN  (user: center Y=1.62, Z=-0.10 → real: Y=3.24, Z=-0.20)
  //        (user radius=0.72 → real radius=1.44)
  //        Fits: Y 1.80–4.68, Z -1.64 to +0.60 ✓ inside skull
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'cerebrum',
    label: 'Cerebrum',
    category: 'brain',
    color: '#ff9eb5',
    emissive: '#3d0010',
    opacity: 0.45,
    position: [0, 3.24, -0.20],
    scale: [1.00, 0.88, 1.00],
    radius: 0.96,
    shape: 'sphere',
    description: 'Largest brain division — controls cognition, motor & sensory functions',
  },
  {
    id: 'left-temporal-lobe',
    label: 'Left Temporal Lobe',
    category: 'brain',
    color: '#ff7a9a',
    emissive: '#3d0010',
    opacity: 0.42,
    position: [-1.30, 2.76, 0.00],
    scale: [0.48, 0.60, 0.78],
    radius: 0.64,
    shape: 'sphere',
    description: 'Processes auditory information, language comprehension & memory',
  },
  {
    id: 'right-temporal-lobe',
    label: 'Right Temporal Lobe',
    category: 'brain',
    color: '#ff7a9a',
    emissive: '#3d0010',
    opacity: 0.42,
    position: [1.30, 2.76, 0.00],
    scale: [0.48, 0.60, 0.78],
    radius: 0.64,
    shape: 'sphere',
    description: 'Processes auditory information, language & facial recognition',
  },
  {
    id: 'cerebellum',
    label: 'Cerebellum',
    category: 'brain',
    color: '#e8607a',
    emissive: '#3d0010',
    opacity: 0.52,
    // Posterior inferior; user: Y=1.10, Z=-0.68 → real: Y=2.20, Z=-1.36
    position: [0, 2.20, -1.36],
    scale: [0.82, 0.56, 0.65],
    radius: 0.62,
    shape: 'sphere',
    description: 'Controls balance, coordination & fine motor movement',
  },
  {
    id: 'brainstem',
    label: 'Brain Stem',
    category: 'brain',
    color: '#c93050',
    emissive: '#3d0010',
    opacity: 0.68,
    // user: Y=0.82, Z=-0.38 → real: Y=1.64, Z=-0.76
    position: [0, 1.64, -0.76],
    radiusTop: 0.28, radiusBottom: 0.22, height: 1.24, radialSegments: 16,
    shape: 'cylinder',
    description: 'Controls breathing, heart rate & basic autonomic functions',
  },
  {
    id: 'hypothalamus',
    label: 'Hypothalamus',
    category: 'brain',
    color: '#ffb8cc',
    emissive: '#2a0010',
    opacity: 0.65,
    // user: Y=1.20, Z=0.08 → real: Y=2.40, Z=0.16
    position: [0, 2.40, 0.16],
    scale: [0.55, 0.38, 0.50],
    radius: 0.26,
    shape: 'sphere',
    description: 'Regulates body temperature, hunger, thirst & hormone release',
  },
  {
    id: 'corpus-callosum',
    label: 'Corpus Callosum',
    category: 'brain',
    color: '#ff7098',
    emissive: '#2a0010',
    opacity: 0.50,
    // user: Y=1.68, Z=-0.08 → real: Y=3.36, Z=-0.16
    position: [0, 3.36, -0.16],
    scale: [0.68, 0.11, 0.48],
    radius: 0.90,
    shape: 'sphere',
    description: 'Thick nerve band connecting left & right cerebral hemispheres',
  },
  {
    id: 'pineal-gland',
    label: 'Pineal Gland',
    category: 'gland',
    color: '#ffcc88',
    emissive: '#221100',
    opacity: 0.82,
    // user: Y=1.52, Z=-0.22 → real: Y=3.04, Z=-0.44
    position: [0, 3.04, -0.44],
    radius: 0.11,
    shape: 'sphere',
    description: 'Produces melatonin — regulates sleep-wake cycles',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EYES  (user: Y=0.92, X=±0.50, Z=0.62 → real: Y=1.84, X=±1.0, Z=1.24)
  //        (user radius=0.175 → real radius=0.35)
  //        Eye surface: Y 1.2–2.4, Z 1.4–2.0 ✓ eyes fit inside at Z=1.24
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-eyeball',
    label: 'Left Eyeball',
    category: 'eye',
    color: '#dff4ff',
    emissive: '#001533',
    opacity: 0.92,
    position: [-1.00, 1.84, 1.24],
    radius: 0.35,
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
    position: [1.00, 1.84, 1.24],
    radius: 0.35,
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
    position: [-1.00, 1.84, 1.58],
    scale: [1, 1, 0.25],
    radius: 0.17,
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
    position: [1.00, 1.84, 1.58],
    scale: [1, 1, 0.25],
    radius: 0.17,
    shape: 'sphere',
    description: 'Pigmented ring controlling pupil size and light entry',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SINUSES  (all coords × 2 from user table)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'frontal-sinus',
    label: 'Frontal Sinus',
    category: 'sinus',
    color: '#aaddff',
    emissive: '#001a33',
    opacity: 0.40,
    // user: Y=1.40, Z=0.45 → real: Y=2.80, Z=0.90
    position: [0, 2.80, 0.90],
    scale: [0.90, 0.38, 0.50],
    radius: 0.40,
    shape: 'sphere',
    description: 'Air-filled cavity in the frontal bone — common site of sinusitis',
  },
  {
    id: 'ethmoid-sinus',
    label: 'Ethmoid Sinus',
    category: 'sinus',
    color: '#99ccee',
    emissive: '#001a33',
    opacity: 0.40,
    // user: Y=1.00, Z=0.50 → real: Y=2.00, Z=1.00
    position: [0, 2.00, 1.00],
    scale: [0.40, 0.52, 0.35],
    radius: 0.34,
    shape: 'sphere',
    description: 'Honeycomb air cells between the eyes & nose bridge',
  },
  {
    id: 'sphenoid-sinus',
    label: 'Sphenoid Sinus',
    category: 'sinus',
    color: '#77bbee',
    emissive: '#001a33',
    opacity: 0.38,
    // user: Y=1.10, Z=0.05 → real: Y=2.20, Z=0.10
    position: [0, 2.20, 0.10],
    scale: [0.72, 0.45, 0.55],
    radius: 0.40,
    shape: 'sphere',
    description: 'Deep sinus in the sphenoid bone — near pituitary gland',
  },
  {
    id: 'left-maxillary-sinus',
    label: 'Left Maxillary Sinus',
    category: 'sinus',
    color: '#88ccff',
    emissive: '#001a33',
    opacity: 0.40,
    // user: Y=0.18, X=-0.50, Z=0.38 → real: Y=0.36, X=-1.00, Z=0.76
    position: [-1.00, 0.36, 0.76],
    scale: [0.68, 0.95, 0.60],
    radius: 0.36,
    shape: 'sphere',
    description: 'Largest paranasal sinus — drains into the nasal cavity',
  },
  {
    id: 'right-maxillary-sinus',
    label: 'Right Maxillary Sinus',
    category: 'sinus',
    color: '#88ccff',
    emissive: '#001a33',
    opacity: 0.40,
    position: [1.00, 0.36, 0.76],
    scale: [0.68, 0.95, 0.60],
    radius: 0.36,
    shape: 'sphere',
    description: 'Largest paranasal sinus — drains into the nasal cavity',
  },
  {
    id: 'nasal-cavity',
    label: 'Nasal Cavity',
    category: 'sinus',
    color: '#ffb8a0',
    emissive: '#330800',
    opacity: 0.45,
    // user: Y=0.35, Z=0.62 → real: Y=0.70, Z=1.24
    position: [0, 0.70, 1.24],
    scale: [0.30, 0.55, 0.42],
    radius: 0.24,
    shape: 'sphere',
    description: 'Air passage filtering & humidifying inhaled air',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ORAL ANATOMY  (all coords × 2)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'tongue',
    label: 'Tongue',
    category: 'oral',
    color: '#dd3030',
    emissive: '#330000',
    opacity: 0.68,
    // user: Y=-0.25, Z=0.52 → real: Y=-0.50, Z=1.04
    position: [0, -0.50, 1.04],
    scale: [0.68, 0.30, 0.85],
    radius: 0.38,
    shape: 'sphere',
    description: 'Muscular organ for taste, chewing & speech',
  },
  {
    id: 'hard-palate',
    label: 'Hard Palate',
    category: 'oral',
    color: '#ffccaa',
    emissive: '#220800',
    opacity: 0.58,
    // user: Y=-0.08, Z=0.55 → real: Y=-0.16, Z=1.10
    position: [0, -0.16, 1.10],
    scale: [1.5, 0.10, 0.75],
    width: 1.10, height: 0.08, depth: 0.70,
    shape: 'box',
    description: 'Bony roof of the mouth separating oral & nasal cavities',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // OPTIC NERVES  (all coords × 2)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-optic-nerve',
    label: 'Left Optic Nerve',
    category: 'nerve',
    color: '#ffe066',
    emissive: '#332200',
    opacity: 0.72,
    position: [-0.60, 1.90, 0.76],
    rotation: [0, -0.55, 0.28],
    radiusTop: 0.056, radiusBottom: 0.056, height: 0.96, radialSegments: 10,
    shape: 'cylinder',
    description: 'Transmits visual signals from the retina to the brain',
  },
  {
    id: 'right-optic-nerve',
    label: 'Right Optic Nerve',
    category: 'nerve',
    color: '#ffe066',
    emissive: '#332200',
    opacity: 0.72,
    position: [0.60, 1.90, 0.76],
    rotation: [0, 0.55, -0.28],
    radiusTop: 0.056, radiusBottom: 0.056, height: 0.96, radialSegments: 10,
    shape: 'cylinder',
    description: 'Transmits visual signals from the retina to the brain',
  },
  {
    id: 'optic-chiasm',
    label: 'Optic Chiasm',
    category: 'nerve',
    color: '#ffd700',
    emissive: '#332200',
    opacity: 0.80,
    position: [0, 2.20, 0.40],
    scale: [0.80, 0.28, 0.35],
    radius: 0.17,
    shape: 'sphere',
    description: 'Crossing point of optic nerves at base of brain',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PITUITARY GLAND  (user: Y=1.18, Z=0.10 → real: Y=2.36, Z=0.20)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'pituitary-gland',
    label: 'Pituitary Gland',
    category: 'gland',
    color: '#ffaa44',
    emissive: '#332200',
    opacity: 0.88,
    position: [0, 2.36, 0.20],
    scale: [1, 0.70, 0.85],
    radius: 0.15,
    shape: 'sphere',
    description: 'Master endocrine gland — regulates hormones body-wide',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // INNER EAR  (user: X=±0.85, Y=1.05, Z=-0.05 → real: X=±1.70, Y=2.10, Z=-0.10)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-inner-ear',
    label: 'Left Inner Ear',
    category: 'nerve',
    color: '#ffcc55',
    emissive: '#332200',
    opacity: 0.75,
    position: [-1.70, 2.10, -0.10],
    scale: [0.38, 0.38, 0.50],
    radius: 0.22,
    shape: 'sphere',
    description: 'Contains cochlea & semicircular canals — hearing & balance',
  },
  {
    id: 'right-inner-ear',
    label: 'Right Inner Ear',
    category: 'nerve',
    color: '#ffcc55',
    emissive: '#332200',
    opacity: 0.75,
    position: [1.70, 2.10, -0.10],
    scale: [0.38, 0.38, 0.50],
    radius: 0.22,
    shape: 'sphere',
    description: 'Contains cochlea & semicircular canals — hearing & balance',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // TRIGEMINAL & FACIAL NERVES  (all × 2)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'trigeminal-left',
    label: 'Left Trigeminal Nerve (V)',
    category: 'nerve',
    color: '#ffee44',
    emissive: '#332200',
    opacity: 0.62,
    position: [-1.00, 2.00, 0.40],
    scale: [0.42, 0.42, 1.10],
    radius: 0.28,
    shape: 'sphere',
    description: 'Cranial nerve V — controls facial sensation & chewing',
  },
  {
    id: 'trigeminal-right',
    label: 'Right Trigeminal Nerve (V)',
    category: 'nerve',
    color: '#ffee44',
    emissive: '#332200',
    opacity: 0.62,
    position: [1.00, 2.00, 0.40],
    scale: [0.42, 0.42, 1.10],
    radius: 0.28,
    shape: 'sphere',
    description: 'Cranial nerve V — controls facial sensation & chewing',
  },
  {
    id: 'facial-nerve-left',
    label: 'Left Facial Nerve (VII)',
    category: 'nerve',
    color: '#ffdd22',
    emissive: '#332200',
    opacity: 0.58,
    position: [-1.56, 1.36, 0.50],
    scale: [0.30, 0.30, 1.00],
    radius: 0.22,
    shape: 'sphere',
    description: 'Cranial nerve VII — controls facial muscles & taste',
  },
  {
    id: 'facial-nerve-right',
    label: 'Right Facial Nerve (VII)',
    category: 'nerve',
    color: '#ffdd22',
    emissive: '#332200',
    opacity: 0.58,
    position: [1.56, 1.36, 0.50],
    scale: [0.30, 0.30, 1.00],
    radius: 0.22,
    shape: 'sphere',
    description: 'Cranial nerve VII — controls facial muscles & taste',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SALIVARY GLANDS  (all × 2)
  //   Parotid: user Y=0.20, X=±0.88, Z=0.32 → real Y=0.40, X=±1.76, Z=0.64
  //   Submandibular: user Y=-0.65, X=±0.40, Z=0.30 → real Y=-1.30, X=±0.80, Z=0.60
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-parotid',
    label: 'Left Parotid Gland',
    category: 'gland',
    color: '#ffbb80',
    emissive: '#221100',
    opacity: 0.55,
    position: [-1.76, 0.40, 0.64],
    scale: [0.45, 0.60, 0.45],
    radius: 0.40,
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
    position: [1.76, 0.40, 0.64],
    scale: [0.45, 0.60, 0.45],
    radius: 0.40,
    shape: 'sphere',
    description: 'Largest salivary gland — in front of & below the ear',
  },
  {
    id: 'submandibular-left',
    label: 'Left Submandibular Gland',
    category: 'gland',
    color: '#ffaa66',
    emissive: '#221100',
    opacity: 0.52,
    position: [-0.80, -1.30, 0.60],
    scale: [0.56, 0.42, 0.48],
    radius: 0.30,
    shape: 'sphere',
    description: 'Second largest salivary gland — under the lower jawbone',
  },
  {
    id: 'submandibular-right',
    label: 'Right Submandibular Gland',
    category: 'gland',
    color: '#ffaa66',
    emissive: '#221100',
    opacity: 0.52,
    position: [0.80, -1.30, 0.60],
    scale: [0.56, 0.42, 0.48],
    radius: 0.30,
    shape: 'sphere',
    description: 'Second largest salivary gland — under the lower jawbone',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MANDIBLE & FACIAL BONES  (user × 2)
  //   Jaw surface: Y -1.2–-0.6 → real: Y -2.4–-1.2; bone at Y≈ -1.70, Z≈ 1.30
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'mandible',
    label: 'Mandible (Jaw Bone)',
    category: 'spine',
    color: '#eeeed0',
    emissive: '#111100',
    opacity: 0.45,
    position: [0, -1.70, 1.30],
    scale: [2.00, 0.28, 0.82],
    radius: 0.52,
    shape: 'sphere',
    description: 'Lower jaw bone — the only movable bone of the skull',
  },
  {
    id: 'zygomatic-left',
    label: 'Left Zygomatic Arch',
    category: 'spine',
    color: '#ddddc8',
    emissive: '#111100',
    opacity: 0.42,
    position: [-1.60, 0.84, 0.90],
    scale: [0.35, 0.22, 0.70],
    radius: 0.28,
    shape: 'sphere',
    description: 'Cheekbone — forms the lateral wall of the orbital socket',
  },
  {
    id: 'zygomatic-right',
    label: 'Right Zygomatic Arch',
    category: 'spine',
    color: '#ddddc8',
    emissive: '#111100',
    opacity: 0.42,
    position: [1.60, 0.84, 0.90],
    scale: [0.35, 0.22, 0.70],
    radius: 0.28,
    shape: 'sphere',
    description: 'Cheekbone — forms the lateral wall of the orbital socket',
  },
  {
    id: 'hyoid-bone',
    label: 'Hyoid Bone',
    category: 'spine',
    color: '#eeeedd',
    emissive: '#111100',
    opacity: 0.72,
    // user: Y=-1.12, Z=0.30 → real: Y=-2.24, Z=0.60
    position: [0, -2.24, 0.60],
    scale: [0.80, 0.20, 0.38],
    radius: 0.18,
    shape: 'sphere',
    description: 'U-shaped bone above the larynx — anchors tongue muscles',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RESPIRATORY TRACT  (user × 2)
  //   Neck real: Y -3.2 to -2.4 (surface)
  //   Larynx: user Y=-1.22, Z=0.22 → real Y=-2.44, Z=0.44
  //   Trachea: user Y=-1.38, Z=0.18 → real Y=-2.76, Z=0.36
  //   Esophagus: user Y=-1.38, Z=0.02 → real Y=-2.76, Z=0.04
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'larynx',
    label: 'Larynx (Voice Box)',
    category: 'respiratory',
    color: '#66ccbb',
    emissive: '#002211',
    opacity: 0.65,
    position: [0, -2.44, 0.44],
    scale: [0.82, 0.65, 0.68],
    radius: 0.32,
    shape: 'sphere',
    description: 'Voice box — contains vocal cords; controls sound production',
  },
  {
    id: 'trachea',
    label: 'Trachea',
    category: 'respiratory',
    color: '#88ddcc',
    emissive: '#002211',
    opacity: 0.58,
    position: [0, -2.76, 0.36],
    radiusTop: 0.17, radiusBottom: 0.17, height: 0.76, radialSegments: 14,
    shape: 'cylinder',
    description: 'Windpipe — conducts air between larynx and lungs',
  },
  {
    id: 'esophagus',
    label: 'Esophagus',
    category: 'respiratory',
    color: '#886655',
    emissive: '#110500',
    opacity: 0.52,
    position: [0, -2.76, 0.04],
    radiusTop: 0.13, radiusBottom: 0.13, height: 0.76, radialSegments: 12,
    shape: 'cylinder',
    description: 'Food passage from throat to stomach — runs behind trachea',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // THYROID  (user: Y=-1.45, Z=0.22 → real: Y=-2.90, Z=0.44)
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'thyroid',
    label: 'Thyroid Gland',
    category: 'gland',
    color: '#ff9966',
    emissive: '#221100',
    opacity: 0.65,
    position: [0, -2.90, 0.44],
    scale: [1.22, 0.36, 0.50],
    radius: 0.44,
    shape: 'sphere',
    description: 'Butterfly-shaped neck gland — regulates metabolism & energy',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VASCULAR  (user × 2)
  //   Carotid: user Y=-1.08 center, X=±0.20, Z=0.05 → real Y=-2.16, X=±0.40, Z=0.10
  //   Jugular: user Y=-1.08, X=±0.32, Z=0.12 → real Y=-2.16, X=±0.64, Z=0.24
  //   Height: user 1.05 → real 2.10 (spans Y -1.10 to -3.22; neck Y real: -3.2 to -2.4) ✓
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: 'left-carotid',
    label: 'Left Carotid Artery',
    category: 'vascular',
    color: '#ff4444',
    emissive: '#330000',
    opacity: 0.72,
    position: [-0.40, -2.16, 0.10],
    radiusTop: 0.080, radiusBottom: 0.080, height: 2.10, radialSegments: 12,
    shape: 'cylinder',
    description: 'Main artery supplying blood to the brain, face & neck',
  },
  {
    id: 'right-carotid',
    label: 'Right Carotid Artery',
    category: 'vascular',
    color: '#ff4444',
    emissive: '#330000',
    opacity: 0.72,
    position: [0.40, -2.16, 0.10],
    radiusTop: 0.080, radiusBottom: 0.080, height: 2.10, radialSegments: 12,
    shape: 'cylinder',
    description: 'Main artery supplying blood to the brain, face & neck',
  },
  {
    id: 'left-jugular',
    label: 'Left Jugular Vein',
    category: 'vascular',
    color: '#6666ff',
    emissive: '#000033',
    opacity: 0.58,
    position: [-0.64, -2.16, 0.24],
    radiusTop: 0.100, radiusBottom: 0.100, height: 2.10, radialSegments: 12,
    shape: 'cylinder',
    description: 'Drains deoxygenated blood from head & neck to the heart',
  },
  {
    id: 'right-jugular',
    label: 'Right Jugular Vein',
    category: 'vascular',
    color: '#6666ff',
    emissive: '#000033',
    opacity: 0.58,
    position: [0.64, -2.16, 0.24],
    radiusTop: 0.100, radiusBottom: 0.100, height: 2.10, radialSegments: 12,
    shape: 'cylinder',
    description: 'Drains deoxygenated blood from head & neck to the heart',
  },
  {
    id: 'basilar-artery',
    label: 'Basilar Artery',
    category: 'vascular',
    color: '#ff6666',
    emissive: '#330000',
    opacity: 0.68,
    // user: Y=0.72, Z=-0.28 → real: Y=1.44, Z=-0.56
    position: [0, 1.44, -0.56],
    radiusTop: 0.056, radiusBottom: 0.056, height: 0.96, radialSegments: 10,
    shape: 'cylinder',
    description: 'Supplies blood to brainstem, cerebellum & posterior brain',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CERVICAL SPINE C1–C7  (user table × 2)
  //   C1: user Y=0.30, Z=-0.42 → real Y=0.60, Z=-0.84
  //   Step:  user 0.25 → real 0.50 per vertebra
  //   Radius: user 0.18 → real 0.36
  //   Height: user 0.17 → real 0.34
  //   C1: Y=0.60, C2: Y=0.10, C3: Y=-0.40, C4: Y=-0.90
  //   C5: Y=-1.40, C6: Y=-1.90, C7: Y=-2.40  (all at Z=-0.84)
  // ══════════════════════════════════════════════════════════════════════════
  ...Array.from({ length: 7 }, (_, i): OrganDef => ({
    id: `vertebra-c${i + 1}`,
    label: `C${i + 1} Vertebra`,
    category: 'spine',
    color: '#e8e8c8',
    emissive: '#111100',
    opacity: 0.78,
    position: [0, 0.60 - i * 0.50, -0.84],
    radiusTop: 0.36, radiusBottom: 0.36, height: 0.34, radialSegments: 8,
    shape: 'cylinder',
    description: `Cervical vertebra C${i + 1} — part of the protective spinal column`,
  })),

  {
    id: 'spinal-cord',
    label: 'Spinal Cord',
    category: 'nerve',
    color: '#fff0aa',
    emissive: '#332200',
    opacity: 0.65,
    // user: Y=-0.45, Z=-0.44 → real: Y=-0.90, Z=-0.88
    position: [0, -0.90, -0.88],
    radiusTop: 0.084, radiusBottom: 0.084, height: 2.10, radialSegments: 10,
    shape: 'cylinder',
    description: 'Extends from brainstem — carries nerve signals between brain & body',
  },
];

// ─── Single organ mesh component ──────────────────────────────────────────────
function OrganMesh({ organ, visible }: { organ: OrganDef; visible: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (hovered) {
      meshRef.current.scale.setScalar(1.0 + Math.sin(Date.now() * 0.004) * 0.04);
    } else {
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 6);
    }
  });

  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(organ.color),
        emissive: new THREE.Color(organ.emissive ?? '#000000'),
        emissiveIntensity: hovered ? 0.70 : 0.28,
        transparent: true,
        opacity: hovered ? Math.min(organ.opacity + 0.22, 0.96) : organ.opacity,
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

  let geometry: React.ReactElement;
  if (organ.shape === 'sphere') {
    geometry = <sphereGeometry args={[organ.radius ?? 0.6, 32, 24]} />;
  } else if (organ.shape === 'cylinder') {
    geometry = (
      <cylinderGeometry
        args={[organ.radiusTop ?? 0.2, organ.radiusBottom ?? 0.2, organ.height ?? 1.0, organ.radialSegments ?? 16]}
      />
    );
  } else if (organ.shape === 'torus') {
    geometry = <torusGeometry args={[organ.torusRadius ?? 0.6, organ.tube ?? 0.12, 16, 60]} />;
  } else {
    geometry = <boxGeometry args={[organ.width ?? 0.8, organ.height ?? 0.12, organ.depth ?? 0.70]} />;
  }

  const labelY =
    organ.shape === 'cylinder'
      ? (organ.height ?? 1.0) / 2 + 0.24
      : (organ.radius ?? 0.6) + 0.28;

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
      {geometry}
      <primitive object={material} attach="material" />

      {hovered && (
        <Html
          position={[0, labelY, 0]}
          center
          distanceFactor={6}
          zIndexRange={[100, 200]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(8,8,20,0.94)',
            border: `1px solid ${organ.color}`,
            borderRadius: '10px',
            padding: '6px 12px',
            minWidth: '160px',
            maxWidth: '230px',
            boxShadow: `0 0 16px ${organ.color}66`,
            fontFamily: "'Space Grotesk', sans-serif",
            pointerEvents: 'none',
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
