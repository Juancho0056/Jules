import { offlineStore } from '../stores/offlineStore';
import { apiService, ApiError } from './apiService'; // ApiError might still be used for status code checks
import { db, type PendingOperationDbo, type UnitOfMeasureDbo, type SaleDbo } from './dbService'; // Added SaleDbo
import { get } from 'svelte/store'; // Para leer el valor actual de un store si es necesario fuera de un componente Svelte
import { toastStore } from '../stores/toastStore';
import type { CreateUnidadMedidaCommand, UpdateUnidadMedidaCommand, UnidadMedida } from '$lib/types/unidadMedida';

// Importar stores y funciones de syncStore
import { syncQueueStatus, lastSyncAttempt, lastSuccessfulSync, isSyncing } from '../stores/syncStore';

// Constantes para el backoff exponencial
const BASE_DELAY_MS = 3000; // 3 segundos
const EXPONENTIAL_FACTOR = 2;
const MAX_BACKOFF_DELAY_MS = 5 * 60 * 1000; // 5 minutos
const JITTER_FACTOR = 0.3; // 30% de jitter para evitar थundering herd

// Función auxiliar para actualizar el store syncQueueStatus
const updateSyncQueueStatusFromService = async () => {
  const currentStatus = await getQueueStatus();
  syncQueueStatus.set(currentStatus);
};

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
      timestamp: new Date(), // Hora de creación original
      status: 'pending',
      attempts: 0,
      lastAttempt: null,
      nextAttemptTimestamp: new Date(), // Intentar procesar inmediatamente
    };
    console.log('Adding operation to queue:', operation);
    const opId = await db.pendingOperations.add(operation);
    console.log(`Operation for ${entityName} (${operationType}, key: ${entityKey || 'N/A'}) added to Dexie queue with opId: ${opId}`);
    toastStore.addToast(`${entityName} ${operationType} operation queued.`, 'info', 2000);
    // Trigger queue processing if online, but not too aggressively.
    // processQueue might be better triggered by online status change or specific UI actions.
    if (!get(offlineStore).isOffline) {
        // isSyncing.set(true); // Considerar si addToQueue por sí solo debe activar isSyncing globalmente
        processQueue(); // Attempt to process immediately if online
    }
    await updateSyncQueueStatusFromService();
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

  isSyncing.set(true);
  lastSyncAttempt.set(new Date());
  await updateSyncQueueStatusFromService();

  const now = new Date();
  const pendingOps = await db.pendingOperations
    .where('status').anyOf('pending', 'failed') // 'failed' para reintentables
    .filter(op =>
      ((op.attempts || 0) < MAX_RETRY_ATTEMPTS || ignoreRetryLimit) &&
      (op.nextAttemptTimestamp == null || op.nextAttemptTimestamp <= now)
    )
    .sortBy('timestamp'); // Opcionalmente sortBy('nextAttemptTimestamp') si se prefiere

  if (pendingOps.length === 0) {
    console.log('SyncService: Queue is empty or all items have reached max retry attempts.');
    isSyncing.set(false); // No operations to process
    await updateSyncQueueStatusFromService(); // Asegurar que el status de la cola (vacía) se refleje
    return;
  }

  toastStore.addToast(`Processing ${pendingOps.length} queued operations...`, 'info', 2000);
  console.log('SyncService: Processing offline queue from Dexie...', pendingOps);

  for (const op of pendingOps) {
    if (!op.opId) continue; // Should not happen with Dexie auto-increment

    try {
      // Incrementar attempts y actualizar lastAttempt ANTES de procesar la operación
      const currentOpAttempts = (op.attempts || 0) + 1;
      await db.pendingOperations.update(op.opId, { 
        status: 'processing', 
        attempts: currentOpAttempts, // Incrementar aquí
        lastAttempt: new Date(), // Fecha del intento actual
        // nextAttemptTimestamp no se modifica aquí, solo si falla
      });
      // op ahora tiene el valor original de attempts, usamos currentOpAttempts para la lógica de reintento

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
          } else if (op.entityName === 'sales') {
            const salePayload = op.payload as SaleDbo; // El payload es la venta completa
            // Asumimos que la API espera un POST a /sales o /api/sales
            // El backend debe ser idempotente respecto al salePayload.uuid
            // Asegurarse que la URL es correcta, ej: `${apiPathPrefix}/sales`
            result = await apiService.post<SaleDbo>(`/sales`, salePayload);
            if (result.isSuccess && result.value) {
              const syncedSale = result.value; // El backend podría devolver la venta confirmada/enriquecida
              // Actualizar el estado de la venta local
              // op.entityKey debería ser el UUID de la venta
              const localSale = await db.sales.where('uuid').equals(op.entityKey!).first();
              if (localSale && localSale.localId) {
                await db.sales.update(localSale.localId, {
                  sincronizado: true,
                  status: 'synced',
                  isDirty: false,
                  fechaModificacion: new Date(syncedSale.fechaModificacion || Date.now()), // Usar fecha del servidor si está disponible
                  // Aquí se podrían actualizar otros campos si el backend los modifica/añade (ej. un ID de servidor diferente al UUID)
                });
                console.log(`Synced create for Sale ${op.entityKey}`);
              } else {
                 console.warn(`Local sale with uuid ${op.entityKey} not found for sync update after create.`);
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
        // Usar currentOpAttempts (que es el número de intento que acaba de fallar)
        if (currentOpAttempts >= MAX_RETRY_ATTEMPTS) {
            await db.pendingOperations.update(op.opId, {
                status: 'failed', // Falla permanentemente
                lastAttempt: new Date(), // Se actualiza con la fecha del último intento (ya hecho arriba)
                // nextAttemptTimestamp: null // Opcional: limpiar para no seleccionarlo más
            });
            console.error(`SyncService: Operation opId ${op.opId} (${op.operationType} ${op.entityName}) failed permanently after ${currentOpAttempts} attempts. Error: ${errorMsg}`);
            toastStore.addToast(`Sync for ${op.entityName} (key: ${op.entityKey || op.payload?.codigo}) failed permanently after ${currentOpAttempts} attempts.`, 'error', 5000);
        } else {
            let backoffDelay = BASE_DELAY_MS * Math.pow(EXPONENTIAL_FACTOR, currentOpAttempts - 1);
            const jitter = (Math.random() - 0.5) * backoffDelay * JITTER_FACTOR; // Jitter puede ser +/-
            backoffDelay = Math.max(BASE_DELAY_MS / 2, Math.min(backoffDelay + jitter, MAX_BACKOFF_DELAY_MS)); // Asegurar un mínimo y respetar el máximo

            const nextTry = new Date(Date.now() + backoffDelay);

            await db.pendingOperations.update(op.opId, {
                status: 'pending', // Marcar como pendiente para reintento
                // 'attempts' ya fue incrementado
                lastAttempt: new Date(), // Fecha del intento actual (ya hecho arriba)
                nextAttemptTimestamp: nextTry,
            });
            console.log(`SyncService: Operation opId ${op.opId} (${op.operationType} ${op.entityName}) failed on attempt ${currentOpAttempts}. Will retry attempt ${currentOpAttempts + 1} after ${nextTry.toISOString()}`);
            toastStore.addToast(`Failed to sync ${op.entityName} (key: ${op.entityKey || op.payload?.codigo}). Will retry (attempt ${currentOpAttempts}).`, 'warning', 3000);
        }
      }
    } catch (error: any) { // Catch de errores generales durante el procesamiento de una operación
      console.error(`SyncService: General error processing opId ${op.opId} (${op.operationType} ${op.entityName}):`, error.message || error);
      // Asumir que este error también es reintentable con backoff, usando currentOpAttempts que se definió al inicio del try
      // Esto podría necesitar una lógica más fina si ciertos errores no deben reintentarse.
      const attemptsForCatch = op.attempts || currentOpAttempts || 1; // Usar el 'attempts' ya incrementado si está disponible en op, o el currentOpAttempts

      if (op.opId) { // Asegurar opId
        if (attemptsForCatch >= MAX_RETRY_ATTEMPTS) {
          await db.pendingOperations.update(op.opId, { status: 'failed', lastAttempt: new Date() });
          toastStore.addToast(`Critical error syncing ${op.entityName} (key: ${op.entityKey || op.payload?.codigo}). Failed permanently.`, 'error', 5000);
        } else {
          let backoffDelay = BASE_DELAY_MS * Math.pow(EXPONENTIAL_FACTOR, attemptsForCatch - 1);
          const jitter = (Math.random() - 0.5) * backoffDelay * JITTER_FACTOR;
          backoffDelay = Math.max(BASE_DELAY_MS / 2, Math.min(backoffDelay + jitter, MAX_BACKOFF_DELAY_MS));
          const nextTry = new Date(Date.now() + backoffDelay);
          await db.pendingOperations.update(op.opId, {
            status: 'pending',
            lastAttempt: new Date(),
            nextAttemptTimestamp: nextTry
            // 'attempts' ya fue incrementado
          });
          toastStore.addToast(`Critical error syncing ${op.entityName} (key: ${op.entityKey || op.payload?.codigo}). Will retry. Attempt ${attemptsForCatch}.`, 'error', 3000);
        }
      } else {
        toastStore.addToast(`Critical error syncing an operation without opId. Check console.`, 'error');
      }
      // Actualización granular después de cada operación (opcional, pero puede ser útil)
      await updateSyncQueueStatusFromService();
    }
  } // Fin del bucle for

  await updateSyncQueueStatusFromService(); // Actualizar después del bucle completo

  // Lógica de re-disparo y estado final de sincronización (sin cambios directos aquí, pero el filtrado inicial de pendingOps es clave)
  const remainingProcessable = await db.pendingOperations
      .where('status').anyOf('pending', 'failed')
      .filter(op =>
        ((op.attempts || 0) < MAX_RETRY_ATTEMPTS) &&
        (op.nextAttemptTimestamp == null || op.nextAttemptTimestamp <= new Date()) // Re-evaluar con 'now'
      )
      .count();

  const anyFutureRetries = await db.pendingOperations
      .where('status').anyOf('pending', 'failed')
      .filter(op => ((op.attempts || 0) < MAX_RETRY_ATTEMPTS) && (op.nextAttemptTimestamp != null && op.nextAttemptTimestamp > new Date()))
      .count();

  if (remainingProcessable > 0 && !get(offlineStore).isOffline) {
      console.log("SyncService: Re-triggering processQueue for immediately processable items.");
      setTimeout(() => processQueue(ignoreRetryLimit), 1000); // Procesar inmediatamente los que ya están listos
  } else if (anyFutureRetries > 0 && !get(offlineStore).isOffline) {
      // Si no hay nada procesable ahora, pero hay reintentos futuros, programar un re-chequeo.
      // Esto podría ser más inteligente calculando el próximo nextAttemptTimestamp más cercano.
      // Por ahora, un chequeo periódico es más simple.
      console.log(`SyncService: Queue has future retries. Will check again in ${BASE_DELAY_MS}ms.`);
      setTimeout(() => processQueue(ignoreRetryLimit), BASE_DELAY_MS); // Reintentar después del delay base
      isSyncing.set(false); // No está activamente sincronizando ahora, pero lo hará.
  } else {
      isSyncing.set(false);
      if (pendingOps.length > 0 && !get(offlineStore).isOffline) { // Si se procesaron operaciones en este ciclo
          toastStore.addToast('All queued operations processed or max retries reached.', 'info');
      }
  }

  const currentStatus = await getQueueStatus(); // Re-obtener el estado final
  syncQueueStatus.set(currentStatus);

  if (currentStatus.pending === 0 && currentStatus.failedRetryable === 0) {
    if (currentStatus.failedPermanent === 0 && pendingOps.length > 0) { // Solo si se procesó algo y todo OK
      lastSuccessfulSync.set(new Date());
    }
  }
  // isSyncing se maneja arriba basado en si hay reintentos inmediatos o futuros.
};


