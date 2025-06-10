import Dexie, { type Table } from 'dexie';
import type { ClienteDbo } from '../types/cliente';
import type { DepartamentoDbo } from '../types/departamento'; // Import DepartamentoDbo

export interface UnitOfMeasureDbo {
  localId?: number;
  id?: string | null;
  codigo: string;
  nombre: string;
  abreviatura?: string | null;
  orden: number;
  estado: boolean;
  sincronizado: boolean;
  disponibleOffline: boolean; // ← Nuevo flag desde backend
  fechaModificacion: Date;
  ultimaConsulta: Date;       // ← Para limpieza automática
  offlineId?: string | null;
}

export interface PendingOperationDbo {
  opId?: number;
  entityName: string;
  operationType: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: Date;
  entityKey?: string | null;
  status: 'pending' | 'processing' | 'failed';
  lastAttempt?: Date | null;
  attempts?: number;
}

export interface AppConfigDbo {
  key: string;
  value: any;
}

export interface SyncIndexDbo {
  tabla: string;          // ← nombre de la tabla sincronizada (ej: 'unitsOfMeasure')
  lastSyncedAt: Date;     // ← timestamp última sincronización exitosa
}

export class MyDexieDatabase extends Dexie {
  unitsOfMeasure!: Table<UnitOfMeasureDbo, number>;
  pendingOperations!: Table<PendingOperationDbo, number>;
  appConfig!: Table<AppConfigDbo, string>;
  syncIndex!: Table<SyncIndexDbo, string>;
  clientes!: Table<ClienteDbo, number>;
  departamentos!: Table<DepartamentoDbo, number>; // Declare departamentos table

  constructor() {
    super('posOfflineFirstDb');
    this.version(2).stores({
      unitsOfMeasure: `
        ++localId,
        &codigo,
        id,
        nombre,
        abreviatura,
        orden,
        estado,
        sincronizado,
        disponibleOffline,
        fechaModificacion,
        ultimaConsulta`,
      pendingOperations: `
        ++opId,
        entityName,
        operationType,
        timestamp,
        entityKey,
        status`,
      appConfig: '&key',
      syncIndex: '&tabla',
    });

    this.version(3).stores({
      unitsOfMeasure: `
        ++localId,
        &codigo,
        id,
        nombre,
        abreviatura,
        orden,
        estado,
        sincronizado,
        disponibleOffline,
        fechaModificacion,
        ultimaConsulta`,
      pendingOperations: `
        ++opId,
        entityName,
        operationType,
        timestamp,
        entityKey,
        status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `
        ++localId,
        &numeroDocumento,
        id,
        razonSocial,
        primerNombre,
        primerApellido,
        email,
        sincronizado,
        disponibleOffline,
        fechaModificacion,
        ultimaConsulta`
    });

    // New version for departamentos table
    this.version(4).stores({
      unitsOfMeasure: `
        ++localId,
        &codigo,
        id,
        nombre,
        abreviatura,
        orden,
        estado,
        sincronizado,
        disponibleOffline,
        fechaModificacion,
        ultimaConsulta`,
      pendingOperations: `
        ++opId,
        entityName,
        operationType,
        timestamp,
        entityKey,
        status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `
        ++localId,
        &numeroDocumento,
        id,
        razonSocial,
        primerNombre,
        primerApellido,
        email,
        sincronizado,
        disponibleOffline,
        fechaModificacion,
        ultimaConsulta`,
      departamentos: `
        ++localId,
        &id,
        nombre,
        estado,
        sincronizado,
        disponibleOffline,
        fechaModificacion,
        ultimaConsulta` // Schema for departamentos
    });
  }
}

export const db = new MyDexieDatabase();
