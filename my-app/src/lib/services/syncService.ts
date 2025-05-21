import { offlineStore } from '../stores/offlineStore';
import { apiService, ApiError } from './apiService';
import { db, type PendingOperationDbo, type UnitOfMeasureDbo } from './dbService'; // Import Dexie db instance and DBO types
import { get } from 'svelte/store';
import { toastStore } from '../stores/toastStore'; // For notifications

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

const processQueue = async (): Promise<void> => {
  if (get(offlineStore).isOffline) {
    console.log('SyncService: Offline, not processing queue.');
    return;
  }

  const pendingOps = await db.pendingOperations
    .where('status').equals('pending')
    .or('status').equals('failed') // Also retry 'failed' ops that are not past MAX_RETRY_ATTEMPTS
    .filter(op => (op.attempts || 0) < MAX_RETRY_ATTEMPTS)
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

      switch (op.operationType) {
        case 'create':
          result = await apiService.post<any>(`/${op.entityName}`, op.payload); // Assuming entityName matches API endpoint path
          if (result.ok && result.value) {
            // Update local Dexie store with server response (especially server-assigned ID)
            if (op.entityName === 'unitsOfMeasure') { // Handle specific entities
              const serverUnit = result.value as UnitOfMeasureDbo; // This assumes result.value *is* UnitOfMeasureDbo
                                                                    // If it's just { id: string }, adjust accordingly.
              // op.entityKey should be the 'codigo' used to find the local record
              // or op.payload.offlineId if that was used as a temporary key
              // Ensure op.payload has 'codigo' if op.entityKey is not reliably set for creates.
              const keyToSearch = op.entityKey || op.payload.codigo;
              if (!keyToSearch) {
                  console.error(`SyncService: 'codigo' or 'entityKey' missing for create operation opId: ${op.opId} for entity ${op.entityName}`);
                  await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
                  continue;
              }
              const localUnit = await db.unitsOfMeasure.where('codigo').equals(keyToSearch).first();
              if (localUnit && localUnit.localId) {
                await db.unitsOfMeasure.update(localUnit.localId, {
                  id: serverUnit.id, // Server ID
                  sincronizado: true,
                  fechaModificacion: new Date(), // Or use server's date
                  // other fields from serverUnit if applicable
                });
                 console.log(`Synced create for unitsOfMeasure ${keyToSearch}, server ID: ${serverUnit.id}`);
              } else {
                 // If not found by codigo, maybe it was deleted locally before sync? Or error in key.
                 console.warn(`Local unit with codigo ${keyToSearch} not found for sync update after create.`);
              }
            }
            // Add more entity-specific handlers here
            success = true;
          }
          break;
        case 'update':
          // entityKey must exist for an update
          if (!op.entityKey) {
            console.error(`SyncService: entityKey missing for update operation opId: ${op.opId}`);
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() }); // Mark as failed
            continue; // next operation
          }
          result = await apiService.put<any>(`/${op.entityName}/${op.entityKey}`, op.payload); // e.g. /unitsOfMeasure/KG
          if (result.ok) {
            if (op.entityName === 'unitsOfMeasure') {
              const localUnit = await db.unitsOfMeasure.where('codigo').equals(op.entityKey).first();
              if (localUnit && localUnit.localId) {
                await db.unitsOfMeasure.update(localUnit.localId, {
                  sincronizado: true,
                  fechaModificacion: new Date(), // Or use server's date
                  // Potentially update other fields from result.value if response contains the full entity
                  ...(result.value || {}) 
                });
                console.log(`Synced update for unitsOfMeasure ${op.entityKey}`);
              }
            }
            // Add more entity-specific handlers here
            success = true;
          }
          break;
        case 'delete':
          if (!op.entityKey) {
            console.error(`SyncService: entityKey missing for delete operation opId: ${op.opId}`);
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
            continue;
          }
          result = await apiService.delete<void>(`/${op.entityName}/${op.entityKey}`);
          if (result.ok) {
            // If successful, the item should have already been removed from local Dexie table by the store action.
            // Or, remove it here if store logic keeps it until sync confirmation.
            // For unitsOfMeasure, if it was optimistically removed from UI store, also remove from Dexie here.
             if (op.entityName === 'unitsOfMeasure') {
                const localUnit = await db.unitsOfMeasure.where('codigo').equals(op.entityKey).first();
                if (localUnit && localUnit.localId) {
                    await db.unitsOfMeasure.delete(localUnit.localId);
                    console.log(`Hard deleted unitsOfMeasure ${op.entityKey} from local Dexie after sync.`);
                }
             }
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
        toastStore.addToast(`${op.entityName} (key: ${op.entityKey}) synced successfully.`, 'success', 2000);
      } else {
        const errorMsg = result?.error?.message || 'Unknown error during sync.';
        console.error(`SyncService: Failed to process opId ${op.opId} (${op.operationType} ${op.entityName} ${op.entityKey}): ${errorMsg}`);
        toastStore.addToast(`Failed to sync ${op.entityName} (key: ${op.entityKey}). Will retry.`, 'warning', 3000);
        // Update status based on error type or retry attempts
        const currentAttempts = (op.attempts || 0); // attempts already incremented for this run
        if (result?.error instanceof ApiError && (result.error.status >= 400 && result.error.status < 500 && result.error.status !== 401 && result.error.status !== 403)) {
            // Non-transient client error, don't retry indefinitely
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
             toastStore.addToast(`Sync for ${op.entityName} ${op.entityKey} failed (client error). Check data.`, 'error', 5000);
        } else if (currentAttempts >= MAX_RETRY_ATTEMPTS) {
            await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
            toastStore.addToast(`Sync for ${op.entityName} ${op.entityKey} failed after ${MAX_RETRY_ATTEMPTS} attempts.`, 'error', 5000);
        } else {
            // Transient error or server error, keep as 'pending' for next retry cycle
             await db.pendingOperations.update(op.opId, { status: 'pending', lastAttempt: new Date() }); // Keep attempts count
        }
      }
    } catch (error) {
      console.error(`SyncService: General error processing opId ${op.opId}:`, error);
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
offlineStore.subscribe(state => {
  if (firstRun) {
      firstRun = false;
      if (!state.isOffline) { // If online on first load, try to process.
          console.log('SyncService: App initialized as online, attempting to process queue.');
          setTimeout(processQueue, 1000); // Initial delay
      }
      return;
  }
  if (!state.isOffline) {
    console.log('SyncService: Application is now online. Attempting to process queue.');
    toastStore.addToast('Back online. Starting data synchronization.', 'info');
    setTimeout(processQueue, 1000); // Delay slightly to allow network to stabilize
  } else {
    console.log('SyncService: Application is now offline. Queue processing paused.');
    toastStore.addToast('Offline. Synchronization paused.', 'warning');
  }
});

export const syncService = {
  addToQueue,
  processQueue, // Expose for manual trigger if needed
  getQueueStatus, // Expose for UI display or debugging
};