// Get current queue status (counts)
// Modificado para contar failedRetryable basado en nextAttemptTimestamp también
const getQueueStatus = async () => {
  const now = new Date();
  const allPendingOrFailedOps = await db.pendingOperations
    .where('status').anyOf('pending', 'failed')
    .toArray();

  let pendingCount = 0;
  let failedRetryableCount = 0;
  let failedPermanentCount = 0;

  for (const op of allPendingOrFailedOps) {
    const attempts = op.attempts || 0;
    if (attempts >= MAX_RETRY_ATTEMPTS) {
      failedPermanentCount++;
    } else { // Menos de MAX_RETRY_ATTEMPTS
      if (op.status === 'failed' || (op.nextAttemptTimestamp != null && op.nextAttemptTimestamp > now)) {
        // Si está marcada como 'failed' (y reintentable) O si es 'pending' pero su próximo intento es futuro
        failedRetryableCount++;
      } else { // status 'pending' y lista para ser procesada (nextAttemptTimestamp <= now o null)
        pendingCount++;
      }
    }
  }

  return {
    pending: pendingCount, // Operaciones listas para procesar ahora
    failedRetryable: failedRetryableCount, // Operaciones que esperan un reintento futuro o marcadas como 'failed' pero reintentables
    failedPermanent: failedPermanentCount,
    total: allPendingOrFailedOps.length, // Total de operaciones no borradas de la cola
  };
};
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
  isSyncing.set(true);
  lastSyncAttempt.set(new Date());
  // No es necesario llamar a updateSyncQueueStatusFromService() aquí si esta función es parte de un flujo mayor
  // que ya maneja el estado de la cola (ej. processQueue). Si es standalone, sí.

  console.log('SyncService: Fetching Unidades de Medida from server...');
  let lastSyncTimestamp: string | undefined;
  try {
    const lastSyncEntry = await db.appConfig.get('lastSync_unitsOfMeasure');
    lastSyncTimestamp = lastSyncEntry?.value as string | undefined;
    if (lastSyncTimestamp) {
      console.log(`SyncService: Last sync timestamp for unitsOfMeasure is ${lastSyncTimestamp}`);
    } else {
      console.log('SyncService: No last sync timestamp found for unitsOfMeasure. Full sync will be performed.');
    }
  } catch (error) {
    console.warn('SyncService: Could not retrieve lastSync_unitsOfMeasure from appConfig. Proceeding with full sync.', error);
    // No need to re-throw, just proceed without a timestamp
  }

  let apiUrl = '/UnidadMedidas/all';
  if (lastSyncTimestamp) {
    apiUrl = `/UnidadMedidas/all?lastSyncTimestamp=${encodeURIComponent(lastSyncTimestamp)}`;
  }

  const result = await apiService.get<UnidadMedida[]>(apiUrl);

  if (result.isSuccess && result.value) {
    const serverUnits = result.value;
    toastStore.addToast(`Fetched ${serverUnits.length} units from server. Updating local store...`, 'info', 3000);
    try {
      if (serverUnits.length === 0 && lastSyncTimestamp) {
        console.log('SyncService: No new or updated units received from server since last sync.');
        // Still update the timestamp to keep it current, even if no data changed.
        // Or, only update if the server explicitly sends a new sync timestamp.
        // For now, we'll update it to signify a successful communication.
        await db.appConfig.put({ key: 'lastSync_unitsOfMeasure', value: new Date().toISOString() });
        toastStore.addToast('Units are already up-to-date.', 'success');
        return true;
      }

      for (const serverUnit of serverUnits) {
        console.log(`SyncService: Processing server unit ${serverUnit.codigo}...`);
        const existingLocalUnit = await db.unitsOfMeasure.where('codigo').equals(serverUnit.codigo).first();

        const unitDbo: UnitOfMeasureDbo = {
          localId: existingLocalUnit?.localId, // Preserve localId if exists for update
          codigo: serverUnit.codigo,           // Server's 'Id' is our 'codigo' (business key)
          id: serverUnit.codigo,               // Store server's 'Id' also in 'id' field.
          nombre: serverUnit.nombre,
          abreviatura: serverUnit.abreviatura,
          orden: serverUnit.orden,
          estado: serverUnit.estado,
          sincronizado: true,
          fechaModificacion: new Date(serverUnit.fechaHoraModificacion || Date.now()),
          offlineId: existingLocalUnit?.offlineId || null
        };
        await db.unitsOfMeasure.put(unitDbo);
      }

      // After successful processing of all fetched units
      await db.appConfig.put({ key: 'lastSync_unitsOfMeasure', value: new Date().toISOString() });
      console.log(`SyncService: Successfully updated local Unidades de Medida. New lastSync_unitsOfMeasure: ${new Date().toISOString()}`);
      toastStore.addToast('Local units updated successfully.', 'success');
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
    isSyncing.set(false); // Asegurarse de que isSyncing se ponga a false en caso de error
    // await updateSyncQueueStatusFromService(); // Opcional, dependiendo si cambia el estado de la cola
    return false;
  }
  // Considerar si un fetchAll exitoso debe actualizar lastSuccessfulSync
  // Por ahora, solo processQueue lo hace cuando la cola se vacía.
  isSyncing.set(false);
  // await updateSyncQueueStatusFromService(); // Opcional
  return true; // Asumiendo que si no hay error, el resultado fue true o la función retornó antes.
};

