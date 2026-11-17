import * as THREE from "three";
import type { MaterialKey, Powder } from "./types";

type Look = { color: string; metalness: number; roughness: number; clearcoat?: number };

const looks: Record<Exclude<MaterialKey, `paint:${string}` | "powder">, Look> = {
  brass: { color: "#d9a650", metalness: 1, roughness: 0.26 },
  nickel: { color: "#d4d6d8", metalness: 1, roughness: 0.2 },
  "lacquered-steel": { color: "#6d6542", metalness: 0.55, roughness: 0.38, clearcoat: 0.8 },
  "case-aluminum": { color: "#b7bbc0", metalness: 1, roughness: 0.42 },
  copper: { color: "#c98559", metalness: 1, roughness: 0.27 },
  "clad-steel": { color: "#b9784e", metalness: 1, roughness: 0.33 },
  lead: { color: "#6f737a", metalness: 0.6, roughness: 0.62 },
  steel: { color: "#c3c9d1", metalness: 1, roughness: 0.22 },
  "hard-steel": { color: "#4b5560", metalness: 1, roughness: 0.3 },
  tungsten: { color: "#70747a", metalness: 1, roughness: 0.4 },
  "depleted-uranium": { color: "#4d4f47", metalness: 0.85, roughness: 0.45 },
  aluminum: { color: "#c9cdd2", metalness: 1, roughness: 0.34 },
  sabot: { color: "#8e949b", metalness: 1, roughness: 0.45 },
  compound: { color: "#d4c38c", metalness: 0, roughness: 0.85 },
  "polymer-red": { color: "#d13a26", metalness: 0, roughness: 0.32, clearcoat: 0.6 },
  "polymer-blue": { color: "#2f6fd6", metalness: 0, roughness: 0.32, clearcoat: 0.6 },
  inert: { color: "#bdb8ab", metalness: 0, roughness: 0.92 },
  explosive: { color: "#e3d293", metalness: 0, roughness: 0.92 },
  incendiary: { color: "#aab0a2", metalness: 0.1, roughness: 0.9 },
  tracer: { color: "#c45c3b", metalness: 0, roughness: 0.9 },
  "hull-red": { color: "#b0261e", metalness: 0, roughness: 0.45, clearcoat: 0.3 },
  "hull-yellow": { color: "#e0b11c", metalness: 0, roughness: 0.45, clearcoat: 0.3 },
  "hull-green": { color: "#2f6b3a", metalness: 0, roughness: 0.45, clearcoat: 0.3 },
  wad: { color: "#ebe6da", metalness: 0, roughness: 0.6 },
  fiber: { color: "#9b8463", metalness: 0, roughness: 1 },
  card: { color: "#d8cdb4", metalness: 0, roughness: 0.9 },
  combustible: { color: "#c3a978", metalness: 0, roughness: 0.95 },
  nylon: { color: "#efe9dd", metalness: 0, roughness: 0.4 },
  "band-copper": { color: "#b8693e", metalness: 1, roughness: 0.34 },
  obturator: { color: "#2d2e30", metalness: 0, roughness: 0.55 },
  igniter: { color: "#2f2f2f", metalness: 0, roughness: 0.95 },
  insulator: { color: "#1f1f1f", metalness: 0, roughness: 0.6 },
  void: { color: "#050505", metalness: 0, roughness: 1 },
};

const cache = new Map<string, THREE.MeshPhysicalMaterial>();

export function swatchColor(key: MaterialKey) {
  if (key.startsWith("paint:")) return key.slice(6);
  if (key === "powder") return "#4a4c4e";
  return looks[key as keyof typeof looks].color;
}

