import Dexie, { type Table } from 'dexie';
import type { ClienteDbo } from '../types/cliente';
import type { DepartamentoDbo } from '../types/departamento';
import type { MunicipioDbo } from '../types/municipio';
import type { CampanaDbo, CampanaProductoDescuentoDbo } from '../types/campana';
import type { ListaPrecioDbo, ListaPrecioProductoDbo } from '../types/listaPrecio'; // Import ListaPrecio types

export interface UnitOfMeasureDbo {
  localId?: number;
  id?: string | null;
  codigo: string;
  nombre: string;
  abreviatura?: string | null;
  orden: number;
  estado: boolean;
  sincronizado: boolean;
  disponibleOffline: boolean;
  fechaModificacion: Date;
  ultimaConsulta: Date;
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
  tabla: string;
  lastSyncedAt: Date;
}

export class MyDexieDatabase extends Dexie {
  unitsOfMeasure!: Table<UnitOfMeasureDbo, number>;
  pendingOperations!: Table<PendingOperationDbo, number>;
  appConfig!: Table<AppConfigDbo, string>;
  syncIndex!: Table<SyncIndexDbo, string>;
  clientes!: Table<ClienteDbo, number>;
  departamentos!: Table<DepartamentoDbo, number>;
  municipios!: Table<MunicipioDbo, number>;
  campanas!: Table<CampanaDbo, number>;
  campanaProductoDescuentos!: Table<CampanaProductoDescuentoDbo, number>;
  listasPrecio!: Table<ListaPrecioDbo, number>; // Declare listasPrecio table
  listaPrecioProductos!: Table<ListaPrecioProductoDbo, number>; // Declare listaPrecioProductos table

  constructor() {
    super('posOfflineFirstDb');
    this.version(2).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
    });

    this.version(3).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `++localId, &numeroDocumento, id, razonSocial, primerNombre, primerApellido, email, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`
    });

    this.version(4).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `++localId, &numeroDocumento, id, razonSocial, primerNombre, primerApellido, email, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      departamentos: `++localId, &id, nombre, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`
    });

    this.version(5).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `++localId, &numeroDocumento, id, razonSocial, primerNombre, primerApellido, email, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      departamentos: `++localId, &id, nombre, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      municipios: `++localId, &id, nombre, departamentoId, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`
    });

    this.version(6).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `++localId, &numeroDocumento, id, razonSocial, primerNombre, primerApellido, email, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      departamentos: `++localId, &id, nombre, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      municipios: `++localId, &id, nombre, departamentoId, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      campanas: `++localId, &id, nombre, fechaInicio, fechaFin, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      campanaProductoDescuentos: `++localId, &[campanaId+productoId], campanaId, productoId, campanaLocalId, tipoDescuento, sincronizado, fechaModificacion`
    });

    this.version(7).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `++localId, &numeroDocumento, id, razonSocial, primerNombre, primerApellido, email, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      departamentos: `++localId, &id, nombre, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      municipios: `++localId, &id, nombre, departamentoId, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      campanas: `++localId, &id, offlineUuid, nombre, fechaInicio, fechaFin, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      campanaProductoDescuentos: `++localId, &[campanaId+productoId], campanaId, productoId, campanaLocalId, tipoDescuento, sincronizado, fechaModificacion`
    });

    // New version for listasPrecio and listaPrecioProductos tables
    this.version(8).stores({
      unitsOfMeasure: `++localId, &codigo, id, nombre, abreviatura, orden, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      pendingOperations: `++opId, entityName, operationType, timestamp, entityKey, status`,
      appConfig: '&key',
      syncIndex: '&tabla',
      clientes: `++localId, &numeroDocumento, id, razonSocial, primerNombre, primerApellido, email, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      departamentos: `++localId, &id, nombre, estado, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      municipios: `++localId, &id, nombre, departamentoId, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      campanas: `++localId, &id, offlineUuid, nombre, fechaInicio, fechaFin, sincronizado, disponibleOffline, fechaModificacion, ultimaConsulta`,
      campanaProductoDescuentos: `++localId, &[campanaId+productoId], campanaId, productoId, campanaLocalId, tipoDescuento, sincronizado, fechaModificacion`,
      listasPrecio: `++localId, &id, offlineUuid, nombre, fechaInicio, disponibleOffline, sincronizado, fechaModificacion, ultimaConsulta`,
      listaPrecioProductos: `++localId, &[listaPrecioId+productoId], listaPrecioId, productoId, listaPrecioLocalId, sincronizado, fechaModificacion`
    });
  }
}

export const db = new MyDexieDatabase();
