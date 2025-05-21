import { writable, get } from 'svelte/store';
import { toastStore } from './toastStore';
import { apiService } from '../services/apiService'; // For health check
import type { Result } from '$lib/types/result'; // For Result type
import type { HealthModel } from '$lib/types/health'; // For health check response type
export interface OfflineState {
  isOffline: boolean;
  isHealthChecking: boolean; // To know if a health check is in progress
}

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_HEALTH_CHECK_FAILURES = 2; // Go offline after 2 consecutive failures
let healthCheckIntervalId: any = null;
let consecutiveHealthCheckFailures = 0;

const createOfflineStore = () => {
  const initialIsOffline = typeof window !== 'undefined' ? !window.navigator.onLine : true;
  const store = writable<OfflineState>({ isOffline: initialIsOffline, isHealthChecking: false });

  const setOfflineStatus = (offline: boolean, reason: string = "") => {
    const currentState = get(store);
    if (currentState.isOffline !== offline) {
      store.update(s => ({ ...s, isOffline: offline }));
      if (offline) {
        toastStore.addToast(`You are now offline. ${reason}`, 'warning', 5000);
        stopHealthCheckTimer(); // Stop checking if we are definitively offline
      } else {
        toastStore.addToast('You are back online!', 'success', 3000);
        consecutiveHealthCheckFailures = 0; // Reset failures
        // Optionally restart health checks if desired (e.g., if stopped due to being truly online)
        // startHealthCheckTimer(); // Or let it be triggered by API failures or manual start.
      }
    } else if (currentState.isOffline === offline && offline && reason && reason.includes("Health checks failed")) {
        // If already offline and health checks continue to fail, maybe update toast or log
        // For now, the initial toast when going offline is considered sufficient.
    }
  };
  
  const performHealthCheck = async () => {
    if (typeof window === 'undefined') return; // SSR guard

    if (!window.navigator.onLine) {
      // If browser explicitly says it's offline, trust it and update status.
      // This check is redundant if 'offline' event listener works reliably, but good as a safeguard.
      setOfflineStatus(true, "Browser indicates network is disconnected.");
      return;
    }
    
    // Avoid multiple health checks running simultaneously if one is already in progress
    if (get(store).isHealthChecking && healthCheckIntervalId) { // Check healthCheckIntervalId to allow manual calls
        console.log("Health check already in progress.");
        return;
    }

    store.update(s => ({ ...s, isHealthChecking: true }));
    
    try {
      // Note: /api/health needs to be a public path in apiService.ts
      // and apiService.get for this path should ideally not trigger global 500-error-go-offline logic.
      // This is a known caveat with the current apiService structure.
      const result = await apiService.get<HealthModel>('/health'); 
      
      if (result.isSuccess) {
        consecutiveHealthCheckFailures = 0;
        // If we were marked offline (e.g., due to previous failed health checks), but now it's fine
        if (get(store).isOffline) { 
            setOfflineStatus(false, "Health check successful.");
        }
      } else {
        consecutiveHealthCheckFailures++;
        console.warn(`Health check attempt ${consecutiveHealthCheckFailures} failed: ${result.errors?.[0] || 'Unknown API error'}`);
      }
    } catch (error) { // Catch network errors from fetchApi itself (e.g., if apiService.get throws)
      consecutiveHealthCheckFailures++;
      console.warn(`Health check attempt ${consecutiveHealthCheckFailures} failed due to network/fetch error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    store.update(s => ({ ...s, isHealthChecking: false }));

    if (consecutiveHealthCheckFailures >= MAX_HEALTH_CHECK_FAILURES) {
      if (!get(store).isOffline) { // Only set if not already marked offline
        setOfflineStatus(true, "Health checks failed consistently.");
      }
    }
  };

  const startHealthCheckTimer = () => {
    if (healthCheckIntervalId === null && typeof window !== 'undefined') {
      console.log("Starting periodic health checks.");
      performHealthCheck(); // Perform an initial check immediately
      healthCheckIntervalId = setInterval(performHealthCheck, HEALTH_CHECK_INTERVAL);
    }
  };

  const stopHealthCheckTimer = () => {
    if (healthCheckIntervalId !== null) {
      console.log("Stopping periodic health checks.");
      clearInterval(healthCheckIntervalId);
      healthCheckIntervalId = null;
    }
    // Always ensure isHealthChecking is reset when timer stops,
    // e.g. if it was stopped while a check was in progress.
    store.update(s => ({ ...s, isHealthChecking: false }));
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log("Browser online event detected.");
      // When browser comes online, perform a health check to confirm actual connectivity.
      // setOfflineStatus(false) will be called by performHealthCheck if successful.
      performHealthCheck();
      // Optionally restart periodic health checks if that's the desired strategy
      // startHealthCheckTimer(); 
    });
    window.addEventListener('offline', () => {
      console.log("Browser offline event detected.");
      setOfflineStatus(true, "Browser detected network disconnection.");
    });

    // Set initial state based on navigator.onLine
    // The store's initialIsOffline already handles this.
    // setOfflineStatus(!window.navigator.onLine, "Initial browser state."); // Redundant if initialIsOffline is correct

    // Decide on proactive health checks (e.g., start them if initially online)
    // if (!get(store).isOffline) {
    //   startHealthCheckTimer(); // Uncomment if proactive checks are desired from the start.
    // }
  }
  
  const suspectConnectivity = () => {
      if (typeof window !== 'undefined' && window.navigator.onLine && !get(store).isOffline) {
          console.warn("Connectivity suspected despite navigator.onLine. Triggering health check.");
          performHealthCheck(); // Perform an immediate check
          // Optionally start the timer if not already running and desired
          // if (healthCheckIntervalId === null) startHealthCheckTimer();
      }
  };

  return {
    subscribe: store.subscribe,
    setOfflineMode: (isOffline: boolean, reason?: string) => setOfflineStatus(isOffline, reason),
    toggleOfflineMode: () => {
      const currentIsOffline = get(store).isOffline;
      setOfflineStatus(!currentIsOffline, "Manual toggle.");
    },
    checkHealth: performHealthCheck, // Expose for manual trigger
    startProactiveHealthChecks: startHealthCheckTimer, // Expose to start checks if needed
    stopProactiveHealthChecks: stopHealthCheckTimer,   // Expose to stop checks
    suspectConnectivity, // To be called by apiService
  };
};

export const offlineStore = createOfflineStore();
