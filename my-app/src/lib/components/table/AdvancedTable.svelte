<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { writable, derived } from "svelte/store";
  import DataCard from "$lib/components/common/DataCard.svelte";
  // Props
  export let data: Record<string, any>[] = [];
  const dataStore = writable(data);

  // Cuando la prop cambie, actualiza el store:
  $: dataStore.set(data);
  export let columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    visible?: boolean;
    isAction?: boolean;
    format?: (value: any, row: Record<string, any>) => string | number;
  }> = [];
  export let actions: Array<{
    label: string;
    eventName: string;
    class?: string;
    disabled?: (row: Record<string, any>) => boolean;
    permission?: string;
  }> = [];
  export let itemsPerPage: number = 10;
  export let userPermissions: Array<string> = [];

  // State
  const currentPage = writable(1);
  const searchTerm = writable("");
  const sortColumn = writable<string | null>(null);
  const sortDirection = writable<"asc" | "desc">("asc");
  const pageSize = writable(itemsPerPage);

  const dispatch = createEventDispatcher();

  // Responsive: columnas visibles
  $: visibleColumns = columns.filter((col) => col.visible !== false);

  // Helper para obtener valor de celda
  function getCellValue(
    row: Record<string, any>,
    column: {
      key: string;
      label: string;
      sortable?: boolean;
      visible?: boolean;
      isAction?: boolean;
      format?: (value: any, row: Record<string, any>) => string | number;
    }
  ): any {
    const value = row[column.key];
    return column.format ? column.format(value, row) : value;
  }

  // Busqueda y ordenamiento
  const filteredAndSortedData = derived(
    [searchTerm, sortColumn, sortDirection, dataStore],
    ([$searchTerm, $sortColumn, $sortDirection, $data]) => {
      let processed = [...$data];
      // Filtro
      if ($searchTerm) {
        const lowerSearchTerm = $searchTerm.toLowerCase();
        processed = processed.filter((row) =>
          visibleColumns.some((col) => {
            if (col.isAction) return false;
            const value = row[col.key];
            return (
              value !== null &&
              value !== undefined &&
              String(value).toLowerCase().includes(lowerSearchTerm)
            );
          })
        );
      }
      // Orden
      if ($sortColumn) {
        processed.sort((a, b) => {
          const valA = a[$sortColumn];
          const valB = b[$sortColumn];
          if (valA === null || valA === undefined)
            return $sortDirection === "asc" ? -1 : 1;
          if (valB === null || valB === undefined)
            return $sortDirection === "asc" ? 1 : -1;
          if (valA < valB) return $sortDirection === "asc" ? -1 : 1;
          if (valA > valB) return $sortDirection === "asc" ? 1 : -1;
          return 0;
        });
      }
      return processed;
    }
  );

  const paginatedData = derived(
    [filteredAndSortedData, currentPage, pageSize],
    ([$filteredAndSortedData, $currentPage, $pageSize]) => {
      const start = ($currentPage - 1) * $pageSize;
      const end = start + $pageSize;
      return $filteredAndSortedData.slice(start, end);
    }
  );
  function handlePageSizeChange(e: Event) {
    pageSize.set(Number((e.target as HTMLSelectElement).value));
    currentPage.set(1);
  }
  const totalPages = derived([pageSize, dataStore], ([$pageSize, $data]) =>
    Math.max(1, Math.ceil($data.length / $pageSize))
  );
  function handleSort(columnKey: string) {
    sortColumn.update((val) => {
      if (val === columnKey) {
        sortDirection.update((dir) => (dir === "asc" ? "desc" : "asc"));
      } else {
        sortDirection.set("asc");
      }
      return columnKey;
    });
    currentPage.set(1);
  }

  function handleActionClick(eventName: string, row: Record<string, any>) {
    dispatch(eventName, row);
  }

  function canShowAction(
    action: (typeof actions)[0],
    row: Record<string, any>
  ): boolean {
    if (action.permission && !userPermissions.includes(action.permission)) {
      return false;
    }
    if (action.disabled && action.disabled(row)) {
      return false;
    }
    return true;
  }

  function handleSearchInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    searchTerm.set(value);
    currentPage.set(1);
  }
  function handleCardAction(
    event: CustomEvent<{ eventName: string; row: Record<string, any> }>
  ) {
    const { eventName, row } = event.detail;
    handleActionClick(eventName, row);
  }
</script>

