<script lang="ts">
  import "../app.css"; // Existing import for Tailwind
  import ToastNotifications from '$lib/components/common/ToastNotifications.svelte';
  import { offlineStore } from '$lib/stores/offlineStore'; // For optional display in layout
  import { onMount } from "svelte";

  // Optional: You can also show a persistent status in the layout itself
  // let onlineStatusMessage = '';
  // offlineStore.subscribe(state => {
  //   onlineStatusMessage = state.isOffline ? 'Status: Offline' : 'Status: Online';
  // });

  // This is just to ensure Tailwind utility classes are available if this is the root layout
  // and to provide a basic structure.
</script>

<div class="min-h-screen bg-gray-100 text-gray-800">
  <!-- Optional: Display persistent status directly in layout -->
  <!-- 
  <div class="p-2 text-center text-sm { $offlineStore.isOffline ? 'bg-yellow-300 text-yellow-800' : 'bg-green-200 text-green-800'}">
    { $offlineStore.isOffline ? 'You are currently offline.' : 'You are online.' }
  </div>
  -->
  
  <slot /> <!-- Main content of each page -->
</div>

<ToastNotifications /> <!-- Add the ToastNotifications component here -->

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
