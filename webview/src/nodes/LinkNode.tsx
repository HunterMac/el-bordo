import type { NodeProps, Node } from '@xyflow/react';
import type { LinkNode as LinkModel } from '../../../src/shared/canvasFormat';
import { useBoardStore } from '../useBoard';
import { Codicon } from '../ui/icons';
import { ConnectionBalls } from './ConnectionBalls';
import { ResizeCorner } from './ResizeCorner';

export type LinkRFNode = Node<{ model: LinkModel }, 'link'>;

export function LinkNode({ data }: NodeProps<LinkRFNode>) {
  const node = data.model;
  const store = useBoardStore();
  return (
    <>
      <div className="eb-node eb-link" title={node.url} onDoubleClick={() => store.getState().openUrl(node.url)}>
        <Codicon name="link" className="eb-link-icon" />
        <span className="eb-link-url">{node.url}</span>
      </div>
      <ConnectionBalls />
      <ResizeCorner id={node.id} />
    </>
  );
}
