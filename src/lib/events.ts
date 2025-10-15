export const ENTRIES_CHANGED = 'entries:changed';

export function notifyEntriesChanged() {
  window.dispatchEvent(new Event(ENTRIES_CHANGED));
}

export function onEntriesChanged(cb: () => void) {
  const h = () => cb();
  window.addEventListener(ENTRIES_CHANGED, h);
  return () => window.removeEventListener(ENTRIES_CHANGED, h);
}
