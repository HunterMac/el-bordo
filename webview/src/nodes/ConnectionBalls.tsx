import { Handle, Position } from '@xyflow/react';

const SIDES = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
] as const;

/** Four balls in the middle of the edges. Every ball is a source handle (ConnectionMode.Loose). */
export function ConnectionBalls() {
  return (
    <>
      {SIDES.map(([side, position]) => (
        <Handle key={side} id={side} type="source" position={position} className="eb-ball nodrag" />
      ))}
    </>
  );
}
