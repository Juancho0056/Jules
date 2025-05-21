import { offlineStore } from '../stores/offlineStore';
import { apiService, ApiError } from './apiService'; // ApiError might still be used for status code checks
import { db, type PendingOperationDbo, type UnitOfMeasureDbo } from './dbService';
import { get } from 'svelte/store';
import { toastStore } from '../stores/toastStore';
import type { CreateUnidadMedidaCommand, UpdateUnidadMedidaCommand, UnidadMedida } from '$lib/types/unidadMedida';

// addToQueue now more generic for different entities and operations
const addToQueue = async (
  entityName: string,
  operationType: 'create' | 'update' | 'delete',
  payload: any, // For create/update, this is the entity data. For delete, could be null or just the key.
  entityKey?: string | null // The main business key (e.g., 'codigo') of the entity.
): Promise<number | undefined> => {
  try {
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
    console.log('Adding operation to queue:', operation);
    const opId = await db.pendingOperations.add(operation);
    console.log(`Operation for ${entityName} (${operationType}, key: ${entityKey || 'N/A'}) added to Dexie queue with opId: ${opId}`);
    toastStore.addToast(`${entityName} ${operationType} operation queued.`, 'info', 2000);
    // Trigger queue processing if online, but not too aggressively.
    // processQueue might be better triggered by online status change or specific UI actions.
    if (!get(offlineStore).isOffline) {
        processQueue(); // Attempt to process immediately if online
    }
    return opId;
  } catch (error) {
    console.error('Failed to add operation to Dexie queue:', error);
    toastStore.addToast(`Error queueing ${entityName} operation.`, 'error');
    return undefined;
  }
};

const MAX_RETRY_ATTEMPTS = 3;

