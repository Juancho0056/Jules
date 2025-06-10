// my-app/src/lib/types/campana.ts

export type TipoDescuento = "Porcentaje" | "ValorFijo";

export interface CampanaDbo {
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

  disponibleOffline: boolean; // If true, this campaign and its discounts can be synced for offline use
}

export interface CampanaProductoDescuentoDbo {
  localId?: number; // Autoincrementing primary key in Dexie
  sincronizado: boolean;
  fechaModificacion: Date; // Timestamp of last modification (local or server)

  // Foreign keys & Data
  campanaId: number; // Server ID of the parent Campana. Mandatory once parent is synced.
                       // If parent (CampanaDbo) is created offline, this might be initially null or temp.
                       // The sync process for CampanaProductoDescuento must ensure Campana parent is synced first.
  campanaLocalId?: number; // Dexie localId of the parent CampanaDbo. Useful for offline linking before server IDs are known.

  productoId: number; // Server ID of the product this discount applies to.
                      // This assumes products are already synced and have server IDs.
                      // If products can also be created offline, a productoLocalId might be needed.

  tipoDescuento: TipoDescuento; // "Porcentaje" or "ValorFijo"
  valorDescuento: number; // The actual discount value (e.g., 10 for 10% or 5 for $5.00)

  // This might be redundant if the discount period is always same as campaign.
  // If discounts can have their own active period *within* the campaign period, it's useful.
  fechaInicioDescuento: string; // ISO date-time string. Could default to Campana.fechaInicio.
  // fechaFinDescuento?: string | null; // Optional: if discount can end before campaign.
}
