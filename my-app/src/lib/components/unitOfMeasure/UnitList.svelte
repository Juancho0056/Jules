<script lang="ts">
  // Import UnitOfMeasureDbo if it's used for strong typing of event.detail, though store itself handles Dbo type.
  import {
    unitOfMeasureStore,
    type UnitOfMeasureState,
  } from "$lib/stores/unitOfMeasureStore"; // unitOfMeasureStore uses Dbo internally
  import type { UnitOfMeasureDbo } from "$lib/services/dbService"; // For CustomEvent type hint
  import UnitListItem from "./UnitListItem.svelte";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();

  // Type for the edit event detail
  const handleEdit = (event: CustomEvent<UnitOfMeasureDbo>) => {
    console.log("Editing unit:", event.detail);
    console.log("Dispatching edit event with detail unitlist");
    dispatch("editUnit", event.detail); // Forward the Dbo object
  };

  // Type for the delete event detail
  interface DeleteEventDetail {
    localId: number;
    codigo: string;
  }

  const handleDelete = async (event: CustomEvent<DeleteEventDetail>) => {
    if (
      confirm(
        `Are you sure you want to delete unit with code '${event.detail.codigo}'? This action will be synced.`
      )
    ) {
      // Call store's remove with localId and codigo
      await unitOfMeasureStore.remove(
        event.detail.localId,
        event.detail.codigo
      );
      // UI should update reactively via liveQuery in the store
    }
  };

  // Accessing store state via $unitOfMeasureStore subscription
</script>

{#if $unitOfMeasureStore.isLoading && $unitOfMeasureStore.units.length === 0}
  <!-- Show loading only if units are empty initially -->
  <p class="text-center text-gray-500 py-4">Loading units...</p>
{:else if $unitOfMeasureStore.error}
  <p class="text-center text-red-500 py-4">
    Error loading units: {$unitOfMeasureStore.error.message}
  </p>
{:else if $unitOfMeasureStore.units.length === 0}
  <p class="text-center text-gray-500 py-4">
    No units of measure found. Add one to get started!
  </p>
{:else}
  <ul class="list-none p-0 m-0 bg-white shadow-md rounded-lg">
    {#each $unitOfMeasureStore.units as unit (unit.localId)}
      <!-- Key by localId, which is Dexie's PK -->
      <UnitListItem {unit} on:edit={handleEdit} on:delete={handleDelete} />
    {/each}
  </ul>
{/if}

<style>
  /* Add any specific styles for the list container if needed */
  ul {
    /* Example: apply max height and scroll if list becomes too long */
    /* max-height: 60vh; */
    /* overflow-y: auto; */
  }
</style>
