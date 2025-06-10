import { offlineStore } from '../stores/offlineStore';
import { apiService } from './apiService';
import {
    db,
    type PendingOperationDbo,
    type UnitOfMeasureDbo,
    type ClienteDbo,
    type DepartamentoDbo,
    type MunicipioDbo,
    type CampanaDbo,
    type CampanaProductoDescuentoDbo,
    type ListaPrecioDbo, // Import ListaPrecioDbo
    type ListaPrecioProductoDbo // Import ListaPrecioProductoDbo
} from './dbService';
import { get } from 'svelte/store';
import { toastStore } from '../stores/toastStore';
import type { CreateUnidadMedidaCommand, UpdateUnidadMedidaCommand, UnidadMedida } from '$lib/types/unidadMedida';
import type { TipoDescuento } from '$lib/types/campana';


// API Endpoint Constants
const P_LISTAPRECIO_ENDPOINT = '/api/listas-precio';
const P_LISTAPRECIO_ADD_PRODUCT_ENDPOINT = '/api/listas-precio/agregar-producto';
const P_LISTAPRECIO_UPDATE_PRICE_ENDPOINT = '/api/listas-precio/actualizar-precio';
const P_LISTAPRECIO_REMOVE_PRODUCT_ENDPOINT = '/api/listas-precio/remover-producto';


// API Response Interfaces
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

interface CampanaDetailApiResponse {
    id: number;
    nombre: string;
    descripcion?: string | null;
    fechaInicio: string;
    fechaFin?: string | null;
    fechaHoraModificacion: string;
    [key: string]: any;
}

interface CampanaProductoApiResponse {
    campanaId: number;
    productoId: number;
    fechaHoraModificacion: string;
    tipoDescuento?: TipoDescuento; // Added from previous context, ensure API returns it if needed for sync
    valorDescuento?: number;     // Added from previous context
    [key: string]: any;
}

interface ListaPrecioApiResponse { // For POST /api/listas-precio
  id: number;
  nombre: string;
  descripcion?: string | null;
  fechaInicio: string;
  fechaFin?: string | null;
  disponibleOffline: boolean;
  // Assuming the createFull might return the full object including product stubs if any were part of the command
  // productos: { productoId: number; precio: number; fechaInicioPrecio?: string; }[];
  fechaHoraModificacion: string;
  [key: string]: any;
}

// For ListaPrecioProductos, often the response is just a success status or the updated item.
// Using 'any' for now if specific response structure for add/update/remove product price is not critical for sync logic beyond success.
type ListaPrecioProductoApiResponse = any;


const MAX_RETRY_ATTEMPTS = 3;

