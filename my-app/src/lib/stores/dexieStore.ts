import { liveQuery } from "dexie";
import type { Readable } from "svelte/store";

export function dexieStore<T>(querier: () => T | Promise<T>): Readable<T> {
  const observable = liveQuery(querier);

  return {
    subscribe(run, invalidate) {
      const subscription = observable.subscribe({
        next: run,
        error: (err) => {
          console.error("Dexie liveQuery error:", err);
          invalidate?.(); // opcional
        }
      });

      return () => subscription.unsubscribe(); // ✅ limpieza automática
    }
  };
}