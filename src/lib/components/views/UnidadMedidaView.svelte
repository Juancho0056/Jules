<script lang="ts">
  import { onMount, tick } from 'svelte';
  import AdvancedTable from '../table/AdvancedTable.svelte';
  import FormBase from '../forms/FormBase.svelte';
  import type { UnidadMedida } from '../../services/dbService';
  import {
    getAllUnidadMedida,
    addUnidadMedida,
    updateUnidadMedida,
    deleteUnidadMedida,
    // db, // For direct db access if needed for more complex scenarios
  } from '../../services/dbService';
import { currentUserPermissions, hasPermission, PERMISSIONS, setCurrentUserRole, ROLES } from '../../stores/authStore'; // +Import
import { isOnline } from '../../stores/connectivityStore';

  // --- State ---
  let unidades: UnidadMedida[] = [];
  let showForm = false;
  let editingUnidad: UnidadMedida | null = null;
  let formKey = 0; // Used to reset FormBase by changing its key

  // --- Table Configuration ---
  const tableColumns = [
    { key: 'nombre', label: 'Nombre', sortable: true },
    { key: 'abreviatura', label: 'Abreviatura', sortable: true },
    { 
      key: 'syncPending', 
      label: 'Sync Status', 
      sortable: true,
      format: (value: boolean) => value ? '⚠️ Pending' : '✅ Synced'
    },
    { key: 'actions', label: 'Actions', isAction: true },
  ];

  const tableActions = [
    { label: 'Edit', eventName: 'edit', class: 'btn-edit', permission: PERMISSIONS.EDIT_UNIDAD },
    { label: 'Delete', eventName: 'delete', class: 'btn-delete', permission: PERMISSIONS.DELETE_UNIDAD },
  ];

  // --- Form Configuration ---
  let formFields = [
    {
      type: 'text',
      name: 'nombre',
      label: 'Nombre de Unidad',
      required: true,
      validation: (value: string) => (!value?.trim() ? 'El nombre es requerido.' : ''),
    },
    {
      type: 'text',
      name: 'abreviatura',
      label: 'Abreviatura',
      required: true,
      validation: (value: string) => (!value?.trim() ? 'La abreviatura es requerida.' : ''),
    },
    // Add other fields for UnidadMedida if any
  ];
  
  let initialFormData: Record<string, any> = {};

  // --- Lifecycle ---
  onMount(async () => {
    await loadUnidades();
    // For testing, cycle through roles
    // setCurrentUserRole(ROLES.VENDEDOR); 
  });

  // --- Functions ---
  async function loadUnidades() {
    unidades = await getAllUnidadMedida();
  }

  function handleAdd() {
    if (!hasPermission(PERMISSIONS.CREATE_UNIDAD)) {
        alert("You don't have permission to create units."); // Or handle more gracefully
        return;
    }
    editingUnidad = null;
    initialFormData = { nombre: '', abreviatura: '' }; // Reset for new entry
    formKey++; // Force re-creation of FormBase if it's already visible and we want to clear it
    showForm = true;
  }

  async function handleEdit(event: CustomEvent<UnidadMedida>) {
    if (!hasPermission(PERMISSIONS.EDIT_UNIDAD)) {
        alert("You don't have permission to edit units.");
        return;
    }
    editingUnidad = event.detail;
    initialFormData = { ...editingUnidad };
    formKey++; 
    showForm = true;
    await tick(); // Wait for DOM update if FormBase is inside an #if block
    // console.log("Editing:", editingUnidad);
  }

  async function handleDelete(event: CustomEvent<UnidadMedida>) {
    if (!hasPermission(PERMISSIONS.DELETE_UNIDAD)) {
        alert("You don't have permission to delete units.");
        return;
    }
    const unidadToDelete = event.detail;
    if (confirm(`Are you sure you want to delete "${unidadToDelete.nombre}"?`)) {
      if (unidadToDelete.id !== undefined) {
        await deleteUnidadMedida(unidadToDelete.id);
        await loadUnidades();
      } else {
        console.error("Cannot delete unit without an ID.");
      }
    }
  }

  async function handleSaveForm(event: CustomEvent<Record<string, any>>) {
    const formData = event.detail;
    try {
      if (editingUnidad && editingUnidad.id !== undefined) {
        // Update existing
        await updateUnidadMedida(editingUnidad.id, {
          nombre: formData.nombre,
          abreviatura: formData.abreviatura,
          // syncPending will be handled by updateUnidadMedida
        });
      } else {
        // Create new
        await addUnidadMedida({
          nombre: formData.nombre,
          abreviatura: formData.abreviatura,
          // syncPending will be handled by addUnidadMedida
        });
      }
      await loadUnidades();
      showForm = false;
      editingUnidad = null;
    } catch (error) {
      console.error("Error saving form:", error);
      // Potentially show user-friendly error message
    }
  }

  function handleCancelForm() {
    showForm = false;
    editingUnidad = null;
  }

</script>

<div class="view-container unidad-medida-view">
  {#if !$isOnline}
    <div class="offline-status-indicator" role="alert">
      ⚠️ You are currently offline. Data will be saved locally and synced when online.
    </div>
  {/if}

  <header class="view-header">
    <h1>Unidades de Medida</h1>
    {#if hasPermission(PERMISSIONS.CREATE_UNIDAD)}
      <button type="button" class="btn btn-primary" on:click={handleAdd}>
        Crear Nueva Unidad
      </button>
    {/if}
  </header>

  <AdvancedTable
    data={unidades}
    columns={tableColumns}
    actions={tableActions}
    userPermissions={$currentUserPermissions} // Pass the reactive store value
    on:edit={handleEdit}
    on:delete={handleDelete}
    itemsPerPage={5}
  />

  {#if showForm}
    <div class="modal-overlay" on:click|self={handleCancelForm}>
      <div class="modal-content">
        <header class="modal-header">
          <h2>{editingUnidad ? 'Editar' : 'Crear'} Unidad de Medida</h2>
          <button class="btn-close" on:click={handleCancelForm} aria-label="Close form">&times;</button>
        </header>
        <FormBase
          {formFields}
          initialData={initialFormData}
          on:save={handleSaveForm}
          on:cancel={handleCancelForm}
          key={formKey} 
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .view-container {
    padding: 1rem;
  }
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .view-header h1 {
    margin: 0;
    font-size: 1.8rem;
  }
  .btn-primary { /* Basic button styling, can be centralized */
    padding: 0.75rem 1.5rem; /* Increased padding for better touch */
    min-height: 44px; /* Ensure touch target height */
    box-sizing: border-box;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .btn-primary:hover {
    background-color: #0056b3;
  }

  /* Basic Modal Styling */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  .modal-content {
    background-color: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    width: 90%;
    max-width: 500px; /* Max width of the modal */
    max-height: 90vh;
    overflow-y: auto;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #eee;
    padding-bottom: 1rem;
  }
  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
  }
  .btn-close {
    background: none;
    border: none;
    font-size: 1.8rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  /* Ensure AdvancedTable actions buttons have some specific styling if needed */
  :global(.btn-edit) { /* Using :global if styles are in AdvancedTable, or define here */
    /* background-color: #ffc107; color: black; */
  }
  :global(.btn-delete) {
    /* background-color: #dc3545; color: white; */
  }

.offline-status-indicator {
  background-color: #fff3cd; /* Light yellow */
  color: #856404; /* Dark yellow text */
  padding: 0.75rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid #ffeeba;
  border-radius: 0.25rem;
  text-align: center;
  font-weight: bold;
}
</style>
