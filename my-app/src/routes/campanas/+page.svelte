<!-- my-app/src/routes/campanas/+page.svelte -->
<script lang="ts">
  import { onMount, tick, get as svelteGet } from 'svelte';
  import { campanaStore, type CampanaDbo, type CampanaProductoDescuentoDbo, type SelectedCampanaDetail, type TipoDescuento } from '$lib/stores/campanaStore';
  // Placeholder for product store - assume product IDs are entered manually for now
  // import { productStore, type ProductDbo } from '$lib/stores/productStore';
  import AdvancedTable from '$lib/components/table/AdvancedTable.svelte';
  import FormBase from '$lib/components/forms/FormBase.svelte';
  import type { FormField } from '$lib/components/forms/FormBase.svelte'; // Assuming FormBase exports this type
  import { currentUserPermissions, hasPermission } from '$lib/stores/authStore';
  import { isOnline } from '$lib/stores/connectivityStore';
  import { toastStore } from '$lib/stores/toastStore';

  const PERMISSIONS = {
    CREATE_CAMPANA: 'Permissions.Campanas.Create',
    EDIT_CAMPANA: 'Permissions.Campanas.Edit',
    DELETE_CAMPANA: 'Permissions.Campanas.Delete',
    MANAGE_PRODUCTOS_CAMPANA: 'Permissions.Campanas.ManageProductos',
  };

  let currentCampaigns: CampanaDbo[] = [];
  let isLoadingCampaigns = true;
  let campaignsError: Error | null = null;

  let selectedCampana: SelectedCampanaDetail | null = null;
  let showMainModal = false;
  let mainFormKey = 0;
  let initialHeaderFormData: Record<string, any> = {};
  let isEditingHeader = false;

  let showProductDiscountForm = false;
  let productFormKey = 0;
  let initialProductFormData: Record<string, any> = {};
  let editingProductDiscount: CampanaProductoDescuentoDbo | null = null;

  campanaStore.subscribe(state => {
    currentCampaigns = state.campanas;
    isLoadingCampaigns = state.isLoading;
    campaignsError = state.error;
  });

  campanaStore.selectedCampanaForDetails.subscribe(details => {
    selectedCampana = details;
    if (details) {
      initialHeaderFormData = {
        nombre: details.nombre,
        descripcion: details.descripcion,
        fechaInicio: details.fechaInicio.split('T')[0], // Format for date input
        fechaFin: details.fechaFin ? details.fechaFin.split('T')[0] : '',
      };
      isEditingHeader = true;
    } else {
      isEditingHeader = false;
    }
    mainFormKey++;
  });

  // --- Main Campaign Table ---
  const campaignTableColumns = [
    { key: 'nombre', label: 'Nombre', sortable: true },
    { key: 'fechaInicio', label: 'Fecha Inicio', sortable: true, format: (v:string) => new Date(v).toLocaleDateString() },
    { key: 'fechaFin', label: 'Fecha Fin', sortable: true, format: (v:string) => v ? new Date(v).toLocaleDateString() : '-' },
    { key: 'sincronizado', label: 'Sync', sortable: true, format: (v: boolean) => (v ? '✅' : '⏳') },
    { key: 'actions', label: 'Acciones', isAction: true },
  ];
  const campaignTableActions = [
    { label: 'Ver/Editar Detalles', eventName: 'viewEdit', class: 'btn-view', permission: PERMISSIONS.EDIT_CAMPANA },
    // { label: 'Eliminar', eventName: 'deleteCampana', class: 'btn-delete', permission: PERMISSIONS.DELETE_CAMPANA },
  ];

  // --- Product Discounts Sub-Table (in modal) ---
  const productTableColumns = [
    { key: 'productoId', label: 'Producto ID', sortable: true },
    { key: 'tipoDescuento', label: 'Tipo', sortable: true },
    { key: 'valorDescuento', label: 'Valor', sortable: true },
    { key: 'fechaInicioDescuento', label: 'Inicio Descuento', sortable: true, format: (v:string) => new Date(v).toLocaleDateString() },
    { key: 'sincronizado', label: 'Sync', sortable: true, format: (v: boolean) => (v ? '✅' : '⏳') },
    { key: 'actions', label: 'Acciones', isAction: true },
  ];
  const productTableActions = [
    { label: 'Editar', eventName: 'editProduct', class: 'btn-edit', permission: PERMISSIONS.MANAGE_PRODUCTOS_CAMPANA },
    // { label: 'Remover', eventName: 'removeProduct', class: 'btn-delete', permission: PERMISSIONS.MANAGE_PRODUCTOS_CAMPANA },
  ];

  // --- Form Field Definitions ---
  const headerFormFields: FormField[] = [
    { type: 'text', name: 'nombre', label: 'Nombre Campaña', required: true },
    { type: 'textarea', name: 'descripcion', label: 'Descripción' },
    { type: 'date', name: 'fechaInicio', label: 'Fecha Inicio', required: true },
    { type: 'date', name: 'fechaFin', label: 'Fecha Fin' },
  ];

  const productFormFields: FormField[] = [
    { type: 'number', name: 'productoId', label: 'ID Producto', required: true, min: 1 },
    {
      type: 'select', name: 'tipoDescuento', label: 'Tipo de Descuento', required: true,
      options: [{value: 'Porcentaje', label: 'Porcentaje'}, {value: 'ValorFijo', label: 'Valor Fijo'}]
    },
    { type: 'number', name: 'valorDescuento', label: 'Valor del Descuento', required: true, min: 0, step: 0.01 },
    { type: 'date', name: 'fechaInicioDescuento', label: 'Fecha Inicio Descuento', required: true },
  ];

  // --- Event Handlers ---
  function handleCreateNewCampaign() {
    if (!hasPermission(PERMISSIONS.CREATE_CAMPANA)) { toastStore.addToast('Sin permiso.'); return; }
    campanaStore.selectedCampanaForDetails.set(null); // Clear selection
    initialHeaderFormData = { nombre: '', descripcion: '', fechaInicio: new Date().toISOString().split('T')[0], fechaFin: '' };
    isEditingHeader = false;
    mainFormKey++;
    showMainModal = true;
  }

  function handleViewEditCampaign(event: CustomEvent<CampanaDbo>) {
    const campanaHeader = event.detail;
    // Use localId to fetch details if server ID (id) is not yet available (campaign created offline)
    const idToFetch = campanaHeader.id ?? campanaHeader.localId;

    if (idToFetch !== undefined) {
        if (campanaHeader.id) { // If server ID exists, use it as it's the primary link for synced data
             campanaStore.getCampanaWithDetails(campanaHeader.id);
        } else if (campanaHeader.localId) { // Fallback to localId if server ID is missing
            // campanaStore.getCampanaWithDetails expects serverID, this needs adjustment in store or here
            // For now, let's assume getCampanaWithDetails can handle localId or is adapted
            // Or, we only allow viewing details if campanaHeader.id is present
            toastStore.addToast('Campaña aún no sincronizada. Detalles pueden ser limitados.', 'info');
            // To show local data, the store's getCampanaWithDetails would need to accept localId
            // and fetch products by campanaLocalId.
            // For simplicity, we'll rely on the store's current implementation that likely uses server ID.
            // If selectedCampanaForDetails is updated correctly by the store based on localId, this will work.
            // campanaStore.getCampanaWithDetailsByLocalId(campanaHeader.localId); // Hypothetical
            campanaStore.selectedCampanaForDetails.set({
                ...campanaHeader,
                productosDescuentos: svelteGet(campanaStore.selectedCampanaForDetails)?.productosDescuentos?.filter(p => p.campanaLocalId === campanaHeader.localId) || []
            });

        }
        showMainModal = true;
    } else {
      toastStore.addToast('Campaña sin ID local ni de servidor, no se pueden cargar detalles.', 'error');
    }
  }


  async function handleSaveCampaignHeader(event: CustomEvent<Record<string, any>>) {
    const formData = event.detail;
    const isoFechaInicio = formData.fechaInicio ? new Date(formData.fechaInicio).toISOString() : '';
    const isoFechaFin = formData.fechaFin ? new Date(formData.fechaFin).toISOString() : null;

    if (isEditingHeader && selectedCampana?.localId ) { // Check localId for Dexie update
      await campanaStore.updateCampanaHeader(selectedCampana.localId, selectedCampana.id, { // Pass serverId for sync queue
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        fechaInicio: isoFechaInicio,
        fechaFin: isoFechaFin,
      });
      toastStore.addToast('Encabezado de campaña actualizado.', 'success');
    } else if (!isEditingHeader) {
      const campData = {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        fechaInicio: isoFechaInicio,
        fechaFin: isoFechaFin,
        // Ensure other non-nullable fields for CampanaDbo (excluding those auto-set by store) are present if any
      };
      await campanaStore.addCampanaAndProductos({ campana: campData, productos: [] });
      toastStore.addToast('Campaña creada. Ahora puedes agregar productos si la campaña se sincroniza y obtiene un ID.', 'success');
      showMainModal = false;
    }
  }

  function handleOpenAddProductForm() {
    if (!selectedCampana) { toastStore.addToast('No hay campaña seleccionada.'); return;}
    // If selectedCampana.id is null/undefined (campaign created offline and not yet synced),
    // adding products that need campanaId (server ID) for API calls will be problematic.
    // The store's addProductoToCampana should handle this, possibly by queuing only after parent syncs
    // or by using campanaLocalId for local storage and deferring API sync.
    if (!selectedCampana.id && selectedCampana.sincronizado === false) {
        toastStore.addToast('La campaña debe sincronizarse primero para obtener un ID de servidor antes de agregar productos.', 'warning');
        // Optionally, allow adding to local list (campanaLocalId) and sync later. Store logic needs to support this.
        // For now, we proceed, assuming store handles it or user adds to synced campaign.
    }
    if (!hasPermission(PERMISSIONS.MANAGE_PRODUCTOS_CAMPANA)) { toastStore.addToast('Sin permiso.'); return; }

    editingProductDiscount = null;
    initialProductFormData = { productoId: '', tipoDescuento: 'Porcentaje', valorDescuento: 0, fechaInicioDescuento: new Date().toISOString().split('T')[0] };
    productFormKey++;
    showProductDiscountForm = true;
  }

  function handleEditProductDiscount(event: CustomEvent<CampanaProductoDescuentoDbo>) {
    editingProductDiscount = event.detail;
    initialProductFormData = {
      ...editingProductDiscount,
      fechaInicioDescuento: editingProductDiscount.fechaInicioDescuento.split('T')[0],
    };
    productFormKey++;
    showProductDiscountForm = true;
  }

  async function handleSaveProductDiscount(event: CustomEvent<Record<string, any>>) {
    const formData = event.detail;
    if (!selectedCampana || (selectedCampana.id === undefined && selectedCampana.localId === undefined) ) {
        toastStore.addToast('Error: No hay campaña seleccionada o la campaña no tiene ID.', 'error');
        return;
    }

    // Server ID is crucial for API calls. If not present, this operation might only be local.
    if (!selectedCampana.id) {
        toastStore.addToast('La campaña principal aún no tiene ID de servidor. El producto se guardará localmente.', 'info');
        // The store methods (add/updateProductoInCampana) need to be robust to this.
        // They should use campanaLocalId for local linking and queue operations appropriately.
    }

    const productData = {
      productoId: Number(formData.productoId),
      tipoDescuento: formData.tipoDescuento as TipoDescuento,
      valorDescuento: Number(formData.valorDescuento),
      fechaInicioDescuento: new Date(formData.fechaInicioDescuento).toISOString(),
    };

    if (editingProductDiscount && editingProductDiscount.productoId && selectedCampana.id) {
      await campanaStore.updateProductoInCampana(selectedCampana.id, editingProductDiscount.productoId, productData);
      toastStore.addToast('Descuento de producto actualizado.', 'success');
    } else if (selectedCampana.id || selectedCampana.localId) { // Adding new product discount
      // Pass both serverId (if available) and localId to the store method
      await campanaStore.addProductoToCampana(selectedCampana.id!, selectedCampana.localId, productData);
      toastStore.addToast('Producto agregado a la campaña.', 'success');
    }

    if (selectedCampana.id) campanaStore.getCampanaWithDetails(selectedCampana.id);
    else if (selectedCampana.localId) { /* Logic to refresh from localId if needed */ }

    showProductDiscountForm = false;
  }

