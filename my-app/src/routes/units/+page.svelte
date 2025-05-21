<script lang="ts">
  import UnitList from '$lib/components/unitOfMeasure/UnitList.svelte';
  import UnitForm from '$lib/components/unitOfMeasure/UnitForm.svelte';
  import type { UnitOfMeasure } from '$lib/types/unitOfMeasure';
  import { unitOfMeasureStore } from '$lib/stores/unitOfMeasureStore';
  import { offlineStore } from '$lib/stores/offlineStore';
  import { onMount } from 'svelte';

  let unitToEdit: UnitOfMeasure | null = null;
  let showForm = false; // To toggle form visibility

  const handleEditUnit = (event: CustomEvent<UnitOfMeasure>) => {
    unitToEdit = event.detail;
    showForm = true; // Show form when editing
  };

  const handleFormSubmitted = () => {
    unitToEdit = null;
    showForm = false; // Hide form after successful submission
  };
  
  const handleFormCleared = () => {
    unitToEdit = null;
    showForm = false; // Hide form if editing is cancelled
  };

  const toggleForm = () => {
    showForm = !showForm;
    if (!showForm) { // If closing form, ensure unitToEdit is cleared
        unitToEdit = null;
    }
  }

  // Fetch units when the component mounts
  onMount(async () => {
    // Data is now loaded by the store itself upon initialization and when coming online.
    // However, if you want to ensure it's fetched when the page is visited,
    // and not just on app load, you can call it here.
    // Consider if $unitOfMeasureStore.units.length === 0, then unitOfMeasureStore.fetchAll();
    // For now, store's own loading logic is relied upon.
  });
</script>

<div class="container mx-auto p-4">
  <div class="flex justify-between items-center mb-4">
    <h1 class="text-2xl font-bold">Units of Measure</h1>
    <button 
      on:click={toggleForm} 
      class="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
      {showForm && !unitToEdit ? 'Cancel' : (unitToEdit ? 'Editing Unit' : 'Add New Unit')}
    </button>
  </div>

  {#if $offlineStore.isOffline}
    <p class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4" role="alert">
      You are currently offline. Some actions may be queued and synced when you are back online.
    </p>
  {/if}
  
  <!-- Status messages from the store -->
  {#if $unitOfMeasureStore.isLoading && $unitOfMeasureStore.units.length === 0 } 
    <!-- Show global loading only if no units are displayed yet -->
    <p class="text-blue-500">Loading data...</p>
  {/if}
  {#if $unitOfMeasureStore.error && $unitOfMeasureStore.units.length === 0 }
    <!-- Show global error only if no units are displayed (e.g. initial load failed) -->
    <p class="text-red-500">Error: {$unitOfMeasureStore.error.message}</p>
  {/if}

  {#if showForm || unitToEdit}
    <UnitForm {unitToEdit} on:formSubmitted={handleFormSubmitted} on:formCleared={handleFormCleared} />
  {/if}

  <UnitList on:editUnit={handleEditUnit} />

  <div class="mt-6 p-2 border rounded">
      <h3 class="text-sm font-semibold">Offline Store Actions (for testing):</h3>
      <button on:click={() => offlineStore.setOfflineMode(true)} class="text-xs bg-orange-500 text-white p-1 rounded mr-1">Go Offline</button>
      <button on:click={() => offlineStore.setOfflineMode(false)} class="text-xs bg-green-500 text-white p-1 rounded mr-1">Go Online</button>
      <button on:click={() => unitOfMeasureStore.fetchAll()} class="text-xs bg-blue-500 text-white p-1 rounded">Force Refresh Units</button>
  </div>
</div>
