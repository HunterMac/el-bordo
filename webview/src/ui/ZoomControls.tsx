import { useEffect } from 'react';
import { Panel, useReactFlow, useStore } from '@xyflow/react';
import { useBoard, useBoardStore } from '../useBoard';
import { GridIcon } from './icons';

const STEPS = [10, 25, 50, 75, 100, 150, 200, 300, 400];

/** Bottom-right: grid toggle, zoom out, percentage (click to reset), zoom in. */
export function ZoomControls() {
  const rf = useReactFlow();
  const store = useBoardStore();
  const zoom = useStore((s) => s.transform[2]);
  const gridEnabled = useBoard((s) => s.settings.gridEnabled);
  const percent = Math.round(zoom * 100);
  useEffect(() => {
    document.documentElement.style.setProperty('--eb-zoom', String(zoom));
  }, [zoom]);

  const zoomTo = (step: number) => void rf.zoomTo(step / 100, { duration: 120 });
  const zoomIn = () => zoomTo(STEPS.find((s) => s > percent + 0.5) ?? STEPS[STEPS.length - 1]);
  const zoomOut = () => zoomTo([...STEPS].reverse().find((s) => s < percent - 0.5) ?? STEPS[0]);

  return (
    <Panel position="bottom-right" className="eb-zoom-panels">
      <div className="eb-ui eb-zoom">
        <button type="button" className={`eb-btn${gridEnabled ? ' active' : ''}`} title={gridEnabled ? 'Hide grid' : 'Show grid'} onClick={() => store.getState().setGrid(!gridEnabled)}>
          <GridIcon />
        </button>
      </div>
      <div className="eb-ui eb-zoom">
        <button type="button" className="eb-btn" title="Zoom out" onClick={zoomOut}>
          −
        </button>
        <button type="button" className="eb-btn eb-zoom-label" title="Reset zoom to 100%" onClick={() => zoomTo(100)}>
          {percent}%
        </button>
        <button type="button" className="eb-btn" title="Zoom in" onClick={zoomIn}>
          +
        </button>
      </div>
    </Panel>
  );
}
