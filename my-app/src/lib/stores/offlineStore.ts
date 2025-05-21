import { writable, get } from 'svelte/store'; // Added get
import { toastStore } from './toastStore'; // Import toastStore

interface OfflineState {
  isOffline: boolean;
}

const createOfflineStore = () => {
  const store = writable<OfflineState>({ isOffline: false });
  const { subscribe, set, update } = store; // get 'set' and 'update' from the store instance

  const setOfflineMode = (isOffline: boolean) => {
    const currentState = get(store); // Get current state from the store instance
    if (currentState.isOffline !== isOffline) { // Only show toast if state actually changes
      set({ isOffline });
      if (isOffline) {
        toastStore.addToast('You are now offline. Queued actions will sync later.', 'warning', 5000);
      } else {
        toastStore.addToast('You are back online!', 'success', 3000);
      }
    }
  };
  
  const toggleOfflineMode = () => {
    const currentState = get(store);
    setOfflineMode(!currentState.isOffline);
  };

  return {
    subscribe,
    toggleOfflineMode,
    setOfflineMode
  };
};

export const offlineStore = createOfflineStore();