const processQueue = async (ignoreRetryLimit = false): Promise<void> => {
  if (get(offlineStore).isOffline) {
    console.log('SyncService: Offline, not processing queue.');
    return;
  }

  const pendingOps = await db.pendingOperations
    .where('status').equals('pending')
    .or('status').equals('failed') // Also retry 'failed' ops that are not past MAX_RETRY_ATTEMPTS
    .filter(op => ignoreRetryLimit || (op.attempts || 0) < MAX_RETRY_ATTEMPTS)
    .sortBy('timestamp');

  if (pendingOps.length === 0) {
    console.log('SyncService: Queue is empty or all items have reached max retry attempts.');
    return;
  }

  toastStore.addToast(`Processing ${pendingOps.length} queued operations...`, 'info', 2000);
  console.log('SyncService: Processing offline queue from Dexie...', pendingOps);

  for (const op of pendingOps) {
    if (!op.opId) continue; // Should not happen with Dexie auto-increment

    try {
      await db.pendingOperations.update(op.opId, { 
        status: 'processing', 
        attempts: (op.attempts || 0) + 1,
        lastAttempt: new Date()
      });

      let result;
      let success = false;

      // Standard API path prefix
      const apiPathPrefix = '';
      console.log(op.entityName);
      switch (op.operationType) {
        case 'create':
          if (op.entityName === 'UnidadMedidas') {
            const dbo = op.payload as UnitOfMeasureDbo;
            const createCommand: CreateUnidadMedidaCommand = {
              codigo: dbo.codigo,
              nombre: dbo.nombre,
              abreviatura: dbo.abreviatura,
              orden: dbo.orden,
              estado: dbo.estado,
            };
            result = await apiService.post<UnidadMedida>(`${apiPathPrefix}/${op.entityName}`, createCommand);
            if (result.isSuccess && result.value) {
              const serverUnit = result.value;
              const localUnit = await db.unitsOfMeasure.where('codigo').equals(dbo.codigo).first();
              if (localUnit && localUnit.localId) {
                await db.unitsOfMeasure.update(localUnit.localId, {
                  id: serverUnit.codigo,
                  nombre: serverUnit.nombre,
                  abreviatura: serverUnit.abreviatura,
                  orden: serverUnit.orden,
                  estado: serverUnit.estado,
                  sincronizado: true,
                  fechaModificacion: new Date(serverUnit.fechaHoraModificacion || Date.now()),
                });
                console.log(`Synced create for UnidadMedidas ${dbo.codigo}, server ID: ${serverUnit.codigo}`);
              } else {
                console.warn(`Local unit with codigo ${dbo.codigo} not found for sync update after create.`);
              }
              success = true;
            }
          } else {
            // Fallback or handler for other entities
            console.warn(`SyncService: Create for unhandled entity ${op.entityName}`);
            // Example: result = await apiService.post<any>(`${apiPathPrefix}/${op.entityName}`, op.payload);
            // if (result.IsSuccess) success = true;
          }
          break;
        case 'update':
          if (!op.entityKey) {
            console.error(`SyncService: entityKey missing for update operation opId: ${op.opId}`);
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
            continue;
          }
          if (op.entityName === 'UnidadMedidas') {
            console.log('op.Payload', op.payload );
            const payloadToUpdate = op.payload as Partial<UnitOfMeasureDbo>;
            const updateCommand: UpdateUnidadMedidaCommand = {
              codigo: op.entityKey!, // entityKey is 'codigo', server maps to 'Id'
              nombre: payloadToUpdate.nombre!,
              abreviatura: payloadToUpdate.abreviatura,
              orden: payloadToUpdate.orden!,
              estado: payloadToUpdate.estado!,
            };
            console.log(`${apiPathPrefix}/${op.entityName}/${op.entityKey}`);
            result = await apiService.put<UnidadMedida>(`${apiPathPrefix}/${op.entityName}/${op.entityKey}`, updateCommand);
            if (result.isSuccess && result.value) {
              const serverUnit = result.value;
              const localUnit = await db.unitsOfMeasure.where('codigo').equals(op.entityKey!).first();
              if (localUnit && localUnit.localId) {
                console.log('localUnit', localUnit);
                const unitDbo: UnitOfMeasureDbo = {
                  ...localUnit, 
                  id: payloadToUpdate.codigo,
                  nombre: payloadToUpdate.nombre ?? localUnit?.nombre,
                  abreviatura: payloadToUpdate.abreviatura ?? localUnit?.abreviatura,
                  orden: payloadToUpdate.orden ?? localUnit?.orden ?? 0,
                  estado: payloadToUpdate.estado ?? localUnit?.estado ?? true,
                  sincronizado: true,
                  fechaModificacion: new Date(Date.now()),
                  offlineId: payloadToUpdate?.offlineId || null
                };

                await db.unitsOfMeasure.put(unitDbo);
                console.log(`Synced update for UnidadMedidas ${op.entityKey}`);
              }
              success = true;
            }
          } else {
            // Fallback or handler for other entities
            console.warn(`SyncService: Update for unhandled entity ${op.entityName}`);
            // Example: result = await apiService.put<any>(`${apiPathPrefix}/${op.entityName}/${op.entityKey}`, op.payload);
            // if (result.IsSuccess) success = true;
          }
          break;
        case 'delete':
          if (!op.entityKey) {
            console.error(`SyncService: entityKey missing for delete operation opId: ${op.opId}`);
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
            continue;
          }
          result = await apiService.delete<void>(`${apiPathPrefix}/${op.entityName}/${op.entityKey}`);
          console.log(`${apiPathPrefix}/${op.entityName}/${op.entityKey}`);
          if (result.isSuccess) { // Check IsSuccess
            if (op.entityName === 'UnidadMedidas') {
              const localUnit = await db.unitsOfMeasure.where('codigo').equals(op.entityKey).first();
              if (localUnit && localUnit.localId) {
                await db.unitsOfMeasure.delete(localUnit.localId);
                console.log(`Hard deleted UnidadMedidas ${op.entityKey} from local Dexie after sync.`);
              }
            }
            // Add more entity-specific handlers here for delete if needed
            console.log(`Synced delete for ${op.entityName} ${op.entityKey}`);
            success = true;
          }
          break;
        default:
          console.warn(`SyncService: Unsupported operationType ${op.operationType} in queue for opId: ${op.opId}`);
          await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
          continue;
      }

      if (success) {
        await db.pendingOperations.delete(op.opId);
        toastStore.addToast(`${op.entityName} (key: ${op.entityKey || op.payload?.codigo}) synced successfully.`, 'success', 2000);
      } else {
        // Use Errors array from Result object
        const errorMsg = result?.errors?.join(', ') || 'Unknown error during sync.';
        console.error(`SyncService: Failed to process opId ${op.opId} (${op.operationType} ${op.entityName} ${op.entityKey || op.payload?.codigo}): ${errorMsg}`);
        toastStore.addToast(`Failed to sync ${op.entityName} (key: ${op.entityKey || op.payload?.codigo}). Will retry.`, 'warning', 3000);
        
        const currentAttempts = (op.attempts || 0); // attempts already incremented
        // Check if result.error exists and has a status property
        // This part needs careful handling since result.error is not directly available from Result<T>
        // We'd need to inspect result.Errors or have a way to get status code from apiService if needed for specific logic
        // For now, general retry logic based on attempts:
        if (currentAttempts >= MAX_RETRY_ATTEMPTS) {
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
            toastStore.addToast(`Sync for ${op.entityName} ${op.entityKey || op.payload?.codigo} failed after ${MAX_RETRY_ATTEMPTS} attempts.`, 'error', 5000);
        } else {
             await db.pendingOperations.update(op.opId, { status: 'pending', lastAttempt: new Date() });
        }
      }
    } catch (error: any) { // Catch any other error
      console.error(`SyncService: General error processing opId ${op.opId}:`, error.message || error);
      if (op.opId) { // Ensure opId is defined
        await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
      }
      toastStore.addToast(`Critical error syncing an operation. Check console.`, 'error');
    }
  }
  // After processing a batch, check if there are still processable items and re-trigger if so.
  // This avoids waiting for the next explicit call if many items are in queue.
  const remainingProcessable = await db.pendingOperations
      .where('status').equals('pending')
      .or('status').equals('failed')
      .filter(op => (op.attempts || 0) < MAX_RETRY_ATTEMPTS)
      .count();
  if (remainingProcessable > 0 && !get(offlineStore).isOffline) {
      console.log("SyncService: Re-triggering processQueue for remaining items.");
      setTimeout(processQueue, 1000); // Small delay to prevent tight loop on persistent errors
  } else if (pendingOps.length > 0 && remainingProcessable === 0 && !get(offlineStore).isOffline) {
      toastStore.addToast('All queued operations processed or max retries reached.', 'info');
  }

};

