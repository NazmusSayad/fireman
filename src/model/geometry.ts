import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export type Vec = [number, number];

const radialSegments = 160;
const sharpCorner = Math.cos((32 * Math.PI) / 180);

export function revolvedGeometry(profile: Vec[], closed: boolean, cut: boolean, holes: Vec[][]) {
  const points = dedupe(profile);
  const pieces: THREE.BufferGeometry[] = smoothRuns(points, closed).map(
    (run) =>
      new THREE.LatheGeometry(
        run.map((point) => new THREE.Vector2(point[0], point[1])),
        radialSegments,
        cut ? Math.PI / 2 : 0,
        cut ? Math.PI : Math.PI * 2,
      ),
  );
  const surface = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  if (!(cut && closed)) return surface;
  const faces = [cutFace(points, holes, 1), cutFace(points, holes, -1)];
  const face = mergeGeometries(faces);
  const merged = mergeGeometries([surface, face], true);
  [surface, face, ...faces].forEach((piece) => piece.dispose());
  return merged;
}

function cutFace(points: Vec[], holes: Vec[][], side: number) {
  const shape = new THREE.Shape(points.map((point) => new THREE.Vector2(point[0] * side, point[1])));
  for (const hole of holes) {
    shape.holes.push(new THREE.Path(hole.map((point) => new THREE.Vector2(point[0] * side, point[1]))));
  }
  return new THREE.ShapeGeometry(shape);
}

function dedupe(points: Vec[]) {
  const result: Vec[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last[0] - point[0]) < 1e-6 && Math.abs(last[1] - point[1]) < 1e-6) continue;
    result.push(point);
  }
  const first = result[0];
  const last = result[result.length - 1];
  if (result.length > 2 && Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) result.pop();
  return result;
}

function smoothRuns(points: Vec[], closed: boolean) {
  const edgeCount = closed ? points.length : points.length - 1;
  const edges: { from: Vec; to: Vec; direction: Vec; onAxis: boolean }[] = [];
  for (let index = 0; index < edgeCount; index++) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    edges.push({
      from,
      to,
      direction: [(to[0] - from[0]) / length, (to[1] - from[1]) / length],
      onAxis: from[0] < 1e-6 && to[0] < 1e-6,
    });
  }

  const breaksBefore = edges.map((edge, index) => {
    if (edge.onAxis) return true;
    const previous = index > 0 ? edges[index - 1] : closed ? edges[edges.length - 1] : undefined;
    if (!previous || previous.onAxis) return true;
    return previous.direction[0] * edge.direction[0] + previous.direction[1] * edge.direction[1] < sharpCorner;
  });

  const start = closed ? Math.max(breaksBefore.indexOf(true), 0) : 0;
  const runs: Vec[][] = [];
  let current: Vec[] = [];
  for (let offset = 0; offset < edges.length; offset++) {
    const index = (start + offset) % edges.length;
    const edge = edges[index];
    if (breaksBefore[index] && current.length > 0) {
      runs.push(current);
      current = [];
    }
    if (edge.onAxis) continue;
    if (current.length === 0) current.push(edge.from);
    current.push(edge.to);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

export function ringGeometry(inner: number, outer: number, facing: "up" | "down", cut: boolean) {
  const thetaStart = cut ? (facing === "down" ? Math.PI : 0) : 0;
  const geometry = new THREE.RingGeometry(inner, outer, radialSegments, 1, thetaStart, cut ? Math.PI : Math.PI * 2);
  geometry.rotateX(facing === "down" ? Math.PI / 2 : -Math.PI / 2);
  return geometry;
}
