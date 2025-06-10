// my-app/src/lib/types/municipio.ts
export interface MunicipioDbo {
  localId?: number; // Autoincrementing primary key in Dexie
  sincronizado: boolean;
  fechaModificacion: Date; // Timestamp of last modification (local or server)
  ultimaConsulta: Date;    // Timestamp of last time this record was actively used/viewed

  // --- Fields from API Definition ---
  id: string; // Primary key / Business key (e.g., DANE code for municipio)
  nombre: string;
  departamentoId: string; // Foreign key to Departamento entity
  disponibleOffline: boolean; // If true, this record can be synced for offline use
}