const CHECK_CLEANUP_INTERVAL_DAYS = 7; // Limpiar cada 7 días
const RETENTION_PERIOD_DAYS = 90; // Mantener datos por 90 días sin acceso

const cleanupOldUnitsOfMeasure = async (retentionDays: number): Promise<number> => {
  if (retentionDays <= 0) {
    console.warn('cleanupOldUnitsOfMeasure: retentionDays must be positive.');
    return 0;
  }
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let deletedCount = 0;
  try {
    const itemsToDelete = await db.unitsOfMeasure
      .where('sincronizado').equals(1) // Dexie usa 1 para true en índices
      .and(item =>
        (item.lastAccessed != null && item.lastAccessed < cutoffDate) ||
        (item.lastAccessed == null && item.fechaModificacion != null && new Date(item.fechaModificacion) < cutoffDate)
      )
      .toArray();

    if (itemsToDelete.length > 0) {
      // Asegurarse de que localId no sea null o undefined antes de añadirlo al array
      const keysToDelete = itemsToDelete.map(item => item.localId).filter(id => id != null) as number[];
      if (keysToDelete.length > 0) {
        await db.unitsOfMeasure.bulkDelete(keysToDelete);
        deletedCount = keysToDelete.length;
        console.log(`SyncService: Cleaned up ${deletedCount} old UnitOfMeasureDbo items not accessed or modified in ${retentionDays} days.`);
        toastStore.addToast(`Limpiadas ${deletedCount} unidades de medida antiguas.`, 'info', 3000);
      } else {
        console.log(`SyncService: No valid keys to delete after filtering items.`);
      }
    } else {
      console.log(`SyncService: No old UnitOfMeasureDbo items to clean up based on ${retentionDays} days retention.`);
    }
    await db.appConfig.put({ key: 'lastCleanup_unitsOfMeasure', value: new Date().toISOString() });
    return deletedCount;
  } catch (error) {
    console.error('SyncService: Error during cleanupOldUnitsOfMeasure:', error);
    toastStore.addToast('Error durante la limpieza de datos antiguos.', 'error');
    return 0;
  }
};

