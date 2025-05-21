import { writable } from 'svelte/store';

export interface ToastMessage {
  id: number;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

const createToastStore = () => {
  const { subscribe, update } = writable<ToastMessage[]>([]);

  const addToast = (
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info',
    duration: number = 3000
  ) => {
    const id = Date.now() + Math.random(); // Simple unique ID
    update(toasts => [...toasts, { id, message, type, duration }]);
    
    // Automatically remove the toast after its duration
    if (duration > 0) {
        setTimeout(() => {
            removeToast(id);
        }, duration);
    }
  };

  const removeToast = (id: number) => {
    update(toasts => toasts.filter(toast => toast.id !== id));
  };

  return {
    subscribe,
    addToast,
    removeToast,
  };
};

export const toastStore = createToastStore();

// Example usage (can be called from anywhere after importing toastStore):
// toastStore.addToast("Profile updated successfully!", "success");
// toastStore.addToast("Could not connect to server.", "error", 5000);
