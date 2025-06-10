// my-app/src/lib/types/departamento.ts
export interface DepartamentoDbo {
  localId?: number; // Autoincrementing primary key in Dexie
  sincronizado: boolean;
  fechaModificacion: Date; // Timestamp of last modification (local or server)
  ultimaConsulta: Date;    // Timestamp of last time this record was actively used/viewed

  // --- Fields from API Definition ---
  // Based on CreateDepartamentoCommand and UpdateDepartamentoCommand
  id: string; // Primary key / Business key (e.g., DANE code), client-provided
  nombre: string;
  estado: boolean; // Active/inactive status from backend
  disponibleOffline: boolean; // If true, this record can be synced for offline use
}
