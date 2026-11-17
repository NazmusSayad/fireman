import type { Vec } from "./geometry";

export type MaterialKey =
  | "brass"
  | "nickel"
  | "lacquered-steel"
  | "case-aluminum"
  | "copper"
  | "clad-steel"
  | "lead"
  | "steel"
  | "hard-steel"
  | "tungsten"
  | "depleted-uranium"
  | "aluminum"
  | "sabot"
  | "powder"
  | "compound"
  | "polymer-red"
  | "polymer-blue"
  | "inert"
  | "explosive"
  | "incendiary"
  | "tracer"
  | "hull-red"
  | "hull-yellow"
  | "hull-green"
  | "wad"
  | "fiber"
  | "card"
  | "combustible"
  | "nylon"
  | "band-copper"
  | "obturator"
  | "igniter"
  | "insulator"
  | "void"
  | `paint:${string}`;

export type Category = "Handgun" | "Rifle" | "Heavy machine gun" | "Autocannon" | "Tank" | "Shotgun";

export type Notch = { y0: number; y1: number; depth: number; square?: boolean };

export type Insert = {
  name: string;
  material: MaterialKey | "air";
  d: number;
  y0: number;
  y1: number;
  noseLen: number;
};

export type Projectile = {
  d: number;
  length: number;
  noseLen: number;
  meplatD: number;
  boatTail?: { length: number; baseD: number };
  heel?: { length: number; d: number };
  notches?: Notch[];
  core: { name: string; material: MaterialKey };
  jacket?: { name: string; material: MaterialKey; thickness: number; base: number };
  nose?:
    | { kind: "exposed"; length: number }
    | { kind: "tip"; length: number; name: string; material: MaterialKey; shankD: number; shankLen: number }
    | { kind: "hollow"; d: number; depth: number };
  inserts?: Insert[];
  band?: { name: string; material: MaterialKey; y0: number; y1: number; depth: number; proud: number };
  tracer?: { d: number; length: number };
  paints?: { name: string; color: string; from: number; to: number }[];
};

export type Primer = { kind: "boxer" | "berdan" | "electric" | "rimfire"; d: number; depth: number };

export type CaseSpec = {
  kind: "rimless" | "rimmed" | "belted" | "rimfire";
  material: MaterialKey;
  rimD: number;
  rimT: number;
  grooveD?: number;
  beltD?: number;
  beltTop?: number;
  baseD: number;
  shoulderD?: number;
  shoulderY?: number;
  neckY?: number;
  neckD: number;
  length: number;
  primer: Primer;
  crimp?: boolean;
  sealant?: string;
  headstamp: string;
};

export type Powder = { style: "flake" | "ball" | "stick" | "grain"; grain: number; fill: number };

export type ShotshellSpec = {
  rimD: number;
  rimT: number;
  hullD: number;
  bore: number;
  length: number;
  headH: number;
  hull: MaterialKey;
  crimp: "star" | "roll";
  powderHeight: number;
  headstamp: string;
  load:
    | { kind: "shot"; name: string; pelletD: number; count: number; perLayer?: number }
    | { kind: "slug"; d: number; length: number; cavityD: number; cavityDepth: number; wadHeight: number };
};

export type TankSpec = {
  caseLength: number;
  baseD: number;
  stubD: number;
  stubHeight: number;
  shoulderY: number;
  shoulderD: number;
  neckD: number;
  primerTube: number;
  finBase: number;
  finSpan: number;
  finLength: number;
} & (
  | { kind: "apfsds"; rodD: number; sabotRear: number; sabotFront: number }
  | { kind: "heat"; bodyBase: number; bodyLength: number; probeD: number; probeBase: number; boomD: number }
);

export type Build =
  | { kind: "metallic"; case: CaseSpec; projectile: Projectile; powder: Powder }
  | { kind: "shotshell"; shell: ShotshellSpec; powder: Powder }
  | { kind: "tank"; tank: TankSpec; powder: Powder };

export type Load = {
  id: string;
  name: string;
  type: string;
  note?: string;
  oal: number;
  projectileMass: number;
  velocity: number;
  build: Build;
};

export type Cartridge = {
  id: string;
  name: string;
  aliases: string;
  category: Category;
  note: string;
  introduced: string;
  boreD: number;
  caseLength: number;
  rimD: number;
  pressure?: { mpa: number; standard: string };
  primer: string;
  caseMaterial: string;
  loads: Load[];
};

export type Part = {
  name: string;
  material: MaterialKey;
  profile: Vec[];
  closed: boolean;
  holes: Vec[][];
};

export type Extra =
  | {
      kind: "ring";
      name: string;
      material: MaterialKey;
      y: number;
      inner: number;
      outer: number;
      facing: "up" | "down";
      texture?: { kind: "headstamp"; text: string } | { kind: "crimp"; folds: number };
    }
  | { kind: "pellets"; name: string; material: MaterialKey; radius: number; positions: [number, number, number][] }
  | { kind: "fins"; name: string; material: MaterialKey; outline: Vec[]; thickness: number; count: number }
  | { kind: "flash-holes"; name: string; material: MaterialKey; radius: number; offset: number; y0: number; y1: number };

export type Model = { parts: Part[]; extras: Extra[]; height: number; radius: number; powder: Powder };
