import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const LONG_PRESS_MS = 480;
const MOVE_THRESHOLD_PX = 10;

export interface TransactionItemBind {
  onPointerDown: (event: React.PointerEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onClick: (event: React.MouseEvent) => void;
}

interface PressState {
  transactionId: string;
  startX: number;
  startY: number;
  timer: number;
}

export function useTransactionMoveSelection(enabled: boolean) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedIdsRef = useRef(selectedIds);
  const enabledRef = useRef(enabled);
  const suppressClickRef = useRef(false);
  const pressRef = useRef<PressState | null>(null);

  selectedIdsRef.current = selectedIds;
  enabledRef.current = enabled;

  const clearPress = useCallback(() => {
    const press = pressRef.current;
    if (press) {
      window.clearTimeout(press.timer);
      pressRef.current = null;
    }
  }, []);

  const selectId = useCallback((transactionId: string) => {
    setSelectedIds((prev) => {
      if (prev.has(transactionId)) return prev;
      const next = new Set(prev);
      next.add(transactionId);
      return next;
    });
  }, []);

  const toggleId = useCallback((transactionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(transactionId)) next.delete(transactionId);
      else next.add(transactionId);
      return next;
    });
  }, []);

  const addIds = useCallback((transactionIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      transactionIds.forEach((id) => {
        if (!id || next.has(id)) return;
        next.add(id);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  const removeIds = useCallback((transactionIds: string[]) => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      transactionIds.forEach((id) => {
        if (!next.has(id)) return;
        next.delete(id);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    const cancelIfMoved = (event: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      const dx = event.clientX - press.startX;
      const dy = event.clientY - press.startY;
      if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) {
        clearPress();
      }
    };

    const endPress = () => {
      clearPress();
    };

    window.addEventListener('pointermove', cancelIfMoved);
    window.addEventListener('pointerup', endPress);
    window.addEventListener('pointercancel', endPress);
    return () => {
      window.removeEventListener('pointermove', cancelIfMoved);
      window.removeEventListener('pointerup', endPress);
      window.removeEventListener('pointercancel', endPress);
      clearPress();
    };
  }, [clearPress]);

  useEffect(() => {
    if (!enabled) clearSelection();
  }, [enabled, clearSelection]);

  useEffect(() => {
    if (selectedIds.size === 0) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds.size, clearSelection]);

  const bindItem = useCallback(
    (transactionId: string): TransactionItemBind => ({
      onPointerDown: (event: React.PointerEvent) => {
        if (!enabledRef.current || event.button !== 0 || !transactionId) return;
        clearPress();
        const timer = window.setTimeout(() => {
          pressRef.current = null;
          suppressClickRef.current = true;
          selectId(transactionId);
          try {
            navigator.vibrate?.(15);
          } catch {
            // vibration is optional
          }
        }, LONG_PRESS_MS);
        pressRef.current = {
          transactionId,
          startX: event.clientX,
          startY: event.clientY,
          timer
        };
      },
      onContextMenu: (event: React.MouseEvent) => {
        event.preventDefault();
      },
      onClick: (event: React.MouseEvent) => {
        if (consumeSuppressedClick()) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (!enabledRef.current || !transactionId) return;
        const isSelecting = selectedIdsRef.current.size > 0;
        if (isSelecting || event.ctrlKey || event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          toggleId(transactionId);
        }
      }
    }),
    [clearPress, consumeSuppressedClick, selectId, toggleId]
  );

  const pruneToExistingIds = useCallback((existingIds: Set<string>) => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (existingIds.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const isSelected = useCallback(
    (transactionId: string) => selectedIds.has(transactionId),
    [selectedIds]
  );

  return {
    selectedIds,
    selectedList,
    isSelecting: selectedIds.size > 0,
    isSelected,
    toggleId,
    selectId,
    addIds,
    removeIds,
    clearSelection,
    bindItem,
    consumeSuppressedClick,
    pruneToExistingIds
  };
}