const addToQueue = async (
  entityName: string,
  operationType: 'create' | 'update' | 'delete' | 'createFull' | 'updateHeader' | 'add' | 'remove',
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
        // ... (cases for UnidadMedidas, Clientes, Departamentos, Municipios, Campanas, CampanaProductos remain unchanged) ...
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

        case 'Municipios':
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
            case 'createFull':
              result = await apiService.post<CampanaDetailApiResponse>(P_LISTAPRECIO_ENDPOINT.replace('listas-precio', 'campanas-descuento'), op.payload); // Corrected endpoint
              if (result.isSuccess && result.value) {
                const campanaServerId = result.value.id;
                const fechaModificacionServer = new Date(result.value.fechaHoraModificacion);

                const localCampana = await db.campanas.where('offlineUuid').equals(op.entityKey!).first();
                if (localCampana && localCampana.localId) {
                  await db.campanas.update(localCampana.localId, {
                    id: campanaServerId,
                    sincronizado: true,
                    fechaModificacion: fechaModificacionServer,
                    offlineUuid: null
                  });
                  await db.campanaProductoDescuentos
                    .where('campanaLocalId').equals(localCampana.localId)
                    .modify({
                      campanaId: campanaServerId,
                      sincronizado: true,
                      fechaModificacion: fechaModificacionServer
                    });
                }
                success = true;
              }
              break;
            case 'updateHeader':
              result = await apiService.put<CampanaDetailApiResponse>(P_LISTAPRECIO_ENDPOINT.replace('listas-precio', `campanas-descuento/${op.entityKey}`), op.payload); // Corrected endpoint
              if (result.isSuccess && result.value) {
                await db.campanas.where('id').equals(parseInt(op.entityKey!)).modify({
                  sincronizado: true,
                  fechaModificacion: new Date(result.value.fechaHoraModificacion),
                  nombre: result.value.nombre,
                  descripcion: result.value.descripcion,
                  fechaInicio: result.value.fechaInicio,
                  fechaFin: result.value.fechaFin,
                });
                success = true;
              }
              break;
          }
          break;

        case 'CampanaProductos':
          switch (op.operationType) {
            case 'add':
              result = await apiService.post<CampanaProductoApiResponse>(P_LISTAPRECIO_ADD_PRODUCT_ENDPOINT.replace('listas-precio', 'campanas-descuento'), op.payload); // Corrected endpoint
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
            case 'update':
              result = await apiService.put<CampanaProductoApiResponse>(P_LISTAPRECIO_UPDATE_PRICE_ENDPOINT.replace('listas-precio', 'campanas-descuento').replace('actualizar-precio', 'actualizar-descuento'), op.payload); // Corrected endpoint & path part
              if (result.isSuccess && result.value) {
                 await db.campanaProductoDescuentos
                  .where('[campanaId+productoId]').equals([op.payload.campanaId, op.payload.productoId])
                  .modify({
                    sincronizado: true,
                    fechaModificacion: new Date(result.value.fechaHoraModificacion),
                    tipoDescuento: result.value.tipoDescuento,
                    valorDescuento: result.value.valorDescuento
                  });
                success = true;
              }
              break;
          }
          break;

        case 'ListasPrecio': // New case for ListasPrecio
          switch (op.operationType) {
            case 'createFull':
              result = await apiService.post<ListaPrecioApiResponse>(P_LISTAPRECIO_ENDPOINT, op.payload);
              if (result.isSuccess && result.value) {
                const listaPrecioServerId = result.value.id;
                const fechaModificacionServer = new Date(result.value.fechaHoraModificacion);

                const localLista = await db.listasPrecio.where('offlineUuid').equals(op.entityKey!).first();
                if (localLista && localLista.localId) {
                  await db.listasPrecio.update(localLista.localId, {
                    id: listaPrecioServerId,
                    sincronizado: true,
                    fechaModificacion: fechaModificacionServer,
                    offlineUuid: null
                  });
                  await db.listaPrecioProductos
                    .where('listaPrecioLocalId').equals(localLista.localId)
                    .modify({
                      listaPrecioId: listaPrecioServerId,
                      sincronizado: true,
                      fechaModificacion: fechaModificacionServer
                    });
                }
                success = true;
              }
              break;
            // Add 'updateHeader' for ListasPrecio if API supports it
          }
          break; // End of case 'ListasPrecio'

        case 'ListaPrecioProductos': // New case for ListaPrecioProductos
          switch (op.operationType) {
            case 'add':
              result = await apiService.post<ListaPrecioProductoApiResponse>(P_LISTAPRECIO_ADD_PRODUCT_ENDPOINT, op.payload);
              if (result.isSuccess) { // Assuming simple success, no detailed product price object in response
                await db.listaPrecioProductos
                  .where('[listaPrecioId+productoId]').equals([op.payload.listaPrecioId, op.payload.productoId])
                  .modify({ sincronizado: true, fechaModificacion: now }); // Use 'now' as API may not return mod time
                success = true;
              }
              break;
            case 'update':
              result = await apiService.put<ListaPrecioProductoApiResponse>(P_LISTAPRECIO_UPDATE_PRICE_ENDPOINT, op.payload);
              if (result.isSuccess) {
                await db.listaPrecioProductos
                  .where('[listaPrecioId+productoId]').equals([op.payload.listaPrecioId, op.payload.productoId])
                  .modify({ sincronizado: true, fechaModificacion: now });
                success = true;
              }
              break;
            case 'remove':
              result = await apiService.put<ListaPrecioProductoApiResponse>(P_LISTAPRECIO_REMOVE_PRODUCT_ENDPOINT, op.payload); // API uses PUT
              if (result.isSuccess) {
                // Local deletion is handled by store
                success = true;
              }
              break;
          }
          break; // End of case 'ListaPrecioProductos'

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