// Get current queue status (counts)
const getQueueStatus = async () => {
  const pendingCount = await db.pendingOperations.where('status').equals('pending').count();
  const failedPotentiallyRetryableCount = await db.pendingOperations
                                .where('status').equals('failed')
                                .filter(op => (op.attempts || 0) < MAX_RETRY_ATTEMPTS)
                                .count();
  const failedPermanentCount = await db.pendingOperations
                                .where('status').equals('failed')
                                .filter(op => (op.attempts || 0) >= MAX_RETRY_ATTEMPTS)
                                .count();
  return {
    pending: pendingCount,
    failedRetryable: failedPotentiallyRetryableCount,
    failedPermanent: failedPermanentCount,
    total: pendingCount + failedPotentiallyRetryableCount + failedPermanentCount,
  };
};


// Auto trigger queue processing when app comes online
// This listener is crucial.
let firstRun = true;

const fetchAllUnidadesMedida = async (): Promise<boolean> => {
  console.log('SyncService: Fetching all Unidades de Medida from server...');
  const result = await apiService.get<UnidadMedida[]>('/UnidadMedidas/all'); // Or /api/UnidadMedidas/activas

  if (result.isSuccess && result.value) {
    const serverUnits = result.value;
    toastStore.addToast(`Fetched ${serverUnits.length} units from server. Updating local store...`, 'info', 3000);
    try {
      for (const serverUnit of serverUnits) {
        console.log(`SyncService: Processing server unit ...`, serverUnit);
        console.log(`SyncService: Processing server unit ${serverUnit.codigo}...` );
        const existingLocalUnit = await db.unitsOfMeasure.where('codigo').equals(serverUnit.codigo).first();

        const unitDbo: UnitOfMeasureDbo = {
          localId: existingLocalUnit?.localId, // Preserve localId if exists for update
          codigo: serverUnit.codigo,               // Server's 'Id' is our 'codigo' (business key)
          id: serverUnit.codigo,                 // Store server's 'Id' also in 'Id' field. Corrected from 'Id' to 'id'
          nombre: serverUnit.nombre,
          abreviatura: serverUnit.abreviatura,
          orden: serverUnit.orden,
          estado: serverUnit.estado,
          sincronizado: true,
          fechaModificacion: new Date(serverUnit.fechaHoraModificacion || Date.now()),
          // Preserve offlineId if it exists and you have specific logic for it, otherwise null
          offlineId: existingLocalUnit?.offlineId || null 
        };
        await db.unitsOfMeasure.put(unitDbo);
      }
      toastStore.addToast('Local units updated successfully.', 'success');
      console.log('SyncService: Successfully fetched and updated local Unidades de Medida.');
      return true;
    } catch (dbError) {
      console.error('SyncService: Error updating local Dexie database:', dbError);
      toastStore.addToast('Failed to update local unit store.', 'error');
      return false;
    }
  } else {
    const errorMsg = result.errors?.join(', ') || 'Failed to fetch units from server.';
    console.error('SyncService: Failed to fetch Unidades de Medida:', errorMsg);
    toastStore.addToast(errorMsg, 'error');
    return false;
  }
};

if (typeof window !== 'undefined') {
  offlineStore.subscribe(state => {
    if (firstRun) {
      firstRun = false;
      if (!state.isOffline) {
        console.log('SyncService: App initialized as online, attempting to process queue.');
        setTimeout(processQueue, 1000);
      }
      return;
    }
    if (!state.isOffline) {
      console.log('SyncService: Application is now online. Attempting to process queue.');
      toastStore.addToast('Back online. Starting data synchronization.', 'info');
      setTimeout(processQueue, 1000);
    } else {
      console.log('SyncService: Application is now offline. Queue processing paused.');
      toastStore.addToast('Offline. Synchronization paused.', 'warning');
    }
  });
}
export const syncService = {
  addToQueue,
  processQueue, // Expose for manual trigger if needed
  getQueueStatus, // Expose for UI display or debugging
  fetchAllUnidadesMedida,
};
