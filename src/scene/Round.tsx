import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { revolvedGeometry, ringGeometry } from "../model/geometry";
import { crimpTexture, getMaterial, headstampTexture } from "../model/materials";
import type { Extra, Model } from "../model/types";

export type Hover = { name: string; point: [number, number, number] } | null;

type Props = {
  model: Model;
  cut: boolean;
  x: number;
  hovered: string | null;
  onHover: (hover: Hover) => void;
};

export function Round(props: Props) {
  const model = props.model;
  const cut = props.cut;

  const geometries = useMemo(
    () => model.parts.map((part) => revolvedGeometry(part.profile, part.closed, cut, part.holes)),
    [model, cut],
  );
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);

  const handlers = (name: string) => ({
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      props.onHover({ name, point: [event.point.x, event.point.y, event.point.z] });
    },
    onPointerOut: () => props.onHover(null),
  });

  return (
    <group position={[props.x, 0, 0]}>
      {model.parts.map((part, index) => (
        <mesh
          key={`${part.name}-${index}`}
          geometry={geometries[index]}
          material={
            cut && part.closed
              ? [
                  getMaterial(part.material, model.powder, props.hovered === part.name, false),
                  getMaterial(part.material, model.powder, props.hovered === part.name, true),
                ]
              : getMaterial(part.material, model.powder, props.hovered === part.name, false)
          }
          {...handlers(part.name)}
        />
      ))}
      {model.extras.map((extra, index) => (
        <ExtraMesh
          key={`${extra.name}-${index}`}
          extra={extra}
          model={model}
          cut={cut}
          highlighted={props.hovered === extra.name}
          handlers={handlers(extra.name)}
        />
      ))}
    </group>
  );
}

type ExtraProps = {
  extra: Extra;
  model: Model;
  cut: boolean;
  highlighted: boolean;
  handlers: {
    onPointerOver: (event: ThreeEvent<PointerEvent>) => void;
    onPointerOut: () => void;
  };
};

function ExtraMesh(props: ExtraProps) {
  const extra = props.extra;
  const cut = props.cut;
  const base = getMaterial(extra.material, props.model.powder, props.highlighted, false);

  const built = useMemo(() => {
    if (extra.kind === "ring") {
      const geometry = ringGeometry(extra.inner, extra.outer, extra.facing, cut);
      const material = base.clone();
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -2;
      if (extra.texture?.kind === "headstamp") {
        const texture = headstampTexture(extra.texture.text, extra.inner, extra.outer);
        material.map = texture;
        material.bumpMap = texture;
        material.bumpScale = 3;
      }
      if (extra.texture?.kind === "crimp") {
        const texture = crimpTexture(extra.texture.folds);
        material.map = texture;
        material.bumpMap = texture;
        material.bumpScale = 4;
      }
      return { kind: "single" as const, geometry, material, items: [] as THREE.Matrix4[] };
    }
    if (extra.kind === "pellets") {
      const geometry = new THREE.SphereGeometry(extra.radius, 18, 12);
      const items = extra.positions
        .filter((position) => cut && position[2] <= extra.radius * 0.35)
        .map((position) => new THREE.Matrix4().makeTranslation(position[0], position[1], position[2]));
      return { kind: "instanced" as const, geometry, material: base, items };
    }
    if (extra.kind === "fins") {
      const shape = new THREE.Shape(extra.outline.map((point) => new THREE.Vector2(point[0], point[1])));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: extra.thickness, bevelEnabled: false });
      geometry.translate(0, 0, -extra.thickness / 2);
      const items: THREE.Matrix4[] = [];
      for (let index = 0; index < extra.count; index++) {
        const angle = (index / extra.count) * Math.PI * 2;
        if (cut && Math.sin(angle) < -1e-6) continue;
        items.push(new THREE.Matrix4().makeRotationY(angle));
      }
      return { kind: "instanced" as const, geometry, material: base, items };
    }
    if (extra.kind === "flash-holes") {
      const height = extra.y1 - extra.y0;
      const geometry = new THREE.CylinderGeometry(extra.radius, extra.radius, height, 16, 1, true, Math.PI / 2, Math.PI);
      const items = cut
        ? [-1, 1].map((side) => new THREE.Matrix4().makeTranslation(side * extra.offset, (extra.y0 + extra.y1) / 2, 0))
        : [];
      return { kind: "instanced" as const, geometry, material: base, items };
    }
    throw new Error("Unknown extra");
  }, [extra, cut, base]);

  useEffect(
    () => () => {
      built.geometry.dispose();
      if (built.material !== base) built.material.dispose();
    },
    [built, base],
  );

  if (built.kind === "single") {
    return (
      <mesh geometry={built.geometry} material={built.material} position={[0, extra.kind === "ring" ? extra.y : 0, 0]} {...props.handlers} />
    );
  }
  if (built.items.length === 0) return null;
  return (
    <instancedMesh
      key={built.items.length}
      args={[built.geometry, built.material, built.items.length]}
      ref={(mesh) => {
        if (!mesh) return;
        built.items.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }}
      {...props.handlers}
    />
  );
}
