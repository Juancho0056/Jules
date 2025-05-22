import Dexie, { type Table } from 'dexie';

export interface UnidadMedida {
  id?: number;
  nombre: string;
  abreviatura: string;
  syncPending?: boolean;
  // Future fields: createdAt, updatedAt, createdBy, updatedBy etc.
}

// Define other interfaces for your entities here as needed
// export interface Product { ... }
// export interface Sale { ... }

export class MySubClassedDexie extends Dexie {
  // Declare tables in your database
  // 'unidadMedida' is the name of the table that will be created in IndexedDB.
  unidadMedida!: Table<UnidadMedida>; 
  // products!: Table<Product>;
  // sales!: Table<Sale>;

  constructor() {
    super('posOfflineDB'); // Database name
    this.version(1).stores({
      // Schema definition for version 1
      // ++id: auto-incrementing primary key
      // nombre: indexed property for searching/sorting
      // syncPending: indexed to easily find records needing sync
      unidadMedida: '++id, nombre, syncPending',
      // products: '++id, name, categoryId, syncPending',
      // sales: '++id, date, totalAmount, customerId, syncPending',
    });
    // You can map table names to their respective classes if you have custom classes for tables
    // this.unidadMedida = this.table('unidadMedida'); 
    // No need to explicitly map if using the declared property name directly.
  }
}

export const db = new MySubClassedDexie();

// === Basic CRUD Operations for UnidadMedida ===

// CREATE
export async function addUnidadMedida(item: Omit<UnidadMedida, 'id' | 'syncPending'>): Promise<number | undefined> {
  try {
    const id = await db.unidadMedida.add({ ...item, syncPending: true });
    return id;
  } catch (error) {
    console.error("Failed to add UnidadMedida: ", error);
    // Handle or throw error as appropriate for your app
  }
}

// READ ONE
export async function getUnidadMedidaById(id: number): Promise<UnidadMedida | undefined> {
  try {
    return await db.unidadMedida.get(id);
  } catch (error) {
    console.error(`Failed to get UnidadMedida ${id}: `, error);
  }
}

// READ ALL
export async function getAllUnidadMedida(): Promise<UnidadMedida[]> {
  try {
    return await db.unidadMedida.toArray();
  } catch (error) {
    console.error("Failed to get all UnidadMedida: ", error);
    return [];
  }
}

// UPDATE
export async function updateUnidadMedida(id: number, updates: Partial<Omit<UnidadMedida, 'id'>>): Promise<number | undefined> {
  try {
    // Ensure syncPending is set if it's a meaningful update
    const updateData = { ...updates, syncPending: true };
    const updatedCount = await db.unidadMedida.update(id, updateData);
    if (updatedCount > 0) return id;
    console.warn(`UnidadMedida with id ${id} not found for update.`);
  } catch (error) {
    console.error(`Failed to update UnidadMedida ${id}: `, error);
  }
}

// DELETE
export async function deleteUnidadMedida(id: number): Promise<boolean> {
  try {
    await db.unidadMedida.delete(id);
    // Note: For offline-first, "deleting" might mean marking as 'deleted' and 'syncPending'
    // rather than actual removal, until synced with a server.
    // For this example, we do a hard delete locally.
    return true;
  } catch (error) {
    console.error(`Failed to delete UnidadMedida ${id}: `, error);
    return false;
  }
}

// Example: Get items that need synchronization
export async function getUnsyncedUnidadMedida(): Promise<UnidadMedida[]> {
  try {
    return await db.unidadMedida.where('syncPending').equals(true).toArray();
  } catch (error) {
    console.error("Failed to get unsynced UnidadMedida: ", error);
    return [];
  }
}

// Example: Mark an item as synced
export async function markUnidadMedidaAsSynced(id: number): Promise<void> {
    try {
        await db.unidadMedida.update(id, { syncPending: false });
    } catch (error) {
        console.error(`Failed to mark UnidadMedida ${id} as synced: `, error);
    }
}

// You would add similar CRUD functions for other tables (Products, Sales, etc.)
