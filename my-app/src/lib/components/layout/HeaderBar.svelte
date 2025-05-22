<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, onDestroy } from "svelte";
  import { sidebarOpen } from "$lib/stores/sidebarStore";
  import { isOnline } from "$lib/stores/connectivityStore";
  // Usa un ícono (ejemplo Heroicons, Lucide o FontAwesome). Aquí con Heroicons:
  // Puedes instalar con: npm i @heroicons/svelte
  import { Cloud, CloudOff, Info } from "lucide-svelte"; // O el ícono que prefieras
  // Cambia import para el store correcto:
  import { sessionStore } from "$lib/stores/sessionStore";
  import { authService } from "$lib/services/authService"; // Asumiendo que logout está aquí
  import { syncIndicatorVisible } from "$lib/stores/syncIndicatorStore";
  import { offlineStore, type OfflineState } from "$lib/stores/offlineStore";

  let currentOfflineState: OfflineState;
  const offlineStoreUnsubscribe = offlineStore.subscribe((value) => {
    currentOfflineState = value;
  });

  let dropdownOpen = false;
  let dropdownRef: HTMLDivElement;

  // Reactividad con Svelte Store (esto te actualiza automáticamente el usuario):
  $: session = $sessionStore;
  $: user = session.user;
  $: claims = session.claims;

  // Deriva info adicional que podrías requerir:
  $: nombre = user?.name || claims?.email || user?.email;
  $: email = claims?.email || user?.email;
  $: roles = claims?.roles || [];

  function toggleSidebar() {
    sidebarOpen.update((value) => !value);
  }
  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
  }

  // Detecta click fuera del dropdown
  onMount(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownOpen &&
        dropdownRef &&
        !dropdownRef.contains(event.target as Node)
      ) {
        dropdownOpen = false;
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  });

  function logout() {
    authService.logout();
    goto("/login");
  }
</script>

<nav
  class="fixed top-0 z-30 w-full border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
>
  <div class="px-3 py-3 lg:px-5 lg:pl-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center justify-start rtl:justify-end">
        <button
          data-drawer-target="logo-sidebar"
          data-drawer-toggle="logo-sidebar"
          aria-controls="logo-sidebar"
          type="button"
          class="inline-flex items-center rounded-lg p-2 text-sm text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:hidden dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
          on:click={() => toggleSidebar()}
        >
          <span class="sr-only">Open sidebar</span>
          <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
            <path
              clip-rule="evenodd"
              fill-rule="evenodd"
              d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"
            />
          </svg>
        </button>
        <a href="/" class="ms-2 flex md:me-24">
          <span
            class="self-center whitespace-nowrap text-xl font-semibold sm:text-2xl dark:text-white"
            >POS App</span
          >
        </a>
      </div>

      <div class="flex items-center gap-4">
        <!-- Estado de conexión -->
        <div class="flex items-center text-xs text-gray-400">
          <!-- Botón de estado y ayuda en el header -->
          <button
            class="flex items-center gap-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition shadow text-xs font-medium ml-2"
            aria-label="Estado de sincronización"
            on:click={() => {
              syncIndicatorVisible.set(true);
              console.log("Sync indicator opened");
            }}
          >
            {#if currentOfflineState.isOffline}
              <CloudOff class="w-4 h-4 text-red-500" />
              <span class="hidden sm:inline text-red-700">Offline</span>
            {:else}
              <Cloud class="w-4 h-4 text-green-500" />
              <span class="hidden sm:inline text-green-700">Online</span>
            {/if}
            {#if currentOfflineState.isHealthChecking}(checking...) <!-- Use the reactive variable -->
            {/if}
            <Info class="w-3 h-3 text-gray-500 ml-1" />
          </button>
        </div>

        <!-- Dropdown -->
        <div class="relative" bind:this={dropdownRef}>
          <button
            type="button"
            on:click={toggleDropdown}
            class="flex rounded-full bg-gray-800 text-sm focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600"
          >
            <span class="sr-only">User menu</span>
            <img
              class="h-8 w-8 rounded-full"
              src="https://flowbite.com/docs/images/people/profile-picture-5.jpg"
              alt="user"
            />
          </button>

          {#if dropdownOpen}
            <div
              class="absolute right-0 z-50 mt-2 w-48 list-none divide-y divide-gray-100 rounded-sm bg-white text-base shadow-sm dark:divide-gray-600 dark:bg-gray-700"
            >
              <div class="px-4 py-3">
                <p class="text-sm text-gray-900 dark:text-white">
                  {user?.email}
                </p>
                <p
                  class="truncate text-sm font-medium text-gray-900 dark:text-gray-300"
                >
                  {user?.claims?.join(", ") ?? "Sin roles"}
                </p>
              </div>
              <ul class="py-1">
                <li>
                  <a
                    href="#"
                    class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white"
                  >
                    Dashboard
                  </a>
                </li>
                <li>
                  <button
                    on:click={logout}
                    class="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600 dark:hover:text-white"
                  >
                    Cerrar sesión
                  </button>
                </li>
              </ul>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</nav>
