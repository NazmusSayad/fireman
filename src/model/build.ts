import type { Vec } from "./geometry";
import type { CaseSpec, Extra, Insert, Load, Model, Part, Projectile, ShotshellSpec, TankSpec } from "./types";

export function buildModel(load: Load): Model {
  const build = load.build;
  if (build.kind === "metallic") return withBounds(metallic(build.case, build.projectile, load.oal, build.powder.fill), build.powder);
  if (build.kind === "shotshell") return withBounds(shotshell(build.shell), build.powder);
  if (build.kind === "tank") return withBounds(tank(build.tank, load.oal), build.powder);
  throw new Error(`Unknown build for ${load.id}`);
}

function withBounds(result: { parts: Part[]; extras: Extra[] }, powder: Model["powder"]): Model {
  let height = 0;
  let radius = 0;
  for (const part of result.parts) {
    for (const point of part.profile) {
      height = Math.max(height, point[1]);
      radius = Math.max(radius, point[0]);
    }
  }
  return { parts: result.parts, extras: result.extras, height, radius, powder };
}

function part(name: string, material: Part["material"], profile: Vec[], holes: Vec[][] = []): Part {
  return { name, material, profile, closed: true, holes };
}

function shift(points: Vec[], dy: number): Vec[] {
  return points.map((point) => [point[0], point[1] + dy]);
}

