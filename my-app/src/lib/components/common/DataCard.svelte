<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  export let row: Record<string, any>;
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
  const dispatch = createEventDispatcher();
  function handleActionClick(eventName: string, row: Record<string, any>) {
    dispatch(eventName, row);
    console.log(`Action ${eventName} triggered for row:`, row);
  }
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
</script>

<div class="p-4 rounded shadow bg-white mb-3">
  {#each columns as col}
    {#if !col.isAction}
      <div class="mb-1">
        <span class="font-bold text-sm">{col.label}:</span>
        <span class="ml-2 text-gray-700">{getCellValue(row, col)}</span>
      </div>
    {/if}
  {/each}
  <div class="flex gap-2 mt-2">
    {#each actions as action}
      <button
        class="px-2 py-1 rounded text-xs bg-blue-50 hover:bg-blue-100 cursor-pointer"
        on:click={() =>
          dispatch("action", { eventName: action.eventName, row })}
        >{action.label}</button
      >
    {/each}
  </div>
</div>
