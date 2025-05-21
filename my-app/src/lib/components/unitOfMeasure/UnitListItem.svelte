<script lang="ts">
  import type { UnitOfMeasure } from '$lib/types/unitOfMeasure';
  import { createEventDispatcher } from 'svelte';

  export let unit: UnitOfMeasure;
  const dispatch = createEventDispatcher();

  const handleEdit = () => dispatch('edit', unit);
  const handleDelete = () => dispatch('delete', unit.id);

  $: isPendingSync = unit.id.startsWith('temp-');
</script>

<li class="flex justify-between items-center p-2 border-b">
  <div>
    <span class="font-semibold">{unit.name}</span> ({unit.symbol})
    {#if isPendingSync}
      <span class="text-xs text-gray-500 ml-2">(Pending sync...)</span>
    {/if}
    {#if unit.createdAt}
      <p class="text-xs text-gray-400">
        Created: {new Date(unit.createdAt).toLocaleDateString()}
        {#if unit.updatedAt && unit.updatedAt !== unit.createdAt}
          | Updated: {new Date(unit.updatedAt).toLocaleDateString()}
        {/if}
      </p>
    {/if}
  </div>
  <div>
    <button on:click={handleEdit} class="text-blue-500 hover:text-blue-700 mr-2">Edit</button>
    <button on:click={handleDelete} class="text-red-500 hover:text-red-700">Delete</button>
  </div>
</li>
