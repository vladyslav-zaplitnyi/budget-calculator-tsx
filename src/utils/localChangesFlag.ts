/**
 * Прапорець «є локальні зміни, які ще не підтверджені Firestore».
 *
 * Навіщо: realtime-підписка (onSnapshot) отримує повний документ із сервера.
 * Якщо застосувати такий снапшот, поки локальна зміна (нова транзакція) ще
 * чекає на 2-секундний debounce або на відповідь сервера, — застарілі дані
 * з хмари затирають щойно введене (помітно на iOS Safari, де вкладку
 * призупиняють/відновлюють і снапшот приходить із затримкою).
 *
 * Життєвий цикл:
 * 1. useSyncDebounce: локальний стан змінився → markLocalChangesDirty()
 * 2. useFirestoreSync: поки прапорець true — вхідні снапшоти ігноруються
 * 3. useSyncDebounce: проміс запису у Firestore завершився → clearLocalChangesDirty()
 */
let dirty = false;
// Версія змін: запис, що завершився, скидає прапорець лише тоді, коли після
// його старту не зʼявилося новіших локальних змін.
let version = 0;

type LocalChangesListener = (dirty: boolean) => void;
const listeners = new Set<LocalChangesListener>();

const setDirty = (next: boolean): void => {
  dirty = next;
  listeners.forEach((listener) => listener(next));
};

export const markLocalChangesDirty = (): number => {
  version += 1;
  if (!dirty) setDirty(true);
  return version;
};

/** Без аргументу — скидає завжди. З версією — лише якщо новіших змін не було. */
export const clearLocalChangesDirty = (upToVersion?: number): void => {
  if (upToVersion !== undefined && upToVersion !== version) return;
  if (dirty) setDirty(false);
};

export const hasLocalChangesDirty = (): boolean => dirty;

export const subscribeLocalChangesFlag = (listener: LocalChangesListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