<div class="w-full">
  <!-- Controles de tabla -->
  <div
    class="flex flex-col sm:flex-row items-center justify-between mb-2 gap-2"
  >
    <input
      type="text"
      placeholder="Buscar..."
      on:input={handleSearchInput}
      class="border border-gray-300 rounded px-3 py-2 text-sm w-full sm:w-64"
      aria-label="Buscar"
    />
    <div class="flex items-center gap-2">
      <label for="page-size" class="text-sm text-gray-600">Filas:</label>
      <select
        id="page-size"
        class="border border-gray-300 rounded px-2 py-1 text-sm"
        bind:value={$pageSize}
        on:change={handlePageSizeChange}
      >
        <option value="5">5</option>
        <option value="10">10</option>
        <option value="20">20</option>
        <option value="50">50</option>
        <option value="100">100</option>
      </select>
    </div>
  </div>
  <!-- En Mobile: Renderiza cards -->
  <div class="block sm:hidden">
    {#each $paginatedData as row (row.id)}
      <DataCard
        {row}
        columns={visibleColumns}
        {actions}
        on:action={handleCardAction}
      />
    {/each}
  </div>
  <!-- Tabla principal -->
  <div
    class="hidden sm:block overflow-x-auto rounded shadow border border-gray-200 bg-white max-h-[70vh]"
  >
    <table class="min-w-full text-xs sm:text-sm md:text-base bg-white">
      <thead>
        <tr>
          {#each visibleColumns as column (column.key)}
            <th
              class="px-2 sm:px-4 py-2 border-b border-gray-100 bg-gray-50 font-bold text-gray-700 cursor-pointer select-none whitespace-nowrap"
              on:click={() => column.sortable && handleSort(column.key)}
              aria-sort={$sortColumn === column.key
                ? $sortDirection === "asc"
                  ? "ascending"
                  : "descending"
                : "none"}
              tabindex={column.sortable ? 0 : -1}
              on:keydown={(e) =>
                (e.key === "Enter" || e.key === " ") &&
                column.sortable &&
                handleSort(column.key)}
            >
              <span class="flex items-center gap-1">
                {column.label}
                {#if column.sortable}
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                {/if}
                {#if $sortColumn === column.key}
                  <span aria-hidden="true"
                    >{$sortDirection === "asc" ? "▲" : "▼"}</span
                  >
                {/if}
              </span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if $paginatedData.length === 0}
          <tr>
            <td
              colspan={visibleColumns.length}
              class="py-6 text-center text-gray-500 italic"
            >
              {$searchTerm ? "Sin resultados." : "Sin datos."}
            </td>
          </tr>
        {/if}
        {#each $paginatedData as row (row.id || JSON.stringify(row))}
          <tr class="hover:bg-gray-50">
            {#each visibleColumns as column (column.key)}
              <td
                class="px-2 sm:px-4 py-2 border-b border-gray-100 align-middle whitespace-nowrap"
              >
                {#if column.isAction}
                  <div class="flex gap-2">
                    {#each actions as action (action.eventName)}
                      {#if canShowAction(action, row)}
                        <button
                          type="button"
                          class="px-2 py-1 text-xs sm:text-sm rounded border border-gray-300 shadow-sm font-semibold bg-white hover:bg-gray-100 focus:ring-2 focus:ring-blue-400 transition {action.class ||
                            ''}"
                          on:click={() =>
                            handleActionClick(action.eventName, row)}
                          disabled={action.disabled
                            ? action.disabled(row)
                            : false}
                        >
                          {action.label}
                        </button>
                      {/if}
                    {/each}
                  </div>
                {:else}
                  {getCellValue(row, column)}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Controles de paginación -->
  {#if $totalPages > 1}
    <div
      class="flex flex-col sm:flex-row justify-center items-center gap-2 mt-4"
    >
      <button
        type="button"
        class="px-3 py-1 bg-gray-100 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        on:click={() => currentPage.update((p) => Math.max(1, p - 1))}
        disabled={$currentPage === 1}
        aria-label="Página anterior"
      >
        Anterior
      </button>
      <span class="text-gray-600 text-sm"
        >Página {$currentPage} de {$totalPages}</span
      >
      <button
        type="button"
        class="px-3 py-1 bg-gray-100 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        on:click={() => currentPage.update((p) => Math.min($totalPages, p + 1))}
        disabled={$currentPage === $totalPages}
        aria-label="Página siguiente"
      >
        Siguiente
      </button>
    </div>
  {/if}
</div>
