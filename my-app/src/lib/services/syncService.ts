import { offlineStore } from '../stores/offlineStore';
import { apiService } from './apiService';
import { db, type PendingOperationDbo, type UnitOfMeasureDbo } from './dbService';
import { get } from 'svelte/store';
import { toastStore } from '../stores/toastStore';
import type { CreateUnidadMedidaCommand, UpdateUnidadMedidaCommand, UnidadMedida } from '$lib/types/unidadMedida';

const MAX_RETRY_ATTEMPTS = 3;

// Añadir operación a la cola
const addToQueue = async (
  entityName: string,
  operationType: 'create' | 'update' | 'delete',
  payload: any,
  entityKey?: string | null
) => {
  const operation: PendingOperationDbo = {
    entityName,
    operationType,
    payload,
    entityKey,
    timestamp: new Date(),
    status: 'pending',
    attempts: 0,
    lastAttempt: null,
  };
  await db.pendingOperations.add(operation);
  toastStore.addToast(`${entityName} ${operationType} operation queued.`, 'info', 2000);

  if (!get(offlineStore).isOffline) {
    processQueue();
  }
};

// Procesamiento robusto con retry automático
const processQueue = async () => {
  if (get(offlineStore).isOffline) return;

  const operations = await db.pendingOperations
    .where('status').anyOf('pending', 'failed')
    .filter(op => (op.attempts || 0) < MAX_RETRY_ATTEMPTS)
    .sortBy('timestamp');

  if (!operations.length) return;

  toastStore.addToast(`Procesando ${operations.length} operaciones...`, 'info', 2000);

  for (const op of operations) {
    try {
      await db.pendingOperations.update(op.opId!, {
        status: 'processing',
        attempts: (op.attempts || 0) + 1,
        lastAttempt: new Date()
      });

      let result;
      let success = false;

      switch (op.operationType) {
        case 'create':
          result = await apiService.post<UnidadMedida>(`/UnidadMedidas`, op.payload);
          if (result.isSuccess && result.value) {
            await db.unitsOfMeasure.where('codigo').equals(op.payload.codigo).modify({
              id: result.value.codigo,
              sincronizado: true,
              disponibleOffline: true,
              fechaModificacion: new Date(result.value.fechaHoraModificacion)
            });
            success = true;
          }
          break;

        case 'update':
          result = await apiService.put<UnidadMedida>(`/UnidadMedidas/${op.entityKey}`, op.payload);
          if (result.isSuccess && result.value) {
            await db.unitsOfMeasure.where('codigo').equals(op.entityKey!).modify({
              sincronizado: true,
              fechaModificacion: new Date(result.value.fechaHoraModificacion)
            });
            success = true;
          }
          break;

        case 'delete':
          result = await apiService.delete(`/UnidadMedidas/${op.entityKey}`);
          if (result.isSuccess) {
            await db.unitsOfMeasure.where('codigo').equals(op.entityKey!).delete();
            success = true;
          }
          break;
      }

      if (success) {
        await db.pendingOperations.delete(op.opId!);
        toastStore.addToast(`Sincronizado: ${op.entityName}`, 'success', 1500);
      } else {
        throw new Error(result.errors?.join(', ') || 'Error desconocido');
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      const attempts = (op.attempts || 0) + 1;
      const status = attempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';
      await db.pendingOperations.update(op.opId!, { status, lastAttempt: new Date() });
      toastStore.addToast(`Error sincronizando ${op.entityName}. Intentos: ${attempts}`, 'warning');
    }
  }
};

// Sincronización incremental de unidades
const fetchUnidadesIncremental = async () => {
  const lastSync = await db.syncIndex.get('unitsOfMeasure');
  const query = lastSync ? `actualizadoDesde=${lastSync.lastSyncedAt.toISOString()}` : '';
  const response = await apiService.get<UnidadMedida[]>(`/UnidadMedidas?offline=true&${query}`);

  if (response.isSuccess && response.value) {
    const now = new Date();
    for (const unidad of response.value) {
      await db.unitsOfMeasure.put({
        ...unidad,
        sincronizado: true,
        disponibleOffline: true,
        ultimaConsulta: now,
        fechaModificacion: new Date(unidad.fechaHoraModificacion),
      });
    }
    await db.syncIndex.put({ tabla: 'unitsOfMeasure', lastSyncedAt: now });
    toastStore.addToast(`Unidades sincronizadas incrementalmente.`, 'success');
  }
};

// Estado de la cola
const getQueueStatus = async () => {
  const pending = await db.pendingOperations.where('status').equals('pending').count();
  const failed = await db.pendingOperations.where('status').equals('failed').count();
  return { pending, failed };
};

// Disparar automáticamente al recuperar conexión
let initialRun = true;
offlineStore.subscribe(async (state) => {
  if (!state.isOffline) {
    if (initialRun) {
      initialRun = false;
    }
    await fetchUnidadesIncremental();
    await processQueue();
  }
});

export const syncService = {
  addToQueue,
  processQueue,
  fetchUnidadesIncremental,
  getQueueStatus,
};