async function tryUnitsOfMeasureCleanup() {
  const lastCleanupEntry = await db.appConfig.get('lastCleanup_unitsOfMeasure');
  let shouldCleanup = true;
  if (lastCleanupEntry && typeof lastCleanupEntry.value === 'string') {
    const lastCleanupDate = new Date(lastCleanupEntry.value);
    const daysSinceLastCleanup = (new Date().getTime() - lastCleanupDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastCleanup < CHECK_CLEANUP_INTERVAL_DAYS) {
      shouldCleanup = false;
    }
  }
  if (shouldCleanup) {
    console.log(`SyncService: Performing scheduled cleanup of UnitOfMeasureDbo older than ${RETENTION_PERIOD_DAYS} days.`);
    await cleanupOldUnitsOfMeasure(RETENTION_PERIOD_DAYS);
  } else {
    console.log(`SyncService: Scheduled cleanup for UnitOfMeasureDbo not due yet. Last cleanup was on ${lastCleanupEntry?.value}`);
  }
}


if (typeof window !== 'undefined') {
  offlineStore.subscribe(async state => { // Hacer la subscripción async para poder usar await dentro
    if (firstRun) {
      firstRun = false;
      if (!state.isOffline) {
        console.log('SyncService: App initialized as online, attempting to process queue and check for cleanup.');
        await updateSyncQueueStatusFromService(); // Actualizar estado inicial de la cola
        setTimeout(() => processQueue(false), 1000); // false para ignoreRetryLimit
        setTimeout(tryUnitsOfMeasureCleanup, 2000); // Dar un pequeño delay
      } else {
        await updateSyncQueueStatusFromService(); // Reflejar estado offline inicial si es el caso
      }
      return;
    }
    if (!state.isOffline) {
      console.log('SyncService: Application is now online. Attempting to process queue.');
      toastStore.addToast('Back online. Starting data synchronization.', 'info');
      await updateSyncQueueStatusFromService(); // Actualizar antes de procesar
      setTimeout(() => processQueue(false), 1000);
    } else {
      console.log('SyncService: Application is now offline. Queue processing paused.');
      isSyncing.set(false); // Detener indicador de sincronización si se va offline
      toastStore.addToast('Offline. Synchronization paused.', 'warning');
    }
  });
}
export const syncService = {
  addToQueue,
  processQueue, // Expose for manual trigger if needed
  getQueueStatus, // Expose for UI display or debugging
  fetchAllUnidadesMedida,
  cleanupOldUnitsOfMeasure, // Exportar para uso externo si es necesario
  // tryUnitsOfMeasureCleanup, // Generalmente no es necesario exportar la función de intento automático
};
