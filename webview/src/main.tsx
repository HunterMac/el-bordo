import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@vscode/codicons/dist/codicon.css';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { App } from './App';
import { createBoardStore } from './store';
import { BoardContext } from './useBoard';
import { postMessage } from './vscodeApi';
import type { ExtensionMessage } from '../../src/shared/protocol';

const store = createBoardStore(postMessage);

window.addEventListener('message', (event: MessageEvent<ExtensionMessage>) => {
  store.getState().handleMessage(event.data);
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BoardContext.Provider value={store}>
      <App />
    </BoardContext.Provider>
  </StrictMode>,
);

postMessage({ type: 'ready' });
