<!-- my-app/src/routes/listasprecio/+page.svelte -->
<script lang="ts">
  import {db} from '$lib/services/dbService';
  import { listaPrecioStore, type SelectedListaPrecioDetail } from '$lib/stores/listaPrecioStore';
  import type {ListaPrecioDbo, ListaPrecioProductoDbo} from '$lib/types/listaPrecio'
  // Placeholder for product store
  // import { productStore, type ProductDbo } from '$lib/stores/productStore';
  import AdvancedTable from '$lib/components/table/AdvancedTable.svelte';
  import FormBase from '$lib/components/forms/FormBase.svelte';
  import { currentUserPermissions, hasPermission, PERMISSIONS } from '$lib/stores/authStore';
  import { isOnline } from '$lib/stores/connectivityStore';
  import { toastStore } from '$lib/stores/toastStore';
  import { get } from 'svelte/store'; // Added get
  import { max, type from } from 'rxjs';

  let currentListasPrecio: ListaPrecioDbo[] = [];
  let isLoadingListas = true;
  let listasError: Error | null = null;

  let selectedLista: SelectedListaPrecioDetail | null = null;
  let showMainModal = false;
  let mainFormKey = 0;
  let initialHeaderFormData: Record<string, any> = {};
  let isEditingHeader = false; // True if we are viewing/editing an existing list's details

  let showProductPriceForm = false;
  let productFormKey = 0;
  let initialProductFormData: Record<string, any> = {};
  let editingProductoPrecio: ListaPrecioProductoDbo | null = null;

  listaPrecioStore.subscribe(state => {
    currentListasPrecio = state.listasPrecio;
    isLoadingListas = state.isLoading;
    listasError = state.error;
  });

  listaPrecioStore.selectedListaPrecioForDetails.subscribe(details => {
    selectedLista = details;
    if (details) {
      initialHeaderFormData = {
        nombre: details.nombre,
        descripcion: details.descripcion || '',
        fechaInicio: details.fechaInicio.split('T')[0],
        fechaFin: details.fechaFin ? details.fechaFin.split('T')[0] : '',
        disponibleOffline: details.disponibleOffline !== undefined ? details.disponibleOffline : true,
      };
      isEditingHeader = true; // Indicates we are viewing/editing an existing list
    } else {
      isEditingHeader = false;
    }
    // This was being called too often, moved specific updates to where they are needed or via reactive $:
    // mainFormKey++;
  });

  const listaPrecioTableColumns = [
    { key: 'nombre', label: 'Nombre', sortable: true },
    { key: 'fechaInicio', label: 'Fecha Inicio', sortable: true, format: (v:string) => new Date(v).toLocaleDateString() },
    { key: 'fechaFin', label: 'Fecha Fin', sortable: true, format: (v:string) => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'disponibleOffline', label: 'Offline', sortable: true, format: (v:boolean) => v ? 'Sí':'No'},
    { key: 'sincronizado', label: 'Sync', sortable: true, format: (v: boolean) => (v ? '✅' : '⏳') },
    { key: 'actions', label: 'Acciones', isAction: true },
  ];
  const listaPrecioTableActions = [
    { label: 'Ver/Gestionar Productos', eventName: 'viewEdit', class: 'btn-view', permission: PERMISSIONS.EDIT_LISTA_PRECIO },
    // Delete action for main list can be added if API supports it
  ];

  const productPriceTableColumns = [
    { key: 'productoId', label: 'Producto ID', sortable: true },
    { key: 'precio', label: 'Precio', sortable: true, format: (v:number) => v.toFixed(2) },
    { key: 'fechaInicioPrecio', label: 'Inicio Precio', sortable: true, format: (v:string) => new Date(v).toLocaleDateString() },
    { key: 'sincronizado', label: 'Sync', sortable: true, format: (v: boolean) => (v ? '✅' : '⏳') },
    { key: 'actions', label: 'Acciones', isAction: true },
  ];
  const productPriceTableActions = [
    { label: 'Editar Precio', eventName: 'editProductPrice', class: 'btn-edit', permission: PERMISSIONS.EDIT_LISTAPRECIO }, // Replaced MANAGE_PRODUCTOS_LISTA_PRECIO
    { label: 'Remover Producto', eventName: 'removeProductPrice', class: 'btn-delete', permission: PERMISSIONS.EDIT_LISTAPRECIO }, // Replaced MANAGE_PRODUCTOS_LISTA_PRECIO
  ];

  let headerFormFields= [
    { type: 'text', name: 'nombre', label: 'Nombre Lista de Precio', required: true, disabled: false },
    { type: 'textarea', name: 'descripcion', label: 'Descripción', disabled: false },
    { type: 'date', name: 'fechaInicio', label: 'Fecha Inicio Vigencia', required: true, disabled: false },
    { type: 'date', name: 'fechaFin', label: 'Fecha Fin Vigencia', disabled: false },
    { type: 'checkbox', name: 'disponibleOffline', label: 'Disponible Offline', default: true, disabled: false },
  ];

  let productPriceFormFields = [
    { type: 'number', name: 'productoId', label: 'ID Producto', required: true, min: 1, disabled: false, step: 1, max: 9999999999, default: 0 },
    { type: 'number', name: 'precio', label: 'Precio', required: true, min: 0, step: 0.01, max: 9999999999, default: 0 },
    { type: 'date', name: 'fechaInicioPrecio', label: 'Fecha Inicio Precio', required: true },
  ];

  function updateHeaderFormFieldsForEditState(isEditingAndSynced: boolean) {
    headerFormFields = headerFormFields.map(f => ({
        ...f,
        disabled: isEditingAndSynced && f.name !== 'disponibleOffline'
    }));
    mainFormKey++; // Trigger re-render of FormBase for header
  }

  function handleCreateNewListaPrecio() {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    if (!hasPermission(PERMISSIONS.CREATE_LISTA_PRECIO)) { toastStore.addToast('Sin permiso.'); return; }
    listaPrecioStore.selectedListaPrecioForDetails.set(null);
    initialHeaderFormData = { nombre: '', descripcion: '', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '', disponibleOffline: true };
    isEditingHeader = false;
    updateHeaderFormFieldsForEditState(false);
    showMainModal = true;
  }

  function handleViewEditListaPrecio(event: CustomEvent<ListaPrecioDbo>) {
    const listaHeader = event.detail;
    const idToLoad = listaHeader.id ?? listaHeader.offlineUuid;
    if (idToLoad !== undefined && idToLoad !== null) { // Ensure idToLoad is not null or undefined
      listaPrecioStore.getListaPrecioWithDetails(idToLoad);
      // isEditingHeader and form fields are updated reactively by selectedListaPrecioForDetails subscription
      showMainModal = true;
    } else {
      toastStore.addToast('Lista de precio no tiene ID para cargar detalles.', 'warning');
    }
  }

  $: if (showMainModal) { // React to selectedLista changes only when modal is open
    if (selectedLista && selectedLista.id) {
      updateHeaderFormFieldsForEditState(true);
    } else if (selectedLista && !selectedLista.id && selectedLista.localId) {
      updateHeaderFormFieldsForEditState(false);
    } else if (!selectedLista && !isEditingHeader) { // Case for new creation after modal is open
      updateHeaderFormFieldsForEditState(false);
    }
  }


  async function handleSaveListaPrecioHeader(event: CustomEvent<Record<string, any>>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    const formData = event.detail;
    const isoFechaInicio = formData.fechaInicio ? new Date(formData.fechaInicio).toISOString() : '';
    const isoFechaFin = formData.fechaFin ? new Date(formData.fechaFin).toISOString() : null;

    if (isEditingHeader && selectedLista?.localId) {
      if (selectedLista.disponibleOffline !== !!formData.disponibleOffline) {
          await db.listasPrecio.update(selectedLista.localId, { disponibleOffline: !!formData.disponibleOffline });
          toastStore.addToast('Disponibilidad offline (local) actualizada.', 'info');
          if(selectedLista.id) listaPrecioStore.getListaPrecioWithDetails(selectedLista.id);
          else if(selectedLista.offlineUuid) listaPrecioStore.getListaPrecioWithDetails(selectedLista.offlineUuid);
      }
      // TODO: Implement full header update sync with backend via listaPrecioStore.updateListaPrecioHeader
      // For now, only 'disponibleOffline' is updated locally for existing records.
      // Other header fields (nombre, descripcion, fechaInicio, fechaFin) are not synced on edit.
      // toastStore.addToast('Gestión de productos habilitada. Cambios al encabezado no se sincronizan.', 'info');
    } else if (!isEditingHeader) {
      const listaData = {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        fechaInicio: isoFechaInicio,
        fechaFin: isoFechaFin,
        // Explicitly pass disponibleOffline, as Omit in store might not include it if not changed from default
        disponibleOffline: !!formData.disponibleOffline,
      };
      const result = await listaPrecioStore.addListaPrecioAndProductos({ listaPrecio: listaData, productos: [] });
      if (result.success && result.offlineUuid) {
        toastStore.addToast('Lista de Precio creada. Ahora puedes agregar productos.', 'success');
        listaPrecioStore.getListaPrecioWithDetails(result.offlineUuid);
        isEditingHeader = true;
        // updateHeaderFormFieldsForEditState(false); // Already handled by reactive block or subscription
      } else {
        // showMainModal = false; // Keep modal open on failure for correction
        toastStore.addToast(`Error al crear lista: ${result.error || 'Error desconocido'}`,'error')
      }
    }
  }

  function handleOpenAddProductoForm() {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    if (!selectedLista) { toastStore.addToast('No hay lista de precio seleccionada.'); return; }
    if (!hasPermission(PERMISSIONS.EDIT_LISTAPRECIO)) { toastStore.addToast('Sin permiso.'); return; } // Replaced MANAGE_PRODUCTOS_LISTA_PRECIO

    if (!selectedLista.id && !selectedLista.localId) {
        toastStore.addToast('La lista de precio debe guardarse primero.', 'warning'); return;
    }
     if (!selectedLista.id) { // Not yet synced, server ID not available
        toastStore.addToast('La lista de precios principal aún no se ha sincronizado. Los productos se asociarán localmente y se sincronizarán después de la lista principal.', 'info');
        // Allow adding products if localId exists, store should handle deferred sync using listaPrecioLocalId
    }


    editingProductoPrecio = null;
    initialProductFormData = { productoId: '', precio: 0, fechaInicioPrecio: new Date().toISOString().split('T')[0] };

    // Disable productoId if editing
    //productPriceFormFields = productPriceFormFields.map(f => f.name === 'productoId' ? {...f, disabled: false} : f);
    productFormKey++;
    showProductPriceForm = true;
  }

  function handleEditProductoPrecio(event: CustomEvent<ListaPrecioProductoDbo>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    editingProductoPrecio = event.detail;
    initialProductFormData = {
      ...editingProductoPrecio,
      fechaInicioPrecio: editingProductoPrecio.fechaInicioPrecio.split('T')[0],
    };
    // Disable productoId if editing
    //productPriceFormFields = productPriceFormFields.map(f => f.name === 'productoId' ? {...f, disabled: true} : f);
    productFormKey++;
    showProductPriceForm = true;
  }

  async function handleSaveProductoPrecio(event: CustomEvent<Record<string, any>>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    const formData = event.detail;
    if (!selectedLista || (!selectedLista.id && !selectedLista.localId)) {
        toastStore.addToast('Error: No hay lista de precio seleccionada o la lista no tiene ID.', 'error');
        return;
    }

    const productoData = {
      productoId: Number(formData.productoId),
      precio: Number(formData.precio),
      fechaInicioPrecio: new Date(formData.fechaInicioPrecio).toISOString(),
    };

    // Server ID is crucial for API calls.
    // The store methods addProductoToListaPrecio/updatePrecioInLista expect a serverId.
    if (!selectedLista.id) {
        toastStore.addToast('La lista de precios principal debe sincronizarse primero para gestionar productos con el servidor.', 'warning');
        // If you want to allow local-only product management for an unsynced list,
        // the store methods would need significant changes to use listaPrecioLocalId for queueing.
        // For now, this implies that product management that queues to server requires parent to be synced.
        showProductPriceForm = false; // Close form as action cannot proceed to server sync as is
        return;
    }
    const listaPrecioServerId = selectedLista.id;

    if (editingProductoPrecio && editingProductoPrecio.productoId) {
      await listaPrecioStore.updatePrecioInLista(listaPrecioServerId, editingProductoPrecio.productoId, productoData);
      toastStore.addToast('Precio de producto actualizado.', 'success');
    } else {
      await listaPrecioStore.addProductoToListaPrecio(listaPrecioServerId, selectedLista.localId, productoData);
      toastStore.addToast('Producto agregado a la lista de precio.', 'success');
    }

    // Refresh details
    if (selectedLista.id) listaPrecioStore.getListaPrecioWithDetails(selectedLista.id);
    else if (selectedLista.offlineUuid) listaPrecioStore.getListaPrecioWithDetails(selectedLista.offlineUuid);

    showProductPriceForm = false;
  }

 async function handleRemoveProductoPrice(event: CustomEvent<ListaPrecioProductoDbo>) {
    if (!get(isOnline)) { toastStore.addToast('Esta acción no está permitida en modo offline.', 'warning'); return; }
    const item = event.detail;
    if (!selectedLista || !selectedLista.id) {
        toastStore.addToast('Lista de precio no identificada o no sincronizada.', 'error'); return;
    }
    if (confirm(`¿Remover producto ${item.productoId} de esta lista de precio?`)) {
        await listaPrecioStore.removeProductoFromLista(selectedLista.id, item.productoId);
        toastStore.addToast('Producto removido.', 'success');
        if (selectedLista.id) listaPrecioStore.getListaPrecioWithDetails(selectedLista.id);
    }
}

