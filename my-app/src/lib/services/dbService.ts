import Dexie, { type Table } from 'dexie';

// Define interfaces for your table records based on Roadmap
export interface UnitOfMeasureDbo { // Dbo for Database Object
  localId?: number; // Auto-incremented primary key by Dexie
  id?: string | null; // Server-assigned ID, null if created offline and not synced
  codigo: string;    // Business key, should be unique
  name: string;
  symbol: string;
  sincronizado: boolean;
  fechaModificacion: Date;
  offlineId?: string | null; // Optional: for client-side temporary ID if needed for UI logic before 'codigo' is set
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
}

export interface AppConfigDbo {
  key: string; // e.g., 'refreshToken', 'tokenExpiration', 'lastSync_unitsOfMeasure'
  value: any;
}

export class MyDexieDatabase extends Dexie {
  unitsOfMeasure!: Table<UnitOfMeasureDbo, number>; // number is the type of the primary key 'localId'
  pendingOperations!: Table<PendingOperationDbo, number>;
  appConfig!: Table<AppConfigDbo, string>; // string is the type of the primary key 'key'

  constructor() {
    super('posOfflineFirstDb'); // Database name
    this.version(1).stores({
      unitsOfMeasure: '++localId, &codigo, id, name, symbol, sincronizado, fechaModificacion, offlineId',
      // 'id' is server ID, 'codigo' is business key. 'localId' is Dexie's auto PK.
      // Index 'id' for quick lookups once server ID is known.
      // Index 'sincronizado' for finding unsynced items can be added if needed: '++localId, &codigo, id, sincronizado, ...'
      // 'offlineId' might be useful if 'codigo' isn't available immediately upon creation.
      
      pendingOperations: '++opId, entityName, operationType, timestamp, entityKey, status',
      // Index 'status' and 'timestamp' for efficient querying of pending operations.

      appConfig: '&key', // 'key' is the primary key and must be unique.
    });
  }
}

export const db = new MyDexieDatabase();

// Example usage (illustrative, not part of this file's direct execution):
// await db.unitsOfMeasure.add({ codigo: 'kg', name: 'Kilogram', symbol: 'kg', sincronizado: false, fechaModificacion: new Date() });
// const unit = await db.unitsOfMeasure.where('codigo').equals('kg').first();
// await db.appConfig.put({ key: 'refreshToken', value: 'someTokenValue' });
// const token = await db.appConfig.get('refreshToken');
