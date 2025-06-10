// my-app/src/lib/types/cliente.ts
export interface ClienteDbo {
  localId?: number; // Autoincrementing primary key in Dexie
  sincronizado: boolean;
  fechaModificacion: Date; // Timestamp of last modification (local or server)
  ultimaConsulta: Date;    // Timestamp of last time this record was actively used/viewed

  // Server-side primary key (nullable if created offline)
  id?: number | null;

  // --- Fields from API Definition (CrearClienteCommand & ActualizarClienteCommand) ---
  tipoDocumentoId: string;
  numeroDocumento: string; // Expected to be the business key
  tipoCliente: string; // e.g., 'Persona Natural', 'Empresa'
  razonSocial?: string | null;
  primerNombre?: string | null;
  segundoNombre?: string | null;
  primerApellido?: string | null;
  segundoApellido?: string | null;
  telefonoFijo?: string | null;
  telefonoMovil?: string | null;
  telefonoFax?: string | null;
  sitioWeb?: string | null;
  email?: string | null; // Validate format?
  calle?: string | null; // Dirección
  municipioId?: string | null; // Foreign key to Municipio entity
  codigoPostal?: string | null;
  listaPrecioId?: number | null; // Foreign key to ListaPrecio entity
  aplicaRetefuente?: boolean | null;
  aplicaReteIVA?: boolean | null;
  aplicaReteICA?: boolean | null;
  granContribuyente?: boolean | null;
  autorretenedor?: boolean | null;
  disponibleOffline: boolean; // If true, this client record can be synced for offline use
}

// It might also be useful to define types for the API commands if not already globally available
// For now, focusing on ClienteDbo as per the plan step.
// export type CrearClienteCommand = Omit<ClienteDbo, 'localId' | 'id' | 'sincronizado' | 'fechaModificacion' | 'ultimaConsulta'>;
// export type ActualizarClienteCommand = Partial<CrearClienteCommand> & { id: number };
