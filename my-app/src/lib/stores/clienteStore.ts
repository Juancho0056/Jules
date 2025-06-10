// my-app/src/lib/stores/clienteStore.ts
import { writable, get } from 'svelte/store';
import { db, type ClienteDbo } from '../services/dbService';
import { apiService } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore';
import { dexieStore } from './dexieStore';
import { toastStore } from './toastStore';

export interface ClienteState {
  clientes: ClienteDbo[];
  isLoading: boolean;
  error: Error | null;
}

const API_PAGE_SIZE = 50;

const initialState: ClienteState = {
  clientes: [],
  isLoading: true,
  error: null,
};

function createClienteStore() {
  const { subscribe, update, set } = writable<ClienteState>(initialState);
  const selectedClienteToEdit = writable<ClienteDbo | null>(null);

  const dexieClientes = dexieStore(() => db.clientes.orderBy('numeroDocumento').toArray());
  const unsubscribeFromLiveQuery = dexieClientes.subscribe(
    (data) => {
      update((state) => ({ ...state, clientes: data, isLoading: false, error: null }));
    },
    (err) => {
      update((state) => ({ ...state, error: err, isLoading: false }));
    }
  );

  const fetchFromApi = async () => {
    if (get(offlineStore).isOffline) {
      update(s => ({ ...s, isLoading: false }));
      return;
    }
    update((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const lastSync = await db.syncIndex.get('clientes');

      let currentPageNumber = 1;
      let morePages = true;

      while (morePages) {
        const queryParams = new URLSearchParams({
          offline: 'true',
          pageNumber: String(currentPageNumber),
          pageSize: String(API_PAGE_SIZE),
        });
        if (lastSync?.lastSyncedAt) {
          queryParams.set('actualizadoDesde', lastSync.lastSyncedAt.toISOString());
        }

        type ClienteApiResponseItem = Omit<ClienteDbo, 'localId' | 'sincronizado' | 'ultimaConsulta' | 'fechaModificacion' | 'localId'> & {
            id: number;
            fechaHoraModificacion?: string;
        };

        const response = await apiService.get<ClienteApiResponseItem[]>(`/api/clientes/offline?${queryParams.toString()}`);

        if (response.isSuccess && response.value) {
          if (response.value.length === 0 && currentPageNumber === 1 && !lastSync?.lastSyncedAt) {
             // No data on initial full sync, clear local table if needed, or just proceed
             // await db.clientes.clear(); // Example: clear if backend is source of truth and sends empty on first sync
          }
          if (response.value.length === 0) {
            morePages = false;
            break;
          }

          const now = new Date();
          for (const clienteApi of response.value) {
            // Ensure all required fields are present, providing defaults if necessary
            const mappedClienteApi = {
              ...clienteApi,
              tipoDocumentoId: clienteApi.tipoDocumentoId || 'defaultTipoDoc', // Provide sensible defaults or handle error
              numeroDocumento: clienteApi.numeroDocumento || 'defaultNumDoc', // Provide sensible defaults or handle error
              tipoCliente: clienteApi.tipoCliente || 'defaultTipoCliente', // Provide sensible defaults or handle error
              disponibleOffline: clienteApi.disponibleOffline !== undefined ? clienteApi.disponibleOffline : true,
            };

            const clienteDbo: ClienteDbo = {
              ...mappedClienteApi,
              id: mappedClienteApi.id,
              sincronizado: true,
              ultimaConsulta: now,
              fechaModificacion: mappedClienteApi.fechaHoraModificacion ? new Date(mappedClienteApi.fechaHoraModificacion) : now,
            };

            const existingLocal = mappedClienteApi.id ? await db.clientes.where('id').equals(mappedClienteApi.id).first() : null;
            if (existingLocal?.localId) {
                await db.clientes.update(existingLocal.localId, clienteDbo);
            } else {
                // If new, or ID wasn't found, remove localId before put to ensure auto-increment
                const { localId, ...dboToInsert } = clienteDbo;
                await db.clientes.put(dboToInsert);
            }
          }

          if (response.value.length < API_PAGE_SIZE) {
            morePages = false;
          } else {
            currentPageNumber++;
          }
        } else {
          morePages = false;
          throw new Error(response.errors?.join(', ') || 'Failed to fetch clientes from API');
        }
      }
      await db.syncIndex.put({ tabla: 'clientes', lastSyncedAt: new Date() });
      // toastStore.addToast('Clientes sincronizados desde API.', 'success');
    } catch (error) {
      console.error('Error fetching clientes from API:', error);
      update((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)) }));
      toastStore.addToast('Error sincronizando clientes.', 'error');
    } finally {
      update((s) => ({ ...s, isLoading: false }));
    }
  };

  const cleanupOldClientes = async () => {
    const monthsOld = 3;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);

    const count = await db.clientes
      .where('ultimaConsulta')
      .below(cutoffDate)
      .and(cliente => cliente.disponibleOffline === true)
      .delete();
    if (count > 0) {
        toastStore.addToast(`${count} clientes antiguos eliminados de la base local.`, 'info');
    }
  };

  const add = async (clienteData: Omit<ClienteDbo, 'localId' | 'id' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>) => {
    try {
      const newCliente: ClienteDbo = {
        ...clienteData,
        id: null,
        sincronizado: false,
        disponibleOffline: clienteData.disponibleOffline !== undefined ? clienteData.disponibleOffline : true,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      };
      // Ensure required fields for DB are present before adding
      if (!newCliente.numeroDocumento || !newCliente.tipoDocumentoId || !newCliente.tipoCliente) {
        throw new Error('Missing required fields for new client (numeroDocumento, tipoDocumentoId, tipoCliente).');
      }
      const localId = await db.clientes.add(newCliente);

      const apiPayload = { ...clienteData };

      await syncService.addToQueue('Clientes', 'create', apiPayload, newCliente.numeroDocumento);
      toastStore.addToast(`Cliente ${newCliente.numeroDocumento} agregado localmente.`, 'info');
      selectedClienteToEdit.set(null);
    } catch (err) {
      console.error('Error adding cliente:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al agregar cliente.', 'error');
    }
  };

  const updateClient = async (
    localIdToUpdate: number,
    clienteChanges: Partial<Omit<ClienteDbo, 'localId' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>>,
    currentNumeroDocumento: string
  ) => {
    try {
      await db.clientes.update(localIdToUpdate, {
        ...clienteChanges,
        sincronizado: false,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      });

      const fullUpdatedClient = await db.clientes.get(localIdToUpdate);
      if (fullUpdatedClient) {
        // Ensure required fields are present for API payload
        const { localId, sincronizado, ultimaConsulta, ...apiPayload } = fullUpdatedClient;
        if (!apiPayload.numeroDocumento || !apiPayload.tipoDocumentoId || !apiPayload.tipoCliente) {
            throw new Error('Missing required fields for updating client (numeroDocumento, tipoDocumentoId, tipoCliente).');
        }
        await syncService.addToQueue('Clientes', 'update', apiPayload, currentNumeroDocumento);
        toastStore.addToast(`Cliente ${currentNumeroDocumento} actualizado localmente.`, 'info');
      }
      selectedClienteToEdit.set(null);
    } catch (err) {
      console.error('Error updating cliente:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al actualizar cliente.', 'error');
    }
  };

  const remove = async (localIdToDelete: number, numeroDocumento: string) => {
    try {
      await db.clientes.delete(localIdToDelete);
      await syncService.addToQueue('Clientes', 'delete', { numeroDocumento: numeroDocumento }, numeroDocumento);
      toastStore.addToast(`Cliente ${numeroDocumento} eliminado localmente.`, 'info');
    } catch (err) {
      console.error('Error removing cliente:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al eliminar cliente.', 'error');
    }
  };

  const selectClienteToEdit = (cliente: ClienteDbo) => {
    selectedClienteToEdit.set(cliente);
  };

  const clearSelectedClienteToEdit = () => {
    selectedClienteToEdit.set(null);
  };

  let isFirstConnection = true;
  let isProcessingConnectivityChange = false;

  const handleConnectivityChange = async () => {
    if (isProcessingConnectivityChange) return;
    isProcessingConnectivityChange = true;

    if (!get(offlineStore).isOffline) {
      toastStore.addToast('Conectado. Sincronizando datos...', 'info', 2000);
      await fetchFromApi();
      await syncService.processQueue();
      if (isFirstConnection) {
         await cleanupOldClientes();
         isFirstConnection = false;
      }
    } else {
      toastStore.addToast('Desconectado. Trabajando en modo offline.', 'warning');
    }
    isProcessingConnectivityChange = false;
  };

  const unsubscribeFromOfflineStore = offlineStore.subscribe(handleConnectivityChange);
  setTimeout(handleConnectivityChange, 0); // Initial call on next tick

  return {
    subscribe,
    fetchFromApi,
    cleanupOldClientes,
    add,
    update: updateClient,
    remove,
    selectedClienteToEdit,
    selectClienteToEdit,
    clearSelectedClienteToEdit,
    destroy: () => {
      unsubscribeFromLiveQuery();
      unsubscribeFromOfflineStore();
    },
  };
}

export const clienteStore = createClienteStore();
