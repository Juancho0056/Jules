<script lang="ts">
  import type { UnitOfMeasureDbo } from "$lib/services/dbService"; // Updated import
  import { createEventDispatcher } from "svelte";

  export let unit: UnitOfMeasureDbo; // Type updated to UnitOfMeasureDbo
  const dispatch = createEventDispatcher();

  // localId is now Dexie's primary key, which should always exist for items from the store.
  // The 'delete' event should dispatch the key needed by unitOfMeasureStore.remove, which is localId and codigo.
  const handleEdit = () => dispatch("edit", unit); // unit object contains localId and codigo
  const handleDelete = () => {
    if (unit.localId !== undefined && unit.codigo) {
      dispatch("delete", { localId: unit.localId, codigo: unit.codigo });
    } else {
      console.error("Cannot delete unit: localId or codigo is missing", unit);
      // Optionally show a toast message to the user
    }
  };

  // Use unit.sincronizado to determine sync status
  $: isUnsynced = unit.sincronizado === false;
  // Server ID might be null if created offline and never synced
  $: hasServerId = unit.id !== null && unit.id !== undefined;
</script>

<li
  class="flex justify-between items-center p-3 border-b hover:bg-gray-50 transition-colors duration-150"
>
  <div class="flex-grow">
    <div class="flex items-center">
      <span class="font-semibold text-gray-700">{unit.name}</span>
      <span class="text-sm text-gray-500 ml-2"
        >({unit.symbol} - {unit.codigo})</span
      >
      {#if isUnsynced}
        <span title="Pending synchronization" class="ml-2 text-orange-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 inline-block"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM8.036 4.697a.75.75 0 011.06.036l1.5 1.5a.75.75 0 01-1.06 1.06l-1.5-1.5a.75.75 0 01.035-1.096zM15.303 5.733a.75.75 0 01-1.06 1.06l-1.5-1.5a.75.75 0 111.06-1.06l1.5 1.5zM10 5.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM6.25 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zM11.5 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zM4.697 11.964a.75.75 0 01.036-1.06l1.5-1.5a.75.75 0 011.06 1.06l-1.5 1.5a.75.75 0 01-1.096-.035zM14.267 11.964a.75.75 0 011.06-.035l1.5 1.5a.75.75 0 01-1.06 1.06l-1.5-1.5a.75.75 0 01-.035-1.06zM10 14.5a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75z"
              clip-rule="evenodd"
            />
            <path
              d="M3.055 11H2.25a.75.75 0 000 1.5h.805a6.974 6.974 0 003.031 3.031v.805a.75.75 0 001.5 0v-.805A6.974 6.974 0 0010.622 14h.002a6.974 6.974 0 003.03-3.031v.805a.75.75 0 001.5 0v-.805a6.974 6.974 0 003.032-3.03h.805a.75.75 0 000-1.5h-.805a6.973 6.973 0 00-3.031-3.03V6.25a.75.75 0 00-1.5 0v.805A6.973 6.973 0 0010 4.028 6.973 6.973 0 006.97 7.056V6.25a.75.75 0 00-1.5 0v.805A6.974 6.974 0 002.434 10H2.25c0 .041.002.081.005.121H2.25a.75.75 0 000 1.5h.005A6.974 6.974 0 003.055 11z"
            />
          </svg>
          <!-- (Unsynced) -->
        </span>
      {/if}
      {#if !hasServerId && !isUnsynced}
        <!-- Should ideally not happen if sincronizado=true means server ID (id) is set -->
        <span title="Synced but server ID missing?" class="ml-2 text-red-600"
          >(Error: Synced but no Server ID)</span
        >
      {/if}
    </div>
    <p class="text-xs text-gray-400 mt-1">
      Local ID: {unit.localId} | Server ID: {unit.id || "N/A"} | Last Mod: {new Date(
        unit.fechaModificacion
      ).toLocaleDateString()}
    </p>
  </div>
  <div class="flex-shrink-0 ml-4">
    <button
      on:click={handleEdit}
      class="text-blue-600 hover:text-blue-800 mr-3 text-sm font-medium"
      >Edit</button
    >
    <button
      on:click={handleDelete}
      class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button
    >
  </div>
</li>
