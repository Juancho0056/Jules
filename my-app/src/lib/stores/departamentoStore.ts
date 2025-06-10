// my-app/src/lib/stores/departamentoStore.ts
import { writable, get } from 'svelte/store';
import { db, type DepartamentoDbo } from '../services/dbService';
import { apiService } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore';
import { dexieStore } from './dexieStore';
import { toastStore } from './toastStore';

export interface DepartamentoState {
  departamentos: DepartamentoDbo[];
  isLoading: boolean;
  error: Error | null;
}

const API_PAGE_SIZE = 50;

const initialState: DepartamentoState = {
  departamentos: [],
  isLoading: true,
  error: null,
};

// Assumed API response structure for a Departamento
interface DepartamentoApiResponse {
  id: string;
  nombre: string;
  estado: boolean;
  disponibleOffline: boolean;
  fechaHoraModificacion?: string; // Or similar server timestamp field
}

function createDepartamentoStore() {
  const { subscribe, update, set } = writable<DepartamentoState>(initialState);
  const selectedDepartamentoToEdit = writable<DepartamentoDbo | null>(null);

  const dexieDepartamentos = dexieStore(() => db.departamentos.orderBy('nombre').toArray());
  const unsubscribeFromLiveQuery = dexieDepartamentos.subscribe(
    (data) => update((state) => ({ ...state, departamentos: data, isLoading: false, error: null })),
    (err) => update((state) => ({ ...state, error: err, isLoading: false }))
  );

  const fetchFromApi = async () => {
    if (get(offlineStore).isOffline) {
      update(s => ({ ...s, isLoading: false }));
      return;
    }
    update((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const lastSync = await db.syncIndex.get('departamentos');
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

        const response = await apiService.get<DepartamentoApiResponse[]>(`/api/Departamentos/offline?${queryParams.toString()}`);

        if (response.isSuccess && response.value) {
          if (response.value.length === 0) {
            morePages = false;
            break;
          }

          const now = new Date();
          for (const itemApi of response.value) {
            const departamentoDbo: DepartamentoDbo = {
              // localId will be handled by put if new, or preserved if updating by 'id'
              id: itemApi.id,
              nombre: itemApi.nombre,
              estado: itemApi.estado,
              disponibleOffline: itemApi.disponibleOffline,
              sincronizado: true,
              ultimaConsulta: now,
              fechaModificacion: itemApi.fechaHoraModificacion ? new Date(itemApi.fechaHoraModificacion) : now,
            };
            // Dexie's put will add or update based on the primary key '&id'
            await db.departamentos.put(departamentoDbo);
          }

          if (response.value.length < API_PAGE_SIZE) {
            morePages = false;
          } else {
            currentPageNumber++;
          }
        } else {
          morePages = false;
          throw new Error(response.errors?.join(', ') || 'Failed to fetch departamentos from API');
        }
      }
      await db.syncIndex.put({ tabla: 'departamentos', lastSyncedAt: new Date() });
    } catch (error) {
      console.error('Error fetching departamentos from API:', error);
      update((s) => ({ ...s, error: error instanceof Error ? error : new Error(String(error)) }));
      toastStore.addToast('Error sincronizando departamentos.', 'error');
    } finally {
      update((s) => ({ ...s, isLoading: false }));
    }
  };

  const cleanupOldDepartamentos = async () => {
    const monthsOld = 3;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);
    const count = await db.departamentos
      .where('ultimaConsulta')
      .below(cutoffDate)
      .and(item => item.disponibleOffline === true)
      .delete();
    if (count > 0) {
        toastStore.addToast(`${count} departamentos antiguos eliminados localmente.`, 'info');
    }
  };

  const add = async (data: Omit<DepartamentoDbo, 'localId' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>) => {
    try {
      if (!data.id || !data.nombre) {
        throw new Error('ID y Nombre son requeridos para crear un departamento.');
      }
      const newDepartamento: DepartamentoDbo = {
        ...data,
        sincronizado: false,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      };
      await db.departamentos.add(newDepartamento); // localId will be auto-generated

      const apiPayload = {
        id: newDepartamento.id,
        nombre: newDepartamento.nombre,
        disponibleOffline: newDepartamento.disponibleOffline,
        estado: newDepartamento.estado, // Ensure 'estado' is part of the payload if API expects it for creation
      };
      await syncService.addToQueue('Departamentos', 'create', apiPayload, newDepartamento.id);
      toastStore.addToast(`Departamento ${newDepartamento.nombre} agregado localmente.`, 'info');
      selectedDepartamentoToEdit.set(null);
    } catch (err) {
      console.error('Error adding departamento:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al agregar departamento.', 'error');
    }
  };

  const update = async (
    localIdToUpdate: number,
    changes: Partial<Omit<DepartamentoDbo, 'localId' | 'id' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>>,
    currentId: string // This is the Departamento's string ID
  ) => {
    try {
      await db.departamentos.update(localIdToUpdate, {
        ...changes,
        sincronizado: false,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      });

      const fullUpdatedItem = await db.departamentos.get(localIdToUpdate);
      if (fullUpdatedItem) {
        const apiPayload = {
          // For UpdateDepartamentoCommand, id is in path, body contains changeable fields
          nombre: fullUpdatedItem.nombre,
          estado: fullUpdatedItem.estado,
          disponibleOffline: fullUpdatedItem.disponibleOffline,
        };
        await syncService.addToQueue('Departamentos', 'update', apiPayload, currentId);
        toastStore.addToast(`Departamento ${currentId} actualizado localmente.`, 'info');
      }
      selectedDepartamentoToEdit.set(null);
    } catch (err) {
      console.error('Error updating departamento:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al actualizar departamento.', 'error');
    }
  };

  const remove = async (localIdToDelete: number, id: string) => {
    try {
      await db.departamentos.delete(localIdToDelete);
      // API for delete is /api/Departamentos/{id}, so payload to syncService is {id} for identification by server
      await syncService.addToQueue('Departamentos', 'delete', { id: id }, id);
      toastStore.addToast(`Departamento ${id} eliminado localmente.`, 'info');
    } catch (err) {
      console.error('Error removing departamento:', err);
      update((s) => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
      toastStore.addToast('Error al eliminar departamento.', 'error');
    }
  };

  const selectDepartamentoToEdit = (item: DepartamentoDbo) => {
    selectedDepartamentoToEdit.set(item);
  };

  const clearSelectedDepartamentoToEdit = () => {
    selectedDepartamentoToEdit.set(null);
  };

  let isFirstConnection = true;
  let isProcessingConnectivityChange = false;

  const handleConnectivityChange = async () => {
    if (isProcessingConnectivityChange) return;
    isProcessingConnectivityChange = true;

    if (!get(offlineStore).isOffline) {
      toastStore.addToast('Conectado. Sincronizando datos de Departamentos...', 'info', 2000);
      await fetchFromApi();
      await syncService.processQueue(); // Let syncService decide what to process
      if (isFirstConnection) {
         await cleanupOldDepartamentos();
         isFirstConnection = false;
      }
    } else {
      toastStore.addToast('Desconectado. Trabajando en modo offline.', 'warning');
    }
    isProcessingConnectivityChange = false;
  };

  const unsubscribeFromOfflineStore = offlineStore.subscribe(handleConnectivityChange);
  // Initial call on mount or after a short delay to ensure other services might be ready
  setTimeout(handleConnectivityChange, 100);

  return {
    subscribe,
    fetchFromApi,
    cleanupOldDepartamentos,
    add,
    update,
    remove,
    selectedDepartamentoToEdit,
    selectDepartamentoToEdit,
    clearSelectedDepartamentoToEdit,
    destroy: () => {
      unsubscribeFromLiveQuery();
      unsubscribeFromOfflineStore();
    },
  };
}

export const departamentoStore = createDepartamentoStore();
