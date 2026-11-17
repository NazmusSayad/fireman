import { type ComponentRef, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { buildModel } from "../model/build";
import type { Load } from "../model/types";
import { ReferenceObject, type Reference } from "./ReferenceObjects";
import { Round, type Hover } from "./Round";

type Props = {
  load: Load;
  frameId: string;
  reference: Reference | null;
  hover: Hover;
  highlighted: string | null;
  onHover: (hover: Hover) => void;
};

export function Viewer(props: Props) {
  const model = useMemo(() => buildModel(props.load), [props.load]);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const reference = props.reference;
  const spacing = model.radius * 2 + Math.max(model.radius * 1.4, model.height * 0.1);
  const left = -spacing / 2 - model.radius;
  const roundsRight = spacing / 2 + model.radius;
  const referenceX = reference ? roundsRight + Math.max(spacing - model.radius * 2, reference.width * 0.25) + reference.width / 2 : 0;
  const right = reference ? referenceX + reference.width / 2 : roundsRight;
  const sceneHeight = reference ? Math.max(model.height, reference.height) : model.height;
  const depth = reference ? Math.max(model.radius * 2, reference.depth) : model.radius * 2;
  const labelGap = Math.max(sceneHeight * 0.06, model.radius * 0.6);
  const labelY = model.height + labelGap;
  const referenceLabelY = reference ? reference.height + labelGap : 0;
  const centerX = (left + right) / 2;
  const frameHeight = Math.max(labelY, referenceLabelY);
  const roundLabels = spacing > frameHeight * 0.08;

  const intactLabel = useRef<HTMLSpanElement>(null);
  const cutLabel = useRef<HTMLSpanElement>(null);
  const referenceLabel = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ fov: 30 }} dpr={[1, 2]}>
        <color attach="background" args={["#0c0d0f"]} />
        <Environment resolution={512}>
          <Lightformer form="rect" intensity={2.4} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
          <Lightformer form="rect" intensity={2} position={[-6, 1, 2]} rotation-y={Math.PI / 2} scale={[2, 9, 1]} />
          <Lightformer form="rect" intensity={1.4} position={[6, 1, 3]} rotation-y={-Math.PI / 2} scale={[2, 9, 1]} />
          <Lightformer form="ring" intensity={1.2} position={[0, 2, 9]} scale={5} />
          <Lightformer form="rect" intensity={0.5} position={[0, -5, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} />
        </Environment>
        <directionalLight position={[2, 6, 4]} intensity={0.6} />

        <Framing controls={controls} id={props.frameId} centerX={centerX} width={right - left} height={frameHeight} depth={depth} />
        <Round model={model} cut={false} x={-spacing / 2} hovered={props.highlighted} onHover={props.onHover} />
        <Round model={model} cut x={spacing / 2} hovered={props.highlighted} onHover={props.onHover} />
        {roundLabels && <Anchor element={intactLabel} position={[-spacing / 2, labelY, 0]} />}
        {roundLabels && <Anchor element={cutLabel} position={[spacing / 2, labelY, 0]} />}
        {reference && <ReferenceObject reference={reference} x={referenceX} onHover={props.onHover} />}
        {reference && <Anchor element={referenceLabel} position={[referenceX, referenceLabelY, 0]} />}
        <Anchor element={tooltip} position={props.hover?.point ?? null} />

        <ContactShadows
          key={`shadow-${props.frameId}-${reference?.id ?? "none"}`}
          position={[0, -sceneHeight * 0.0005, 0]}
          scale={[Math.max(-left, right) * 3.2, Math.max(model.radius * 8, depth * 4)]}
          far={sceneHeight * 0.5}
          blur={2.2}
          opacity={0.6}
          resolution={1024}
          frames={1}
        />
        <OrbitControls ref={controls} makeDefault enableDamping />
      </Canvas>

      {roundLabels && (
        <>
          <span ref={intactLabel} className="pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-full text-xs font-medium tracking-wide text-neutral-500 select-none">
            Intact
          </span>
          <span ref={cutLabel} className="pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-full text-xs font-medium tracking-wide text-neutral-500 select-none">
            Cutaway
          </span>
        </>
      )}
      {reference && (
        <span ref={referenceLabel} className="pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-full text-xs font-medium tracking-wide whitespace-nowrap text-neutral-500 select-none">
          {reference.name}
        </span>
      )}
      <div ref={tooltip} className="pointer-events-none absolute top-0 left-0">
        {props.hover && (
          <div className="ml-3 -translate-y-1/2 rounded-md bg-neutral-900/90 px-2 py-1 text-xs whitespace-nowrap text-neutral-100 ring-1 ring-white/10">
            {props.hover.name}
          </div>
        )}
      </div>
    </div>
  );
}

const projected = new THREE.Vector3();

function Anchor(props: { element: RefObject<HTMLElement | null>; position: [number, number, number] | null }) {
  useFrame((state) => {
    const element = props.element.current;
    if (!element || !props.position) return;
    projected.set(props.position[0], props.position[1], props.position[2]).project(state.camera);
    const x = ((projected.x + 1) / 2) * state.size.width;
    const y = ((1 - projected.y) / 2) * state.size.height;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  });
  return null;
}

const viewDirection = new THREE.Vector3(0.22, 0.3, 1).normalize();

type FramingProps = {
  controls: RefObject<ComponentRef<typeof OrbitControls> | null>;
  id: string;
  centerX: number;
  width: number;
  height: number;
  depth: number;
};

function Framing(props: FramingProps) {
  const camera = useThree((state) => state.camera);
  const aspect = useThree((state) => state.size.width / state.size.height);

  useEffect(() => {
    const controls = props.controls.current;
    if (!(camera instanceof THREE.PerspectiveCamera) || !controls) return;
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const fitHeight = props.height / 2 / Math.tan(halfFov);
    const fitWidth = props.width / 2 / (Math.tan(halfFov) * aspect);
    const distance = Math.max(fitHeight, fitWidth) * 1.18 + props.depth;
    const target = new THREE.Vector3(props.centerX, props.height * 0.47, 0);
    camera.position.copy(target).addScaledVector(viewDirection, distance);
    camera.near = distance / 200;
    camera.far = distance * 50;
    camera.updateProjectionMatrix();
    controls.target.copy(target);
    controls.update();
  }, [props.controls, props.id, props.centerX, props.width, props.height, props.depth, camera, aspect]);

  return null;
}
