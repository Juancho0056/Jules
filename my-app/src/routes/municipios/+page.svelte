<!-- my-app/src/routes/municipios/+page.svelte -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { municipioStore } from '$lib/stores/municipioStore';
  import type {MunicipioDbo} from '$lib/types/municipio'
  import type { DepartamentoDbo } from '$lib/types/departamento';
  import { departamentoStore } from '$lib/stores/departamentoStore';
  import AdvancedTable from '$lib/components/table/AdvancedTable.svelte';
  import FormBase from '$lib/components/forms/FormBase.svelte';
  import {
    currentUserPermissions,
    hasPermission,
    PERMISSIONS,
  } from '$lib/stores/authStore';
  import { isOnline } from '$lib/stores/connectivityStore';
  import { toastStore } from '$lib/stores/toastStore';

  let municipios: MunicipioDbo[] = [];
  let isLoading = true;
  let error: any = null;

  let departamentosList: DepartamentoDbo[] = [];

  let showForm = false;
  let editingMunicipio: MunicipioDbo | null = null;
  let formKey = 0;
  let initialFormData: Record<string, any> = {};

  // Subscribe to stores
  municipioStore.subscribe((state) => {
    municipios = state.municipios;
    isLoading = state.isLoading;
    error = state.error;
  });
  departamentoStore.subscribe((state) => {
    departamentosList = state.departamentos;
    // Dynamically update formFields when departamentoOptions change
    updateDepartamentoOptionsInFormFields();
  });

  onMount(() => {
    // Fetch departamentos if not already loaded, for the dropdown
    if (departamentosList.length === 0 && get(departamentoStore).isLoading !== true) { // Check isLoading to prevent multiple fetches
      departamentoStore.fetchFromApi();
    }
  });

  // Reactive declaration for departamento options
  $: departamentoOptions = departamentosList.filter(d => d.estado).map(d => ({ value: d.id, label: `${d.nombre} (${d.id})` }));

  const tableColumns = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'nombre', label: 'Nombre', sortable: true },
    {
      key: 'departamentoId',
      label: 'Departamento',
      sortable: true,
      format: (value: string) => {
        const depto = departamentosList.find(d => d.id === value);
        return depto ? `${depto.nombre} (${depto.id})` : value;
      },
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
    { label: 'Editar', eventName: 'edit', class: 'btn-edit', permission: PERMISSIONS.EDIT_MUNICIPIO },
    { label: 'Eliminar', eventName: 'delete', class: 'btn-delete', permission: PERMISSIONS.DELETE_MUNICIPIO },
  ];

  let formFields = [ // Explicitly type if FormField is exported
    {
      type: 'text', name: 'id', label: 'ID (Código DANE)', required: true, disabled: false,
      validation: (v: string) => !v?.trim() ? 'El ID es requerido.' : '',
    },
    {
      type: 'text', name: 'nombre', label: 'Nombre del Municipio', required: true,
      validation: (v: string) => !v?.trim() ? 'El nombre es requerido.' : '',
    },
    {
      type: 'select', name: 'departamentoId', label: 'Departamento', required: true, options: [], // Options populated by updateDepartamentoOptionsInFormFields
      validation: (v: string) => !v ? 'El departamento es requerido.' : '',
    },
    { type: 'checkbox', name: 'disponibleOffline', label: 'Disponible para Sincronización Offline', default: true },
  ];

  function updateDepartamentoOptionsInFormFields() {
    formFields = formFields.map(field => {
      if (field.name === 'departamentoId') {
        return { ...field, options: departamentoOptions };
      }
      return field;
    });
    // Only increment formKey if the form is actually visible and might need re-rendering
    // This prevents unnecessary re-renders if options update in background
    if (showForm) {
        formKey++;
    }
  }

  function updateFormFieldsForEditState(isEditing: boolean) {
    formFields = formFields.map(field => {
      if (field.name === 'id') return { ...field, disabled: isEditing };
      // Ensure departamentoId field always has the latest options
      if (field.name === 'departamentoId') return { ...field, options: departamentoOptions };
      return field;
    });
    formKey++;
  }

  function handleAdd() {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.CREATE_MUNICIPIO)) {
      toastStore.addToast('No tienes permiso para crear municipios.', 'warning'); return;
    }
    editingMunicipio = null;
    initialFormData = { id: '', nombre: '', departamentoId: departamentoOptions[0]?.value || '', disponibleOffline: true };
    updateFormFieldsForEditState(false); // This will set ID enabled and refresh options
    showForm = true;
  }

  function handleEdit(event: CustomEvent<MunicipioDbo>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.EDIT_MUNICIPIO)) {
      toastStore.addToast('No tienes permiso para editar municipios.', 'warning'); return;
    }
    editingMunicipio = event.detail;
    initialFormData = { ...editingMunicipio };
    updateFormFieldsForEditState(true); // This will set ID disabled and refresh options
    showForm = true;
    tick();
  }

  async function handleDelete(event: CustomEvent<MunicipioDbo>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.DELETE_MUNICIPIO)) {
      toastStore.addToast('No tienes permiso para eliminar municipios.', 'warning'); return;
    }
    const munToDelete = event.detail;
    if (confirm(`¿Seguro deseas eliminar "${munToDelete.nombre}" (ID: ${munToDelete.id})?`)) {
      if (munToDelete.localId !== undefined) {
        await municipioStore.remove(munToDelete.localId, munToDelete.id);
        toastStore.addToast('Municipio eliminado localmente.', 'success');
      } else {
        toastStore.addToast('Error: El municipio no tiene un ID local.', 'error');
      }
    }
  }

  async function handleSaveForm(event: CustomEvent<Record<string, any>>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    const formData = event.detail;
    try {
      if (!formData.id?.trim() || !formData.nombre?.trim() || !formData.departamentoId) {
        toastStore.addToast('ID, Nombre y Departamento son campos requeridos.', 'error'); return;
      }
      const dataPayload = {
        id: formData.id.trim(),
        nombre: formData.nombre.trim(),
        departamentoId: formData.departamentoId,
        disponibleOffline: !!formData.disponibleOffline,
      };

      if (editingMunicipio && editingMunicipio.localId !== undefined) {
        await municipioStore.update(
          editingMunicipio.localId,
          { // Payload: only include fields that can be changed
            nombre: dataPayload.nombre,
            departamentoId: dataPayload.departamentoId,
            disponibleOffline: dataPayload.disponibleOffline
          },
          editingMunicipio.id // Pass the original ID as currentId for the syncService
        );
        toastStore.addToast('Municipio actualizado localmente.', 'success');
      } else {
        const existing = municipios.find(m => m.id === dataPayload.id);
        if (existing) {
          toastStore.addToast(`El ID de municipio '${dataPayload.id}' ya existe.`, 'error'); return;
        }
        await municipioStore.add(dataPayload);
        toastStore.addToast('Municipio agregado localmente.', 'success');
      }
      showForm = false;
      editingMunicipio = null;
    } catch (error) {
      console.error('Error guardando municipio:', error);
      toastStore.addToast('Error guardando municipio: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  }

  function handleCancelForm() {
    showForm = false;
    editingMunicipio = null;
  }
</script>

<div class="view-container municipio-view">
  {#if !$isOnline}
    <div class="offline-status-indicator" role="alert">
      ⚠️ Estás en modo offline. Los cambios se sincronizarán cuando haya conexión.
    </div>
  {/if}

  <header class="view-header">
    <h1>Municipios</h1>
    {#if hasPermission(PERMISSIONS.CREATE_MUNICIPIO) && $isOnline}
      <button type="button" class="btn btn-primary" on:click={handleAdd}>
        Crear Nuevo Municipio
      </button>
    {/if}
  </header>

  {#if isLoading && municipios.length === 0}
    <div class="loading-indicator">Cargando municipios...</div>
  {:else if error}
    <div class="error-message">
        Ocurrió un error cargando los municipios: {error.message || JSON.stringify(error)}.
        Intenta <button on:click={() => municipioStore.fetchFromApi()}>reintentar</button>.
    </div>
  {/if}

  <AdvancedTable
    data={municipios}
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
          <h2>{editingMunicipio ? 'Editar' : 'Crear'} Municipio</h2>
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
