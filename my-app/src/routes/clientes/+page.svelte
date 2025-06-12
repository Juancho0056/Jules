<!-- my-app/src/routes/clientes/+page.svelte -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store'; // Added get
  import { clienteStore } from '$lib/stores/clienteStore';
  import type {ClienteDbo} from '$lib/types/cliente';
  import AdvancedTable from '$lib/components/table/AdvancedTable.svelte';
  import FormBase from '$lib/components/forms/FormBase.svelte';
  import {
    currentUserPermissions,
    hasPermission,
    PERMISSIONS, // Added PERMISSIONS import
  } from '$lib/stores/authStore';
  import { isOnline } from '$lib/stores/connectivityStore';
  import { toastStore } from '$lib/stores/toastStore';

  let clientes: ClienteDbo[] = [];
  let isLoading = true;
  let error: any = null;

  let showForm = false;
  let editingCliente: ClienteDbo | null = null;
  let formKey = 0;
  let initialFormData: Record<string, any> = {};

  clienteStore.subscribe((state) => {
    clientes = state.clientes;
    isLoading = state.isLoading;
    error = state.error;
  });

  onMount(() => {
    // Optional: Trigger initial fetch if not handled by store's own init or connectivity change
    // if (clientes.length === 0 && !isLoading) {
    //   clienteStore.fetchFromApi();
    // }
  });

  const tableColumns = [
    { key: 'numeroDocumento', label: 'Nro. Documento', sortable: true },
    {
      key: 'nombreCompleto',
      label: 'Nombre/Razón Social',
      sortable: true,
      format: (_value: any, item: ClienteDbo) =>
        item.razonSocial || `${item.primerNombre || ''} ${item.primerApellido || ''}`.trim()
    },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'telefonoMovil', label: 'Tel. Móvil', sortable: true },
    {
      key: 'sincronizado',
      label: 'Sync',
      sortable: true,
      format: (value: boolean) => (value ? '✅' : '⏳'),
    },
    // Assuming ClienteDbo has an 'estado' field. If not, this column should be removed or adapted.
    // For now, let's assume 'disponibleOffline' can represent a form of 'active for offline use'
    // or that an 'estado' field will be added to ClienteDbo if it's a general concept.
    // If 'estado' is not on ClienteDbo, this will cause errors.
    // {
    //   key: 'estado',
    //   label: 'Estado', // This field is NOT on ClienteDbo currently
    //   sortable: true,
    //   format: (v: boolean) => (v ? 'Activo' : 'Inactivo'),
    // },
    { key: 'actions', label: 'Acciones', isAction: true },
  ];

  const tableActions = [
    {
      label: 'Editar',
      eventName: 'edit',
      class: 'btn-edit',
      permission: PERMISSIONS.EDIT_CLIENTE,
    },
    {
      label: 'Eliminar',
      eventName: 'delete',
      class: 'btn-delete',
      permission: PERMISSIONS.DELETE_CLIENTE,
    },
  ];

  // Define formFields based on ClienteDbo and API commands
  // Ensure 'name' attributes match ClienteDbo properties
  let formFields = [
    {
      type: 'select',
      name: 'tipoDocumentoId',
      label: 'Tipo de Documento',
      required: true,
      options: [ // These should ideally come from a dynamic source or a config
        { value: 'CC', label: 'Cédula de Ciudadanía' },
        { value: 'NIT', label: 'NIT' },
        { value: 'CE', label: 'Cédula de Extranjería' },
        { value: 'PAS', label: 'Pasaporte' },
      ],
      validation: (value: string) => !value ? 'El tipo de documento es requerido.' : '',
    },
    {
      type: 'text',
      name: 'numeroDocumento',
      label: 'Número de Documento',
      required: true,
      validation: (value: string) => !value?.trim() ? 'El número de documento es requerido.' : '',
    },
    {
      type: 'select',
      name: 'tipoCliente',
      label: 'Tipo de Cliente',
      required: true,
      options: [
        { value: 'Persona Natural', label: 'Persona Natural' },
        { value: 'Empresa', label: 'Empresa' },
      ],
      validation: (value: string) => !value ? 'El tipo de cliente es requerido.' : '',
    },
    { type: 'text', name: 'razonSocial', label: 'Razón Social (Empresa)' },
    { type: 'text', name: 'primerNombre', label: 'Primer Nombre' },
    { type: 'text', name: 'segundoNombre', label: 'Segundo Nombre' },
    { type: 'text', name: 'primerApellido', label: 'Primer Apellido' },
    { type: 'text', name: 'segundoApellido', label: 'Segundo Apellido' },
    {
      type: 'email',
      name: 'email',
      label: 'Email',
      validation: (value: string) => {
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return 'Email inválido.';
        }
        return '';
      }
    },
    { type: 'text', name: 'telefonoMovil', label: 'Teléfono Móvil' },
    { type: 'text', name: 'calle', label: 'Dirección (Calle)' },
    { type: 'text', name: 'municipioId', label: 'ID Municipio' }, // Ideally a select input
    {
      type: 'checkbox',
      name: 'disponibleOffline',
      label: 'Disponible Offline',
      default: true
    },
    // Add 'estado' field if it becomes part of ClienteDbo and is managed
    // {
    //   type: 'checkbox',
    //   name: 'estado', // NOT on ClienteDbo currently
    //   label: 'Activo',
    //   default: true
    // },
  ];


  function handleAdd() {
    if (!get(isOnline)) { toastStore.addToast('Crear no está permitido en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.CREATE_CLIENTE)) {
      toastStore.addToast('No tienes permiso para crear clientes.', 'warning');
      return;
    }
    editingCliente = null;
    // Default values for a new client
    initialFormData = {
      tipoDocumentoId: 'CC',
      numeroDocumento: '',
      tipoCliente: 'Persona Natural',
      disponibleOffline: true,
      // estado: true, // if field exists
    };
    formKey++; // Re-render form
    showForm = true;
  }

  function handleEdit(event: CustomEvent<ClienteDbo>) {
    if (!get(isOnline)) { toastStore.addToast('Editar no está permitido en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.EDIT_CLIENTE)) {
      toastStore.addToast('No tienes permiso para editar clientes.', 'warning');
      return;
    }
    editingCliente = event.detail;
    initialFormData = { ...editingCliente };
    formKey++;
    showForm = true;
    tick();
  }

  async function handleDelete(event: CustomEvent<ClienteDbo>) {
    if (!get(isOnline)) { toastStore.addToast('Eliminar no está permitido en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.DELETE_CLIENTE)) {
      toastStore.addToast('No tienes permiso para eliminar clientes.', 'warning');
      return;
    }
    const clienteToDelete = event.detail;
    const nombreCliente = clienteToDelete.razonSocial || `${clienteToDelete.primerNombre || ''} ${clienteToDelete.primerApellido || ''}`.trim();
    if (confirm(`¿Seguro deseas eliminar al cliente "${nombreCliente}" (${clienteToDelete.numeroDocumento})?`)) {
      if (clienteToDelete.localId !== undefined) {
        await clienteStore.remove(clienteToDelete.localId, clienteToDelete.numeroDocumento);
        toastStore.addToast('Cliente eliminado localmente.', 'success');
      } else {
        toastStore.addToast('Error: El cliente no tiene un ID local para eliminar.', 'error');
      }
    }
  }

  async function handleSaveForm(event: CustomEvent<Record<string, any>>) {
    if (!get(isOnline)) { toastStore.addToast('Guardar no está permitido en modo offline.', 'warning'); return; }
    const formData = event.detail;
    try {
      // Ensure required fields are present from formData
      if (!formData.tipoDocumentoId || !formData.numeroDocumento || !formData.tipoCliente) {
          toastStore.addToast('Campos requeridos (Tipo Doc, Nro Doc, Tipo Cliente) faltantes.', 'error');
          return;
      }

      // Prepare data for store (map form data to ClienteDbo structure)
      const clienteDataPayload = {
        tipoDocumentoId: formData.tipoDocumentoId,
        numeroDocumento: formData.numeroDocumento,
        tipoCliente: formData.tipoCliente,
        razonSocial: formData.razonSocial,
        primerNombre: formData.primerNombre,
        segundoNombre: formData.segundoNombre,
        primerApellido: formData.primerApellido,
        segundoApellido: formData.segundoApellido,
        email: formData.email,
        telefonoMovil: formData.telefonoMovil,
        telefonoFijo: formData.telefonoFijo, // ensure this is in formFields if needed
        telefonoFax: formData.telefonoFax,   // ensure this is in formFields if needed
        sitioWeb: formData.sitioWeb,       // ensure this is in formFields if needed
        calle: formData.calle,
        municipioId: formData.municipioId,
        codigoPostal: formData.codigoPostal, // ensure this is in formFields if needed
        listaPrecioId: formData.listaPrecioId ? Number(formData.listaPrecioId) : null, // ensure this is in formFields if needed
        aplicaRetefuente: !!formData.aplicaRetefuente, // ensure this is in formFields if needed
        aplicaReteIVA: !!formData.aplicaReteIVA,       // ensure this is in formFields if needed
        aplicaReteICA: !!formData.aplicaReteICA,       // ensure this is in formFields if needed
        granContribuyente: !!formData.granContribuyente, // ensure this is in formFields if needed
        autorretenedor: !!formData.autorretenedor,     // ensure this is in formFields if needed
        disponibleOffline: !!formData.disponibleOffline,
        // estado: !!formData.estado, // if field 'estado' is used
      };


      if (editingCliente && editingCliente.localId !== undefined) {
        // Update operation
        // Pass only changed fields if your store/API supports partial updates,
        // or the full object if it expects a full replacement.
        // For simplicity, passing most fields.
        await clienteStore.update(
          editingCliente.localId,
          clienteDataPayload, // Pass the payload that matches Omit<ClienteDbo, ...>
          editingCliente.numeroDocumento // Pass the original numeroDocumento as currentNumeroDocumento
        );
        toastStore.addToast('Cliente actualizado localmente.', 'success');
      } else {
        // Create operation
        await clienteStore.add(clienteDataPayload); // This payload should fit Omit<ClienteDbo, 'localId'|'id'|'sincronizado'|'fechaModificacion'|'ultimaConsulta'>
        toastStore.addToast('Cliente agregado localmente.', 'success');
      }
      showForm = false;
      editingCliente = null;
    } catch (error) {
      console.error('Error guardando cliente:', error);
      toastStore.addToast('Error guardando cliente: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  }

  function handleCancelForm() {
    showForm = false;
    editingCliente = null;
  }
</script>

<div class="view-container cliente-view">
  {#if !$isOnline}
    <div class="offline-status-indicator" role="alert">
      ⚠️ Estás en modo offline. Los cambios se sincronizarán cuando haya conexión.
    </div>
  {/if}

  <header class="view-header">
    <h1>Clientes</h1>
    {#if hasPermission(PERMISSIONS.CREATE_CLIENTE) && $isOnline}
      <button type="button" class="btn btn-primary" on:click={handleAdd}>
        Crear Nuevo Cliente
      </button>
    {/if}
  </header>

  {#if isLoading && clientes.length === 0}
    <div class="loading-indicator">Cargando clientes...</div>
  {:else if error}
    <div class="error-message">
        Ocurrió un error cargando los clientes: {error.message || JSON.stringify(error)}.
        Intenta <button on:click={() => clienteStore.fetchFromApi()}>reintentar</button>.
    </div>
  {/if}

  <AdvancedTable
    data={clientes}
    columns={tableColumns}
    actions={tableActions}
    userPermissions={$currentUserPermissions}
    on:edit={handleEdit}
    on:delete={handleDelete}
    itemsPerPage={10}
    emptyMessage="No hay clientes para mostrar."
  />

  {#if showForm}
    <div class="modal-overlay">
      <div class="modal-content">
        <header class="modal-header">
          <h2>{editingCliente ? 'Editar' : 'Crear'} Cliente</h2>
          <button
            class="btn-close"
            on:click={handleCancelForm}
            aria-label="Cerrar formulario">&times;</button>
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
  .view-container { padding: 1rem; }
  .view-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .view-header h1 { margin: 0; font-size: 1.8rem; }
  .btn-primary { padding: 0.75rem 1.5rem; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
  .btn-primary:hover { background-color: #0056b3; }
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .modal-content { background-color: white; padding: 2rem; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; border-bottom: 1px solid #eee; padding-bottom: 1rem; }
  .modal-header h2 { margin: 0; font-size: 1.5rem; }
  .btn-close { background: none; border: none; font-size: 1.8rem; cursor: pointer; padding: 0; line-height: 1; }
  .offline-status-indicator { background-color: #fff3cd; color: #856404; padding: 0.75rem 1.25rem; margin-bottom: 1rem; border: 1px solid #ffeeba; border-radius: 0.25rem; text-align: center; font-weight: bold; }
  .loading-indicator { margin: 2rem; text-align: center; color: #666; }
  .error-message { margin: 2rem; text-align: center; color: #d33; background: #ffeaea; border: 1px solid #ffa7a7; padding: 1rem; border-radius: 6px; }
</style>
