import { offlineStore } from '../stores/offlineStore';
import { apiService } from './apiService';
import {
    db,
    type PendingOperationDbo,
    type UnitOfMeasureDbo,
    type ClienteDbo,
    type DepartamentoDbo,
    type MunicipioDbo,
    type CampanaDbo, // Import CampanaDbo
    type CampanaProductoDescuentoDbo // Import CampanaProductoDescuentoDbo
} from './dbService';
import { get } from 'svelte/store';
import { toastStore } from '../stores/toastStore';
import type { CreateUnidadMedidaCommand, UpdateUnidadMedidaCommand, UnidadMedida } from '$lib/types/unidadMedida';
import type { TipoDescuento } from '$lib/types/campana';


// API Response Interfaces (basic definitions)
interface ClienteApiResponse {
  id: number;
  fechaHoraModificacion: string;
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

interface CampanaDetailApiResponse { // For POST /api/campanas-descuento and PUT /api/campanas-descuento/{id}
    id: number;
    nombre: string;
    descripcion?: string | null;
    fechaInicio: string;
    fechaFin?: string | null;
    fechaHoraModificacion: string; // Assuming server returns this
    // If the API returns the full list of products upon create/update header, define structure here
    // productos?: Array<{ productoId: number; tipoDescuento: TipoDescuento; valorDescuento: number; /* ... */ }>;
    [key: string]: any;
}

interface CampanaProductoApiResponse { // For POST/PUT on CampanaProductos
    // Define based on what the API returns for these operations
    // Often, it might just be a success status or the updated/created object
    campanaId: number;
    productoId: number;
    fechaHoraModificacion: string; // Assuming server returns this
    [key: string]: any;
}


const MAX_RETRY_ATTEMPTS = 3;

const addToQueue = async (
  entityName: string,
  operationType: 'create' | 'update' | 'delete' | 'createFull' | 'updateHeader' | 'add' | 'remove', // Extended operation types
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
      const now = new Date();

      switch (op.entityName) {
        case 'UnidadMedidas':
          // ... existing logic for UnidadMedidas ...
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
          // ... existing logic for Clientes ...
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
          // ... existing logic for Departamentos ...
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

        case 'Municipios':
          // ... existing logic for Municipios ...
          switch (op.operationType) {
            case 'create':
              result = await apiService.post<MunicipioApiResponse>('/api/Municipios', op.payload);
              if (result.isSuccess && result.value) {
                await db.municipios.where('id').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion!)
                });
                success = true;
              }
              break;
            case 'update':
              result = await apiService.put<MunicipioApiResponse>(`/api/Municipios/${op.entityKey}`, op.payload);
              if (result.isSuccess && result.value) {
                await db.municipios.where('id').equals(op.entityKey!).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion!),
                  nombre: result.value.nombre,
                  departamentoId: result.value.departamentoId,
                  disponibleOffline: result.value.disponibleOffline
                });
                success = true;
              }
              break;
            case 'delete':
              result = await apiService.delete(`/api/Municipios/${op.entityKey}`);
              if (result.isSuccess) {
                success = true;
              }
              break;
          }
          break;

        case 'Campanas':
          switch (op.operationType) {
            case 'createFull': // op.payload is CrearCampanaConProductosCommand
                               // op.entityKey is the offlineUuid
              result = await apiService.post<CampanaDetailApiResponse>('/api/campanas-descuento', op.payload);
              if (result.isSuccess && result.value) {
                const campanaServerId = result.value.id;
                const fechaModificacionServer = new Date(result.value.fechaHoraModificacion);

                const localCampana = await db.campanas.where('offlineUuid').equals(op.entityKey!).first();
                if (localCampana && localCampana.localId) {
                  await db.campanas.update(localCampana.localId, {
                    id: campanaServerId,
                    sincronizado: true,
                    fechaModificacion: fechaModificacionServer,
                    offlineUuid: null // Clear UUID
                  });
                  // Update associated products with the new campanaId (server ID)
                  await db.campanaProductoDescuentos
                    .where('campanaLocalId').equals(localCampana.localId)
                    .modify({
                      campanaId: campanaServerId,
                      sincronizado: true, // Assuming products are also synced by this parent op
                      fechaModificacion: fechaModificacionServer // Or use product-specific mod date if API returns it
                    });
                }
                success = true;
              }
              break;
            case 'updateHeader': // op.payload is ActualizarCampanaCommand (includes id)
                                 // op.entityKey is campanaServerId (string)
              result = await apiService.put<CampanaDetailApiResponse>(`/api/campanas-descuento/${op.entityKey}`, op.payload);
              if (result.isSuccess && result.value) {
                await db.campanas.where('id').equals(parseInt(op.entityKey!)).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion),
                  // Update other fields if API returns them and they should be synced back
                  nombre: result.value.nombre,
                  descripcion: result.value.descripcion,
                  fechaInicio: result.value.fechaInicio,
                  fechaFin: result.value.fechaFin,
                });
                success = true;
              }
              break;
          }
          break; // End of case 'Campanas'

        case 'CampanaProductos':
          switch (op.operationType) {
            case 'add': // op.payload is AgregarProductoCampanaCommand
                        // op.entityKey is campanaId_productoId
              result = await apiService.post<CampanaProductoApiResponse>('/api/campanas-descuento/agregar-producto', op.payload);
              if (result.isSuccess && result.value) {
                await db.campanaProductoDescuentos
                  .where('[campanaId+productoId]').equals([op.payload.campanaId, op.payload.productoId])
                  .modify({
                    sincronizado: true,
                    fechaModificacion: new Date(result.value.fechaHoraModificacion)
                  });
                success = true;
              }
              break;
            case 'update': // op.payload is ActualizarDescuentoCampanaCommand
                           // op.entityKey is campanaId_productoId
              result = await apiService.put<CampanaProductoApiResponse>('/api/campanas-descuento/actualizar-descuento', op.payload);
              if (result.isSuccess && result.value) {
                 await db.campanaProductoDescuentos
                  .where('[campanaId+productoId]').equals([op.payload.campanaId, op.payload.productoId])
                  .modify({
                    sincronizado: true,
                    fechaModificacion: new Date(result.value.fechaHoraModificacion),
                    // Sync back any changes from API response if necessary
                    tipoDescuento: result.value.tipoDescuento, // Example
                    valorDescuento: result.value.valorDescuento // Example
                  });
                success = true;
              }
              break;
            // TODO: Add 'remove' (delete) operation for CampanaProductos if API endpoint exists
          }
          break; // End of case 'CampanaProductos'

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
