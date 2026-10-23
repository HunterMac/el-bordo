import type { ReactNode } from 'react';
import { isBoardNode } from '../../../src/shared/canvasFormat';
import { useBoard, useBoardStore } from '../useBoard';
import type { Point } from '../geometry';
import { Codicon } from './icons';

interface Item {
  label: string;
  icon: string;
  run(): void;
}

/** Custom right-click menu: objects, lines, and the empty board. */
export function ContextMenu({ origin, viewCenter }: { origin: { left: number; top: number }; viewCenter: () => Point }) {
  const store = useBoardStore();
  const menu = useBoard((s) => s.contextMenu);
  if (!menu) return null;

  const api = () => store.getState();
  const close = () => api().setContextMenu(null);
  const paste = async () => {
    const text = await api().readClipboard();
    api().pasteText(text, viewCenter(), menu.flow);
  };
  const copy = () => {
    const text = api().copyText();
    if (text) api().writeClipboard(text);
  };

  const items: Item[] = [];
  const { target } = menu;
  if (target.kind === 'node') {
    const node = api().doc.nodes.find((n) => isBoardNode(n) && n.id === target.id);
    items.push({ label: 'Copy', icon: 'copy', run: copy }, { label: 'Paste', icon: 'clippy', run: () => void paste() }, { label: 'Duplicate', icon: 'files', run: () => api().duplicateSelection() });
    if (node?.kind === 'file') items.push({ label: 'Open in editor', icon: 'go-to-file', run: () => api().openFile(node.file) });
    if (node?.kind === 'link') {
      items.push(
        { label: 'Open link', icon: 'link', run: () => api().openUrl(node.url) },
        {
          label: 'Edit URL',
          icon: 'edit',
          run: () => void api().promptUrl(node.url).then((url) => url && api().updateNode(node.id, { url })),
        },
      );
    }
    items.push({ label: 'Delete', icon: 'trash', run: () => api().deleteSelection() });
  } else if (target.kind === 'edge') {
    items.push({ label: 'Delete', icon: 'trash', run: () => api().deleteEdge(target.id) });
  } else {
    items.push({ label: 'Paste', icon: 'clippy', run: () => void paste() });
  }

  const row = (item: Item): ReactNode => (
    <button
      key={item.label}
      type="button"
      className="eb-menu-item"
      onClick={() => {
        close();
        item.run();
      }}
    >
      <Codicon name={item.icon} />
      {item.label}
    </button>
  );

  return (
    <>
      <div className="eb-backdrop" onPointerDown={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div className="eb-menu eb-ui" style={{ left: menu.screen.x - origin.left, top: menu.screen.y - origin.top }}>
        {items.map(row)}
      </div>
    </>
  );
}
