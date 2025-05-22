<script lang="ts">
  import HeaderBar from "./HeaderBar.svelte";
  import SidebarMenu from "./SidebarMenu.svelte";
  import FooterBar from "./FooterBar.svelte";
  import { syncIndicatorVisible } from "$lib/stores/syncIndicatorStore";
  import { scale, fade } from "svelte/transition";
  import SyncIndicator from "../common/SyncIndicator.svelte";
</script>

<!-- Navbar fijo -->
<HeaderBar />

<!-- Sidebar lateral -->
<SidebarMenu />

<!-- Contenido principal (ajustado a sidebar y navbar) -->

<div class="p-4 pt-20 sm:ml-64 pb-24 overflow-auto">
  <div
    class="rounded-lg border-2 border-dashed border-gray-200 p-4 dark:border-gray-700 pb-20"
  >
    <slot />
  </div>
</div>
<!-- Panel modal animado -->
{#if $syncIndicatorVisible}
  <div
    class="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center"
  >
    <SyncIndicator />
    <button
      class="absolute top-1 right-1 rounded-full bg-gray-200 hover:bg-gray-300 p-1"
      aria-label="Cerrar"
      on:click={() => syncIndicatorVisible.set(false)}>✕</button
    >
  </div>
{/if}
<FooterBar />
