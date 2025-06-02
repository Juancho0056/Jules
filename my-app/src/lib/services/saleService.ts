import { db, type SaleDbo, type SaleItemDbo } from './dbService';
import { syncService } from './syncService';
import { v4 as uuidv4 } from 'uuid';

// Datos de ejemplo para una venta, esto vendría de la UI
export interface CreateSaleInput {
  items: { productCodigo: string; quantity: number; priceAtSale: number; subtotal: number; }[];
  totalAmount: number;
  // otros campos como customerId, etc.
}

export const saleService = {
  async createOfflineSale(saleInput: CreateSaleInput): Promise<SaleDbo | undefined> {
    const newUuid = uuidv4();
    const saleDate = new Date();

    // Mapear los items de entrada a SaleItemDbo si es necesario (en este caso, coinciden)
    const saleItems: SaleItemDbo[] = saleInput.items.map(item => ({
      productCodigo: item.productCodigo,
      quantity: item.quantity,
      priceAtSale: item.priceAtSale,
      subtotal: item.subtotal,
    }));

    const saleRecord: SaleDbo = {
      uuid: newUuid,
      items: saleItems,
      totalAmount: saleInput.totalAmount,
      saleDate: saleDate,
      status: 'pending',
      sincronizado: false,
      isDirty: false, // Se considera 'false' inicialmente porque se va a encolar inmediatamente
      fechaModificacion: saleDate,
    };

    try {
      const localId = await db.sales.add(saleRecord);
      saleRecord.localId = localId; // Añadir el localId al objeto devuelto

      // Añadir a la cola de operaciones pendientes para sincronización
      // El entityName 'sales' debe coincidir con lo que espera el backend y el syncService
      // El entityKey para ventas será el UUID.
      await syncService.addToQueue('sales', 'create', saleRecord, newUuid);

      console.log(`Venta ${newUuid} creada offline y encolada. LocalId: ${localId}`);
      // toastStore.addToast(`Venta ${newUuid} guardada localmente y encolada.`, 'success'); // Opcional
      return saleRecord;
    } catch (error) {
      console.error(`Error al crear la venta offline ${newUuid}:`, error);
      // Considerar si se debe eliminar de db.sales si la adición a la cola falla.
      // Por ejemplo, si la adición a la cola es crítica:
      // if (saleRecord.localId) {
      //   await db.sales.delete(saleRecord.localId).catch(deleteErr => {
      //     console.error(`Error al intentar revertir la inserción de la venta ${newUuid} de la BD local:`, deleteErr);
      //   });
      // }
      // toastStore.addToast(`Error al crear venta offline ${newUuid}.`, 'error'); // Opcional
      return undefined;
    }
  },

  async getSaleByUuid(uuid: string): Promise<SaleDbo | undefined> {
    return db.sales.where('uuid').equals(uuid).first();
  },

  async getSalesByStatus(status: 'pending' | 'synced' | 'failed'): Promise<SaleDbo[]> {
    return db.sales.where('status').equals(status).toArray();
  },

  async getAllSales(sortBy: keyof SaleDbo = 'saleDate', reverse: boolean = false): Promise<SaleDbo[]> {
    let query = db.sales.orderBy(sortBy);
    if (reverse) {
      query = query.reverse();
    }
    return query.toArray();
  }
};
