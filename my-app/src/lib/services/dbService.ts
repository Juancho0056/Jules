import Dexie, { type Table } from 'dexie';

// Define interfaces for your table records based on Roadmap
export interface UnitOfMeasureDbo { // Dbo for Database Object
  localId?: number; // Auto-incremented primary key by Dexie
  id?: string | null; // Server-assigned ID, null if created offline and not synced
  codigo: string;    // Business key, maps to UnidadMedida.Id from server, should be unique
  nombre: string;           // Renamed from 'name'
  abreviatura?: string | null; // Renamed from 'symbol', optional
  orden: number;            // New field
  estado: boolean;          // New field
  sincronizado: boolean;
  fechaModificacion: Date;
  offlineId?: string | null; // Optional: for client-side temporary ID if needed for UI logic before 'codigo' is set
  lastAccessed?: Date | null;
}

export interface PendingOperationDbo {
  opId?: number; // Auto-incremented primary key
  entityName: string; // e.g., 'unitsOfMeasure', 'products'
  operationType: 'create' | 'update' | 'delete';
  payload: any; // Data for create/update; could be specific ID for delete
  timestamp: Date;
  entityKey?: string | null; // The 'codigo' or 'id' of the entity this operation affects
  status: 'pending' | 'processing' | 'failed';
  lastAttempt?: Date | null;
  attempts?: number;
  nextAttemptTimestamp?: Date | null;
}

export interface AppConfigDbo {
  key: string; // e.g., 'refreshToken', 'tokenExpiration', 'lastSync_unitsOfMeasure'
  value: any;
}

export interface SaleItemDbo {
  productCodigo: string; // Identificador del producto
  quantity: number;
  priceAtSale: number; // Precio del producto al momento de la venta
  subtotal: number;
}

export interface SaleDbo {
  localId?: number; // PK auto-incremental de Dexie
  uuid: string; // UUID generado en el cliente, clave única global
  items: SaleItemDbo[];
  totalAmount: number;
  saleDate: Date;
  status: 'pending' | 'synced' | 'failed'; // Estado de sincronización
  sincronizado: boolean; // True si está confirmado por el backend
  isDirty?: boolean; // True si hay cambios locales pendientes de encolar/sincronizar
  fechaModificacion: Date; // Última fecha de modificación local o de sincronización
  // Considerar añadir userId, posId, etc., si son relevantes
}

export class MyDexieDatabase extends Dexie {
  unitsOfMeasure!: Table<UnitOfMeasureDbo, number>; // number is the type of the primary key 'localId'
  pendingOperations!: Table<PendingOperationDbo, number>;
  appConfig!: Table<AppConfigDbo, string>; // string is the type of the primary key 'key'
  sales!: Table<SaleDbo, number>; // number is the type of the primary key 'localId'


  constructor() {
    super('posOfflineFirstDb'); // Database name
    // Actualizar el esquema de pendingOperations para incluir attempts y lastAttempt si no existen.
    // Basándome en el código anterior, estos campos ya fueron añadidos en pendingOperations,
    // así que el esquema de pendingOperations debería ser:
    // pendingOperations: '++opId, entityName, operationType, timestamp, entityKey, status, attempts, lastAttempt'
    // Lo confirmaré al leer el archivo si es necesario, pero por ahora asumo que está correcto.

    this.version(1).stores({
      unitsOfMeasure: '++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, fechaModificacion, offlineId, lastAccessed',
      pendingOperations: '++opId, entityName, operationType, timestamp, entityKey, status, attempts, lastAttempt, nextAttemptTimestamp', // Esquema actualizado
      appConfig: '&key', // 'key' is the primary key and must be unique.
      sales: '++localId, &uuid, saleDate, status, sincronizado, fechaModificacion', // Nuevo esquema para sales
    });

    // Inicialización explícita de las tablas para asegurar que Dexie las reconozca correctamente con tipado.
    // Esto es redundante si las propiedades ya están declaradas con ! arriba, pero no causa daño.
    this.unitsOfMeasure = this.table('unitsOfMeasure');
    this.pendingOperations = this.table('pendingOperations');
    this.appConfig = this.table('appConfig');
    this.sales = this.table('sales');
  }
}

export const db = new MyDexieDatabase();

// Example usage (illustrative, not part of this file's direct execution):
// await db.unitsOfMeasure.add({ codigo: 'kg', name: 'Kilogram', symbol: 'kg', sincronizado: false, fechaModificacion: new Date() });
// const unit = await db.unitsOfMeasure.where('codigo').equals('kg').first();
// await db.appConfig.put({ key: 'refreshToken', value: 'someTokenValue' });
// const token = await db.appConfig.get('refreshToken');
