// Serializes operations that can change document identity or its saved baseline.
// A rejected operation does not poison the queue.
export function createDocumentOperationQueue() {
  let tail = Promise.resolve();

  return Object.freeze({
    enqueue(operation) {
      if (typeof operation !== 'function') {
        return Promise.reject(new TypeError('Document operation must be a function.'));
      }

      const result = tail.then(() => operation());
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  });
}
