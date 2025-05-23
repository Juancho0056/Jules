export interface UnitOfMeasure {
  localId?: number; // Auto-incremented primary key by Dexie
  id: string;
  codigo: string; // Business key, should be unique
  nombre: string;
  abreviatura: string;
  createdAt?: string; 
  updatedAt?: string;
}
