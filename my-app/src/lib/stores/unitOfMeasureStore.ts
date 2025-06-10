import { writable, get } from 'svelte/store';
import { db, type UnitOfMeasureDbo } from '../services/dbService';
import { apiService } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore';
import { liveQuery } from 'dexie';
import { dexieStore } from './dexieStore';

export interface UnitOfMeasureState {
  units: UnitOfMeasureDbo[];
  isLoading: boolean;
  error: Error | null;
}

const initialState: UnitOfMeasureState = {
  units: [],
  isLoading: true,
  error: null,
};

function createUnitOfMeasureStore() {
  const { subscribe, update } = writable<UnitOfMeasureState>(initialState);

  const selectedUnitToEdit = writable<UnitOfMeasureDbo | null>(null);

  // Dexie liveQuery para actualización reactiva
  const dexieUnits = dexieStore(() => db.unitsOfMeasure.orderBy('orden').toArray());

  const unsubscribeFromLiveQuery = dexieUnits.subscribe((data) => {
    update(state => ({ ...state, units: data, isLoading: false, error: null }));
  });

  // Descarga selectiva desde API según estrategia unificada
  const fetchFromApi = async () => {
    update(s => ({ ...s, isLoading: true, error: null }));

    try {
      const lastSync = await db.syncIndex.get('unitsOfMeasure');
      const query = lastSync ? `actualizadoDesde=${lastSync.lastSyncedAt.toISOString()}` : '';
      const response = await apiService.get<UnitOfMeasureDbo[]>(`/UnidadMedidas?offline=true&${query}`);

      if (response.isSuccess && response.value) {
        for (const unidad of response.value) {
          const unidadDbo: UnitOfMeasureDbo = {
            ...unidad,
            sincronizado: true,
            ultimaConsulta: new Date(),
            disponibleOffline: true,
            fechaModificacion: new Date(unidad.fechaModificacion),
          };
          await db.unitsOfMeasure.put(unidadDbo);
        }

        // Registrar última sincronización exitosa
        await db.syncIndex.put({ tabla: 'unitsOfMeasure', lastSyncedAt: new Date() });
      }

      update(s => ({ ...s, isLoading: false }));
    } catch (error) {
      console.error('Error fetching unidades from API:', error);
      update(s => ({ ...s, isLoading: false, error: error instanceof Error ? error : new Error(String(error)) }));
    }
  };

  // Limpieza periódica automática
  const cleanupOldUnits = async () => {
    const monthsOld = 3; // Puedes ajustar este valor
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld);

    await db.unitsOfMeasure
      .where('ultimaConsulta')
      .below(cutoffDate)
      .and(unit => unit.disponibleOffline)
      .delete();
  };

  // CRUD operations
  const add = async (unitData: Omit<UnitOfMeasureDbo, 'localId' | 'id' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta' | 'disponibleOffline'>) => {
    try {
      const newUnit: UnitOfMeasureDbo = {
        ...unitData,
        id: null,
        sincronizado: false,
        disponibleOffline: true,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      };

      const localId = await db.unitsOfMeasure.add(newUnit);

      await syncService.addToQueue('UnidadMedidas', 'create', unitData, unitData.codigo);
      selectedUnitToEdit.set(null);
    } catch (err) {
      update(s => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
    }
  };

  const updateUnit = async (
    localId: number,
    unitChanges: Partial<Omit<UnitOfMeasureDbo, 'localId' | 'id' | 'sincronizado' | 'fechaModificacion' | 'codigo' | 'disponibleOffline' | 'ultimaConsulta'>>,
    currentCodigo: string
  ) => {
    try {
      await db.unitsOfMeasure.update(localId, {
        ...unitChanges,
        sincronizado: false,
        fechaModificacion: new Date(),
        ultimaConsulta: new Date(),
      });

      await syncService.addToQueue('UnidadMedidas', 'update', unitChanges, currentCodigo);
      selectedUnitToEdit.set(null);
    } catch (err) {
      update(s => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
    }
  };

  const remove = async (localId: number, codigo: string) => {
    try {
      await db.unitsOfMeasure.delete(localId);
      await syncService.addToQueue('UnidadMedidas', 'delete', { codigo }, codigo);
    } catch (err) {
      update(s => ({ ...s, error: err instanceof Error ? err : new Error(String(err)) }));
    }
  };

  const selectUnitToEdit = (unit: UnitOfMeasureDbo) => {
    selectedUnitToEdit.set(unit);
  };

  const clearSelectedUnitToEdit = () => {
    selectedUnitToEdit.set(null);
  };

  // Al reconectar, descarga incrementalmente unidades
  offlineStore.subscribe(async (state) => {
    if (!state.isOffline) {
      await fetchFromApi();
      await cleanupOldUnits();
    }
  });

  return {
    subscribe,
    fetchFromApi,
    cleanupOldUnits,
    add,
    update: updateUnit,
    remove,
    selectedUnitToEdit,
    selectUnitToEdit,
    clearSelectedUnitToEdit,
    destroy: unsubscribeFromLiveQuery,
  };
}

export const unitOfMeasureStore = createUnitOfMeasureStore();
