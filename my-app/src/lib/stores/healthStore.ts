// my-app/src/lib/stores/healthStore.ts
import { writable, type Writable } from 'svelte/store';

export type HealthStatus = 'checking' | 'healthy' | 'unhealthy' | 'error';

export interface HealthState {
  status: HealthStatus;
  errorDetails?: string | null;
  lastChecked?: Date | null;
}

const initialState: HealthState = {
  status: 'checking',
  errorDetails: null,
  lastChecked: null,
};

export const healthStore: Writable<HealthState> = writable(initialState);

// Optional helper to update store easily
export const updateHealthStatus = (status: HealthStatus, errorDetails?: string) => {
  healthStore.set({
    status,
    errorDetails: errorDetails || null,
    lastChecked: new Date(),
  });
};

// Optional: function to trigger a check, can be called from UI too
// For now, initial check will be in +layout.svelte
/*
import { apiService } from '$lib/services/apiService';
export const performHealthCheck = async () => {
  updateHealthStatus('checking');
  const result = await apiService.checkHealth();
  if (result.IsSuccess) {
    updateHealthStatus('healthy');
  } else {
    updateHealthStatus('unhealthy', result.Errors?.join(', '));
  }
};
*/
