<script lang="ts">
  import "../app.css"; // Existing import for Tailwind
  import ToastNotifications from '$lib/components/common/ToastNotifications.svelte';
  import SyncIndicator from '$lib/components/common/SyncIndicator.svelte'; // Import SyncIndicator
  import { offlineStore } from '$lib/stores/offlineStore'; // For optional direct display
  import { sessionStore } from '$lib/stores/sessionStore'; // For conditional logic if needed here
  import { authService } from '$lib/services/authService'; // For initializeSession
  import { onMount } from "svelte";

  // Initialize session on application load
  onMount(async () => {
    // Make sure this is only called once, typically in the root layout.
    if (typeof window !== 'undefined') { // Ensure it runs only on client
        await authService.initializeSession();
    }
  });

</script>

<div class="min-h-screen bg-gray-100 text-gray-800">
  <!-- Example: Optional persistent status directly in layout -->
  <!-- 
  <div class="p-2 text-center text-sm { $offlineStore.isOffline ? 'bg-yellow-300 text-yellow-800' : ($sessionStore.isAuthenticated ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800')}">
    {#if $sessionStore.isAuthenticated}
      { $offlineStore.isOffline ? 'You are currently offline.' : 'You are online.' }
    {:else}
      Not authenticated.
    {/if}
  </div>
  -->
  
  <slot /> <!-- Main content of each page -->
</div>

<ToastNotifications />
<SyncIndicator /> <!-- Add the SyncIndicator component here -->

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
