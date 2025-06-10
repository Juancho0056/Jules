// my-app/src/lib/types/listaPrecio.ts

export interface ListaPrecioDbo {
  localId?: number; // Autoincrementing primary key in Dexie
  sincronizado: boolean;
  fechaModificacion: Date; // Timestamp of last modification (local or server)
  ultimaConsulta: Date;    // Timestamp of last time this record was actively used/viewed

  // Server-side primary key (nullable if created offline)
  id?: number | null;
  offlineUuid?: string | null; // For correlating records created offline before server ID is known

  // --- Fields from API Definition ---
  nombre: string;
  descripcion?: string | null;
  fechaInicio: string; // ISO date-time string e.g. "YYYY-MM-DDTHH:mm:ss"
  fechaFin?: string | null;   // ISO date-time string e.g. "YYYY-MM-DDTHH:mm:ss"

  disponibleOffline: boolean; // If true, this price list and its products can be synced for offline use
}

export interface ListaPrecioProductoDbo {
  localId?: number; // Autoincrementing primary key in Dexie
  sincronizado: boolean;
  fechaModificacion: Date; // Timestamp of last modification (local or server)

  // Foreign keys & Data
  listaPrecioId: number; // Server ID of the parent ListaPrecio. Mandatory once parent is synced.
  listaPrecioLocalId?: number; // Dexie localId of the parent ListaPrecioDbo. Useful for offline linking.

  productoId: number; // Server ID of the product this price applies to.
  precio: number; // The actual price for the product in this price list

  // Optional: If prices can have their own active period *within* the price list period.
  // If not, this might default to the parent ListaPrecio.fechaInicio.
  fechaInicioPrecio: string; // ISO date-time string.
  // fechaFinPrecio?: string | null; // Optional: if price can end before price list.
}
