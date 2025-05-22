<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { writable, derived } from 'svelte/store';

  // Props
  export let data: Array<Record<string, any>> = [];
  export let columns: Array<{
    key: string;
    label: string;
    sortable?: boolean;
    visible?: boolean;
    isAction?: boolean;
    format?: (value: any, row: Record<string, any>) => string | number | SafeHTML;
  }> = [];
  export let actions: Array<{
    label: string;
    eventName: string;
    class?: string;
    disabled?: (row: Record<string, any>) => boolean;
    permission?: string;
  }> = [];
  export let itemsPerPage: number = 10;
  export let userPermissions: Array<string> = []; // e.g., ['edit_user', 'delete_user']

  // Internal state as Svelte stores for easier reactivity
  const currentPage = writable(1);
  const searchTerm = writable('');
  const sortColumn = writable<string | null>(null);
  const sortDirection = writable<'asc' | 'desc'>('asc');

  const dispatch = createEventDispatcher();

  // Helper to get cell value
  function getCellValue(row: Record<string, any>, column: typeof columns[0]): any {
    const value = row[column.key];
    return column.format ? column.format(value, row) : value;
  }

  // Derived store for filtered and sorted data
  const filteredAndSortedData = derived(
    [searchTerm, sortColumn, sortDirection, writable(data)], // Writable(data) to react to data prop changes
    ([$searchTerm, $sortColumn, $sortDirection, $data]) => {
      let processed = [...$data];

      // Filter
      if ($searchTerm) {
        const lowerSearchTerm = $searchTerm.toLowerCase();
        processed = processed.filter(row =>
          visibleColumns.some(col => {
            if (col.isAction) return false;
            const value = row[col.key];
            return value !== null && value !== undefined && String(value).toLowerCase().includes(lowerSearchTerm);
          })
        );
      }

      // Sort
      if ($sortColumn) {
        processed.sort((a, b) => {
          const valA = a[$sortColumn];
          const valB = b[$sortColumn];
          if (valA === null || valA === undefined) return $sortDirection === 'asc' ? -1 : 1;
          if (valB === null || valB === undefined) return $sortDirection === 'asc' ? 1 : -1;
          if (valA < valB) return $sortDirection === 'asc' ? -1 : 1;
          if (valA > valB) return $sortDirection === 'asc' ? 1 : -1;
          return 0;
        });
      }
      return processed;
    }
  );

  // Derived store for paginated data
  const paginatedData = derived(
    [filteredAndSortedData, currentPage],
    ([$filteredAndSortedData, $currentPage]) => {
      const start = ($currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      return $filteredAndSortedData.slice(start, end);
    }
  );

  // Derived store for total pages
  const totalPages = derived(filteredAndSortedData, ($filteredAndSortedData) => {
    return Math.ceil($filteredAndSortedData.length / itemsPerPage);
  });

  // Visible columns (respecting the 'visible' prop)
  $: visibleColumns = columns.filter(col => col.visible !== false);

  function handleSort(columnKey: string) {
    if (sortColumn.get() === columnKey) {
      sortDirection.update(dir => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      sortColumn.set(columnKey);
      sortDirection.set('asc');
    }
    currentPage.set(1); // Reset to first page on sort
  }

  function handleActionClick(eventName: string, row: Record<string, any>) {
    dispatch(eventName, row);
  }

  function canShowAction(action: typeof actions[0], row: Record<string, any>): boolean {
    if (action.permission && !userPermissions.includes(action.permission)) {
      return false;
    }
    if (action.disabled && action.disabled(row)) {
      return false;
    }
    return true;
  }
  
  // Debounce search term
  let searchDebounceTimer: number;
  function handleSearchInput(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
        searchTerm.set(inputElement.value);
        currentPage.set(1); // Reset to first page on search
    }, 300);
  }

  // Ensure data changes from prop are reflected in the store
  $: if (data) {
    // This is a bit of a hack to make derived store react to prop changes.
    // A better way might be to pass `data` directly to derived store's array.
    // For now, re-assigning to a new writable store if data prop itself changes instance.
    // This was addressed by wrapping `data` with `writable(data)` in the derived store.
  }

</script>