export function getMaterial(key: MaterialKey, powder: Powder, highlighted: boolean, face: boolean) {
  const id = `${key}|${key === "powder" ? `${powder.style}-${powder.grain}` : ""}|${highlighted}|${face}`;
  const cached = cache.get(id);
  if (cached) return cached;
  let material: THREE.MeshPhysicalMaterial;
  if (key.startsWith("paint:")) {
    material = new THREE.MeshPhysicalMaterial({ color: key.slice(6), metalness: 0.1, roughness: 0.5, clearcoat: 0.4 });
  } else if (key === "powder") {
    const texture = powderTexture(powder.style).clone();
    const tile = powder.grain * 14;
    texture.repeat.set(1 / tile, 1 / tile);
    texture.needsUpdate = true;
    material = new THREE.MeshPhysicalMaterial({ map: texture, bumpMap: texture, bumpScale: 2, metalness: 0.15, roughness: 0.85 });
  } else {
    const look = looks[key as keyof typeof looks];
    material = new THREE.MeshPhysicalMaterial({
      color: look.color,
      metalness: look.metalness,
      roughness: look.roughness,
      clearcoat: look.clearcoat ?? 0,
      clearcoatRoughness: 0.25,
    });
  }
  if (face) {
    material.metalness *= 0.5;
    material.roughness = Math.max(material.roughness, 0.42);
    material.clearcoat = 0;
  }
  material.side = THREE.DoubleSide;
  if (highlighted) {
    material.emissive = new THREE.Color("#3b82f6");
    material.emissiveIntensity = 0.55;
  }
  cache.set(id, material);
  return material;
}

const powderTextures = new Map<string, THREE.CanvasTexture>();

function powderTexture(style: Powder["style"]) {
  const cached = powderTextures.get(style);
  if (cached) return cached;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#1c1d1f";
  context.fillRect(0, 0, size, size);
  const random = seeded(7);
  const grain = size / 14;
  for (let index = 0; index < 900; index++) {
    const x = random() * size;
    const y = random() * size;
    const shade = 70 + random() * 60;
    context.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 6})`;
    context.save();
    context.translate(x, y);
    context.rotate(random() * Math.PI);
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        context.save();
        context.translate(dx, dy);
        drawGrain(context, style, grain, random);
        context.restore();
      }
    }
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  powderTextures.set(style, texture);
  return texture;
}

function drawGrain(context: CanvasRenderingContext2D, style: Powder["style"], grain: number, random: () => number) {
  if (style === "ball") {
    context.beginPath();
    context.arc(0, 0, grain * (0.32 + random() * 0.12), 0, Math.PI * 2);
    context.fill();
    return;
  }
  if (style === "flake") {
    context.beginPath();
    context.ellipse(0, 0, grain * 0.5, grain * 0.12, 0, 0, Math.PI * 2);
    context.fill();
    return;
  }
  if (style === "stick") {
    context.fillRect(-grain * 0.5, -grain * 0.2, grain, grain * 0.4);
    context.fillStyle = "#151515";
    context.beginPath();
    context.arc(0, 0, grain * 0.06, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  context.arc(0, 0, grain * 0.42, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#151515";
  for (let hole = 0; hole < 7; hole++) {
    const angle = (hole / 6) * Math.PI * 2;
    const distance = hole === 6 ? 0 : grain * 0.22;
    context.beginPath();
    context.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, grain * 0.05, 0, Math.PI * 2);
    context.fill();
  }
}

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

const stampCache = new Map<string, THREE.CanvasTexture>();

export function headstampTexture(text: string, inner: number, outer: number) {
  const id = `${text}|${(inner / outer).toFixed(3)}`;
  const cached = stampCache.get(id);
  if (cached) return cached;
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  const middle = ((inner / outer + 1) / 2) * (size / 2);
  const band = (1 - inner / outer) * (size / 2);
  const fontSize = Math.min(band * 0.62, size * 0.11);
  context.fillStyle = "#6b6b6b";
  context.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const characters = [...text];
  const step = Math.min((fontSize * 0.78) / middle, (Math.PI * 2) / characters.length);
  context.translate(size / 2, size / 2);
  context.rotate(-((characters.length - 1) * step) / 2);
  for (const character of characters) {
    context.save();
    context.translate(0, -middle);
    context.fillText(character, 0, 0);
    context.restore();
    context.rotate(step);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  stampCache.set(id, texture);
  return texture;
}

let crimp: THREE.CanvasTexture | undefined;

export function crimpTexture(folds: number) {
  if (crimp) return crimp;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.translate(size / 2, size / 2);
  context.strokeStyle = "#7a7a7a";
  context.lineWidth = size * 0.012;
  for (let fold = 0; fold < folds; fold++) {
    const angle = (fold / folds) * Math.PI * 2;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.5);
    context.stroke();
  }
  crimp = new THREE.CanvasTexture(canvas);
  crimp.colorSpace = THREE.SRGBColorSpace;
  return crimp;
}
