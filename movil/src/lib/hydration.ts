type PersistedStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
};

// Los stores con `persist` leen AsyncStorage de forma asíncrona: escribir en
// ellos antes de que terminen hace que la hidratación pise el cambio.
export function whenHydrated(store: PersistedStore): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = store.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}
