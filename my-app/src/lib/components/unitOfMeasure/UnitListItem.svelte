<script lang="ts">
  import type { UnitOfMeasureDbo } from "$lib/services/dbService"; // Updated import
  import { createEventDispatcher } from "svelte";
  import UnitForm from "./UnitForm.svelte";
  import { unitOfMeasureStore } from "$lib/stores/unitOfMeasureStore";
  import { sessionStore } from '$lib/stores/sessionStore';
  import { AppClaims } from '$lib/config/appClaims.ts';

  export let unit: UnitOfMeasureDbo; // Type updated to UnitOfMeasureDbo

  // Claim checking logic
  $: canUpdateUnit = $sessionStore.user?.claims?.includes(AppClaims.UnidadMedida_Update) ?? false;
  $: canDeleteUnit = $sessionStore.user?.claims?.includes(AppClaims.UnidadMedida_Delete) ?? false;

  const { selectedUnitToEdit, clearSelectedUnitToEdit } = unitOfMeasureStore;

  const dispatch = createEventDispatcher();

  // localId is now Dexie's primary key, which should always exist for items from the store.
  // The 'delete' event should dispatch the key needed by unitOfMeasureStore.remove, which is localId and codigo.
  const handleEdit = () => {
    console.log("Editing unit:", unit);
    dispatch("edit", unit);
  }; // unit object contains localId and codigo
  const handleDelete = () => {
    if (unit.localId !== undefined && unit.codigo) {
      dispatch("delete", { localId: unit.localId, codigo: unit.codigo });
    } else {
      console.error("Cannot delete unit: localId or codigo is missing", unit);
      // Optionally show a toast message to the user
    }
  };
  const handleClearEdit = () => {
    console.log("Cancel or submit -> clearing selected unit");
    clearSelectedUnitToEdit();
  };
  // Use unit.sincronizado to determine sync status
  // Server ID might be null if created offline and never synced
</script>

<li
  class="flex justify-between items-center p-4 border-b hover:bg-gray-50 transition-colors duration-150"
>
  <div class="flex-grow space-y-1">
    <div class="flex items-center">
      <span class="font-semibold text-gray-800 text-lg">{unit.nombre}</span>
      <span class="text-sm text-gray-600 ml-2"
        >({unit.abreviatura || "-"} - Cod: {unit.codigo})</span
      >
      {#if !unit.sincronizado}
        <span
          title="Pending synchronization"
          class="ml-2 px-2 py-0.5 text-xs font-medium text-yellow-800 bg-yellow-100 rounded-full"
        >
          No sincronizado
        </span>
      {/if}
      {#if unit.sincronizado && (!unit.id || unit.id === unit.offlineId)}
        <!-- This case indicates it's considered synced but server ID might be the offlineId or missing, review logic if this appears -->
        <span
          title="Synced but server ID might be temporary or missing"
          class="ml-2 px-2 py-0.5 text-xs font-medium text-blue-800 bg-blue-100 rounded-full"
        >
          Synced (Local ID as Server ID)
        </span>
      {/if}
    </div>
    <div class="text-sm text-gray-500">
      <span
        >Orden: <span class="font-medium text-gray-700">{unit.orden}</span
        ></span
      >
      <span class="mx-2">|</span>
      <span
        >Estado: <span
          class="font-medium {unit.estado ? 'text-green-600' : 'text-red-600'}"
          >{unit.estado ? "Activo" : "Inactivo"}</span
        ></span
      >
    </div>
    <p class="text-xs text-gray-400 mt-1">
      Local ID: {unit.localId} | Server ID: {unit.id || "N/A"} | Last Mod: {new Date(
        unit.fechaModificacion
      ).toLocaleString()}
    </p>
  </div>
  <div class="flex-shrink-0 ml-4 space-x-2">
    {#if canUpdateUnit}
      <button
        on:click={handleEdit}
        class="text-blue-600 hover:text-blue-800 mr-3 text-sm font-medium"
        >Edit</button
      >
    {/if}
    {#if canDeleteUnit}
      <button
        on:click={handleDelete}
        class="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button
      >
    {/if}
  </div>
</li>

{#if $selectedUnitToEdit?.localId === unit.localId}
  {#key $selectedUnitToEdit?.localId}
    <UnitForm
      unitToEdit={$selectedUnitToEdit}
      on:submitted={() => dispatch("edit", null)}
      on:formCleared={() => dispatch("cancel", null)}
    />
  {/key}
{/if}
