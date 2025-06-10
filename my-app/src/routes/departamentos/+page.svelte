<!-- my-app/src/routes/departamentos/+page.svelte -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { departamentoStore  } from '$lib/stores/departamentoStore';
  import type { DepartamentoDbo } from '$lib/types/departamento';
  import AdvancedTable from '$lib/components/table/AdvancedTable.svelte';
  import FormBase from '$lib/components/forms/FormBase.svelte';
  import {
    currentUserPermissions,
    hasPermission,
  } from '$lib/stores/authStore';
  import { isOnline } from '$lib/stores/connectivityStore';
  import { toastStore } from '$lib/stores/toastStore';

  // Placeholder permissions
  const PERMISSIONS = {
    CREATE_DEPARTAMENTO: 'Permissions.Departamentos.Create',
    EDIT_DEPARTAMENTO: 'Permissions.Departamentos.Edit',
    DELETE_DEPARTAMENTO: 'Permissions.Departamentos.Delete',
  };

  let departamentos: DepartamentoDbo[] = [];
  let isLoading = true;
  let error: any = null;

  let showForm = false;
  let editingDepartamento: DepartamentoDbo | null = null;
  let formKey = 0;
  let initialFormData: Record<string, any> = {};

  departamentoStore.subscribe((state) => {
    departamentos = state.departamentos;
    isLoading = state.isLoading;
    error = state.error;
  });

  const tableColumns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'nombre', label: 'Nombre', sortable: true },
    {
      key: 'estado',
      label: 'Estado',
      sortable: true,
      format: (value: boolean) => (value ? 'Activo' : 'Inactivo'),
    },
    {
      key: 'disponibleOffline',
      label: 'Disp. Offline',
      sortable: true,
      format: (value: boolean) => (value ? 'Sí' : 'No'),
    },
    {
      key: 'sincronizado',
      label: 'Sync',
      sortable: true,
      format: (value: boolean) => (value ? '✅' : '⏳'),
    },
    { key: 'actions', label: 'Acciones', isAction: true },
  ];

  const tableActions = [
    {
      label: 'Editar',
      eventName: 'edit',
      class: 'btn-edit',
      permission: PERMISSIONS.EDIT_DEPARTAMENTO,
    },
    {
      label: 'Eliminar',
      eventName: 'delete',
      class: 'btn-delete',
      permission: PERMISSIONS.DELETE_DEPARTAMENTO,
    },
  ];

  let formFields = [
    {
      type: 'text',
      name: 'id',
      label: 'ID (Código DANE)',
      required: true,
      disabled: false, // Will be set to true dynamically for edits
      validation: (value: string) => {
        if (!value?.trim()) return 'El ID es requerido.';
        if (value.length > 10) return 'El ID no debe exceder los 10 caracteres.'; // Example validation
        return '';
      }
    },
    {
      type: 'text',
      name: 'nombre',
      label: 'Nombre del Departamento',
      required: true,
      validation: (value: string) => !value?.trim() ? 'El nombre es requerido.' : '',
    },
    {
      type: 'checkbox',
      name: 'estado',
      label: 'Activo (Habilitado en el sistema)',
      default: true,
    },
    {
      type: 'checkbox',
      name: 'disponibleOffline',
      label: 'Disponible para Sincronización Offline',
      default: true,
    },
  ];

  function updateFormFieldsForEdit(isEditing: boolean) {
    //formFields = formFields.map(field => {
    //  if (field.name === 'id') {
    //    return { ...field, disabled: isEditing };
    //  }
    //  return field;
    //});
    formKey++; // Re-render form with updated field properties
  }

  function handleAdd() {
    if (!hasPermission(PERMISSIONS.CREATE_DEPARTAMENTO)) {
      toastStore.addToast('No tienes permiso para crear departamentos.', 'warning');
      return;
    }
    editingDepartamento = null;
    initialFormData = { id: '', nombre: '', estado: true, disponibleOffline: true };
    updateFormFieldsForEdit(false);
    showForm = true;
  }

  function handleEdit(event: CustomEvent<DepartamentoDbo>) {
    if (!hasPermission(PERMISSIONS.EDIT_DEPARTAMENTO)) {
      toastStore.addToast('No tienes permiso para editar departamentos.', 'warning');
      return;
    }
    editingDepartamento = event.detail;
    initialFormData = { ...editingDepartamento };
    updateFormFieldsForEdit(true);
    showForm = true;
    tick();
  }

  async function handleDelete(event: CustomEvent<DepartamentoDbo>) {
    if (!hasPermission(PERMISSIONS.DELETE_DEPARTAMENTO)) {
      toastStore.addToast('No tienes permiso para eliminar departamentos.', 'warning');
      return;
    }
    const deptoToDelete = event.detail;
    if (confirm(`¿Seguro deseas eliminar "${deptoToDelete.nombre}" (ID: ${deptoToDelete.id})?`)) {
      if (deptoToDelete.localId !== undefined) {
        await departamentoStore.remove(deptoToDelete.localId, deptoToDelete.id);
        toastStore.addToast('Departamento eliminado localmente.', 'success');
      } else {
        toastStore.addToast('Error: El departamento no tiene un ID local.', 'error');
      }
    }
  }

  async function handleSaveForm(event: CustomEvent<Record<string, any>>) {
    const formData = event.detail;
    try {
      if (!formData.id?.trim() || !formData.nombre?.trim()) {
        toastStore.addToast('ID y Nombre son campos requeridos.', 'error');
        return;
      }

      const dataPayload = {
        id: formData.id.trim(),
        nombre: formData.nombre.trim(),
        estado: !!formData.estado,
        disponibleOffline: !!formData.disponibleOffline,
      };

      if (editingDepartamento && editingDepartamento.localId !== undefined) {
        // Update: localId and original ID (currentId) are from editingDepartamento
        
        toastStore.addToast('Departamento actualizado localmente.', 'success');
      } else {
        // Create
        // Check if ID already exists locally before attempting to add, as 'id' should be unique
        const existing = departamentos.find(d => d.id === dataPayload.id);
        if (existing) {
            toastStore.addToast(`El ID de departamento '${dataPayload.id}' ya existe.`, 'error');
            return;
        }
        await departamentoStore.add(dataPayload); // dataPayload fits Omit<DepartamentoDbo, 'localId'|'sincronizado'|...>
        toastStore.addToast('Departamento agregado localmente.', 'success');
      }
      showForm = false;
      editingDepartamento = null;
    } catch (error) {
      console.error('Error guardando departamento:', error);
      toastStore.addToast('Error guardando departamento: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  }

  function handleCancelForm() {
    showForm = false;
    editingDepartamento = null;
  }
</script>

<div class="view-container departamento-view">
  {#if !$isOnline}
    <div class="offline-status-indicator" role="alert">
      ⚠️ Estás en modo offline. Los cambios se sincronizarán cuando haya conexión.
    </div>
  {/if}

  <header class="view-header">
    <h1>Departamentos</h1>
    {#if hasPermission(PERMISSIONS.CREATE_DEPARTAMENTO)}
      <button type="button" class="btn btn-primary" on:click={handleAdd}>
        Crear Nuevo Departamento
      </button>
    {/if}
  </header>

  {#if isLoading && departamentos.length === 0}
    <div class="loading-indicator">Cargando departamentos...</div>
  {:else if error}
    <div class="error-message">
        Ocurrió un error cargando los departamentos: {error.message || JSON.stringify(error)}.
        Intenta <button on:click={() => departamentoStore.fetchFromApi()}>reintentar</button>.
    </div>
  {/if}

  <AdvancedTable
    data={departamentos}
    columns={tableColumns}
    actions={tableActions}
    userPermissions={$currentUserPermissions}
    on:edit={handleEdit}
    on:delete={handleDelete}
    itemsPerPage={10}
  />

  {#if showForm}
    <div class="modal-overlay">
      <div class="modal-content">
        <header class="modal-header">
          <h2>{editingDepartamento ? 'Editar' : 'Crear'} Departamento</h2>
          <button class="btn-close" on:click={handleCancelForm} aria-label="Cerrar formulario">&times;</button>
        </header>
        <FormBase
          fields={formFields}
          initialData={initialFormData}
          on:save={handleSaveForm}
          on:cancel={handleCancelForm}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  /* Styles similar to other view pages */
  .view-container { padding: 1rem; }
  .view-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .view-header h1 { margin: 0; font-size: 1.8rem; }
  .btn-primary { padding: 0.75rem 1.5rem; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
  .btn-primary:hover { background-color: #0056b3; }
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .modal-content { background-color: white; padding: 2rem; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 90%; max-width: 500px; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
  .modal-header h2 { margin: 0; font-size: 1.5rem; }
  .btn-close { background: none; border: none; font-size: 1.8rem; cursor: pointer; padding: 0; line-height: 1; }
  .offline-status-indicator { background-color: #fff3cd; color: #856404; padding: 0.75rem 1.25rem; margin-bottom: 1rem; border: 1px solid #ffeeba; border-radius: 0.25rem; text-align: center; font-weight: bold; }
  .loading-indicator { margin: 2rem; text-align: center; color: #666; }
  .error-message { margin: 2rem; text-align: center; color: #d33; background: #ffeaea; border: 1px solid #ffa7a7; padding: 1rem; border-radius: 6px; }
</style>
