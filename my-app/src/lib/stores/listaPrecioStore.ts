// my-app/src/lib/stores/listaPrecioStore.ts
import { writable, get } from 'svelte/store';
import { db, type ListaPrecioDbo, type ListaPrecioProductoDbo } from '../services/dbService';
import { apiService } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore';
import { dexieStore } from './dexieStore';
import { toastStore } from './toastStore';
import { v4 as uuidv4 } from 'uuid';

export interface ListaPrecioState {
  listasPrecio: ListaPrecioDbo[];
  isLoading: boolean;
  error: Error | null;
}

export interface SelectedListaPrecioDetail extends ListaPrecioDbo {
  productosPrecios: ListaPrecioProductoDbo[];
}

const API_PAGE_SIZE = 50;

const initialState: ListaPrecioState = {
  listasPrecio: [],
  isLoading: true,
  error: null,
};

// Assumed API response structure for an item from /api/listas-precio/offline
// This assumes the /offline endpoint returns full details including products.
interface ListaPrecioApiResponseItem {
  id: number;
  nombre: string;
  descripcion?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  disponibleOffline: boolean;
  productos: { // Corresponds to CreateListaPrecioProductoDto
    productoId: number;
    precio: number;
    // If individual items have their own effective date from the full detail, add here
    // For now, assume CreateListaPrecioProductoDto structure for items from /offline endpoint.
    // However, AgregarProductoListaPrecioCommand has a 'fechaInicio' for the product price.
    // This suggests the detail for a product in a price list should also have its own 'fechaInicioPrecio'.
    // Let's assume the /offline endpoint provides this for each product.
    fechaInicioPrecio?: string;
  }[];
  fechaHoraModificacion?: string;
}

