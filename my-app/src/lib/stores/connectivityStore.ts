import { readable } from 'svelte/store';

/**
 * A readable Svelte store that tracks the browser's online status.
 * True if online, false if offline.
 */
export const isOnline = readable<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true, (set) => {
  // Ensure code only runs in browser environment
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    // For SSR or environments without window/navigator, assume online and do nothing.
    // Or, you could set to false or throw an error depending on desired SSR behavior.
    set(true); 
    return () => {}; // No-op cleanup function
  }

  const onlineHandler = () => {
    set(true);
  };

  const offlineHandler = () => {
    set(false);
  };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  // Initial check, as navigator.onLine might have changed since store initialization
  // especially if the store is created before the first event fires.
  set(navigator.onLine);


  // Cleanup function: remove event listeners when the last subscriber unsubscribes
  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
});

// Example usage in a Svelte component:
// <script lang="ts">
//   import { isOnline } from './connectivityStore';
// </script>
//
// {#if !$isOnline}
//   <div class="offline-indicator">
//     You are currently offline. Some features may be limited.
//   </div>
// {/if}
