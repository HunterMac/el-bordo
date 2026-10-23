import { ViewportPortal } from '@xyflow/react';
import { useBoard } from '../useBoard';
import { GUIDE_COLOR } from '../snapping';

/** Magenta alignment lines shown while a drag is snapped to other objects. */
export function SnapGuides() {
  const guides = useBoard((s) => s.snapGuides);
  if (guides.length === 0) return null;
  return (
    <ViewportPortal>
      <svg className="eb-snap-guides">
        {guides.map((g) => (
          <line
            key={`${g.axis}:${g.at}`}
            x1={g.axis === 'x' ? g.at : g.from}
            x2={g.axis === 'x' ? g.at : g.to}
            y1={g.axis === 'x' ? g.from : g.at}
            y2={g.axis === 'x' ? g.to : g.at}
            stroke={GUIDE_COLOR}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            shapeRendering="crispEdges"
          />
        ))}
      </svg>
    </ViewportPortal>
  );
}