function createListaPrecioStore() {
  const { subscribe, update, set } = writable<ListaPrecioState>(initialState);
  const selectedListaPrecioForDetails = writable<SelectedListaPrecioDetail | null>(null);

  const dexieListasPrecio = dexieStore(() => db.listasPrecio.orderBy('nombre').toArray());
  const unsubscribeFromLiveQuery = dexieListasPrecio.subscribe(
    (data) => update((state) => ({ ...state, listasPrecio: data, isLoading: false, error: null })),
    (err) => update((state) => ({ ...state, error: err, isLoading: false }))
  );

  const fetchFromApi = async () => {
    if (get(offlineStore).isOffline) {
      update(s => ({ ...s, isLoading: false }));
      return;
    }
    update((s) => ({ ...s, isLoading: true, error: null }));
    const now = new Date();

    try {
      const lastSync = await db.syncIndex.get('listasPrecio');
      let currentPageNumber = 1;
      let morePages = true;

      while (morePages) {
        const queryParams = new URLSearchParams({
          pageNumber: String(currentPageNumber),
          pageSize: String(API_PAGE_SIZE),
        });
        // The /api/listas-precio/offline endpoint has 'actualizadoDesde'
        if (lastSync?.lastSyncedAt) {
          queryParams.set('actualizadoDesde', lastSync.lastSyncedAt.toISOString());
        }

        const response = await apiService.get<ListaPrecioApiResponseItem[]>(`/api/listas-precio/offline?${queryParams.toString()}`);

        if (response.isSuccess && response.value) {
          if (response.value.length === 0) {
            morePages = false;
            break;
          }

          for (const itemApi of response.value) {
            const listaPrecioDbo: ListaPrecioDbo = {
              id: itemApi.id,
              nombre: itemApi.nombre,
              descripcion: itemApi.descripcion,
              fechaInicio: itemApi.fechaInicio,
              fechaFin: itemApi.fechaFin,
              disponibleOffline: itemApi.disponibleOffline,
              sincronizado: true,
              offlineUuid: null, // Clear if it was an offline created item
              fechaModificacion: itemApi.fechaHoraModificacion ? new Date(itemApi.fechaHoraModificacion) : now,
              ultimaConsulta: now,
            };
            const localListaPrecioId = await db.listasPrecio.put(listaPrecioDbo);

            await db.listaPrecioProductos.where('listaPrecioId').equals(itemApi.id).delete();

            if (itemApi.productos && itemApi.productos.length > 0) {
              const productosDbo: ListaPrecioProductoDbo[] = itemApi.productos.map(p => ({
                listaPrecioId: itemApi.id,
                // Ensure localListaPrecioId is correctly the ID from Dexie after put, if needed for immediate local consistency
                // However, for items coming from API, listaPrecioId (server ID) is the primary link.
                listaPrecioLocalId: localListaPrecioId,
                productoId: p.productoId,
                precio: p.precio,
                // Use product-specific fechaInicioPrecio if available, otherwise default or use list's
                fechaInicioPrecio: p.fechaInicioPrecio || itemApi.fechaInicio,
                sincronizado: true,
                fechaModificacion: now, // Or use item-specific mod date if API provides
              }));
              await db.listaPrecioProductos.bulkAdd(productosDbo);
            }
          }

          if (response.value.length < API_PAGE_SIZE) {
            morePages = false;
          } else {
            currentPageNumber++;
          }
        } else {
          morePages = false;
          throw new Error(response.errors?.join(', ') || 'Failed to fetch listas de precio from API');
        }
      }
      await db.syncIndex.put({ tabla: 'listasPrecio', lastSyncedAt: new Date() });
      toastStore.addToast('Listas de Precio sincronizadas.', 'success');
    } catch (error) {
      console.error('Error fetching listas de precio from API:', error);
      update((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)) }));
      toastStore.addToast('Error sincronizando Listas de Precio.', 'error');
    } finally {
      update((s) => ({ ...s, isLoading: false }));
    }
  };

  const cleanupOldListasPrecio = async () => {
    const monthsOld = 3;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    const oldItems = await db.listasPrecio
      .where('ultimaConsulta').below(cutoffDate)
      .and(lp => lp.disponibleOffline === true).toArray();

    for(const item of oldItems) {
        if (item.id) await db.listaPrecioProductos.where('listaPrecioId').equals(item.id).delete();
        // also consider deleting by listaPrecioLocalId if id is null
        else if (item.localId) await db.listaPrecioProductos.where('listaPrecioLocalId').equals(item.localId).delete();
        if (item.localId) await db.listasPrecio.delete(item.localId);
    }
    if (oldItems.length > 0) {
        toastStore.addToast(`${oldItems.length} listas de precio antiguas y sus productos eliminados.`, 'info');
    }
  };

  const getListaPrecioWithDetails = async (idToLoad: number | string) => {
    let listaHeader: ListaPrecioDbo | undefined;
    if (typeof idToLoad === 'number') { // server ID
        listaHeader = await db.listasPrecio.where('id').equals(idToLoad).first();
    } else { // offlineUuid
        listaHeader = await db.listasPrecio.where('offlineUuid').equals(idToLoad).first();
    }

    if (!listaHeader || listaHeader.localId === undefined) {
      selectedListaPrecioForDetails.set(null);
      toastStore.addToast(`Lista de Precio ${idToLoad} no encontrada localmente.`, 'warning');
      return;
    }

    const productosPrecios = listaHeader.id
        ? await db.listaPrecioProductos.where('listaPrecioId').equals(listaHeader.id).toArray()
        : await db.listaPrecioProductos.where('listaPrecioLocalId').equals(listaHeader.localId).toArray();

    selectedListaPrecioForDetails.set({ ...listaHeader, productosPrecios });
  };

  const addListaPrecioAndProductos = async (data: {
        listaPrecio: Omit<ListaPrecioDbo, 'localId'|'id'|'sincronizado'|'fechaModificacion'|'ultimaConsulta'|'offlineUuid'|'disponibleOffline'> & { disponibleOffline?: boolean },
        productos: Omit<ListaPrecioProductoDbo, 'localId'|'listaPrecioId'|'listaPrecioLocalId'|'sincronizado'|'fechaModificacion'>[]
    }) => {
    const offlineUuid = uuidv4();
    const now = new Date();
    try {
      const listaPrecioToSave: ListaPrecioDbo = {
        ...data.listaPrecio,
        id: undefined, // Explicitly set server id to undefined for new items
        offlineUuid: offlineUuid,
        disponibleOffline: data.listaPrecio.disponibleOffline !== undefined ? data.listaPrecio.disponibleOffline : true,
        sincronizado: false,
        fechaModificacion: now,
        ultimaConsulta: now,
      };
      const localListaPrecioId = await db.listasPrecio.add(listaPrecioToSave);

      const productosToSave: ListaPrecioProductoDbo[] = data.productos.map(p => ({
        ...p,
        listaPrecioLocalId: localListaPrecioId,
        listaPrecioId: 0, // Placeholder, server will assign this relationship implicitly or explicitly
        sincronizado: false,
        fechaModificacion: now,
      }));
      if (productosToSave.length > 0) {
        await db.listaPrecioProductos.bulkAdd(productosToSave);
      }

      const apiPayload = {
        nombre: data.listaPrecio.nombre,
        descripcion: data.listaPrecio.descripcion,
        fechaInicio: data.listaPrecio.fechaInicio,
        fechaFin: data.listaPrecio.fechaFin,
        disponibleOffline: listaPrecioToSave.disponibleOffline,
        productos: data.productos.map(p => ({
            productoId: p.productoId,
            precio: p.precio
            // CreateListaPrecioProductoDto does not include fechaInicioPrecio
            // This implies product prices initially adopt list's fechaInicio or are effective immediately
        })),
      };
      await syncService.addToQueue('ListasPrecio', 'createFull', apiPayload, offlineUuid );
      toastStore.addToast(`Lista de Precio ${data.listaPrecio.nombre} agregada localmente.`, 'info');
      selectedListaPrecioForDetails.set(null); // Clear selection after add
      return { success: true, localId: localListaPrecioId, offlineUuid: offlineUuid };
    } catch (err) {
      console.error('Error adding lista de precio:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al agregar lista de precio.', 'error');
      return { success: false, error: err };
    }
  };

  // No direct API endpoint to update ListaPrecio header, so this would be local only or not implemented
  // const updateListaPrecioHeader = async (...) => { ... }

  const addProductoToListaPrecio = async (listaPrecioServerId: number, listaPrecioLocalId: number | undefined, productoData: Omit<ListaPrecioProductoDbo, 'localId'|'listaPrecioId'|'listaPrecioLocalId'|'sincronizado'|'fechaModificacion'>) => {
    try {
        const itemToSave: ListaPrecioProductoDbo = {
            ...productoData,
            listaPrecioId: listaPrecioServerId, // Server ID of parent
            listaPrecioLocalId: listaPrecioLocalId, // Dexie ID of parent
            sincronizado: false,
            fechaModificacion: new Date(),
        };
        await db.listaPrecioProductos.add(itemToSave);
        const apiPayload = { // Matches AgregarProductoListaPrecioCommand
            listaPrecioId: listaPrecioServerId,
            productoId: productoData.productoId,
            precio: productoData.precio,
            fechaInicio: productoData.fechaInicioPrecio, // API expects 'fechaInicio'
        };
        await syncService.addToQueue('ListaPrecioProductos', 'add', apiPayload, `${listaPrecioServerId}_${productoData.productoId}`);
        toastStore.addToast('Producto agregado a lista de precio localmente.', 'info');
    } catch (err) {
        console.error('Error adding producto to lista precio:', err);
        toastStore.addToast('Error al agregar producto a lista de precio.', 'error');
    }
  };

  const updatePrecioInLista = async (listaPrecioServerId: number, productoId: number, changes: Partial<Omit<ListaPrecioProductoDbo, 'localId'|'listaPrecioId'|'listaPrecioLocalId'|'productoId'|'sincronizado'|'fechaModificacion'>>) => {
    try {
        const item = await db.listaPrecioProductos.where('[listaPrecioId+productoId]').equals([listaPrecioServerId, productoId]).first();
        if (!item || item.localId === undefined) throw new Error('Producto no encontrado en lista de precio local.');

        const updatedItem = { ...item, ...changes }; // Apply changes to existing item to get full new state
        await db.listaPrecioProductos.update(item.localId, {
            precio: updatedItem.precio,
            fechaInicioPrecio: updatedItem.fechaInicioPrecio,
            sincronizado: false,
            fechaModificacion: new Date()
        });

        const apiPayload = { // Matches ActualizarPrecioListaPrecioCommand
            listaPrecioId: listaPrecioServerId,
            productoId: productoId,
            nuevoPrecio: updatedItem.precio,
            fechaInicioNuevoPrecio: updatedItem.fechaInicioPrecio,
        };
        await syncService.addToQueue('ListaPrecioProductos', 'update', apiPayload, `${listaPrecioServerId}_${productoId}`);
        toastStore.addToast('Precio de producto actualizado localmente.', 'info');
    } catch (err) {
        console.error('Error updating precio in lista:', err);
        toastStore.addToast('Error al actualizar precio de producto.', 'error');
    }
  };

  const removeProductoFromLista = async (listaPrecioServerId: number, productoId: number) => {
    try {
        const item = await db.listaPrecioProductos.where('[listaPrecioId+productoId]').equals([listaPrecioServerId, productoId]).first();
        if (item && item.localId !== undefined) {
            await db.listaPrecioProductos.delete(item.localId);
        }
        // API payload for RemoverProductoListaPrecioCommand
        const apiPayload = { listaPrecioId: listaPrecioServerId, productoId: productoId };
        await syncService.addToQueue('ListaPrecioProductos', 'remove', apiPayload, `${listaPrecioServerId}_${productoId}`);
        toastStore.addToast('Producto removido de lista de precio localmente.', 'info');
    } catch (err) {
        console.error('Error removing producto from lista:', err);
        toastStore.addToast('Error al remover producto de lista de precio.', 'error');
    }
  };

  let isFirstConnection = true;
  let isProcessingConnectivityChange = false;
  const handleConnectivityChange = async () => {
    if (isProcessingConnectivityChange) return; isProcessingConnectivityChange = true;
    if (!get(offlineStore).isOffline) {
      toastStore.addToast('Conectado. Sincronizando Listas de Precio...', 'info', 1500);
      await fetchFromApi();
      await syncService.processQueue();
      if (isFirstConnection) { await cleanupOldListasPrecio(); isFirstConnection = false; }
    } else {
      toastStore.addToast('Desconectado. Trabajando en modo offline con Listas de Precio.', 'warning');
    }
    isProcessingConnectivityChange = false;
  };
  const unsubscribeFromOfflineStore = offlineStore.subscribe(handleConnectivityChange);
  setTimeout(handleConnectivityChange, 250); // Stagger initial check

  return {
    subscribe,
    fetchFromApi,
    getListaPrecioWithDetails,
    selectedListaPrecioForDetails,
    addListaPrecioAndProductos,
    // updateListaPrecioHeader, // Not implemented as per comment
    addProductoToListaPrecio,
    updatePrecioInLista,
    removeProductoFromLista,
    destroy: () => { unsubscribeFromLiveQuery(); unsubscribeFromOfflineStore(); },
  };
}

export const listaPrecioStore = createListaPrecioStore();
