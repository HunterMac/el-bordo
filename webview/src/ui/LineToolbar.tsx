import type { BoardEdge } from '../../../src/shared/canvasFormat';
import type { Point } from '../geometry';
import { useBoardStore } from '../useBoard';
import { ArrowEndIcon, Codicon, LabelIcon } from './icons';

/** Floating toolbar at the midpoint of a single selected line. */
export function LineToolbar({ edge, at, zoom, hasLabel }: { edge: BoardEdge; at: Point; zoom: number; hasLabel: boolean }) {
  const store = useBoardStore();
  const api = () => store.getState();
  const offset = (hasLabel ? 34 : 22) / zoom;
  return (
    <div
      className="eb-toolbar eb-ui nodrag nopan"
      style={{ transform: `translate(${at.x}px, ${at.y - offset}px) scale(${1 / zoom}) translate(-50%, -100%)` }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`eb-btn${edge.fromEnd === 'arrow' ? ' active' : ''}`}
        title="Arrow at start"
        onClick={() => api().updateEdge(edge.id, { fromEnd: edge.fromEnd === 'arrow' ? 'none' : 'arrow' })}
      >
        <ArrowEndIcon at="start" on={edge.fromEnd === 'arrow'} />
      </button>
      <button
        type="button"
        className={`eb-btn${edge.toEnd === 'arrow' ? ' active' : ''}`}
        title="Arrow at end"
        onClick={() => api().updateEdge(edge.id, { toEnd: edge.toEnd === 'arrow' ? 'none' : 'arrow' })}
      >
        <ArrowEndIcon at="end" on={edge.toEnd === 'arrow'} />
      </button>
      <button type="button" className="eb-btn" title="Add label" onClick={() => api().setLabelEditing(edge.id)}>
        <LabelIcon />
      </button>
      <button type="button" className="eb-btn" title="Delete" onClick={() => api().deleteEdge(edge.id)}>
        <Codicon name="trash" />
      </button>
    </div>
  );
}
