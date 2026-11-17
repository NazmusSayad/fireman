import { type JSX, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { Hover } from "./Round";

export type Reference = {
  id: string;
  name: string;
  size: string;
  width: number;
  height: number;
  depth: number;
  Model: () => JSX.Element;
};

export const references: Reference[] = [
  { id: "quarter", name: "US quarter", size: "24.3 mm across", width: 24.26, height: 24.26, depth: 1.75, Model: Quarter },
  { id: "aa-battery", name: "AA battery", size: "14.5 × 50.5 mm", width: 14.5, height: 50.5, depth: 14.5, Model: Battery },
  { id: "golf-ball", name: "Golf ball", size: "42.7 mm across", width: 42.67, height: 42.67, depth: 42.67, Model: GolfBall },
  { id: "credit-card", name: "Credit card", size: "85.6 × 54 mm", width: 85.6, height: 53.98, depth: 0.76, Model: CreditCard },
  { id: "soda-can", name: "Soda can", size: "66 × 122 mm", width: 66, height: 122, depth: 66, Model: SodaCan },
  { id: "smartphone", name: "Smartphone", size: "71.5 × 147 mm", width: 71.5, height: 147, depth: 7.8, Model: Smartphone },
  { id: "pencil", name: "Pencil", size: "190 mm long", width: 8.1, height: 190, depth: 8.1, Model: Pencil },
  { id: "ruler", name: "30 cm ruler", size: "310 × 32 mm", width: 32, height: 310, depth: 2, Model: Ruler },
];

type Props = {
  reference: Reference;
  x: number;
  onHover: (hover: Hover) => void;
};

export function ReferenceObject(props: Props) {
  const Model = props.reference.Model;
  return (
    <group
      position={[props.x, 0, 0]}
      onPointerOver={(event) => {
        event.stopPropagation();
        props.onHover({ name: `${props.reference.name} · ${props.reference.size}`, point: [event.point.x, event.point.y, event.point.z] });
      }}
      onPointerOut={() => props.onHover(null)}
    >
      <Model />
    </group>
  );
}

const coinProfile = [
  [0, -0.7],
  [11.2, -0.7],
  [11.45, -0.875],
  [12.13, -0.875],
  [12.13, 0.875],
  [11.45, 0.875],
  [11.2, 0.7],
  [0, 0.7],
].map((point) => new THREE.Vector2(point[0], point[1]));

function Quarter() {
  return (
    <mesh position={[0, 12.13, 0]} rotation-x={Math.PI / 2}>
      <latheGeometry args={[coinProfile, 128]} />
      <meshPhysicalMaterial color="#d6d9dd" metalness={1} roughness={0.5} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Battery() {
  return (
    <group>
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[6.4, 6.4, 0.3, 64]} />
        <meshPhysicalMaterial color="#b9bdc3" metalness={1} roughness={0.35} />
      </mesh>
      <mesh position={[0, 24.9, 0]}>
        <cylinderGeometry args={[7.25, 7.25, 49.2, 64]} />
        <meshPhysicalMaterial color="#2c3a4f" metalness={0.3} roughness={0.35} clearcoat={1} />
      </mesh>
      <mesh position={[0, 49.65, 0]}>
        <cylinderGeometry args={[6.6, 7.0, 0.3, 64]} />
        <meshPhysicalMaterial color="#b9bdc3" metalness={1} roughness={0.35} />
      </mesh>
      <mesh position={[0, 50.15, 0]}>
        <cylinderGeometry args={[2.6, 2.75, 0.7, 48]} />
        <meshPhysicalMaterial color="#c9ccd1" metalness={1} roughness={0.25} />
      </mesh>
    </group>
  );
}

function GolfBall() {
  const texture = useMemo(dimpleTexture, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[0, 21.335, 0]}>
      <sphereGeometry args={[21.335, 128, 64]} />
      <meshPhysicalMaterial color="#f4f4f1" roughness={0.42} clearcoat={0.6} bumpMap={texture} bumpScale={2} />
    </mesh>
  );
}

function dimpleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const rows = 22;
  const rowHeight = canvas.height / rows;
  for (let row = 0; row < rows; row++) {
    const latitude = ((row + 0.5) / rows - 0.5) * Math.PI;
    const scale = Math.cos(latitude);
    const count = Math.max(1, Math.round(44 * scale));
    const radiusY = rowHeight * 0.46;
    const radiusX = Math.min(radiusY / scale, canvas.width / count / 2);
    for (let column = 0; column < count; column++) {
      const x = ((column + (row % 2) * 0.5) / count) * canvas.width;
      const y = (row + 0.5) * rowHeight;
      for (const offset of [-canvas.width, 0, canvas.width]) {
        const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, "#7a7a7a");
        gradient.addColorStop(1, "#ffffff");
        context.save();
        context.translate(x + offset, y);
        context.scale(radiusX, radiusY);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(0, 0, 1, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  }
  return new THREE.CanvasTexture(canvas);
}

function roundedRect(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const left = -width / 2;
  const right = width / 2;
  shape.moveTo(left + radius, 0);
  shape.lineTo(right - radius, 0);
  shape.quadraticCurveTo(right, 0, right, radius);
  shape.lineTo(right, height - radius);
  shape.quadraticCurveTo(right, height, right - radius, height);
  shape.lineTo(left + radius, height);
  shape.quadraticCurveTo(left, height, left, height - radius);
  shape.lineTo(left, radius);
  shape.quadraticCurveTo(left, 0, left + radius, 0);
  return shape;
}

const cardShape = roundedRect(85.6, 53.98, 3.18);

function CreditCard() {
  return (
    <group>
      <mesh position={[0, 0, -0.38]}>
        <extrudeGeometry args={[cardShape, { depth: 0.76, bevelEnabled: false, curveSegments: 12 }]} />
        <meshPhysicalMaterial color="#3566a8" roughness={0.4} clearcoat={1} />
      </mesh>
      <mesh position={[-26.8, 30.3, 0.42]}>
        <boxGeometry args={[11.5, 9, 0.08]} />
        <meshPhysicalMaterial color="#e2c47a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 42.1, -0.42]}>
        <boxGeometry args={[85.6, 12.7, 0.06]} />
        <meshPhysicalMaterial color="#111214" roughness={0.5} />
      </mesh>
    </group>
  );
}

const canProfile = [
  [0, 5],
  [18, 3.6],
  [24, 0.8],
  [25.5, 0],
  [28, 0.4],
  [31.6, 3],
  [33, 8],
  [33, 110],
  [29.6, 116],
  [27.6, 119.6],
  [27.6, 122],
  [26.6, 122],
  [26, 119.2],
  [0, 119.2],
].map((point) => new THREE.Vector2(point[0], point[1]));

function SodaCan() {
  return (
    <group>
      <mesh>
        <latheGeometry args={[canProfile, 128]} />
        <meshPhysicalMaterial color="#d3d7dc" metalness={1} roughness={0.28} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 59, 0]}>
        <cylinderGeometry args={[33.06, 33.06, 102, 128, 1, true]} />
        <meshPhysicalMaterial color="#2f6fb5" metalness={0.5} roughness={0.3} clearcoat={1} />
      </mesh>
    </group>
  );
}

