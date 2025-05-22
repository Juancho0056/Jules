<script lang="ts">
  import HeaderBar from "./HeaderBar.svelte";
  import SidebarMenu from "./SidebarMenu.svelte";
  import FooterBar from "./FooterBar.svelte";
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
<FooterBar />
