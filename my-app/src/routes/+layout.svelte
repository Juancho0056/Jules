<script lang="ts">
  import "../app.css";
  import ToastNotifications from "$lib/components/common/ToastNotifications.svelte";
  import SyncIndicator from "$lib/components/common/SyncIndicator.svelte";
  // import { offlineStore } from '$lib/stores/offlineStore'; // Not directly used in the provided new script
  import { sessionStore } from "$lib/stores/sessionStore"; // Still used implicitly or can be used for other checks
  import { authService } from "$lib/services/authService";
  import { onMount } from "svelte";

  // Import for health check
  import { apiService } from "$lib/services/apiService";
  import { healthStore, updateHealthStatus } from "$lib/stores/healthStore"; // Using updateHealthStatus helper

  // Import new layout components
  import Headerbar from "$lib/components/layout/Headerbar.svelte";
  import Sidebar from "$lib/components/layout/Sidebar.svelte";

  let showMobileMenu = false; // This will be used later for mobile menu toggle

  onMount(async () => {
    // ... (existing onMount logic remains the same)
    if (typeof window !== "undefined") {
      await authService.initializeSession();
      updateHealthStatus("checking");
      try {
        const healthResult = await apiService.checkHealth();
        if (healthResult.isSuccess) {
          updateHealthStatus("healthy");
        } else {
          const errorMsg =
            healthResult.errors && healthResult.errors.length > 0
              ? healthResult.errors.join(", ")
              : "API health check failed with no specific error details.";
          updateHealthStatus("unhealthy", errorMsg);
        }
      } catch (e: any) {
        updateHealthStatus(
          "error",
          e.message || "A critical error occurred during health check."
        );
      }
    }
  });
</script>

<div class="min-h-screen bg-gray-100 text-gray-800">
  <Headerbar on:toggleMobileMenu={() => showMobileMenu = !showMobileMenu} />
  
  <div class="flex">
    <Sidebar bind:showMobileMenu />
    
    {/* Main content area */}
    {/* Adjust margin-left on md+ screens to account for sidebar width */}
    <main class="flex-1 p-4 md:ml-64"> 
      {/* The Headerbar already has a pt-16 div to push content down */}
      <slot />
    </main>
  </div>

  <!-- Overlay for mobile menu -->
  {#if showMobileMenu}
    <div 
      class="fixed inset-0 bg-black opacity-50 z-30 md:hidden" 
      on:click={() => showMobileMenu = false}
      role="button"
      tabindex="0"
      aria-label="Close menu"
    ></div>
  {/if}
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
  /* Ensure content area respects header, more specific adjustments might be needed */
  main {
    /* The pt-16 for header is handled by a spacer in Headerbar itself or by main content starting after header */
    /* The md:ml-64 is for the sidebar */
  }
</style>
