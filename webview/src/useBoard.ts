import { createContext, useContext } from 'react';
import { useStore } from 'zustand';
import type { BoardActions, BoardState, BoardStore } from './store';

export const BoardContext = createContext<BoardStore | null>(null);

export function useBoardStore(): BoardStore {
  const store = useContext(BoardContext);
  if (!store) throw new Error('BoardContext is missing');
  return store;
}

export function useBoard<T>(selector: (state: BoardState & BoardActions) => T): T {
  return useStore(useBoardStore(), selector);
}
