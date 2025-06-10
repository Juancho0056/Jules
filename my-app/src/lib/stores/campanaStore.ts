// my-app/src/lib/stores/campanaStore.ts
import { writable, get } from 'svelte/store';
import { db, type CampanaDbo, type CampanaProductoDescuentoDbo, type TipoDescuento } from '../services/dbService';
import { apiService } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore';
import { dexieStore } from './dexieStore';
import { toastStore } from './toastStore';
import { v4 as uuidv4 } from 'uuid';

export interface CampanaState {
  campanas: CampanaDbo[]; // List of campaign headers
  isLoading: boolean;
  error: Error | null;
}

export interface SelectedCampanaDetail extends CampanaDbo {
  productosDescuentos: CampanaProductoDescuentoDbo[];
}

const initialState: CampanaState = {
  campanas: [],
  isLoading: true,
  error: null,
};

// --- API Response Structure Placeholders ---
interface CampanaHeaderFromListApiResponse {
  id: number;
  nombre: string;
  descripcion?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  // any other fields from /activas endpoint
  fechaHoraModificacion?: string; // Needed for any kind of smart sync
}

interface ProductoDescuentoFromDetailApiResponse {
  productoId: number;
  tipo: TipoDescuento;
  valor: number;
  fechaInicio: string; // This is fechaInicioDescuento for our DBO
  // any other fields for a product discount line item
}

interface CampanaDetailApiResponse extends CampanaHeaderFromListApiResponse {
  productos: ProductoDescuentoFromDetailApiResponse[];
}


