<script lang="ts">
  import { onMount, tick } from "svelte";
  import { unitOfMeasureStore } from "$lib/stores/unitOfMeasureStore";
  import AdvancedTable from "$lib/components/table/AdvancedTable.svelte";
  import FormBase from "$lib/components/forms/FormBase.svelte";
  import {
    currentUserPermissions,
    hasPermission,
    PERMISSIONS,
  } from "$lib/stores/authStore";
  import { isOnline } from "$lib/stores/connectivityStore";
  import type { UnitOfMeasureDbo } from "$lib/services/dbService";

  // --- State from Store ---
  let unidades: UnitOfMeasureDbo[] = [];
  let isLoading = true;
  let error: any = null;

  // Form state
  let showForm = false;
  let editingUnidad: UnitOfMeasureDbo | null = null;
  let formKey = 0;
  let initialFormData: Record<string, any> = {};

  // Subscribe to store for reactivity (this is enough!)
  unitOfMeasureStore.subscribe((state) => {
    unidades = state.units;
    isLoading = state.isLoading;
    error = state.error;
  });

  // --- Table Configuration ---
  const tableColumns = [
    { key: "nombre", label: "Nombre", sortable: true },
    { key: "abreviatura", label: "Abreviatura", sortable: true },
    {
      key: "sincronizado",
      label: "Sync",
      sortable: true,
      format: (value: boolean) => (value ? "✅" : "⏳"),
    },
    { key: "orden", label: "Orden", sortable: true },
    {
      key: "estado",
      label: "Estado",
      sortable: true,
      format: (v: boolean) => (v ? "Activo" : "Inactivo"),
    },
    { key: "actions", label: "Acciones", isAction: true },
  ];

  const tableActions = [
    {
      label: "Editar",
      eventName: "edit",
      class: "btn-edit",
      permission: PERMISSIONS.EDIT_UNIDAD,
    },
    {
      label: "Eliminar",
      eventName: "delete",
      class: "btn-delete",
      permission: PERMISSIONS.DELETE_UNIDAD,
    },
  ];

  // --- Form Configuration ---
  let formFields = [
    {
      type: "text",
      name: "codigo",
      label: "Código de Unidad",
      required: true,
      validation: (value: string) =>
        !value?.trim() ? "El código es requerido." : "",
    },
    {
      type: "text",
      name: "nombre",
      label: "Nombre de Unidad",
      required: true,
      validation: (value: string) =>
        !value?.trim() ? "El nombre es requerido." : "",
    },
    {
      type: "text",
      name: "abreviatura",
      label: "Abreviatura",
      required: true,
      validation: (value: string) =>
        !value?.trim() ? "La abreviatura es requerida." : "",
    },
    {
      type: "number",
      name: "orden",
      label: "Orden",
      required: true,
      min: 0,
      step: 1,
      allowDecimals: false,
      stepButtons: true, // ← activa botones + y -
      default: 1,
      validation: (value: any) =>
        value === undefined || value === null || value === ""
          ? "El orden es requerido."
          : "",
    },
    {
      type: "checkbox",
      name: "estado",
      label: "Activo",
      required: false,
      default: true,
    },
  ];

  // --- Actions ---
  function handleAdd() {
    if (!hasPermission(PERMISSIONS.CREATE_UNIDAD)) {
      alert("No tienes permiso para crear unidades.");
      return;
    }
    editingUnidad = null;
    initialFormData = { nombre: "", abreviatura: "", orden: 1, estado: true };
    formKey++;
    showForm = true;
  }

  function handleEdit(event: CustomEvent<UnitOfMeasureDbo>) {
    if (!hasPermission(PERMISSIONS.EDIT_UNIDAD)) {
      alert("No tienes permiso para editar.");
      return;
    }
    editingUnidad = event.detail;
    initialFormData = { ...editingUnidad };
    formKey++;
    showForm = true;
    tick();
  }

  async function handleDelete(event: CustomEvent<UnitOfMeasureDbo>) {
    if (!hasPermission(PERMISSIONS.DELETE_UNIDAD)) {
      alert("No tienes permiso para eliminar.");
      return;
    }
    const unidadToDelete = event.detail;
    if (confirm(`¿Seguro deseas eliminar "${unidadToDelete.nombre}"?`)) {
      if (unidadToDelete.localId !== undefined) {
        await unitOfMeasureStore.remove(
          unidadToDelete.localId,
          unidadToDelete.codigo
        );
      } else {
        alert("No se puede eliminar la unidad, falta el identificador.");
      }
    }
  }

  async function handleSaveForm(event: CustomEvent<Record<string, any>>) {
    const formData = event.detail;
    try {
      if (editingUnidad && editingUnidad.localId !== undefined) {
        await unitOfMeasureStore.update(
          editingUnidad.localId,
          {
            nombre: formData.nombre,
            abreviatura: formData.abreviatura,
            orden: Number(formData.orden),
            estado: !!formData.estado,
          },
          editingUnidad.codigo
        );
      } else {
        await unitOfMeasureStore.add({
          nombre: formData.nombre,
          abreviatura: formData.abreviatura,
          codigo:
            formData.codigo ||
            formData.nombre + "_" + Math.random().toString(36).substr(2, 6), // Si el código no viene, genera uno temporal único
          orden: Number(formData.orden),
          estado: !!formData.estado,
        });
      }
      showForm = false;
      editingUnidad = null;
    } catch (error) {
      alert("Error guardando la unidad: " + (error || error));
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
      ⚠️ Estás en modo offline. Los cambios se sincronizarán cuando haya
      conexión.
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

  {#if isLoading}
    <div class="loading-indicator">Cargando unidades...</div>
  {:else if error}
    <div class="error-message">Ocurrió un error: {error.message}</div>
  {/if}
 {@html (() => {
    console.log("💡 Unidades que llegan a AdvancedTable:", unidades);
    return "";
  })()}
  <AdvancedTable
    data={unidades}
    columns={tableColumns}
    actions={tableActions}
    userPermissions={$currentUserPermissions}
    on:edit={handleEdit}
    on:delete={handleDelete}
    itemsPerPage={5}
  />

  {#if showForm}
    <div class="modal-overlay">
      <div class="modal-content">
        <header class="modal-header">
          <h2>{editingUnidad ? "Editar" : "Crear"} Unidad de Medida</h2>
          <button
            class="btn-close"
            on:click={handleCancelForm}
            aria-label="Cerrar formulario">&times;</button
          >
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
  .btn-primary {
    padding: 0.75rem 1.5rem;
    min-height: 44px;
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
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 500px;
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
  .offline-status-indicator {
    background-color: #fff3cd;
    color: #856404;
    padding: 0.75rem 1.25rem;
    margin-bottom: 1rem;
    border: 1px solid #ffeeba;
    border-radius: 0.25rem;
    text-align: center;
    font-weight: bold;
  }
  .loading-indicator {
    margin: 2rem;
    text-align: center;
    color: #666;
  }
  .error-message {
    margin: 2rem;
    text-align: center;
    color: #d33;
    background: #ffeaea;
    border: 1px solid #ffa7a7;
    padding: 1rem;
    border-radius: 6px;
  }
</style>
