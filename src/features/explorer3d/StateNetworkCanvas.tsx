import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DFA, MinimizationResult } from '../../engine';

interface Node3D {
  id: string;
  label: string;
  position: [number, number, number];
  isStart: boolean;
  isFinal: boolean;
  isUnreachable: boolean;
  groupIndex: number;
}

interface StateNetworkCanvasProps {
  mode: 'original' | 'minimized';
  result: MinimizationResult;
  yawAngle: number;
  pitchAngle: number;
  reducedMotion: boolean;
  resolvedTheme: 'light' | 'dark';
  onContextLost: () => void;
  onDragDelta: (dYaw: number, dPitch: number) => void;
}

function build3DNodes(
  dfa: DFA,
  result: MinimizationResult,
  mode: 'original' | 'minimized',
): Node3D[] {
  const finalSet = new Set(dfa.finalStateIds);
  const removedSet = new Set(result.removed);
  const classIndexOf = new Map<string, number>();

  result.classes.forEach((cls, idx) => {
    for (const m of cls) classIndexOf.set(m, idx);
  });

  if (mode === 'original') {
    const coords: Record<string, [number, number, number]> = {
      A: [-2.7, 0.35, 0.2],
      B: [-1.1, 0.95, 0.55],
      C: [-1.1, -0.55, -0.35],
      D: [0.6, 0.95, 0.45],
      E: [0.6, -0.55, -0.35],
      F: [2.2, 0.25, 0.15],
      U: [-0.2, -1.65, -0.9],
    };
    return dfa.states.map((s, idx) => ({
      id: s.id,
      label: s.label,
      position: coords[s.id] ?? [(idx - 3) * 0.9, 0, 0],
      isStart: dfa.startStateId === s.id,
      isFinal: finalSet.has(s.id),
      isUnreachable: removedSet.has(s.id),
      groupIndex: removedSet.has(s.id) ? -1 : classIndexOf.get(s.id) ?? 0,
    }));
  }

  return dfa.states.map((s, idx) => ({
    id: s.id,
    label: s.label,
    position: [(idx - 1.5) * 1.65, idx % 2 === 0 ? 0.3 : -0.25, idx % 2 === 0 ? 0.25 : -0.25],
    isStart: dfa.startStateId === s.id,
    isFinal: finalSet.has(s.id),
    isUnreachable: false,
    groupIndex: idx,
  }));
}

const GROUP_HEX = ['#344BC6', '#6A3EC8', '#0F766E', '#A86008'];

function NetworkScene({
  mode,
  result,
  yawAngle,
  pitchAngle,
  reducedMotion,
  resolvedTheme,
}: Omit<StateNetworkCanvasProps, 'onContextLost' | 'onDragDelta'>) {
  const groupRef = useRef<THREE.Group>(null);
  const { invalidate } = useThree();

  const dfa = mode === 'original' ? result.original : result.minimized;
  const nodes = useMemo(() => build3DNodes(dfa, result, mode), [dfa, mode, result]);
  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n.position])), [nodes]);

  const edgeLines = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; from: [number, number, number]; to: [number, number, number] }[] = [];
    for (const t of dfa.transitions) {
      if (t.from === t.to) continue;
      const key = `${t.from}->${t.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const from = posById.get(t.from);
      const to = posById.get(t.to);
      if (from && to) list.push({ key, from, to });
    }
    return list;
  }, [dfa.transitions, posById]);

  useEffect(() => {
    invalidate();
  }, [invalidate, mode, yawAngle, pitchAngle, resolvedTheme]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (reducedMotion) {
      groupRef.current.rotation.y = yawAngle;
      groupRef.current.rotation.x = pitchAngle;
      return;
    }
    const diffY = yawAngle - groupRef.current.rotation.y;
    const diffX = pitchAngle - groupRef.current.rotation.x;
    if (Math.abs(diffY) > 0.002 || Math.abs(diffX) > 0.002) {
      groupRef.current.rotation.y += diffY * Math.min(1, delta * 10);
      groupRef.current.rotation.x += diffX * Math.min(1, delta * 10);
      invalidate();
    }
  });

  const lineColor = resolvedTheme === 'dark' ? '#7E8798' : '#707B8C';

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 5]} intensity={0.75} />
      <group ref={groupRef}>
        {nodes.map((node) => {
          const color = node.isUnreachable
            ? '#8892A2'
            : GROUP_HEX[Math.max(0, node.groupIndex) % GROUP_HEX.length]!;
          return (
            <group key={node.id} position={node.position}>
              <mesh>
                <sphereGeometry args={[0.3, 24, 24]} />
                <meshStandardMaterial
                  color={color}
                  roughness={0.45}
                  metalness={0.08}
                  transparent={node.isUnreachable}
                  opacity={node.isUnreachable ? 0.45 : 1}
                />
              </mesh>
              {node.isFinal && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.42, 0.032, 12, 32]} />
                  <meshStandardMaterial color={resolvedTheme === 'dark' ? '#6CE2AC' : '#08734A'} />
                </mesh>
              )}
              {node.isStart && (
                <mesh position={[-0.55, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                  <coneGeometry args={[0.1, 0.25, 16]} />
                  <meshStandardMaterial color={resolvedTheme === 'dark' ? '#A6B2FF' : '#344BC6'} />
                </mesh>
              )}
            </group>
          );
        })}

        {edgeLines.map((edge) => {
          const points = [new THREE.Vector3(...edge.from), new THREE.Vector3(...edge.to)];
          const geo = new THREE.BufferGeometry().setFromPoints(points);
          return (
            <lineSegments key={edge.key} geometry={geo}>
              <lineBasicMaterial color={lineColor} />
            </lineSegments>
          );
        })}
      </group>
    </>
  );
}

export default function StateNetworkCanvas(props: StateNetworkCanvasProps) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      style={{ width: '100%', height: '100%', touchAction: 'pan-y' }}
      onPointerDown={(e) => {
        dragRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.x;
        const dy = e.clientY - dragRef.current.y;
        dragRef.current = { x: e.clientX, y: e.clientY };
        props.onDragDelta(dx * 0.008, dy * 0.006);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.35, 6.2], fov: 42 }}
        onCreated={({ gl }) => {
          const canvasEl = gl.domElement;
          canvasEl.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            props.onContextLost();
          });
        }}
      >
        <NetworkScene
          mode={props.mode}
          result={props.result}
          yawAngle={props.yawAngle}
          pitchAngle={props.pitchAngle}
          reducedMotion={props.reducedMotion}
          resolvedTheme={props.resolvedTheme}
        />
      </Canvas>
    </div>
  );
}