function createCampanaStore() {
  const { subscribe, update, set } = writable<CampanaState>(initialState);
  const selectedCampanaForDetails = writable<SelectedCampanaDetail | null>(null);

  const dexieCampanas = dexieStore(() => db.campanas.orderBy('nombre').toArray());
  const unsubscribeFromLiveQuery = dexieCampanas.subscribe(
    (data) => update((state) => ({ ...state, campanas: data, isLoading: false, error: null })),
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
      const activeCampaignsResponse = await apiService.get<CampanaHeaderFromListApiResponse[]>('/api/campanas-descuento/activas');
      if (!activeCampaignsResponse.isSuccess || !activeCampaignsResponse.value) {
        throw new Error(activeCampaignsResponse.errors?.join(', ') || 'Failed to fetch active campaigns');
      }

      for (const campHeader of activeCampaignsResponse.value) {
        const detailResponse = await apiService.get<CampanaDetailApiResponse>(`/api/campanas-descuento/${campHeader.id}/detalles`);

        if (detailResponse.isSuccess && detailResponse.value) {
          const campDetail = detailResponse.value;
          const campanaDbo: CampanaDbo = {
            id: campDetail.id,
            nombre: campDetail.nombre,
            descripcion: campDetail.descripcion,
            fechaInicio: campDetail.fechaInicio,
            fechaFin: campDetail.fechaFin,
            disponibleOffline: true, // Assume all fetched are for offline
            sincronizado: true,
            fechaModificacion: campDetail.fechaHoraModificacion ? new Date(campDetail.fechaHoraModificacion) : now,
            ultimaConsulta: now,
          };
          // Use put to add or update the campaign header. Returns localId.
          const campanaLocalId = await db.campanas.put(campanaDbo);

          // Clear existing products for this campaign and add new ones
          // Ensure campDetail.id is valid before deleting
          if (typeof campDetail.id === 'number') {
            await db.campanaProductoDescuentos.where('campanaId').equals(campDetail.id).delete();
          }

          const productosDbo: CampanaProductoDescuentoDbo[] = campDetail.productos.map(p => ({
            campanaId: campDetail.id, // Server ID of parent
            campanaLocalId: campanaLocalId, // Link to local parent's Dexie ID
            productoId: p.productoId,
            tipoDescuento: p.tipo,
            valorDescuento: p.valor,
            fechaInicioDescuento: p.fechaInicio,
            sincronizado: true,
            fechaModificacion: now, // Or if product lines have own mod date from API
          }));
          if (productosDbo.length > 0) {
            await db.campanaProductoDescuentos.bulkAdd(productosDbo);
          }
        } else {
          console.warn(`Failed to fetch details for campaign ${campHeader.id}: ${detailResponse.errors?.join(', ')}`);
        }
      }
      await db.syncIndex.put({ tabla: 'campanas_full_details', lastSyncedAt: now });
      toastStore.addToast('Campañas y detalles sincronizados.', 'success');
    } catch (error) {
      console.error('Error fetching campaigns from API:', error);
      update((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)) }));
      toastStore.addToast('Error sincronizando campañas.', 'error');
    } finally {
      update((s) => ({ ...s, isLoading: false }));
    }
  };

  const cleanupOldCampanas = async () => {
    const monthsOld = 3; // Example: remove campaigns not consulted in 3 months
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);

    const oldCampanas = await db.campanas
      .where('ultimaConsulta').below(cutoffDate)
      .and(c => c.disponibleOffline === true).toArray(); // Only cleanup offline-available ones

    let count = 0;
    for(const camp of oldCampanas) {
        if (camp.id) { // If it has a server ID, clear its products by server ID
            await db.campanaProductoDescuentos.where('campanaId').equals(camp.id).delete();
        } else if (camp.localId) { // If only local, clear by local ID linkage
            await db.campanaProductoDescuentos.where('campanaLocalId').equals(camp.localId).delete();
        }
        if (camp.localId) { // Delete campaign header by its local ID
            await db.campanas.delete(camp.localId);
            count++;
        }
    }
    if (count > 0) {
        toastStore.addToast(`${count} campañas antiguas y sus detalles eliminados.`, 'info');
    }
  };

  const getCampanaWithDetails = async (campanaLocalId: number) => { // Changed to use localId for direct Dexie access
    const campanaHeader = await db.campanas.get(campanaLocalId);
    if (!campanaHeader) {
      selectedCampanaForDetails.set(null);
      toastStore.addToast(`Campaña con ID local ${campanaLocalId} no encontrada.`, 'warning');
      return;
    }
    // Fetch discounts by campanaLocalId if server ID (campanaHeader.id) might not be available yet
    const productosDescuentos = campanaHeader.id
        ? await db.campanaProductoDescuentos.where('campanaId').equals(campanaHeader.id).toArray()
        : await db.campanaProductoDescuentos.where('campanaLocalId').equals(campanaLocalId).toArray();

    selectedCampanaForDetails.set({ ...campanaHeader, productosDescuentos });
  };

  const addCampanaAndProductos = async (data: {
        campana: Omit<CampanaDbo, 'localId'|'id'|'sincronizado'|'fechaModificacion'|'ultimaConsulta'|'disponibleOffline'>,
        productos: Omit<CampanaProductoDescuentoDbo, 'localId'|'campanaId'|'campanaLocalId'|'sincronizado'|'fechaModificacion'>[]
    }) => {
    const tempCorrelationId = uuidv4();
    try {
      const now = new Date();
      const campanaToSave: CampanaDbo = {
        ...data.campana,
        id: undefined, // Ensure server ID is null/undefined for new items
        disponibleOffline: true, // Default for new campaigns created by user
        sincronizado: false,
        fechaModificacion: now,
        ultimaConsulta: now,
      };
      const localCampanaId = await db.campanas.add(campanaToSave);

      const productosToSave: CampanaProductoDescuentoDbo[] = data.productos.map(p => ({
        ...p,
        campanaLocalId: localCampanaId, // Link to local parent
        campanaId: 0, // Placeholder: This will be updated by syncService after parent syncs and gets a server ID
        sincronizado: false,
        fechaModificacion: now,
      }));
      await db.campanaProductoDescuentos.bulkAdd(productosToSave);

      const apiPayload = {
        // Structure should match 'CrearCampanaConProductosCommand' from backend
        nombre: data.campana.nombre,
        descripcion: data.campana.descripcion,
        fechaInicio: data.campana.fechaInicio,
        fechaFin: data.campana.fechaFin,
        // Backend expects list of product DTOs, map from our DBO-like structure
        productos: data.productos.map(p => ({
            productoId: p.productoId,
            tipoDescuento: p.tipoDescuento, // Ensure names match API DTO
            valorDescuento: p.valorDescuento, // Ensure names match API DTO
            fechaInicioDescuento: p.fechaInicioDescuento, // Ensure names match API DTO
        })),
      };
      await syncService.addToQueue('Campanas', 'createFull', apiPayload, tempCorrelationId );
      toastStore.addToast(`Campaña ${data.campana.nombre} agregada localmente. Pendiente de sincronización.`, 'info');
      selectedCampanaForDetails.set(null); // Clear selection after add
    } catch (err) {
      console.error('Error adding campana y productos:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al agregar campaña.', 'error');
    }
  };

  const updateCampanaHeader = async (localCampanaId: number, serverCampanaId: number | null | undefined, changes: Partial<Omit<CampanaDbo, 'localId'|'id'|'sincronizado'|'fechaModificacion'|'ultimaConsulta'|'disponibleOffline'>>) => {
    try {
        await db.campanas.update(localCampanaId, { ...changes, sincronizado: false, fechaModificacion: new Date(), ultimaConsulta: new Date() });
        if (serverCampanaId) { // Only queue if server ID exists (i.e., it's not a purely offline new item)
            const apiPayload = { id: serverCampanaId, ...changes };
            await syncService.addToQueue('Campanas', 'updateHeader', apiPayload, String(serverCampanaId));
            toastStore.addToast(`Encabezado de campaña ${serverCampanaId} actualizado. Pendiente de sincronización.`, 'info');
        } else {
            toastStore.addToast(`Encabezado de campaña (local) actualizado.`, 'info');
        }
    } catch (err) {
        console.error('Error updating campana header:', err);
        toastStore.addToast('Error al actualizar encabezado de campaña.', 'error');
    }
  };

  const addProductoToCampana = async (campanaServerId: number, campanaLocalId: number | undefined, productoData: Omit<CampanaProductoDescuentoDbo, 'localId'|'campanaId'|'campanaLocalId'|'sincronizado'|'fechaModificacion'>) => {
    try {
        const itemToSave: CampanaProductoDescuentoDbo = {
            ...productoData,
            campanaId: campanaServerId, // Server ID of parent
            campanaLocalId: campanaLocalId, // Dexie ID of parent
            sincronizado: false,
            fechaModificacion: new Date(),
        };
        await db.campanaProductoDescuentos.add(itemToSave);

        const apiPayload = { // Matches AgregarProductoCampanaCommand
            campanaId: campanaServerId,
            productoId: productoData.productoId,
            tipoDescuento: productoData.tipoDescuento,
            valorDescuento: productoData.valorDescuento,
            fechaInicioDescuento: productoData.fechaInicioDescuento,
        };
        await syncService.addToQueue('CampanaProductos', 'add', apiPayload, `${campanaServerId}_${productoData.productoId}`);
        toastStore.addToast('Producto agregado a campaña localmente. Pendiente de sincronización.', 'info');
    } catch (err) {
        console.error('Error adding producto to campana:', err);
        toastStore.addToast('Error al agregar producto a campaña.', 'error');
    }
  };

  const updateProductoInCampana = async (campanaServerId: number, productoId: number, changes: Partial<Omit<CampanaProductoDescuentoDbo, 'localId'|'campanaId'|'campanaLocalId'|'productoId'|'sincronizado'|'fechaModificacion'>>) => {
    try {
        const item = await db.campanaProductoDescuentos.where('[campanaId+productoId]').equals([campanaServerId, productoId]).first();
        if (!item || item.localId === undefined) throw new Error('Producto no encontrado en campaña local para actualizar.');

        await db.campanaProductoDescuentos.update(item.localId, { ...changes, sincronizado: false, fechaModificacion: new Date() });

        const apiPayload = { // Matches ActualizarDescuentoCampanaCommand
            campanaId: campanaServerId,
            productoId: productoId,
            // Send only fields that can be changed via this command
            tipoDescuento: changes.tipoDescuento,
            valorDescuento: changes.valorDescuento,
            fechaInicioDescuento: changes.fechaInicioDescuento,
        };
        await syncService.addToQueue('CampanaProductos', 'update', apiPayload, `${campanaServerId}_${productoId}`);
        toastStore.addToast('Descuento de producto actualizado localmente. Pendiente de sincronización.', 'info');
    } catch (err) {
        console.error('Error updating producto in campana:', err);
        toastStore.addToast('Error al actualizar descuento de producto.', 'error');
    }
  };

  // TODO: Implement delete methods for Campana and CampanaProductos if needed, considering API endpoints and logic.

  let isFirstConnection = true;
  let isProcessingConnectivityChange = false;
  const handleConnectivityChange = async () => {
    if (isProcessingConnectivityChange) return;
    isProcessingConnectivityChange = true;
    if (!get(offlineStore).isOffline) {
      toastStore.addToast('Conectado. Sincronizando Campañas...', 'info', 1500);
      await fetchFromApi();
      await syncService.processQueue(); // This will try to sync pending Campana operations
      if (isFirstConnection) {
        await cleanupOldCampanas();
        isFirstConnection = false;
      }
    } else {
      toastStore.addToast('Desconectado. Trabajando en modo offline con Campañas.', 'warning');
    }
    isProcessingConnectivityChange = false;
  };
  const unsubscribeFromOfflineStore = offlineStore.subscribe(handleConnectivityChange);
  setTimeout(handleConnectivityChange, 200); // Stagger initial check

  return {
    subscribe,
    fetchFromApi,
    getCampanaWithDetails,
    selectedCampanaForDetails,
    addCampanaAndProductos,
    updateCampanaHeader,
    addProductoToCampana,
    updateProductoInCampana,
    destroy: () => {
      unsubscribeFromLiveQuery();
      unsubscribeFromOfflineStore();
    },
  };
}

export const campanaStore = createCampanaStore();
