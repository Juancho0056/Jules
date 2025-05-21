<script lang="ts">
  import { unitOfMeasureStore, type UnitOfMeasure } from '$lib/stores/unitOfMeasureStore';
  import UnitListItem from './UnitListItem.svelte';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  const handleEdit = (event: CustomEvent<UnitOfMeasure>) => {
    dispatch('editUnit', event.detail);
  };

  const handleDelete = async (event: CustomEvent<string>) => {
    if (confirm('Are you sure you want to delete this unit?')) {
      await unitOfMeasureStore.remove(event.detail);
    }
  };
</script>

{#if $unitOfMeasureStore.isLoading && $unitOfMeasureStore.units.length === 0}
  <p>Loading units...</p>
{:else if $unitOfMeasureStore.error && $unitOfMeasureStore.units.length === 0}
  <p class="text-red-500">Error loading units: {$unitOfMeasureStore.error.message}</p>
{:else if $unitOfMeasureStore.units.length === 0}
  <p>No units of measure found. Add one below!</p>
{:else}
  <ul class="list-none p-0">
    {#each $unitOfMeasureStore.units as unit (unit.id)}
      <UnitListItem {unit} on:edit={handleEdit} on:delete={handleDelete} />
    {/each}
  </ul>
{/if}
