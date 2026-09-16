export function bindValueObserver<T>(
  listeners: Set<() => void>,
  read: () => T,
  listener: (value: T) => void,
): () => void {
  let last = read();
  listener(last);
  const onChange = (): void => {
    const next = read();
    if (next !== last) {
      last = next;
      listener(next);
    }
  };
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}
