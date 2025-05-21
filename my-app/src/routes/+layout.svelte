<script lang="ts">
  import "../app.css";
  import ToastNotifications from '$lib/components/common/ToastNotifications.svelte';
  import SyncIndicator from '$lib/components/common/SyncIndicator.svelte';
  // import { offlineStore } from '$lib/stores/offlineStore'; // Not directly used in the provided new script
  import { sessionStore } from '$lib/stores/sessionStore'; // Still used implicitly or can be used for other checks
  import { authService } from '$lib/services/authService';
  import { onMount } from "svelte";

  // Import for health check
  import { apiService } from '$lib/services/apiService';
  import { healthStore, updateHealthStatus } from '$lib/stores/healthStore'; // Using updateHealthStatus helper

  onMount(async () => {
    if (typeof window !== 'undefined') { // Ensure it runs only on client
      // Initialize session
      await authService.initializeSession();

      // Perform initial health check
      updateHealthStatus('checking'); // Set status to checking
      try {
        const healthResult = await apiService.checkHealth();
        if (healthResult.IsSuccess) {
          updateHealthStatus('healthy');
        } else {
          // If Errors is null or empty, provide a generic message
          const errorMsg = healthResult.Errors && healthResult.Errors.length > 0 
                           ? healthResult.Errors.join(', ') 
                           : 'API health check failed with no specific error details.';
          updateHealthStatus('unhealthy', errorMsg);
        }
      } catch (e: any) {
        // Catch any exception during the apiService.checkHealth() call itself (e.g., network error not caught by fetchApi)
        updateHealthStatus('error', e.message || 'A critical error occurred during health check.');
      }
    }
  });

</script>

<!-- Rest of the layout remains the same -->
<div class="min-h-screen bg-gray-100 text-gray-800">
  <slot />
</div>

<ToastNotifications />
<SyncIndicator />

<style>
  /* Minimal global styles if necessary */
  /* Ensure body takes full height for min-h-screen on the div to work as expected */
  :global(body) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  :global(html, body) {
    height: 100%;
  }
</style>