function lerp(a: Vec, b: Vec, t: number): Vec {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function clipY(curve: Vec[], yMin: number, yMax: number): Vec[] {
  const result: Vec[] = [];
  const inside = (point: Vec) => point[1] >= yMin - 1e-9 && point[1] <= yMax + 1e-9;
  for (let index = 0; index < curve.length; index++) {
    const point = curve[index];
    if (inside(point)) result.push(point);
    else if (result.length > 0) break;
    const next = curve[index + 1];
    if (!next) break;
    const crossings = [yMin, yMax]
      .filter((bound) => (point[1] - bound) * (next[1] - bound) < 0)
      .map((bound) => (bound - point[1]) / (next[1] - point[1]))
      .sort((a, b) => a - b);
    for (const t of crossings) result.push(lerp(point, next, t));
  }
  return result;
}

function toAxis(curve: Vec[]): Vec[] {
  const result: Vec[] = [];
  for (let index = 0; index < curve.length; index++) {
    const point = curve[index];
    if (point[0] <= 0) {
      const previous = result[result.length - 1];
      if (previous) result.push([0, previous[1] + ((point[1] - previous[1]) * previous[0]) / (previous[0] - point[0])]);
      else result.push([0, point[1]]);
      return result;
    }
    result.push(point);
  }
  result.push([0, result[result.length - 1][1]]);
  return result;
}

function offsetCurve(curve: Vec[], distance: number): Vec[] {
  return curve.map((point, index) => {
    const before = curve[Math.max(index - 1, 0)];
    const after = curve[Math.min(index + 1, curve.length - 1)];
    const dr = after[0] - before[0];
    const dy = after[1] - before[1];
    const length = Math.hypot(dr, dy);
    return [point[0] - (dy / length) * distance, point[1] + (dr / length) * distance];
  });
}

function noseCurve(radius: number, noseLen: number, meplatRadius: number, steps = 36): Vec[] {
  const shape = (z: number, length: number) => {
    if (length >= radius) {
      const rho = (radius * radius + length * length) / (2 * radius);
      return Math.sqrt(Math.max(rho * rho - z * z, 0)) - (rho - radius);
    }
    return radius * Math.sqrt(Math.max(1 - (z / length) ** 2, 0));
  };
  let full = noseLen;
  if (meplatRadius > 0) {
    let low = noseLen;
    let high = noseLen * 80;
    for (let iteration = 0; iteration < 60; iteration++) {
      const middle = (low + high) / 2;
      if (shape(noseLen, middle) < meplatRadius) low = middle;
      else high = middle;
    }
    full = (low + high) / 2;
  }
  const points: Vec[] = [];
  for (let step = 1; step <= steps; step++) {
    const z = noseLen * Math.sin(((step / steps) * Math.PI) / 2);
    points.push([step === steps ? meplatRadius : shape(z, full), z]);
  }
  return points;
}

function sideCurve(projectile: Projectile, withNotches: boolean): Vec[] {
  const radius = projectile.d / 2;
  const length = projectile.length;
  const noseStart = length - projectile.noseLen;
  const points: Vec[] = [];
  let bearingStart: number;
  if (projectile.heel) {
    points.push([projectile.heel.d / 2, 0], [projectile.heel.d / 2, projectile.heel.length], [radius, projectile.heel.length]);
    bearingStart = projectile.heel.length;
  } else if (projectile.boatTail) {
    const corner = radius * 0.04;
    points.push([projectile.boatTail.baseD / 2, 0], [radius - corner, projectile.boatTail.length - corner * 0.5], [radius, projectile.boatTail.length]);
    bearingStart = projectile.boatTail.length;
  } else {
    const bevel = radius * 0.05;
    points.push([radius - bevel, 0], [radius, bevel]);
    bearingStart = bevel;
  }
  const notches = withNotches ? [...(projectile.notches ?? [])] : [];
  if (withNotches && projectile.band) {
    notches.push({ y0: projectile.band.y0, y1: projectile.band.y1, depth: projectile.band.depth, square: true });
  }
  notches.sort((a, b) => a.y0 - b.y0);
  for (const notch of notches) {
    if (notch.y0 <= bearingStart || notch.y1 >= noseStart) continue;
    const slope = notch.square ? 0 : Math.min(notch.depth * 0.8, (notch.y1 - notch.y0) / 3);
    points.push(
      [radius, notch.y0],
      [radius - notch.depth, notch.y0 + slope],
      [radius - notch.depth, notch.y1 - slope],
      [radius, notch.y1],
    );
  }
  points.push([radius, noseStart]);
  for (const point of noseCurve(radius, projectile.noseLen, projectile.meplatD / 2)) {
    points.push([point[0], noseStart + point[1]]);
  }
  return points;
}

function insertCurve(insert: Insert): Vec[] {
  const radius = insert.d / 2;
  const chamfer = radius * 0.12;
  const points: Vec[] = [
    [0, insert.y0],
    [radius - chamfer, insert.y0],
    [radius, insert.y0 + chamfer],
    [radius, insert.y1 - insert.noseLen],
  ];
  if (insert.noseLen > 0) {
    for (const point of noseCurve(radius, insert.noseLen, 0)) points.push([point[0], insert.y1 - insert.noseLen + point[1]]);
  } else {
    points.push([radius - chamfer, insert.y1], [0, insert.y1]);
  }
  return points;
}

function radiusAt(curve: Vec[], y: number) {
  for (let index = 0; index < curve.length - 1; index++) {
    const a = curve[index];
    const b = curve[index + 1];
    if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  }
  return 0;
}

function fitInside(curve: Vec[], boundary: Vec[], margin: number): Vec[] {
  const result: Vec[] = [];
  for (let index = 0; index < curve.length; index++) {
    const point = curve[index];
    const next = curve[index + 1];
    const pieces = next ? Math.max(1, Math.ceil(Math.abs(next[1] - point[1]) / (margin * 8))) : 1;
    for (let piece = 0; piece < pieces; piece++) {
      const sample = next ? lerp(point, next, piece / pieces) : point;
      result.push([Math.max(0, Math.min(sample[0], radiusAt(boundary, sample[1]) - margin)), sample[1]]);
    }
  }
  return result;
}

function projectileParts(projectile: Projectile, base: number): { parts: Part[]; extras: Extra[] } {
  const radius = projectile.d / 2;
  const length = projectile.length;
  const outer = sideCurve(projectile, true);
  const smooth = sideCurve(projectile, false);
  const tip: Vec = [0, length];
  const parts: Part[] = [];
  const jacket = projectile.jacket;
  let core: Vec[];

  if (!jacket) {
    core = [[0, 0], ...outer, tip];
  } else {
    const nose = projectile.nose;
    const closedNose = !nose;
    const offset = offsetCurve(closedNose ? [...smooth, tip] : smooth, jacket.thickness);
    let inner = closedNose ? toAxis(offset) : offset;
    inner = jacket.base > 0 ? clipY(inner, jacket.base, Infinity) : [[inner[0][0], 0], ...inner];
    const coreBottom: Vec = [0, jacket.base];

    let start: Vec[] = jacket.base > 0 ? [[0, 0]] : [];
    if (projectile.tracer && jacket.base > 0) {
      const tracerRadius = projectile.tracer.d / 2;
      const tracerTop = projectile.tracer.length;
      start = [[0, tracerTop], [tracerRadius, tracerTop], [tracerRadius, 0]];
      parts.push(part("Tracer compound", "tracer", [[0, 0], [tracerRadius, 0], [tracerRadius, tracerTop], [0, tracerTop]]));
    }
    const end: Vec[] = jacket.base > 0 ? [coreBottom] : [];

    if (closedNose) {
      parts.push(part(jacket.name, jacket.material, [...start, ...outer, tip, ...[...inner].reverse(), ...end]));
      core = [coreBottom, ...inner];
    } else if (nose.kind === "hollow") {
      const mouth = clipY(inner, -Infinity, length);
      const mouthTop = mouth[mouth.length - 1];
      parts.push(part(jacket.name, jacket.material, [...start, ...outer, ...[...mouth].reverse(), ...end]));
      const cavityRadius = Math.min(nose.d / 2, mouthTop[0] * 0.92);
      core = [
        coreBottom,
        ...mouth,
        [cavityRadius, mouthTop[1]],
        [cavityRadius * 0.3, mouthTop[1] - nose.depth],
        [0, mouthTop[1] - nose.depth - cavityRadius * 0.15],
      ];
    } else {
      const jacketTop = length - nose.length;
      const outerLow = clipY(outer, -Infinity, jacketTop);
      const outerHigh = clipY(outer, jacketTop, Infinity);
      const innerLow = clipY(inner, -Infinity, jacketTop);
      parts.push(part(jacket.name, jacket.material, [...start, ...outerLow, ...[...innerLow].reverse(), ...end]));
      if (nose.kind === "exposed") {
        core = [coreBottom, ...innerLow, ...outerHigh, tip];
      } else {
        const shankRadius = nose.shankD / 2;
        const shankBottom = jacketTop - nose.shankLen;
        core = [coreBottom, ...innerLow, [shankRadius, jacketTop], [shankRadius, shankBottom], [0, shankBottom]];
        parts.push(part(nose.name, nose.material, [[0, shankBottom], [shankRadius, shankBottom], [shankRadius, jacketTop], ...outerHigh, tip]));
      }
    }

    if (projectile.tracer && jacket.base === 0) {
      const tracerTop = projectile.tracer.length;
      const side = core.slice(1);
      parts.push(part("Tracer compound", "tracer", [[0, 0], ...clipY(side, 0, tracerTop), [0, tracerTop]]));
      core = [[0, tracerTop], ...clipY(side, tracerTop, Infinity)];
    }
  }

  const inserts = [...(projectile.inserts ?? [])].sort((a, b) => b.y1 - a.y1);
  for (const insert of inserts) {
    const curve = fitInside(insertCurve(insert), core, projectile.d * 0.012);
    core.push(...[...curve].reverse());
    if (insert.material !== "air") parts.push(part(insert.name, insert.material, curve));
  }
  parts.push(part(projectile.core.name, projectile.core.material, core));

  if (projectile.band) {
    const band = projectile.band;
    const width = band.y1 - band.y0;
    parts.push(
      part(band.name, band.material, [
        [radius - band.depth, band.y0],
        [radius + band.proud * 0.5, band.y0],
        [radius + band.proud, band.y0 + width * 0.25],
        [radius + band.proud, band.y1 - width * 0.1],
        [radius + band.proud * 0.7, band.y1],
        [radius - band.depth, band.y1],
      ]),
    );
  }

  for (const paint of projectile.paints ?? []) {
    const curve = clipY([...outer, tip], length - paint.to, length - paint.from);
    parts.push({
      name: paint.name,
      material: `paint:${paint.color}`,
      profile: offsetCurve(curve, -Math.max(projectile.d * 0.0025, 0.01)),
      closed: false,
      holes: [],
    });
  }

  return {
    parts: parts.map((item) => ({ ...item, profile: shift(item.profile, base) })),
    extras: [],
  };
}

function caseParts(spec: CaseSpec, mouthRadius: number, seatY: number, crimpDepth: number) {
  const rimRadius = spec.rimD / 2;
  const baseRadius = spec.baseD / 2;
  const neckRadius = spec.neckD / 2;
  const rimChamfer = spec.rimT * 0.18;
  const primer = spec.primer;
  const primerRadius = primer.d / 2;
  const rimfire = primer.kind === "rimfire";
  const mouthWall = neckRadius - mouthRadius;
  const extras: Extra[] = [];
  const parts: Part[] = [];

  const outer: Vec[] = [rimfire ? [0, 0] : [primerRadius, 0], [rimRadius - rimChamfer, 0], [rimRadius, rimChamfer], [rimRadius, spec.rimT - rimChamfer], [rimRadius - rimChamfer, spec.rimT]];
  let bodyStart: number;
  if (spec.kind === "rimless" || spec.kind === "belted") {
    const grooveRadius = spec.grooveD! / 2;
    const flat = spec.rimT * 0.55;
    const target = spec.kind === "belted" ? spec.beltD! / 2 : baseRadius;
    const bevel = (target - grooveRadius) * 1.2;
    outer.push([grooveRadius, spec.rimT], [grooveRadius, spec.rimT + flat], [target, spec.rimT + flat + bevel]);
    bodyStart = spec.rimT + flat + bevel;
    if (spec.kind === "belted") {
      const step = (target - baseRadius) * 0.8;
      outer.push([target, spec.beltTop! - step], [baseRadius, spec.beltTop!]);
      bodyStart = spec.beltTop!;
    }
  } else {
    const fillet = spec.rimT * 0.15;
    outer.push([baseRadius + fillet, spec.rimT], [baseRadius, spec.rimT + fillet]);
    bodyStart = spec.rimT + fillet;
  }

  const bottleneck = spec.shoulderD !== undefined;
  if (bottleneck) outer.push([spec.shoulderD! / 2, spec.shoulderY!], [neckRadius, spec.neckY!]);
  const crimpLength = crimpDepth * 3;
  if (crimpDepth > 0) {
    outer.push([neckRadius, spec.length - crimpLength], [neckRadius - crimpDepth, spec.length]);
  } else {
    outer.push([neckRadius, spec.length]);
  }

  const bodyWall = rimfire ? mouthWall : Math.max(mouthWall * 2.4, spec.baseD * 0.045);
  const webY = rimfire ? mouthWall : Math.max(primer.depth + spec.baseD * 0.12, bodyStart + spec.baseD * 0.1);
  const inner: Vec[] = crimpDepth > 0 ? [[mouthRadius - crimpDepth, spec.length], [mouthRadius, spec.length - crimpLength]] : [[mouthRadius, spec.length]];
  if (bottleneck) {
    inner.push([mouthRadius, spec.neckY!], [spec.shoulderD! / 2 - mouthWall * 1.3, spec.shoulderY!]);
  } else if (seatY < spec.length) {
    inner.push([mouthRadius, seatY]);
  }
  const wallRadius = baseRadius - bodyWall;
  if (rimfire) {
    inner.push([wallRadius, spec.rimT], [rimRadius - mouthWall, spec.rimT - mouthWall], [rimRadius - mouthWall, mouthWall], [0, mouthWall]);
  } else {
    const fillet = Math.min(spec.baseD * 0.08, wallRadius * 0.3);
    for (let step = 0; step <= 4; step++) {
      const angle = (step / 4) * (Math.PI / 2);
      inner.push([wallRadius - fillet + fillet * Math.cos(angle), webY + fillet - fillet * Math.sin(angle)]);
    }
  }

  const flashRadius = primer.d * 0.19;
  let head: Vec[];
  const holes: Vec[][] = [];
  if (rimfire) {
    head = [];
  } else if (primer.kind === "berdan") {
    const bumpRadius = primerRadius * 0.38;
    head = [[0, webY], [0, primer.depth - primer.d * 0.1], [bumpRadius, primer.depth], [primerRadius, primer.depth]];
    const holeRadius = primer.d * 0.075;
    const holeOffset = primerRadius * 0.55;
    holes.push([
      [holeOffset - holeRadius, primer.depth],
      [holeOffset + holeRadius, primer.depth],
      [holeOffset + holeRadius, webY],
      [holeOffset - holeRadius, webY],
    ]);
    extras.push({ kind: "flash-holes", name: "Flash holes", material: "void", radius: holeRadius, offset: holeOffset, y0: primer.depth, y1: webY });
  } else {
    head = [[flashRadius, webY], [flashRadius, primer.depth], [primerRadius, primer.depth]];
  }

  parts.push(part("Case", spec.material, [...outer, ...inner, ...head], holes));

  if (!rimfire) {
    const seat = primer.d * 0.02;
    const cupWall = primer.d * 0.05;
    const top = primer.depth;
    const cupRadius = primerRadius * 0.995;
    parts.push(
      part("Primer cup", spec.material === "nickel" ? "nickel" : "brass", [
        [0, seat],
        [cupRadius, seat],
        [cupRadius, top],
        [cupRadius - cupWall, top],
        [cupRadius - cupWall, seat + cupWall],
        [0, seat + cupWall],
      ]),
    );
    const compoundTop = seat + cupWall + primer.d * 0.08;
    parts.push(part("Priming compound", "compound", [[0, seat + cupWall], [cupRadius - cupWall, seat + cupWall], [cupRadius - cupWall, compoundTop], [0, compoundTop]]));
    if (primer.kind === "boxer") {
      const anvilRadius = (cupRadius - cupWall) * 0.92;
      const anvilWall = primer.d * 0.045;
      parts.push(
        part("Primer anvil", "brass", [
          [0, compoundTop],
          [anvilRadius, top - anvilWall],
          [anvilRadius, top],
          [anvilRadius - anvilWall, top],
          [0, compoundTop + anvilWall * 1.5],
        ]),
      );
    }
    if (primer.kind === "electric") {
      parts.push(part("Insulator", "insulator", [[0, seat * 0.5], [primerRadius * 0.45, seat * 0.5], [primerRadius * 0.45, seat + cupWall], [0, seat + cupWall]]));
    }
  } else {
    parts.push(
      part("Priming compound (in rim)", "compound", [
        [wallRadius * 0.55, mouthWall],
        [rimRadius - mouthWall, mouthWall],
        [rimRadius - mouthWall, spec.rimT - mouthWall],
        [wallRadius * 0.55, spec.rimT - mouthWall],
      ]),
    );
  }

  extras.push({
    kind: "ring",
    name: "Headstamp",
    material: spec.material,
    y: -spec.baseD * 0.0015,
    inner: rimfire ? 0.01 : primerRadius * 1.04,
    outer: rimRadius - rimChamfer * 1.2,
    facing: "down",
    texture: { kind: "headstamp", text: spec.headstamp },
  });
  if (spec.sealant) {
    extras.push({ kind: "ring", name: "Primer sealant", material: `paint:${spec.sealant}`, y: -spec.baseD * 0.003, inner: primerRadius * 0.96, outer: primerRadius * 1.12, facing: "down" });
    extras.push({ kind: "ring", name: "Case mouth sealant", material: `paint:${spec.sealant}`, y: spec.length + spec.baseD * 0.002, inner: mouthRadius - crimpDepth, outer: mouthRadius - crimpDepth + mouthWall * 0.7, facing: "up" });
  }

  return { parts, extras, inner, webY: rimfire ? spec.rimT : webY };
}

function metallic(spec: CaseSpec, projectile: Projectile, oal: number, fill: number) {
  const seatY = oal - projectile.length;
  const mouthRadius = projectile.heel ? projectile.heel.d / 2 : projectile.d / 2;
  const crimpDepth = spec.crimp ? Math.min((spec.neckD / 2 - mouthRadius) * 0.8, projectile.d * 0.025) : 0;
  const notches = [...(projectile.notches ?? [])];
  if (crimpDepth > 0) {
    const mouth = spec.length - seatY;
    notches.push({ y0: mouth - crimpDepth * 3 - crimpDepth, y1: mouth + crimpDepth * 2, depth: crimpDepth });
  }
  const bullet = projectileParts({ ...projectile, notches }, seatY);
  const casing = caseParts(spec, mouthRadius, seatY, crimpDepth);
  const fillTop = casing.webY + (Math.min(seatY, spec.length) - casing.webY) * fill;
  const charge = clipY([...casing.inner].reverse(), casing.webY, fillTop);
  const powder = part("Propellant", "powder", [[0, casing.webY], ...charge, [0, charge[charge.length - 1][1]]]);
  return { parts: [...casing.parts, powder, ...bullet.parts], extras: casing.extras };
}

function shotshell(spec: ShotshellSpec) {
  const rimRadius = spec.rimD / 2;
  const hullRadius = spec.hullD / 2;
  const innerRadius = spec.bore / 2;
  const wall = hullRadius - innerRadius;
  const brass = spec.hullD * 0.015;
  const rimChamfer = spec.rimT * 0.25;
  const cupRadius = spec.hullD * 0.152;
  const cupHeight = spec.hullD * 0.36;
  const baseWad = spec.hullD * 0.46;
  const parts: Part[] = [];
  const extras: Extra[] = [];

  parts.push(
    part("Brass head", "brass", [
      [cupRadius, 0],
      [rimRadius - rimChamfer, 0],
      [rimRadius, rimChamfer],
      [rimRadius, spec.rimT],
      [hullRadius, spec.rimT],
      [hullRadius, spec.headH],
      [hullRadius - brass, spec.headH],
      [hullRadius - brass, brass],
      [cupRadius, brass],
    ]),
  );

  const crimpRound = wall * 1.6;
  const holeRadius = spec.crimp === "star" ? spec.hullD * 0.06 : innerRadius * 0.62;
  const top = spec.length;
  const under = top - wall * 2;
  const hull: Vec[] = [[cupRadius, brass], [hullRadius - brass, brass], [hullRadius - brass, spec.headH], [hullRadius, spec.headH], [hullRadius, top - crimpRound]];
  for (let step = 1; step <= 6; step++) {
    const angle = (step / 6) * (Math.PI / 2);
    hull.push([hullRadius - crimpRound + crimpRound * Math.cos(angle), top - crimpRound + crimpRound * Math.sin(angle)]);
  }
  hull.push([holeRadius, top], [holeRadius, under], [innerRadius - wall * 0.5, under], [innerRadius, under - wall * 0.5], [innerRadius, baseWad], [cupRadius, baseWad]);
  parts.push(part("Plastic hull", spec.hull, hull));

  const primerRadius = cupRadius * 0.62;
  const primerDepth = spec.hullD * 0.17;
  parts.push(
    part("Battery cup", "brass", [
      [primerRadius, 0],
      [cupRadius, 0],
      [cupRadius, cupHeight],
      [cupRadius * 0.28, cupHeight],
      [cupRadius * 0.28, primerDepth],
      [primerRadius, primerDepth],
    ]),
  );
  const seat = spec.hullD * 0.004;
  const cupWall = spec.hullD * 0.012;
  const compoundTop = seat + cupWall + spec.hullD * 0.02;
  parts.push(part("Primer cup", "brass", [[0, seat], [primerRadius, seat], [primerRadius, primerDepth], [primerRadius - cupWall, primerDepth], [primerRadius - cupWall, seat + cupWall], [0, seat + cupWall]]));
  parts.push(part("Priming compound", "compound", [[0, seat + cupWall], [primerRadius - cupWall, seat + cupWall], [primerRadius - cupWall, compoundTop], [0, compoundTop]]));
  parts.push(part("Primer anvil", "brass", [[0, compoundTop], [(primerRadius - cupWall) * 0.9, primerDepth - cupWall], [(primerRadius - cupWall) * 0.9, primerDepth], [0, compoundTop + cupWall * 1.4]]));

  const powderTop = baseWad + spec.powderHeight;
  parts.push(part("Propellant", "powder", [[0, baseWad], [innerRadius, baseWad], [innerRadius, powderTop], [0, powderTop]]));

  const load = spec.load;
  if (load.kind === "shot") {
    const cupWallThickness = load.perLayer ? spec.bore * 0.012 : spec.bore * 0.03;
    const shotRadius = innerRadius - cupWallThickness;
    const pellets = packPellets(shotRadius, load.pelletD / 2, load.count, load.perLayer);
    const columnTop = under - spec.bore * 0.02;
    const cupBase = columnTop - pellets.height;
    for (const position of pellets.positions) position[1] += cupBase;
    extras.push({ kind: "pellets", name: load.name, material: "lead", radius: load.pelletD / 2, positions: pellets.positions });

    const skirt = spec.bore * 0.24;
    const stemRadius = spec.bore * 0.11;
    const cupFloor = spec.bore * 0.08;
    const stemTop = cupBase - cupFloor;
    const y0 = powderTop;
    parts.push(
      part("Plastic wad", "wad", [
        [0, y0 + skirt * 0.55],
        [innerRadius - spec.bore * 0.05, y0 + skirt * 0.2],
        [innerRadius - spec.bore * 0.05, y0],
        [innerRadius, y0],
        [innerRadius, y0 + skirt],
        [stemRadius + spec.bore * 0.05, y0 + skirt],
        [stemRadius, y0 + skirt + spec.bore * 0.04],
        [stemRadius, stemTop - spec.bore * 0.04],
        [stemRadius + spec.bore * 0.05, stemTop],
        [innerRadius, stemTop],
        [innerRadius, columnTop],
        [shotRadius, columnTop],
        [shotRadius, cupBase],
        [0, cupBase],
      ]),
    );
  } else {
    const card = spec.bore * 0.06;
    const fiberTop = powderTop + card + load.wadHeight;
    parts.push(part("Over-powder card", "card", [[0, powderTop], [innerRadius, powderTop], [innerRadius, powderTop + card], [0, powderTop + card]]));
    parts.push(part("Fiber cushion wad", "fiber", [[0, powderTop + card], [innerRadius, powderTop + card], [innerRadius, fiberTop], [0, fiberTop]]));
    const slugRadius = load.d / 2;
    const cavityRadius = load.cavityD / 2;
    const noseLen = load.length * 0.42;
    const slug: Vec[] = [[cavityRadius, 0], [slugRadius - slugRadius * 0.05, 0], [slugRadius, slugRadius * 0.05], [slugRadius, load.length - noseLen]];
    for (let step = 1; step <= 20; step++) {
      const angle = (step / 20) * (Math.PI / 2);
      slug.push([slugRadius * Math.cos(angle) * 0.75 + slugRadius * 0.25 * (1 - step / 20), load.length - noseLen + noseLen * Math.sin(angle)]);
    }
    slug.push([0, load.length], [0, load.cavityDepth + cavityRadius * 0.4], [cavityRadius * 0.7, load.cavityDepth], [cavityRadius * 0.85, load.cavityDepth * 0.5]);
    parts.push(part("Foster slug", "lead", shift(slug, fiberTop)));
  }

  extras.push({
    kind: "ring",
    name: "Headstamp",
    material: "brass",
    y: -spec.hullD * 0.0015,
    inner: cupRadius * 1.03,
    outer: rimRadius - rimChamfer * 1.2,
    facing: "down",
    texture: { kind: "headstamp", text: spec.headstamp },
  });
  if (spec.crimp === "star") {
    extras.push({ kind: "ring", name: "Star crimp", material: spec.hull, y: top + spec.hullD * 0.001, inner: holeRadius, outer: hullRadius - crimpRound * 0.6, facing: "up", texture: { kind: "crimp", folds: 8 } });
  }
  return { parts, extras };
}

function packPellets(cylinderRadius: number, pelletRadius: number, count: number, perLayer?: number) {
  const positions: [number, number, number][] = [];
  const diameter = pelletRadius * 2;
  const layerGap = perLayer ? diameter * 0.78 : diameter * 0.816;
  let layer = 0;
  while (positions.length < count) {
    const y = pelletRadius + layer * layerGap;
    if (perLayer) {
      const ring = pelletRadius / Math.sin(Math.PI / perLayer);
      for (let index = 0; index < perLayer && positions.length < count; index++) {
        const angle = (index / perLayer) * Math.PI * 2 + (layer % 2) * (Math.PI / perLayer);
        positions.push([Math.cos(angle) * ring, y, Math.sin(angle) * ring]);
      }
    } else {
      const limit = cylinderRadius - pelletRadius;
      const rowGap = diameter * Math.sqrt(3) * 0.5;
      const offsetX = layer % 3 === 1 ? pelletRadius : layer % 3 === 2 ? pelletRadius * 0.5 : 0;
      const offsetZ = layer % 3 === 1 ? rowGap / 3 : layer % 3 === 2 ? (rowGap * 2) / 3 : 0;
      const rows = Math.ceil(limit / rowGap) + 1;
      for (let row = -rows; row <= rows; row++) {
        const columns = Math.ceil(limit / diameter) + 1;
        for (let column = -columns; column <= columns; column++) {
          const x = column * diameter + (row % 2 !== 0 ? pelletRadius : 0) + offsetX;
          const z = row * rowGap + offsetZ;
          if (Math.hypot(x, z) <= limit && positions.length < count) positions.push([x, y, z]);
        }
      }
    }
    layer++;
  }
  const height = positions.reduce((max, position) => Math.max(max, position[1]), 0) + pelletRadius;
  return { positions, height };
}

function paintShell(name: string, color: string, curve: Vec[], offset: number): Part {
  return { name, material: `paint:${color}`, profile: offsetCurve(curve, -offset), closed: false, holes: [] };
}

function tank(spec: TankSpec, oal: number): { parts: Part[]; extras: Extra[] } {
  const bore = 60;
  const parts: Part[] = [];
  const extras: Extra[] = [];
  const baseRadius = spec.baseD / 2;
  const stubRadius = spec.stubD / 2;
  const shoulderRadius = spec.shoulderD / 2;
  const neckRadius = spec.neckD / 2;
  const caseWall = neckRadius - bore;
  const stubWall = 6;
  const baseThickness = 26;
  const rimHeight = 14;
  const neckY = spec.shoulderY + (shoulderRadius - neckRadius) * 1.6;
  const primerRadius = 11;
  const tubeRadius = 7;
  const tubeWall = 1.2;
  const tubeTop = baseThickness + spec.primerTube;
  const liner = stubRadius - stubWall;

  parts.push(
    part("Case base (steel stub)", "steel", [
      [primerRadius, 0],
      [baseRadius - 2, 0],
      [baseRadius, 2],
      [baseRadius, rimHeight],
      [stubRadius, rimHeight + 4],
      [stubRadius, spec.stubHeight],
      [liner, spec.stubHeight],
      [liner, baseThickness],
      [primerRadius, baseThickness],
    ]),
  );
  parts.push(
    part("Combustible case", "combustible", [
      [liner - caseWall, baseThickness],
      [liner, baseThickness],
      [liner, spec.stubHeight],
      [stubRadius, spec.stubHeight],
      [shoulderRadius, spec.shoulderY],
      [neckRadius, neckY],
      [neckRadius, spec.caseLength],
      [bore, spec.caseLength],
      [bore, neckY],
      [shoulderRadius - caseWall, spec.shoulderY],
      [stubRadius - caseWall, spec.stubHeight + caseWall],
      [liner - caseWall, spec.stubHeight + caseWall],
    ]),
  );
  parts.push(
    part("Electric primer", "brass", [
      [primerRadius * 0.4, 1],
      [primerRadius, 1],
      [primerRadius, baseThickness],
      [tubeRadius, baseThickness],
      [tubeRadius, tubeTop],
      [0, tubeTop],
      [0, tubeTop - tubeWall],
      [tubeRadius - tubeWall, tubeTop - tubeWall],
      [tubeRadius - tubeWall, baseThickness * 0.7],
      [primerRadius * 0.4, baseThickness * 0.7],
    ]),
  );
  parts.push(part("Firing contact & insulator", "insulator", [[0, 1.5], [primerRadius * 0.4, 1.5], [primerRadius * 0.4, baseThickness * 0.7], [0, baseThickness * 0.7]]));
  parts.push(part("Igniter charge", "igniter", [[0, baseThickness * 0.7], [tubeRadius - tubeWall, baseThickness * 0.7], [tubeRadius - tubeWall, tubeTop - tubeWall], [0, tubeTop - tubeWall]]));

  const caseInner: Vec[] = [
    [bore, spec.caseLength],
    [bore, neckY],
    [shoulderRadius - caseWall, spec.shoulderY],
    [stubRadius - caseWall, spec.stubHeight + caseWall],
    [liner - caseWall, spec.stubHeight + caseWall],
    [liner - caseWall, baseThickness],
    [tubeRadius, baseThickness],
    [tubeRadius, tubeTop],
    [0, tubeTop],
  ];

  const finRoot = spec.kind === "apfsds" ? spec.rodD / 2 + 2 : spec.boomD / 2;
  const finTip = spec.finSpan / 2;
  extras.push({
    kind: "fins",
    name: "Stabilizing fins",
    material: "aluminum",
    thickness: spec.kind === "apfsds" ? 3 : 4,
    count: 6,
    outline: [
      [finRoot * 0.95, spec.finBase],
      [finTip, spec.finBase + 4],
      [finTip, spec.finBase + spec.finLength * 0.45],
      [finRoot * 0.95, spec.finBase + spec.finLength],
    ],
  });

  if (spec.kind === "apfsds") {
    const rodRadius = spec.rodD / 2;
    const hubRadius = rodRadius + 2;
    const hubTop = spec.finBase + spec.finLength + 8;
    const tracerLength = 30;
    const windscreenLength = 70;
    const rodTop = oal - windscreenLength * 0.55;
    const noseStart = rodTop - spec.rodD * 1.6;
    const toothPitch = 5;
    const toothDepth = 1.1;
    const teeth: Vec[] = [];
    for (let y = spec.sabotRear + 6; y < spec.sabotFront - 6; y += toothPitch) {
      teeth.push([rodRadius, y], [rodRadius - toothDepth, y + 0.4], [rodRadius - toothDepth * 0.2, y + toothPitch * 0.9]);
    }
    const rodSide: Vec[] = [[rodRadius, spec.sabotRear], ...teeth, [rodRadius, spec.sabotFront]];

    parts.push(part("Tracer", "tracer", [[0, spec.finBase], [5, spec.finBase], [5, spec.finBase + tracerLength], [0, spec.finBase + tracerLength]]));
    parts.push(
      part("Fin assembly hub", "aluminum", [
        [5, spec.finBase],
        [hubRadius - 1, spec.finBase],
        [hubRadius, spec.finBase + 1],
        [hubRadius, hubTop],
        [0, hubTop],
        [0, spec.finBase + tracerLength],
        [5, spec.finBase + tracerLength],
      ]),
    );
    parts.push(part("Depleted-uranium penetrator", "depleted-uranium", [[0, hubTop], [rodRadius - 1, hubTop], [rodRadius, hubTop + 1], ...rodSide, [rodRadius, noseStart], [rodRadius * 0.3, rodTop], [0, rodTop]]));
    parts.push(
      part("Windscreen (ballistic cap)", "aluminum", [
        [rodRadius, noseStart - 18],
        [rodRadius + 1.2, noseStart - 18],
        [2.2, oal - 2],
        [0, oal],
        [0, oal - 9],
        [rodRadius * 0.3, rodTop],
        [rodRadius, noseStart],
      ]),
    );

    const rear = spec.sabotRear;
    const front = spec.sabotFront;
    const bandBottom = spec.caseLength + 4;
    const bandTop = bandBottom + 18;
    parts.push(
      part("Sabot (3 aluminum petals)", "sabot", [
        ...rodSide,
        [rodRadius + 3, front + 3],
        [bore - 5, front + 42],
        [bore - 0.3, front + 42],
        [bore - 0.3, front + 22],
        [rodRadius + 16, front - 35],
        [rodRadius + 16, bandTop + 30],
        [bore - 0.3, bandTop + 10],
        [bore - 0.3, bandTop],
        [bore - 1.5, bandTop],
        [bore - 1.5, bandBottom],
        [bore - 0.3, bandBottom],
        [bore - 0.3, spec.caseLength - 14],
        [rodRadius + 5, rear + 6],
        [rodRadius + 1, rear],
      ]),
    );
    parts.push(part("Obturator band", "obturator", [[bore - 1.5, bandBottom], [bore + 0.6, bandBottom + 1], [bore + 0.6, bandTop], [bore - 1.5, bandTop]]));

    const charge: Vec[] = [
      ...clipY(caseInner, -Infinity, rear),
      [0, spec.finBase],
      [hubRadius, spec.finBase],
      [hubRadius, hubTop],
      [rodRadius, hubTop],
      [rodRadius, rear],
    ];
    parts.push(part("Stick propellant", "powder", charge));
  } else {
    const boomRadius = spec.boomD / 2;
    const bodyBase = spec.bodyBase;
    const bourrelet = bodyBase + 24;
    const ogiveStart = bodyBase + spec.bodyLength;
    const probeRadius = spec.probeD / 2;
    const wall = 6;
    const baseThickness = 26;
    const explosiveBottom = bodyBase + baseThickness;
    const linerMouth = ogiveStart - 6;
    const linerApex = explosiveBottom + 60;
    const linerWall = 3.5;
    const tracerLength = 34;

    const outer: Vec[] = [[boomRadius + 2, bodyBase], [bore - 8, bodyBase + 8], [bore - 0.3, bourrelet], [bore - 0.3, ogiveStart]];
    for (const point of noseCurve(bore - 0.3, spec.probeBase - ogiveStart, probeRadius + 3)) {
      outer.push([point[0], ogiveStart + point[1]]);
    }
    const inner = offsetCurve(outer.slice(2), wall).filter((point) => point[1] >= explosiveBottom && point[0] >= probeRadius + 1.5);
    const innerTop = inner[inner.length - 1];
    const wallRadius = inner[0][0];
    const detonatorRadius = 9;
    parts.push(
      part("Projectile body (steel)", "steel", [
        [0, bodyBase],
        ...outer,
        [probeRadius, spec.probeBase],
        [probeRadius, innerTop[1]],
        ...[...inner].reverse(),
        [wallRadius, explosiveBottom],
        [detonatorRadius, explosiveBottom],
        [detonatorRadius, bodyBase + 4],
        [0, bodyBase + 4],
      ]),
    );
    parts.push(part("Base detonator", "brass", [[0, bodyBase + 4], [detonatorRadius, bodyBase + 4], [detonatorRadius, explosiveBottom], [0, explosiveBottom]]));
    parts.push(part("High-explosive charge", "explosive", [[0, explosiveBottom], [wallRadius, explosiveBottom], [wallRadius, linerMouth], [0, linerApex]]));
    parts.push(part("Copper shaped-charge liner", "copper", [[0, linerApex], [wallRadius, linerMouth], [wallRadius, linerMouth + linerWall * 1.5], [0, linerApex + linerWall]]));
    parts.push(paintShell("Body paint (black)", "#232527", outer.slice(3), 0.2));
    parts.push(paintShell("Marking band (yellow)", "#d9b12a", [[bore - 0.3, ogiveStart - 60], [bore - 0.3, ogiveStart - 40]], 0.35));

    const probeTop = oal - 22;
    parts.push(part("Standoff probe", "steel", [[probeRadius - 2.5, innerTop[1]], [probeRadius, innerTop[1]], [probeRadius, probeTop], [probeRadius - 2.5, probeTop]]));
    parts.push(
      part("Nose impact switch", "aluminum", [
        [0, probeTop - 8],
        [probeRadius - 2.5, probeTop - 8],
        [probeRadius - 2.5, probeTop],
        [probeRadius, probeTop],
        [probeRadius * 1.15, probeTop + 6],
        [probeRadius * 0.9, oal - 3],
        [probeRadius * 0.6, oal],
        [0, oal],
      ]),
    );
    parts.push(part("Tracer", "tracer", [[0, spec.finBase], [6, spec.finBase], [6, spec.finBase + tracerLength], [0, spec.finBase + tracerLength]]));
    parts.push(
      part("Tail boom", "steel", [
        [6, spec.finBase],
        [boomRadius - 1, spec.finBase],
        [boomRadius, spec.finBase + 1],
        [boomRadius, bodyBase],
        [0, bodyBase],
        [0, spec.finBase + tracerLength],
        [6, spec.finBase + tracerLength],
      ]),
    );
    parts.push(part("Obturator band", "obturator", [[bore - 0.3, bourrelet + 6], [bore + 0.6, bourrelet + 7], [bore + 0.6, bourrelet + 22], [bore - 0.3, bourrelet + 22]]));

    const charge: Vec[] = [...clipY(caseInner, -Infinity, bodyBase), [0, spec.finBase], [boomRadius, spec.finBase], [boomRadius, bodyBase]];
    parts.push(part("Stick propellant", "powder", charge));
  }

  extras.push({
    kind: "ring",
    name: "Base markings",
    material: "steel",
    y: -0.3,
    inner: primerRadius * 1.05,
    outer: baseRadius - 3,
    facing: "down",
    texture: { kind: "headstamp", text: spec.kind === "apfsds" ? "120MM APFSDS-T" : "120MM HEAT-MP-T" },
  });
  return { parts, extras };
}
