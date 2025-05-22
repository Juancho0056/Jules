<script lang="ts">
  import "../app.css";
  import ToastNotifications from "$lib/components/common/ToastNotifications.svelte";
  import SyncIndicator from "$lib/components/common/SyncIndicator.svelte";
  import { authService } from "$lib/services/authService";
  import { onMount } from "svelte";
  import AppLayout from "$lib/components/layout/AppLayout.svelte";
  // Import for health check
  import { apiService } from "$lib/services/apiService";
  import { healthStore, updateHealthStatus } from "$lib/stores/healthStore"; // Using updateHealthStatus helper
  import { page } from "$app/stores";
  let isPublicPage = false;

  // Reaccionar a cambios en la URL
  $: {
    const path = $page?.url?.pathname ?? "";
    isPublicPage = path.startsWith("/login");
  }

  onMount(async () => {
    if (typeof window !== "undefined") {
      // Ensure it runs only on client
      // Initialize session
      await authService.initializeSession();

      // Perform initial health check
      updateHealthStatus("checking"); // Set status to checking
      try {
        const healthResult = await apiService.checkHealth();
        if (healthResult.isSuccess) {
          updateHealthStatus("healthy");
        } else {
          // If Errors is null or empty, provide a generic message
          const errorMsg =
            healthResult.errors && healthResult.errors.length > 0
              ? healthResult.errors.join(", ")
              : "API health check failed with no specific error details.";
          updateHealthStatus("unhealthy", errorMsg);
        }
      } catch (e: any) {
        // Catch any exception during the apiService.checkHealth() call itself (e.g., network error not caught by fetchApi)
        updateHealthStatus(
          "error",
          e.message || "A critical error occurred during health check."
        );
      }
    }
  });
</script>

<!-- Rest of the layout remains the same -->
{#if isPublicPage}
  <!-- No usar layout para /login -->
  <slot />
{:else}
  <!-- Usar layout para el resto -->
  <AppLayout>
    <slot />
  </AppLayout>
{/if}

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
