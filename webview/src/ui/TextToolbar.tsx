import { NodeToolbar, Position } from '@xyflow/react';
import { FONT_SIZES, PALETTE, type Align, type BoardNode } from '../../../src/shared/canvasFormat';
import { useBoard, useBoardStore } from '../useBoard';
import { AlignIcon, Codicon } from './icons';

const ALIGNS: Align[] = ['left', 'center', 'right'];

type StyledNode = Extract<BoardNode, { kind: 'sticky' | 'rectangle' | 'file' }>;

/** Floating toolbar above a single selected sticky, rectangle, or file reference. */
export function TextToolbar({ node }: { node: StyledNode }) {
  const store = useBoardStore();
  const visible = useBoard((s) => s.selNodes.length === 1 && s.selNodes[0] === node.id && s.selEdges.length === 0);
  const withColor = node.kind !== 'file';
  const update = (patch: Record<string, unknown>) => store.getState().updateNode(node.id, patch);
  const sizes = (FONT_SIZES as readonly number[]).includes(node.fontSize) ? FONT_SIZES : [...FONT_SIZES, node.fontSize].sort((a, b) => a - b);

  return (
    <NodeToolbar isVisible={visible} position={Position.Top} offset={12}>
      <div className="eb-toolbar eb-ui nodrag nopan" onDoubleClick={(e) => e.stopPropagation()}>
        <select
          className="eb-select"
          title="Font size"
          value={node.fontSize}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
        >
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {withColor && (
          <div className="eb-swatches" role="group" aria-label="Color">
            {PALETTE.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`eb-swatch${node.color?.toUpperCase() === p.value.toUpperCase() ? ' active' : ''}`}
                style={{ background: p.fill, borderColor: p.border }}
                title={p.name}
                onClick={() => update({ color: p.value })}
              />
            ))}
          </div>
        )}
        <div className="eb-btn-group" role="group" aria-label="Alignment">
          {ALIGNS.map((a) => (
            <button key={a} type="button" className={`eb-btn${node.align === a ? ' active' : ''}`} title={`Align ${a}`} onClick={() => update({ align: a })}>
              <AlignIcon align={a} />
            </button>
          ))}
        </div>
        <button type="button" className={`eb-btn${node.bold ? ' active' : ''}`} title="Bold" onClick={() => update({ bold: !node.bold })}>
          <Codicon name="bold" />
        </button>
        <button type="button" className="eb-btn" title="Delete" onClick={() => store.getState().deleteNode(node.id)}>
          <Codicon name="trash" />
        </button>
      </div>
    </NodeToolbar>
  );
}
