<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { sidebarOpen } from "$lib/stores/sidebarStore";
  import { sessionStore } from "$lib/stores/sessionStore";
  import { authService } from "$lib/services/authService";

  let open = false;

  const unsubscribe = sidebarOpen.subscribe((val) => {
    open = val;
  });
  function toggleSidebar() {
    sidebarOpen.update((value) => !value);
  }
  onMount(() => {
    return () => unsubscribe();
  });

  // Acceso directo al usuario actual (tipado como UserProfile)
  $: session = $sessionStore;
  $: permisos = session.claims?.permisos ?? [];
  $: roles = session.claims?.roles ?? [];
  $: user = session.user;

  $: nombre = session?.claims?.email || "";

  $: permisos: console.log(permisos);
  function logout() {
    authService.logout();
    goto("/login");
  }

  const menuItems = [
    {
      path: "/admin/unidades",
      label: "Unidades",
      icon: "🏛️",
      permiso: "unidadmedida.view",
      permisosExtra: [
        "unidadmedida.create",
        "unidadmedida.update",
        "unidadmedida.delete",
      ],
    },
    {
      path: "/admin/departamentos",
      label: "Departamentos",
      icon: "🏛️",
      permiso: "departamento.view",
      permisosExtra: [
        "departamento.create",
        "departamento.update",
        "departamento.delete",
      ],
    },
    {
      path: "/admin/municipios",
      label: "Municipios",
      icon: "📍",
      permiso: "municipio.view",
    },
    {
      path: "/admin/productos",
      label: "Productos",
      icon: "📦",
      permiso: "producto.view",
    },
    {
      path: "/admin/categorias",
      label: "Categorías",
      icon: "📁",
      permiso: "categoriaproducto.view",
    },
    {
      path: "/admin/clientes",
      label: "Clientes",
      icon: "🧑‍💼",
      permiso: "cliente.view",
    },
    {
      path: "/admin/cajas",
      label: "Cajas",
      icon: "🧾",
      permiso: "caja.view",
    },
    {
      path: "/admin/campanas-descuento",
      label: "Campañas",
      icon: "🏷️",
      permiso: "campanadescuento.view",
    },
    {
      path: "/admin/listas-precio",
      label: "Listas de Precio",
      icon: "💰",
      permiso: "listaprecio.view",
    },
    {
      path: "/pos",
      label: "Punto de Venta",
      icon: "🛒",
      permiso: "pos.view",
    },
  ];

  const isActive = (path: string, current: string) => current.startsWith(path);
</script>

<aside
  class={`fixed left-0 top-0 z-50 h-screen w-64 transform border-r bg-white pt-4 transition-transform
    duration-300 ease-in-out sm:translate-x-0 dark:border-gray-700 dark:bg-gray-800
    ${open ? "translate-x-0" : "-translate-x-full"}`}
  aria-label="Sidebar"
>
  <div class="flex items-center justify-between px-4 py-2 sm:justify-end">
    <a href="/" class="flex items-center">
      <span
        class="self-center text-xl font-semibold sm:text-2xl dark:text-white"
        >POS App</span
      >
    </a>

    <button
      data-drawer-target="logo-sidebar"
      data-drawer-toggle="logo-sidebar"
      aria-controls="logo-sidebar"
      type="button"
      class="inline-flex items-center rounded-lg p-2 text-sm text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600"
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
  </div>
  <div
    class="flex h-full flex-col justify-between overflow-y-auto bg-white px-3 pb-4 dark:bg-gray-800"
  >
    <ul class="space-y-2 font-medium">
      {#each menuItems as item}
        {#if permisos?.includes(item.permiso)}
          <li>
            <a
              href={item.path}
              class="group flex items-center rounded-lg p-2 text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700"
              class:bg-gray-100={isActive(item.path, $page.url.pathname)}
            >
              <span class="text-lg">{item.icon}</span>
              <span class="ms-3">{item.label}</span>
            </a>
          </li>
        {/if}
      {/each}
    </ul>

    <div class="border-t border-gray-700 pt-4">
      {#if user}
        <div class="mt-2 text-xs text-gray-400">Usuario: {nombre}</div>
        <div class="text-xs text-gray-400">Rol: {roles?.join(", ")}</div>
      {/if}

      <div class="mt-2 text-xs text-gray-400"></div>

      <button
        on:click={logout}
        class="mt-4 w-full rounded bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600"
      >
        🚪 Cerrar sesión
      </button>
    </div>
  </div>
</aside>
