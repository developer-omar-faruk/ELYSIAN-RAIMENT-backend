const TTL_MS = 5_000;

let cache;
let expiresAt = 0;
let generation = 0;
let pending;

export function getBootstrapCache(load) {
  if (cache !== undefined && expiresAt > Date.now()) return Promise.resolve(cache);

  const currentGeneration = generation;
  if (pending?.generation === currentGeneration) return pending.promise;

  const promise = Promise.resolve()
    .then(load)
    .then((value) => {
      if (generation === currentGeneration) {
        cache = value;
        expiresAt = Date.now() + TTL_MS;
      }
      return value;
    })
    .finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });

  pending = { generation: currentGeneration, promise };
  return promise;
}

export function invalidateBootstrapCache() {
  generation++;
  cache = undefined;
  expiresAt = 0;
  pending = undefined;
}
