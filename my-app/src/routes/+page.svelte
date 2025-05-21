<script lang="ts">
  import UnitList from "$lib/components/unitOfMeasure/UnitList.svelte";
  import UnitForm from "$lib/components/unitOfMeasure/UnitForm.svelte";
  import type { UnitOfMeasureDbo } from "$lib/services/dbService"; // Correct type
  import { unitOfMeasureStore } from "$lib/stores/unitOfMeasureStore";
  import { offlineStore } from "$lib/stores/offlineStore";
  import { syncService } from "$lib/services/syncService"; // Import syncService
  import { onMount } from "svelte";

  // showFormForNew controls visibility of the form for creating a new unit.
  // Editing existing units is handled by $unitOfMeasureStore.selectedUnitToEdit.
  let showFormForNew = false;
  const { selectedUnitToEdit } = unitOfMeasureStore;

  const handleEditUnit = (event: CustomEvent<UnitOfMeasureDbo>) => {
    unitOfMeasureStore.selectUnitToEdit(event.detail);
    console.log("Selected unit to edit:", event.detail);
    showFormForNew = false; // Hide new unit form if editing existing
  };

  const handleFormSubmitted = () => {
    // UnitForm calls store methods directly, which should clear selectedUnitToEdit on success.
    // If we were showing the form for a new unit, hide it.
    showFormForNew = false;
    // $unitOfMeasureStore.selectedUnitToEdit should be null now if store logic is correct
  };

  const handleFormCleared = () => {
    // This event is from UnitForm when its "Cancel Edit" is clicked
    unitOfMeasureStore.clearSelectedUnitToEdit();
    showFormForNew = false; // Also ensure new unit form is hidden
  };

  const toggleAddNewForm = () => {
    if ($selectedUnitToEdit) {
      unitOfMeasureStore.clearSelectedUnitToEdit(); // Clear any existing edit selection
    }
    showFormForNew = !showFormForNew; // Toggle new unit form
  };

  onMount(async () => {
    // unitOfMeasureStore.setLoading(true); // Optional: if store manages global loading state
    try {
      await syncService.fetchAllUnidadesMedida();
    } catch (e) {
      console.error("Error fetching all Unidades de Medida on mount:", e);
      // Error is likely already handled and toasted by syncService/apiService
    } finally {
      // unitOfMeasureStore.setLoading(false); // Optional
    }
  });

  // Reactive variable to determine if any form should be shown (either new or edit)
  $: showAnyForm = showFormForNew || !!$selectedUnitToEdit;
  // Determine which unit to pass to the form: null for new, or the selected one for editing.
  $: currentUnitForForm = showFormForNew ? null : $selectedUnitToEdit;
</script>

<div class="container mx-auto p-6 bg-gray-50 min-h-screen">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-semibold text-gray-800">Units of Measure</h1>
    <button
      on:click={toggleAddNewForm}
      class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
    >
      {#if showFormForNew}
        Cancel New Unit
      {:else if $selectedUnitToEdit}
        Add New Unit <!-- If editing, button still says "Add New" to switch context -->
      {:else}
        Add New Unit
      {/if}
    </button>
  </div>

  {#if $offlineStore.isOffline}
    <p
      class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-4 rounded-md shadow"
      role="alert"
    >
      You are currently offline. Operations will be queued and synced when
      online.
    </p>
  {/if}

  {#if $unitOfMeasureStore.isLoading && $unitOfMeasureStore.units.length === 0}
    <p class="text-center text-gray-500 py-4">Loading units...</p>
  {/if}
  {#if $unitOfMeasureStore.error && $unitOfMeasureStore.units.length === 0}
    <p class="text-center text-red-600 py-4">
      Error loading units: {$unitOfMeasureStore.error.message ||
        "Unknown error"}
    </p>
  {/if}

  {#if showAnyForm}
    <div class="mb-8 p-6 bg-white rounded-lg shadow-xl">
      <UnitForm
        unitToEdit={currentUnitForForm}
        on:formSubmitted={handleFormSubmitted}
        on:formCleared={handleFormCleared}
      />
    </div>
  {/if}

  <div class="bg-white rounded-lg shadow-xl overflow-hidden">
    <UnitList on:editUnit={handleEditUnit} />
  </div>

  <!-- Test buttons can be kept for development, or removed for production -->
  <div class="mt-8 p-4 border border-gray-200 rounded-md bg-gray-50">
    <h3 class="text-lg font-medium text-gray-700 mb-2">Developer Tools:</h3>
    <div class="flex space-x-2">
      <button
        on:click={() => offlineStore.setOfflineMode(true)}
        class="text-sm bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-3 rounded-md shadow-sm"
        >Go Offline</button
      >
      <button
        on:click={() => offlineStore.setOfflineMode(false)}
        class="text-sm bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-3 rounded-md shadow-sm"
        >Go Online</button
      >
      <button
        on:click={() => syncService.fetchAllUnidadesMedida()}
        class="text-sm bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded-md shadow-sm"
        >Force Refresh Units</button
      >
      <button
        on:click={() => syncService.processQueue()}
        class="text-sm bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-3 rounded-md shadow-sm"
        >Force Process Queue</button
      >
    </div>
  </div>
</div>