</script>

<div class="view-container lista-precio-view">
  {#if !$isOnline}
    <div class="offline-status-indicator" role="alert">⚠️ Modo offline.</div>
  {/if}

  <header class="view-header">
    <h1>Listas de Precio</h1>
    {#if hasPermission(PERMISSIONS.CREATE_LISTA_PRECIO) && $isOnline}
      <button type="button" class="btn btn-primary" on:click={handleCreateNewListaPrecio}>Crear Nueva Lista</button>
    {/if}
  </header>

  {#if isLoadingListas && currentListasPrecio.length === 0}
    <div class="loading-indicator">Cargando listas de precio...</div>
  {:else if listasError}
    <div class="error-message">Error: {listasError.message} <button on:click={() => listaPrecioStore.fetchFromApi()}>Reintentar</button></div>
  {/if}

  <AdvancedTable
    data={currentListasPrecio}
    columns={listaPrecioTableColumns}
    actions={listaPrecioTableActions}
    userPermissions={$currentUserPermissions}
    on:viewEdit={handleViewEditListaPrecio}
    itemsPerPage={10}
    
  />

  {#if showMainModal}
    <div class="modal-overlay" on:mousedown|self={() => showMainModal = false}>
      <div class="modal-content" on:mousedown|stopPropagation>
        <header class="modal-header">
          <h2>{isEditingHeader && selectedLista ? `Editar Lista: ${selectedLista.nombre}` : 'Crear Nueva Lista de Precio'}</h2>
          <button class="btn-close" on:click={() => showMainModal = false}>&times;</button>
        </header>

        <FormBase
          fields={headerFormFields}
          initialData={initialHeaderFormData}
          on:save={handleSaveListaPrecioHeader}
          on:cancel={() => showMainModal = false}
        />

        {#if isEditingHeader && selectedLista && (selectedLista.id || selectedLista.localId)}
          <section class="product-prices-section">
            <h3>Productos y Precios en esta Lista</h3>
            {#if hasPermission(PERMISSIONS.EDIT_LISTAPRECIO) && $isOnline}
              {#if selectedLista.id /* Only allow adding products if header is synced and has server ID */}
                <button class="btn btn-secondary" on:click={handleOpenAddProductoForm}>Agregar Producto/Precio</button>
              {:else}
                <p class="text-sm text-gray-500 italic py-2">La lista de precios debe sincronizarse primero para obtener un ID de servidor antes de agregar productos.</p>
              {/if}
            {/if}
            <AdvancedTable
              data={selectedLista.productosPrecios || []}
              columns={productPriceTableColumns}
              actions={productPriceTableActions}
              userPermissions={$currentUserPermissions}
              on:editProductPrice={handleEditProductoPrecio}
              on:removeProductPrice={handleRemoveProductoPrice}
            />
          </section>
        {/if}
      </div>
    </div>
  {/if}

  {#if showProductPriceForm && selectedLista}
    <div class="modal-overlay modal-overlay-nested" on:mousedown|self={() => showProductPriceForm = false}>
      <div class="modal-content modal-content-nested" on:mousedown|stopPropagation>
        <header class="modal-header">
          <h2>{editingProductoPrecio ? 'Editar Precio de Producto' : 'Agregar Producto a Lista'}</h2>
          <button class="btn-close" on:click={() => showProductPriceForm = false}>&times;</button>
        </header>
        <FormBase
          fields={productPriceFormFields}
          initialData={initialProductFormData}
          on:save={handleSaveProductoPrecio}
          on:cancel={() => showProductPriceForm = false}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .view-container { padding: 1rem; }
  .view-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  .btn-primary { padding: 0.75rem 1.5rem; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
  .btn-secondary { padding: 0.5rem 1rem; background-color: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 0.5rem; }
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 1000; }
  .modal-content { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.2); width: 90%; max-width: 700px; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px; }
  .btn-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
  .product-prices-section { margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
  .modal-overlay-nested { z-index: 1010; background-color: rgba(0,0,0,0.3); }
  .modal-content-nested { max-width: 500px; }
  .offline-status-indicator { background-color: #fff3cd; color: #856404; padding: 0.75rem 1.25rem; margin-bottom: 1rem; border: 1px solid #ffeeba; border-radius: 0.25rem; text-align: center; }
  .loading-indicator, .error-message { text-align: center; padding: 1rem; }
  .text-sm { font-size: 0.875rem; }
  .text-gray-500 { color: #6b7280; }
  .italic { font-style: italic; }
  .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
</style>
