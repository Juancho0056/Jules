// my-app/src/lib/stores/municipioStore.ts
import { writable, get } from 'svelte/store';
import { db, type MunicipioDbo } from '../services/dbService';
import { apiService } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore';
import { dexieStore } from './dexieStore';
import { toastStore } from './toastStore';

export interface MunicipioState {
  municipios: MunicipioDbo[];
  isLoading: boolean;
  error: Error | null;
}

const API_PAGE_SIZE = 50;

const initialState: MunicipioState = {
  municipios: [],
  isLoading: true,
  error: null,
};

interface MunicipioApiResponse {
  id: string;
  nombre: string;
  departamentoId: string;
  disponibleOffline: boolean;
  fechaHoraModificacion?: string;
}

function createMunicipioStore() {
  const { subscribe, update, set } = writable<MunicipioState>(initialState);
  const selectedMunicipioToEdit = writable<MunicipioDbo | null>(null);

  const dexieMunicipios = dexieStore(() => db.municipios.orderBy('nombre').toArray());
  const unsubscribeFromLiveQuery = dexieMunicipios.subscribe(
    (data) => update((state) => ({ ...state, municipios: data, isLoading: false, error: null })),
    (err) => update((state) => ({ ...state, error: err, isLoading: false }))
  );

  const fetchFromApi = async () => {
    if (get(offlineStore).isOffline) {
      update(s => ({ ...s, isLoading: false }));
      return;
    }
    update((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const lastSync = await db.syncIndex.get('municipios');
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

        const response = await apiService.get<MunicipioApiResponse[]>(`/api/Municipios/offline?${queryParams.toString()}`);

        if (response.isSuccess && response.value) {
          if (response.value.length === 0) {
            morePages = false;
            break;
          }
          const now = new Date();
          for (const itemApi of response.value) {
            const municipioDbo: MunicipioDbo = {
              id: itemApi.id,
              nombre: itemApi.nombre,
              departamentoId: itemApi.departamentoId,
              disponibleOffline: itemApi.disponibleOffline,
              sincronizado: true,
              ultimaConsulta: now,
              fechaModificacion: itemApi.fechaHoraModificacion ? new Date(itemApi.fechaHoraModificacion) : now,
            };
            await db.municipios.put(municipioDbo);
          }
          if (response.value.length < API_PAGE_SIZE) {
            morePages = false;
          } else {
            currentPageNumber++;
          }
        } else {
          morePages = false;
          throw new Error(response.errors?.join(', ') || 'Failed to fetch municipios from API');
        }
      }
      await db.syncIndex.put({ tabla: 'municipios', lastSyncedAt: new Date() });
    } catch (error) {
      console.error('Error fetching municipios from API:', error);
      update((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)) }));
      toastStore.addToast('Error sincronizando municipios.', 'error');
    } finally {
      update((s) => ({ ...s, isLoading: false }));
    }
  };

  const cleanupOldMunicipios = async () => {
    const monthsOld = 3;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    const count = await db.municipios
      .where('ultimaConsulta')
      .below(cutoffDate)
      .and(item => item.disponibleOffline === true)
      .delete();
    if (count > 0) {
        toastStore.addToast(`${count} municipios antiguos eliminados localmente.`, 'info');
    }
  };

  const add = async (data: Omit<MunicipioDbo, 'localId' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>) => {
    try {
      if (!data.id || !data.nombre || !data.departamentoId) {
        throw new Error('ID, Nombre y ID Departamento son requeridos.');
      }
      const newMunicipio: MunicipioDbo = {
        ...data,
        sincronizado: false,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      };
      await db.municipios.add(newMunicipio);
      const apiPayload = {
        id: newMunicipio.id,
        nombre: newMunicipio.nombre,
        departamentoId: newMunicipio.departamentoId,
        disponibleOffline: newMunicipio.disponibleOffline,
      };
      await syncService.addToQueue('Municipios', 'create', apiPayload, newMunicipio.id);
      toastStore.addToast(`Municipio ${newMunicipio.nombre} agregado localmente.`, 'info');
      selectedMunicipioToEdit.set(null);
    } catch (err) {
      console.error('Error adding municipio:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al agregar municipio.', 'error');
    }
  };

  const update = async (
    localIdToUpdate: number,
    changes: Partial<Omit<MunicipioDbo, 'localId' | 'id' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>>,
    currentId: string
  ) => {
    try {
      await db.municipios.update(localIdToUpdate, {
        ...changes,
        sincronizado: false,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      });
      const fullUpdatedItem = await db.municipios.get(localIdToUpdate);
      if (fullUpdatedItem) {
        const apiPayload = {
          nombre: fullUpdatedItem.nombre,
          departamentoId: fullUpdatedItem.departamentoId,
          disponibleOffline: fullUpdatedItem.disponibleOffline,
        };
        await syncService.addToQueue('Municipios', 'update', apiPayload, currentId);
        toastStore.addToast(`Municipio ${currentId} actualizado localmente.`, 'info');
      }
      selectedMunicipioToEdit.set(null);
    } catch (err) {
      console.error('Error updating municipio:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al actualizar municipio.', 'error');
    }
  };

  const remove = async (localIdToDelete: number, id: string) => {
    try {
      await db.municipios.delete(localIdToDelete);
      await syncService.addToQueue('Municipios', 'delete', { id }, id);
      toastStore.addToast(`Municipio ${id} eliminado localmente.`, 'info');
    } catch (err) {
      console.error('Error removing municipio:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al eliminar municipio.', 'error');
    }
  };

  const selectMunicipioToEdit = (item: MunicipioDbo) => {
    selectedMunicipioToEdit.set(item);
  };
  const clearSelectedMunicipioToEdit = () => {
    selectedMunicipioToEdit.set(null);
  };

  let isFirstConnection = true;
  let isProcessingConnectivityChange = false;

  const handleConnectivityChange = async () => {
    if (isProcessingConnectivityChange) return;
    isProcessingConnectivityChange = true;
    if (!get(offlineStore).isOffline) {
      toastStore.addToast('Conectado. Sincronizando datos de Municipios...', 'info', 2000);
      await fetchFromApi();
      await syncService.processQueue();
      if (isFirstConnection) {
         await cleanupOldMunicipios();
         isFirstConnection = false;
      }
    } else {
      toastStore.addToast('Desconectado. Trabajando en modo offline con Municipios.', 'warning');
    }
    isProcessingConnectivityChange = false;
  };
  const unsubscribeFromOfflineStore = offlineStore.subscribe(handleConnectivityChange);
  setTimeout(handleConnectivityChange, 150); // Stagger slightly

  return {
    subscribe,
    fetchFromApi,
    cleanupOldMunicipios,
    add,
    update,
    remove,
    selectedMunicipioToEdit,
    selectMunicipioToEdit,
    clearSelectedMunicipioToEdit,
    destroy: () => {
      unsubscribeFromLiveQuery();
      unsubscribeFromOfflineStore();
    },
  };
}

export const municipioStore = createMunicipioStore();
