
export interface FacialMarker {
  name: string;
  x: number;
  y: number;
  z: number;
}

export const FACIAL_MARKERS: FacialMarker[] = [
  { name: "Nasal Bridge", x: -0.12, y: 1.46, z: 2.37 },
  { name: "Right Medial Canthus", x: -0.39, y: 1.67, z: 1.84 },
  { name: "Left Medial Canthus", x: 0.2, y: 1.64, z: 1.84 },
  { name: "Right Eyelid", x: 0.77, y: 1.76, z: 1.96 },
  { name: "Left Eyelid", x: 0.52, y: 1.77, z: 1.96 },
  { name: "Right Lateral Canthus", x: -1.05, y: 1.63, z: 1.65 },
  { name: "Left Lateral Canthus", x: 0.87, y: 1.66, z: 1.61 },
  { name: "Lower Occipital", x: 0.57, y: 1.48, z: -1.77 },
  { name: "Lower Occipital", x: -0.5, y: 1.44, z: -1.82 },
  { name: "Right Suboccipital", x: 0.56, y: 0.56, z: -1.24 },
  { name: "Left Suboccipital", x: 0.56, y: 0.56, z: -1.29 },
  { name: "Nose Bridge", x: -0.11, y: 1.52, z: 2.33 },
  { name: "Nasal Tip", x: -0.1, y: 1.13, z: 2.58 },
  { name: "Right Nasal Sidewall / Ala", x: -0.41, y: 1.04, z: 2.3 },
  { name: "Left Nasal Sidewall / Ala", x: 0.26, y: 1.03, z: 2.3 },
  { name: "Right Cheek", x: -0.99, y: 0.75, z: 1.87 },
  { name: "Left Cheek", x: 0.77, y: 0.8, z: 1.84 },
  { name: "Right Zygomatic / Cheekbone", x: -0.69, y: 0.98, z: 2.03 },
  { name: "Left Zygomatic / Cheekbone", x: 0.52, y: 0.97, z: 1.99 },
  { name: "Right Ear", x: -1.66, y: 1.19, z: 0.04 },
  { name: "Left Ear", x: 1.55, y: 1.22, z: 0.07 },
  { name: "Nunchal / C1-C2 Region", x: -0.07, y: 0.35, z: -1.31 },
  { name: "Left Upper Trapezius", x: 0.25, y: 0.04, z: -1.32 },
  { name: "Right Upper Trapezius", x: -0.5, y: 0.08, z: -1.32 },
  { name: "Philtrum", x: -1.38, y: 1.07, z: 1.23 },
  { name: "Oral Commissure / Lips", x: -0.11, y: 0.47, z: 2.25 },
  { name: "Right Buccal / Lower Cheek", x: -0.98, y: 0.29, z: 1.83 },
  { name: "Left Buccal / Lower Cheek", x: 0.76, y: 0.31, z: 1.85 },
  { name: "Right Masseter / Jaw", x: -0.64, y: 0.16, z: 1.97 },
  { name: "Left Masseter / Jaw", x: 0.43, y: -0.03, z: 2.02 },
  { name: "Cervical Spine (C3–C4)", x: -0.01, y: -0.41, z: -1.44 },
  { name: "Right Sternocleidomastoid", x: -1.26, y: -0.35, z: -0.03 },
  { name: "Left Sternocleidomastoid", x: 1.08, y: -0.03, z: -0.28 },
  { name: "Mentalis / Chin", x: -0.11, y: -0.23, z: 2.27 },
  { name: "Mental Protuberance (Chin Tip)", x: -0.06, y: -0.45, z: 2.14 },
  { name: "Left & Right Chin / Submental (Under jaw)", x: -0.05, y: -0.67, z: 1.68 },
  { name: "Cervical Spine (C4–C5)", x: -0.06, y: -0.68, z: -1.56 },
  { name: "Anterior Neck / Thyroid", x: 0.18, y: -1.39, z: 0.76 },
  { name: "Right Sternocleidomastoid (Lower sections)", x: -1.19, y: -0.96, z: 0.08 },
  { name: "Left Sternocleidomastoid (Lower sections)", x: -1.07, y: -0.92, z: 0.02 },
  { name: "Left Cervical / Trapezius Neck Back of neck", x: -1.04, y: -0.43, z: 0.81 },
  { name: "Right Cervical / Trapezius Neck Back of neck", x: 0.73, y: -0.34, z: -0.99 },
  { name: "Glabella", x: -0.12, y: 1.89, z: 2.13 },
  { name: "Right Supraorbital Ridge", x: -0.83, y: 2.01, z: 2.01 },
  { name: "Left Supraorbital Ridge", x: 0.7, y: 0.93, z: 1.89 },
  { name: "Right Lateral Orbit", x: -0.96, y: 2.09, z: 1.96 },
  { name: "Left Lateral Orbit", x: 0.68, y: 2.09, z: 1.98 },
  { name: "Right Zygomatic arch", x: -1.47, y: 1.32, z: 0.92 },
  { name: "Left Zygomatic arch", x: 1.24, y: 1.41, z: 0.94 },
  { name: "Mid Occipital / Inion", x: -0.05, y: 0.75, z: -1.48 },
  { name: "Left Posterior Parietal", x: 1.43, y: 2.18, z: 0.16 },
  { name: "Right Posterior Parietal", x: -1.6, y: 2.15, z: 0.09 },
  { name: "Left Mastoid Region", x: 1.26, y: 0.81, z: -0.08 },
  { name: "Central Forehead", x: -0.11, y: 2.45, z: 2.12 },
  { name: "Right Forehead", x: -0.8, y: 2.56, z: 2.01 },
  { name: "Left Forehead", x: 0.86, y: 2.46, z: 1.7 },
  { name: "Right Temple", x: -1.4, y: 1.69, z: 1.22 },
  { name: "Left Temple", x: 1.17, y: 1.83, z: 1.17 },
  { name: "Right Temporal Fossa", x: -1.62, y: 2.24, z: 0.06 },
  { name: "Left Temporal Fossa", x: 1.44, y: 2.26, z: 0.19 },
  { name: "Occipital(Upper)", x: -0.04, y: 2.36, z: -1.97 },
  { name: "Right Occipital", x: -0.84, y: 1.77, z: -1.71 },
  { name: "Left Occipital", x: 0.91, y: 1.84, z: -1.63 },
  { name: "Crown/vertex", x: -0.03, y: 3.03, z: -1.76 },
  { name: "Right Parietal Scalp", x: -1.13, y: 3, z: 1.43 },
  { name: "Right Occipital Scalp", x: 1.05, y: 1.16, z: -1.21 },
  { name: "Left Occipital Scalp", x: -1.03, y: 1.04, z: -1.2 },
  { name: "Left Trapezius", x: 2.77, y: -2.28, z: -0.17 },
  { name: "Right Trapezius", x: -2.77, y: -2.28, z: -0.17 },
  { name: "Platysma", x: -0.53, y: -1.59, z: 0.57 },
  { name: "Scalenus", x: 2.34, y: -3.21, z: 0.70 },
  { name: "Sternum", x: 0.11, y: -3.49, z: 0.94 },
  { name: "Thyroid cartilage", x: -0.07, y: -1.01, z: 1.04 },
  { name: "Thyroid gland", x: -0.09, y: -1.21, z: 0.93 }
];

export function getNearestMarker(x: number, y: number, z: number): string {
  let nearestName = "Unknown Region";
  let minDistance = Infinity;

  for (const marker of FACIAL_MARKERS) {
    const dx = x - marker.x;
    const dy = y - marker.y;
    const dz = z - marker.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < minDistance) {
      minDistance = distSq;
      nearestName = marker.name;
    }
  }
  return nearestName;
}