const phoneShape = roundedRect(71.5, 147, 9);
const glassShape = roundedRect(70.6, 146.1, 8.6);
const screenShape = roundedRect(67.4, 142.9, 7.4);

function Smartphone() {
  return (
    <group>
      <mesh position={[0, 0, -3.9]}>
        <extrudeGeometry args={[phoneShape, { depth: 7.8, bevelEnabled: false, curveSegments: 16 }]} />
        <meshPhysicalMaterial color="#8d9198" metalness={1} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.45, 3.9]}>
        <shapeGeometry args={[glassShape, 16]} />
        <meshPhysicalMaterial color="#050608" roughness={0.08} clearcoat={1} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh position={[0, 2.05, 3.91]}>
        <shapeGeometry args={[screenShape, 16]} />
        <meshPhysicalMaterial color="#0e141c" roughness={0.1} clearcoat={1} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh position={[0, 139.5, 3.92]}>
        <circleGeometry args={[1.6, 32]} />
        <meshBasicMaterial color="#000000" polygonOffset polygonOffsetFactor={-3} />
      </mesh>
    </group>
  );
}

function Pencil() {
  return (
    <group>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[3.4, 3.4, 6, 48]} />
        <meshPhysicalMaterial color="#e3888f" roughness={0.85} />
      </mesh>
      <mesh position={[0, 10.5, 0]}>
        <cylinderGeometry args={[3.75, 3.75, 9, 48]} />
        <meshPhysicalMaterial color="#c8cacd" metalness={1} roughness={0.35} />
      </mesh>
      <mesh position={[0, 93.5, 0]}>
        <cylinderGeometry args={[4.04, 4.04, 157, 6]} />
        <meshPhysicalMaterial color="#e6b522" roughness={0.45} clearcoat={0.5} flatShading />
      </mesh>
      <mesh position={[0, 179.5, 0]}>
        <cylinderGeometry args={[0.9, 3.5, 15, 48]} />
        <meshPhysicalMaterial color="#d8b285" roughness={0.85} />
      </mesh>
      <mesh position={[0, 188.5, 0]}>
        <cylinderGeometry args={[0.15, 0.9, 3, 32]} />
        <meshPhysicalMaterial color="#38393c" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Ruler() {
  const materials = useMemo(() => {
    const side = new THREE.MeshPhysicalMaterial({ color: "#dfe3e6", roughness: 0.4 });
    const face = new THREE.MeshPhysicalMaterial({ map: rulerTexture(), roughness: 0.4 });
    return [side, side, side, side, face, side];
  }, []);
  useEffect(
    () => () => {
      materials[4].map?.dispose();
      materials[4].dispose();
      materials[0].dispose();
    },
    [materials],
  );
  return (
    <mesh position={[0, 155, 0]} material={materials}>
      <boxGeometry args={[32, 310, 2]} />
    </mesh>
  );
}

function rulerTexture() {
  const pixelsPerMm = 8;
  const canvas = document.createElement("canvas");
  canvas.width = 32 * pixelsPerMm;
  canvas.height = 310 * pixelsPerMm;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  context.fillStyle = "#e9ecee";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1b1c1e";
  context.font = `600 ${4 * pixelsPerMm}px system-ui, sans-serif`;
  context.textBaseline = "middle";
  for (let mm = 0; mm <= 300; mm++) {
    const y = (305 - mm) * pixelsPerMm;
    const length = mm % 10 === 0 ? 9 : mm % 5 === 0 ? 6 : 3.5;
    context.fillRect(0, y - 1, length * pixelsPerMm, 2);
    if (mm % 10 === 0) context.fillText(String(mm / 10), 11 * pixelsPerMm, y);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
