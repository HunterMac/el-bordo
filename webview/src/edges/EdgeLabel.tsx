import { useEffect, useRef, useState } from 'react';
import type { Point } from '../geometry';
import { useBoard, useBoardStore } from '../useBoard';
import { keepNativeUndo } from '../ui/textKeys';

interface Props {
  edgeId: string;
  label: string;
  at: Point;
}

/** Label at the middle of a line. Editing is inline; an empty label is removed from the file. */
export function EdgeLabel({ edgeId, label, at }: Props) {
  const store = useBoardStore();
  const editing = useBoard((s) => s.labelEditing === edgeId);
  const [draft, setDraft] = useState(label);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    if (editing) {
      done.current = false;
      setDraft(label);
      ref.current?.focus();
      ref.current?.select();
    }
    // Reset the draft only when edit mode starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (label === '' && !editing) return null;

  const finish = () => {
    if (done.current) return;
    done.current = true;
    const state = store.getState();
    state.setLabelEditing(null);
    const next = draft.trim();
    if (next !== label) state.updateEdge(edgeId, { label: next });
  };

  const style = { transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` };
  if (editing) {
    return (
      <div className="eb-edge-label editing nodrag nopan" style={style}>
        <input
          ref={ref}
          className="nowheel"
          value={draft}
          size={Math.max(6, draft.length + 1)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            keepNativeUndo(e);
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              finish();
            }
          }}
        />
      </div>
    );
  }
  return (
    <div className="eb-edge-label nodrag nopan" style={style} onDoubleClick={() => store.getState().setLabelEditing(edgeId)}>
      {label}
    </div>
  );
}
