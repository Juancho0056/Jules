import { offlineStore } from '../stores/offlineStore';
import { apiService } from './apiService';
import { db, type PendingOperationDbo, type UnitOfMeasureDbo, type ClienteDbo } from './dbService'; // Added ClienteDbo
import { get } from 'svelte/store';
import { toastStore } from '../stores/toastStore';
import type { CreateUnidadMedidaCommand, UpdateUnidadMedidaCommand, UnidadMedida } from '$lib/types/unidadMedida';

// TODO: Define this properly based on actual API response structure for Clientes
interface ClienteApiResponse {
  id: number; // Server ID
  fechaHoraModificacion: string;
  // Potentially all fields of a client
  [key: string]: any;
}

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

      switch (op.entityName) {
        case 'UnidadMedidas': // Existing logic for UnidadMedidas
          switch (op.operationType) {
            case 'create':
              result = await apiService.post<UnidadMedida>(`/UnidadMedidas`, op.payload);
              if (result.isSuccess && result.value) {
                await db.unitsOfMeasure.where('codigo').equals(op.payload.codigo).modify({
                  id: result.value.codigo, // Assuming API returns 'codigo' as 'id' for UoM
                  sincronizado: true,
                  disponibleOffline: true, // Ensure this is set as per UoM logic
                  fechaModificacion: new Date(result.value.fechaHoraModificacion)
                });
                success = true;
              }
              break;

            case 'update':
              // Ensure op.entityKey is the server ID (codigo for UoM)
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
              // Ensure op.entityKey is the server ID (codigo for UoM)
              result = await apiService.delete(`/UnidadMedidas/${op.entityKey}`);
              if (result.isSuccess) {
                // Local deletion is typically handled by the store, but can be confirmed here
                await db.unitsOfMeasure.where('codigo').equals(op.entityKey!).delete();
                success = true;
              }
              break;
          }
          break; // End of case 'UnidadMedidas'

        case 'Clientes': // New logic for Clientes
          switch (op.operationType) {
            case 'create':
              // op.payload is CrearClienteCommand equivalent
              result = await apiService.post<ClienteApiResponse>(`/api/clientes`, op.payload);
              if (result.isSuccess && result.value) {
                const serverClient = result.value;
                await db.clientes.where('numeroDocumento').equals(op.entityKey!).modify({
                  id: serverClient.id,
                  sincronizado: true,
                  fechaModificacion: new Date(serverClient.fechaHoraModificacion)
                });
                success = true;
              }
              break;

            case 'update':
              // op.payload is ActualizarClienteCommand equivalent, includes server id
              if (!op.payload.id) {
                throw new Error('Client update operation missing server ID in payload.');
              }
              result = await apiService.put<ClienteApiResponse>(`/api/clientes/${op.payload.id}`, op.payload);
              if (result.isSuccess && result.value) {
                const serverClient = result.value;
                await db.clientes.where('numeroDocumento').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(serverClient.fechaHoraModificacion)
                });
                success = true;
              }
              break;

            case 'delete':
              // op.entityKey is numeroDocumento. We need server ID.
              const clientToDelete = await db.clientes.where('numeroDocumento').equals(op.entityKey!).first();
              if (clientToDelete && clientToDelete.id) {
                result = await apiService.delete(`/api/clientes/${clientToDelete.id}`);
                if (result.isSuccess) {
                  // Local deletion is handled by clienteStore.
                  // Optionally, ensure it's deleted: await db.clientes.where('numeroDocumento').equals(op.entityKey!).delete();
                  success = true;
                }
              } else {
                // Client not found locally or has no server ID.
                // If it was already deleted locally and this is a retry, consider it success.
                // Or if it was created offline and deleted before first sync.
                console.warn(`Client with numeroDocumento ${op.entityKey} not found for deletion or missing server ID. Assuming already handled.`);
                success = true; // Mark as success to remove from queue
              }
              break;
          }
          break; // End of case 'Clientes'

        default:
          console.warn(`Unknown entity type in sync queue: ${op.entityName}`);
          // Optionally mark as failed or leave for manual inspection
          // For now, let it retry up to MAX_RETRY_ATTEMPTS
          break;
      }

      if (success) {
        await db.pendingOperations.delete(op.opId!);
        toastStore.addToast(`Sincronizado: ${op.entityName} ${op.operationType}`, 'success', 1500);
      } else {
        // Ensure result has errors, or provide a generic one
        const errorMessages = result?.errors?.join(', ') || 'Error desconocido durante la operación de sincronización.';
        throw new Error(errorMessages);
      }
    } catch (error: any) {
      console.error(`Sync error for ${op.entityName} ${op.operationType} (ID: ${op.opId}):`, error);
      const currentAttempts = op.attempts || 0; // attempts has been incremented already for this run
      const newStatus = currentAttempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';

      await db.pendingOperations.update(op.opId!, {
        status: newStatus,
        // lastAttempt is already updated
      });
      toastStore.addToast(`Error sincronizando ${op.entityName}. Intentos: ${currentAttempts}.`, 'warning');
    }
  }
};

// Sincronización incremental de unidades - This function might be deprecated if each store handles its own sync.
const fetchUnidadesIncremental = async () => {
  const lastSync = await db.syncIndex.get('unitsOfMeasure');
  const query = lastSync ? `actualizadoDesde=${lastSync.lastSyncedAt.toISOString()}` : '';
  // Assuming endpoint for UoM is /UnidadMedidas
  const response = await apiService.get<UnidadMedida[]>(`/UnidadMedidas?offline=true&${query}`);

  if (response.isSuccess && response.value) {
    const now = new Date();
    for (const unidad of response.value) {
      const existing = await db.unitsOfMeasure.where('codigo').equals(unidad.codigo).first();
      const uomDbo: UnitOfMeasureDbo = {
        localId: existing?.localId, // preserve localId if it exists
        id: unidad.codigo, // API uses 'codigo' as ID
        codigo: unidad.codigo,
        nombre: unidad.nombre,
        abreviatura: unidad.abreviatura,
        orden: unidad.orden,
        estado: unidad.estado,
        sincronizado: true,
        disponibleOffline: true, // Assuming true if fetched from this endpoint
        fechaModificacion: new Date(unidad.fechaHoraModificacion),
        ultimaConsulta: now,
      };
      await db.unitsOfMeasure.put(uomDbo);
    }
    await db.syncIndex.put({ tabla: 'unitsOfMeasure', lastSyncedAt: now });
    // toastStore.addToast(`Unidades sincronizadas incrementalmente.`, 'success'); // Store might handle this
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
    // if (initialRun) { // This logic might be handled by stores themselves
    //   initialRun = false;
    // }
    // fetchUnidadesIncremental(); // Removed as per instructions, stores handle their own fetching
    await processQueue();
  }
});

export const syncService = {
  addToQueue,
  processQueue,
  // fetchUnidadesIncremental, // Commented out as it's likely deprecated
  getQueueStatus,
};
