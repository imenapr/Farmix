/**
 * Tiny global event bus for cross-component communication.
 * MVP goal: simple pub/sub without dependencies.
 */

/** @typedef {(payload: any) => void} Handler */

/** @type {Map<string, Set<Handler>>} */
const listeners = new Map();

export function on(eventName, handler) {
  const set = listeners.get(eventName) ?? new Set();
  set.add(handler);
  listeners.set(eventName, set);
  return () => off(eventName, handler);
}

export function once(eventName, handler) {
  const offFn = on(eventName, (payload) => {
    offFn();
    handler(payload);
  });
  return offFn;
}

export function off(eventName, handler) {
  const set = listeners.get(eventName);
  if (!set) return;
  set.delete(handler);
  if (set.size === 0) listeners.delete(eventName);
}

export function emit(eventName, payload) {
  const set = listeners.get(eventName);
  if (!set) return;
  for (const handler of set) handler(payload);
}

