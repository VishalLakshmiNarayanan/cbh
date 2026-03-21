export type Point3D = { x: number; y: number; z: number };

export type DecalData = {
  id: string;
  position: Point3D;
  normal: Point3D;
  label: string;
  type: 'symptom' | 'heatmap';
  color?: string;
  size?: number;
  opacity?: number;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  relatedDecalId?: string;
};
