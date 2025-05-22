<script lang="ts">
  import { offlineStore } from "$lib/stores/offlineStore";
  import { syncService } from "$lib/services/syncService";
</script>

<footer
  class="fixed bottom-0 left-0 w-full z-50 bg-white/95 border-t border-gray-200 shadow-lg"
>
  <div
    class="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between py-2 px-4 gap-2 sm:gap-0"
  >
    <span class="font-semibold text-gray-700 text-base">Developer Tools:</span>
    <div class="flex flex-wrap gap-2">
      <button
        on:click={() => offlineStore.setOfflineMode(true)}
        class="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-3 rounded shadow-sm transition"
        >Go Offline</button
      >
      <button
        on:click={() => offlineStore.setOfflineMode(false)}
        class="text-sm bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-3 rounded shadow-sm transition"
        >Go Online</button
      >
      <button
        on:click={() => syncService.fetchAllUnidadesMedida()}
        class="text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded shadow-sm transition"
        >Force Refresh Units</button
      >
      <button
        on:click={() => syncService.processQueue()}
        class="text-sm bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-3 rounded shadow-sm transition"
        >Force Process Queue</button
      >
    </div>
  </div>
</footer>