<div class="advanced-table-wrapper">
  <div class="table-controls">
    <input
      type="text"
      placeholder="Search..."
      on:input={handleSearchInput}
      class="search-input"
      aria-label="Search table data"
    />
    <!-- Future: Column visibility toggle button -->
  </div>

  <div class="table-container" role="region" aria-labelledby="table-caption" tabindex="0">
    <table class="advanced-table">
      <caption id="table-caption" class="visually-hidden">List of items</caption>
      <thead>
        <tr>
          {#each visibleColumns as column (column.key)}
            <th
              scope="col"
              class:sortable={column.sortable}
              on:click={() => column.sortable && handleSort(column.key)}
              aria-sort={$sortColumn === column.key ? ($sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              tabindex={column.sortable ? 0 : -1}
              on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && column.sortable && handleSort(column.key)}
            >
              {column.label}
              {#if $sortColumn === column.key}
                <span aria-hidden="true">{$sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
              {/if}
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#if $paginatedData.length === 0}
          <tr>
            <td colspan={visibleColumns.length} class="no-data-message">
              {$searchTerm ? 'No results found.' : 'No data available.'}
            </td>
          </tr>
        {/if}
        {#each $paginatedData as row (row.id || JSON.stringify(row))} <!-- Assuming row.id or unique key -->
          <tr class:sync-pending={row.syncPending}> <!-- Mock sync pending -->
            {#each visibleColumns as column (column.key)}
              <td>
                {#if column.isAction}
                  <div class="action-buttons">
                    {#each actions as action (action.eventName)}
                      {#if canShowAction(action, row)}
                        <button
                          type="button"
                          class="btn-action {action.class || ''}"
                          on:click={() => handleActionClick(action.eventName, row)}
                          disabled={action.disabled ? action.disabled(row) : false}
                          aria-label={`${action.label} ${row[columns.find(c => c.key !== 'actions' && c.key !=='id')?.key || 'item']}`}
                        >
                          {action.label}
                        </button>
                      {/if}
                    {/each}
                  </div>
                {:else}
                  {@html column.format ? column.format(row[column.key], row) : row[column.key]}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if $totalPages > 1}
    <div class="pagination-controls">
      <button
        type="button"
        on:click={() => currentPage.update(p => Math.max(1, p - 1))}
        disabled={$currentPage === 1}
        aria-label="Previous page"
      >
        Previous
      </button>
      <span>Page {$currentPage} of {$totalPages}</span>
      <button
        type="button"
        on:click={() => currentPage.update(p => Math.min($totalPages, p + 1))}
        disabled={$currentPage === $totalPages}
        aria-label="Next page"
      >
        Next
      </button>
    </div>
  {/if}
</div>

<style>
  .advanced-table-wrapper {
    width: 100%;
    font-family: sans-serif;
  }
  .table-controls {
    margin-bottom: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .search-input {
    padding: 0.75rem 0.5rem; /* Consistent with other inputs */
    min-height: 44px; /* Ensure minimum touch target height */
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 0.9rem; /* Can be 1rem for consistency, but 0.9 is often fine for search */
    box-sizing: border-box;
  }
  .table-container {
    overflow-x: auto; /* Horizontal scroll on small screens */
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  .advanced-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 600px; /* Ensure table has a min-width for structure before scroll */
  }
  .advanced-table th, .advanced-table td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #ddd;
    white-space: nowrap; /* Prevent text wrapping that might break layout */
  }
  .advanced-table th {
    background-color: #f7f7f7;
    font-weight: bold;
    cursor: default;
  }
  .advanced-table th.sortable {
    cursor: pointer;
  }
  .advanced-table th.sortable:hover {
    background-color: #efefef;
  }
  .advanced-table tr:last-child td {
    border-bottom: none;
  }
  .advanced-table tr:hover {
    background-color: #f1f1f1;
  }
  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }
  .btn-action {
    padding: 0.5rem 0.75rem; /* Increased padding for better touch */
    font-size: 0.875rem; /* Slightly larger font */
    min-height: 38px; /* Closer to 44px with padding */
    border: 1px solid #ccc;
    background-color: #fff;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-action:hover {
    background-color: #eee;
  }
  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pagination-controls {
    margin-top: 1rem;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
  }
  .pagination-controls button {
    padding: 0.6rem 1rem; /* Increased padding */
    min-height: 44px; /* Ensure touch target height */
    border: 1px solid #ccc;
    background-color: #fff;
    border-radius: 4px;
    cursor: pointer;
  }
  .pagination-controls button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pagination-controls span {
    padding: 0 0.5rem;
  }
  .no-data-message {
    text-align: center;
    padding: 2rem;
    color: #777;
    font-style: italic;
  }
  .visually-hidden { /* For accessibility */
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  .sync-pending td:first-child::before { /* Mock indicator */
    content: '⏳ '; /* Simple emoji, replace with SVG or class-based icon */
    display: inline-block;
    margin-right: 0.5em;
    font-style: normal; /* Ensure emoji isn't italic if cell is */
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    /* On smaller screens, action buttons might be better stacked or icons only */
    .btn-action {
      /* Could make buttons smaller or icon-only */
    }
    .advanced-table th, .advanced-table td {
      /* Consider reducing padding slightly on very small screens if needed */
       /* white-space: normal; /* Allow wrapping if really needed, but might look messy */
    }
  }
</style>
