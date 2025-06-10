import { offlineStore } from '../stores/offlineStore';
import { apiService } from './apiService';
import { db, type PendingOperationDbo, type UnitOfMeasureDbo, type ClienteDbo, type DepartamentoDbo, type MunicipioDbo } from './dbService'; // Added MunicipioDbo
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

interface DepartamentoApiResponse {
  id: string;
  nombre: string;
  estado: boolean;
  disponibleOffline: boolean;
  fechaHoraModificacion?: string;
}

interface MunicipioApiResponse {
  id: string;
  nombre: string;
  departamentoId: string;
  disponibleOffline: boolean;
  fechaHoraModificacion?: string;
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
        case 'UnidadMedidas':
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
          break;

        case 'Clientes':
          switch (op.operationType) {
            case 'create':
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
              const clientToDelete = await db.clientes.where('numeroDocumento').equals(op.entityKey!).first();
              if (clientToDelete && clientToDelete.id) {
                result = await apiService.delete(`/api/clientes/${clientToDelete.id}`);
                if (result.isSuccess) {
                  success = true;
                }
              } else {
                console.warn(`Client with numeroDocumento ${op.entityKey} not found for deletion or missing server ID. Assuming already handled.`);
                success = true;
              }
              break;
          }
          break;

        case 'Departamentos':
          switch (op.operationType) {
            case 'create':
              result = await apiService.post<DepartamentoApiResponse>('/api/Departamentos', op.payload);
              if (result.isSuccess && result.value) {
                await db.departamentos.where('id').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion!),
                  estado: result.value.estado,
                });
                success = true;
              }
              break;
            case 'update':
              result = await apiService.put<DepartamentoApiResponse>(`/api/Departamentos/${op.entityKey}`, op.payload);
              if (result.isSuccess && result.value) {
                await db.departamentos.where('id').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion!),
                  nombre: result.value.nombre,
                  estado: result.value.estado,
                  disponibleOffline: result.value.disponibleOffline
                });
                success = true;
              }
              break;
            case 'delete':
              result = await apiService.delete(`/api/Departamentos/${op.entityKey}`);
              if (result.isSuccess) {
                success = true;
              }
              break;
          }
          break;

        case 'Municipios': // New logic for Municipios
          switch (op.operationType) {
            case 'create':
              // op.payload is { id, nombre, departamentoId, disponibleOffline }
              // op.entityKey is municipio.id
              result = await apiService.post<MunicipioApiResponse>('/api/Municipios', op.payload);
              if (result.isSuccess && result.value) {
                await db.municipios.where('id').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion!) // Add null check if needed
                  // Other fields like nombre, departamentoId, disponibleOffline are set by client
                  // API might not return them all, or they might not need updating if client is source of truth for them post-creation
                });
                success = true;
              }
              break;
            case 'update':
              // op.payload is { nombre, departamentoId, disponibleOffline }
              // op.entityKey is municipio.id
              result = await apiService.put<MunicipioApiResponse>(`/api/Municipios/${op.entityKey}`, op.payload);
              if (result.isSuccess && result.value) {
                await db.municipios.where('id').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion!), // Add null check if needed
                  nombre: result.value.nombre,
                  departamentoId: result.value.departamentoId,
                  disponibleOffline: result.value.disponibleOffline
                });
                success = true;
              }
              break;
            case 'delete':
              // op.entityKey is municipio.id
              result = await apiService.delete(`/api/Municipios/${op.entityKey}`);
              if (result.isSuccess) {
                // Local deletion is handled by municipioStore.
                success = true;
              }
              break;
          }
          break; // End of case 'Municipios'

        default:
          console.warn(`Unknown entity type in sync queue: ${op.entityName}`);
          break;
      }

      if (success) {
        await db.pendingOperations.delete(op.opId!);
        toastStore.addToast(`Sincronizado: ${op.entityName} ${op.operationType}`, 'success', 1500);
      } else {
        const errorMessages = result?.errors?.join(', ') || 'Error desconocido durante la operación de sincronización.';
        throw new Error(errorMessages);
      }
    } catch (error: any) {
      console.error(`Sync error for ${op.entityName} ${op.operationType} (ID: ${op.opId}):`, error);
      const currentAttempts = op.attempts || 0;
      const newStatus = currentAttempts >= MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';

      await db.pendingOperations.update(op.opId!, {
        status: newStatus,
      });
      toastStore.addToast(`Error sincronizando ${op.entityName}. Intentos: ${currentAttempts}.`, 'warning');
    }
  }
};

// Estado de la cola
const getQueueStatus = async () => {
  const pending = await db.pendingOperations.where('status').equals('pending').count();
  const failed = await db.pendingOperations.where('status').equals('failed').count();
  return { pending, failed };
};

offlineStore.subscribe(async (state) => {
  if (!state.isOffline) {
    await processQueue();
  }
});

export const syncService = {
  addToQueue,
  processQueue,
  getQueueStatus,
};
