<script lang="ts">
  import { unitOfMeasureStore, type UnitOfMeasure } from '$lib/stores/unitOfMeasureStore';
  import { createEventDispatcher, onMount } from 'svelte';

  export let unitToEdit: UnitOfMeasure | null = null;

  let id: string | undefined = undefined;
  let name: string = '';
  let symbol: string = '';
  let isEditing = false;

  const dispatch = createEventDispatcher();

  onMount(() => {
    if (unitToEdit) {
      id = unitToEdit.id;
      name = unitToEdit.name;
      symbol = unitToEdit.symbol;
      isEditing = true;
    }
  });

  // Watch for changes in unitToEdit prop
  $: if (unitToEdit && unitToEdit.id !== id) {
    id = unitToEdit.id;
    name = unitToEdit.name;
    symbol = unitToEdit.symbol;
    isEditing = true;
  } else if (!unitToEdit && isEditing) {
    resetForm(); // Clear form if unitToEdit becomes null
  }
  

  const handleSubmit = async () => {
    if (!name || !symbol) {
      alert('Name and Symbol are required.');
      return;
    }
    const unitData = { name, symbol };
    if (isEditing && id) {
      await unitOfMeasureStore.update(id, unitData);
    } else {
      await unitOfMeasureStore.add(unitData);
    }
    resetForm();
    dispatch('formSubmitted');
  };

  const resetForm = () => {
    id = undefined;
    name = '';
    symbol = '';
    isEditing = false;
    unitToEdit = null; // Important to clear the prop effect
    dispatch('formCleared');
  };
</script>

<form on:submit|preventDefault={handleSubmit} class="p-4 border rounded shadow-md mb-4">
  <h3 class="text-lg font-semibold mb-2">{isEditing ? 'Edit' : 'Add'} Unit of Measure</h3>
  <div class="mb-2">
    <label for="name" class="block text-sm font-medium text-gray-700">Name:</label>
    <input type="text" id="name" bind:value={name} required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
  </div>
  <div class="mb-4">
    <label for="symbol" class="block text-sm font-medium text-gray-700">Symbol:</label>
    <input type="text" id="symbol" bind:value={symbol} required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
  </div>
  <button type="submit" class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2">
    {isEditing ? 'Update' : 'Add'} Unit
  </button>
  {#if isEditing}
    <button type="button" on:click={resetForm} class="bg-gray-300 hover:bg-gray-400 text-black font-bold py-2 px-4 rounded">
      Cancel Edit
    </button>
  {/if}
</form>