</script>

<div class="view-container campana-view">
  <!-- Offline Indicator -->
  {#if !$isOnline}
    <div class="offline-status-indicator" role="alert">⚠️ Modo offline.</div>
  {/if}

  <!-- Header -->
  <header class="view-header">
    <h1>Campañas de Descuento</h1>
    {#if hasPermission(PERMISSIONS.CREATE_CAMPANA)}
      <button type="button" class="btn btn-primary" on:click={handleCreateNewCampaign}>Crear Nueva Campaña</button>
    {/if}
  </header>

  <!-- Loading / Error for Main List -->
  {#if isLoadingCampaigns && currentCampaigns.length === 0}
    <div class="loading-indicator">Cargando campañas...</div>
  {:else if campaignsError}
    <div class="error-message">Error: {campaignsError.message} <button on:click={() => campanaStore.fetchFromApi()}>Reintentar</button></div>
  {/if}

  <!-- Main Campaign Table -->
  <AdvancedTable
    data={currentCampaigns}
    columns={campaignTableColumns}
    actions={campaignTableActions}
    userPermissions={$currentUserPermissions}
    on:viewEdit={handleViewEditCampaign}
    itemsPerPage={10}
    emptyMessage="No hay campañas para mostrar."
  />

  <!-- Main Modal for Campaign Header & Product/Discount List -->
  {#if showMainModal}
    <div class="modal-overlay" on:mousedown|self={() => showMainModal = false}>
      <div class="modal-content" on:mousedown|stopPropagation>
        <header class="modal-header">
          <h2>{isEditingHeader && selectedCampana ? `Editar Campaña: ${selectedCampana.nombre}` : 'Crear Nueva Campaña'}</h2>
          <button class="btn-close" on:click={() => showMainModal = false}>&times;</button>
        </header>

        <FormBase
          key={mainFormKey}
          fields={headerFormFields}
          initialData={initialHeaderFormData}
          on:save={handleSaveCampaignHeader}
          on:cancel={() => showMainModal = false}
          submitButtonText={isEditingHeader ? 'Guardar Cambios Encabezado' : 'Guardar Encabezado'}
        />

        {#if isEditingHeader && selectedCampana }
          <section class="product-discounts-section">
            <h3>Productos y Descuentos en esta Campaña</h3>
            {#if hasPermission(PERMISSIONS.MANAGE_PRODUCTOS_CAMPANA)}
              <button class="btn btn-secondary" on:click={handleOpenAddProductForm}>Agregar Producto/Descuento</button>
            {/if}
            <AdvancedTable
              data={selectedCampana.productosDescuentos || []}
              columns={productTableColumns}
              actions={productTableActions}
              userPermissions={$currentUserPermissions}
              on:editProduct={handleEditProductDiscount}
              emptyMessage="No hay productos/descuentos en esta campaña aún."
              compact={true}
            />
          </section>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Sub-Modal for Adding/Editing Product Discount -->
  {#if showProductDiscountForm && selectedCampana}
    <div class="modal-overlay modal-overlay-nested" on:mousedown|self={() => showProductDiscountForm = false}>
      <div class="modal-content modal-content-nested" on:mousedown|stopPropagation>
        <header class="modal-header">
          <h2>{editingProductDiscount ? 'Editar Descuento de Producto' : 'Agregar Producto a Campaña'}</h2>
          <button class="btn-close" on:click={() => showProductDiscountForm = false}>&times;</button>
        </header>
        <FormBase
          key={productFormKey}
          fields={productFormFields}
          initialData={initialProductFormData}
          on:save={handleSaveProductDiscount}
          on:cancel={() => showProductDiscountForm = false}
          submitButtonText="Guardar Descuento"
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
  .product-discounts-section { margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
  .modal-overlay-nested { z-index: 1010; background-color: rgba(0,0,0,0.3); }
  .modal-content-nested { max-width: 500px; }
  .offline-status-indicator { background-color: #fff3cd; color: #856404; padding: 0.75rem 1.25rem; margin-bottom: 1rem; border: 1px solid #ffeeba; border-radius: 0.25rem; text-align: center; }
  .loading-indicator, .error-message { text-align: center; padding: 1rem; }
</style>
