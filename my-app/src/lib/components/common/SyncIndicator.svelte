<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { offlineStore, type OfflineState } from "$lib/stores/offlineStore";
  import { sessionStore } from "$lib/stores/sessionStore"; // Used to only show sync features when authenticated
  import { syncService } from "$lib/services/syncService";
  import { writable, type Writable } from "svelte/store";
  import { toastStore } from "$lib/stores/toastStore";

  interface QueueStatus {
    pending: number;
    failedRetryable: number;
    failedPermanent: number;
    total: number;
  }

  let queueStatus: Writable<QueueStatus | null> = writable(null);
  let statusInterval: any;

  // Use Svelte's reactive statements for store values in the script
  let currentOfflineState: OfflineState;
  const offlineStoreUnsubscribe = offlineStore.subscribe((value) => {
    currentOfflineState = value;
  });

  let currentIsAuthenticated: boolean = false;
  const updateQueueStatus = async () => {
    if (!currentIsAuthenticated) {
      // Guard against running if not authenticated
      // If not authenticated and polling is somehow active, stop it.
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
      queueStatus.set(null); // Ensure queue status is cleared
      return;
    }
    try {
      const status = await syncService.getQueueStatus();
      queueStatus.set(status);
    } catch (e) {
      console.error("Failed to get queue status:", e);
      queueStatus.set(null); // Clear on error
    }
  };

  const sessionStoreUnsubscribe = sessionStore.subscribe((value) => {
    const previousIsAuthenticated = currentIsAuthenticated;
    currentIsAuthenticated = value.isAuthenticated;

    // React to changes in authentication state
    if (currentIsAuthenticated && !previousIsAuthenticated) {
      // Just logged in
      updateQueueStatus();
      if (!statusInterval) {
        statusInterval = setInterval(updateQueueStatus, 5000);
      }
    } else if (!currentIsAuthenticated && previousIsAuthenticated) {
      // Just logged out
      queueStatus.set(null);
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
    }
  });

  onMount(() => {
    // Initial check on mount
    if (currentIsAuthenticated) {
      updateQueueStatus();
      if (!statusInterval) {
        // Ensure interval is started if authenticated
        statusInterval = setInterval(updateQueueStatus, 5000);
      }
    }
  });

  onDestroy(() => {
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
    // Svelte automatically unsubscribes from stores if they are referenced in the template with $
    // but manual unsubscription is good practice for subscriptions made in the script block.
    if (offlineStoreUnsubscribe) offlineStoreUnsubscribe();
    if (sessionStoreUnsubscribe) sessionStoreUnsubscribe();
  });

  const handleManualSync = async () => {
    if (currentOfflineState.isOffline) {
      // Use the reactive variable
      toastStore.addToast("Cannot sync while offline.", "warning");
      return;
    }
    toastStore.addToast("Attempting manual sync...", "info");
    await syncService.processQueue(true);
    updateQueueStatus(); // Refresh status after attempt
  };

  const handleManualHealthCheck = async () => {
    toastStore.addToast("Performing manual health check...", "info");
    await offlineStore.checkHealth();
    // offlineStore itself will update its state and show toasts
  };
</script>

{#if currentIsAuthenticated}
  <!-- Only show indicator if authenticated -->
  <div
    class="sync-indicator fixed bottom-4 left-4 p-3 bg-gray-700 text-white text-xs rounded-lg shadow-xl z-50 max-w-xs"
  >
    <div class="flex justify-between items-center mb-1">
      <span class="font-semibold">
        Status:
        {#if currentOfflineState.isOffline}
          <!-- Use the reactive variable -->
          <span class="text-red-400">Offline</span>
        {:else}
          <span class="text-green-400">Online</span>
        {/if}
        {#if currentOfflineState.isHealthChecking}(checking...) <!-- Use the reactive variable -->
        {/if}
      </span>
      <button
        title="Force Health Check"
        on:click={handleManualHealthCheck}
        class="ml-2 p-1 bg-blue-500 hover:bg-blue-600 rounded text-xs leading-none"
        >Probe</button
      >
    </div>

    {#if $queueStatus}
      {#if $queueStatus.total > 0}
        <div class="mb-1">
          Pending Sync: {$queueStatus.pending + $queueStatus.failedRetryable} item(s)
        </div>
      {/if}
      {#if $queueStatus.failedPermanent > 0}
        <div class="text-red-400 mb-1">
          Failed Permanently: {$queueStatus.failedPermanent} item(s)
        </div>
      {/if}
      {#if $queueStatus.total === 0 && !currentOfflineState.isOffline}
        <!-- Use the reactive variable -->
        <div class="text-green-300 mb-1">Data synced.</div>
      {/if}
    {/if}

    {#if !currentOfflineState.isOffline}
      <!-- Use the reactive variable -->
      <button
        on:click={handleManualSync}
        class="w-full mt-1 p-1 bg-purple-500 hover:bg-purple-600 rounded text-xs"
      >
        Sync Now
      </button>
    {:else}
      <button
        class="w-full mt-1 p-1 bg-gray-500 rounded text-xs cursor-not-allowed"
        disabled
      >
        Sync Now (Offline)
      </button>
    {/if}
  </div>
{/if}

<style>
  .sync-indicator {
    /* Add any specific styles if Tailwind classes are not enough */
  }
</style>
