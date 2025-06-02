import { db, type UnitOfMeasureDbo } from './dbService';

export const unidadMedidaService = {
  // Obtener todas las unidades de medida (ordenadas por el campo "orden")
  async getAllUnidadMedida(): Promise<UnitOfMeasureDbo[]> {
    // Considerar si se debe actualizar lastAccessed aquí para todas las unidades leídas.
    // Por ahora, se omite para no impactar el rendimiento de lecturas masivas sin una necesidad clara.
    return await db.unitsOfMeasure.orderBy('orden').toArray();
  },

  // Agregar una nueva unidad de medida
  async addUnidadMedida(unit: Omit<UnitOfMeasureDbo, 'sincronizado' | 'fechaModificacion' | 'localId'>): Promise<number | undefined> {
    // Asegurarse de que el localId no se pase, Dexie lo autogenera
    const { localId, ...unitData } = unit as UnitOfMeasureDbo;
    try {
      return await db.unitsOfMeasure.add({
        ...unitData,
        sincronizado: false, // Nueva unidad, no sincronizada
        fechaModificacion: new Date(),
        lastAccessed: new Date(), // Accedida al crearla
      });
    } catch (error) {
      console.error("Failed to add UnidadMedida:", error);
      return undefined;
    }
  },

  // Actualizar una unidad de medida (por localId)
  async updateUnidadMedida(localId: number, changes: Partial<Omit<UnitOfMeasureDbo, 'localId' | 'fechaModificacion' | 'sincronizado'>>): Promise<number> {
    // No permitir la actualización directa de sincronizado o fechaModificacion desde aquí;
    // syncService maneja 'sincronizado', y 'fechaModificacion' se actualiza automáticamente.
    const { sincronizado, fechaModificacion, ...validChanges } = changes as UnitOfMeasureDbo;
    return await db.unitsOfMeasure.update(localId, {
      ...validChanges,
      fechaModificacion: new Date(),
      lastAccessed: new Date(), // Accedida al actualizarla
      // 'sincronizado' se marcará como false si hay cambios que necesiten sincronización,
      // esto debería manejarlo la lógica que llama a updateUnidadMedida si es relevante para la sincronización.
      // Por simplicidad, aquí no se cambia 'sincronizado' automáticamente.
    });
  },

  // Eliminar una unidad de medida (por localId)
  // Esta es una eliminación local. La sincronización maneja la eliminación en el backend.
  async deleteUnidadMedida(localId: number): Promise<void> {
    await db.unitsOfMeasure.delete(localId);
  },

  // Obtener una unidad de medida por su 'codigo' y actualizar su 'lastAccessed'
  async getUnitOfMeasureByCodigoAndUpdateAccess(codigo: string): Promise<UnitOfMeasureDbo | undefined> {
    const unit = await db.unitsOfMeasure.where('codigo').equals(codigo).first();
    if (unit && unit.localId) {
      // No esperar la promesa de update para devolver el dato más rápido.
      db.unitsOfMeasure.update(unit.localId, { lastAccessed: new Date() }).catch(err => {
        console.error(`Failed to update lastAccessed for unit ${codigo}:`, err);
      });
    }
    return unit;
  },

  // Obtener una unidad de medida por su 'localId' y actualizar su 'lastAccessed'
  async getUnitOfMeasureByLocalIdAndUpdateAccess(localId: number): Promise<UnitOfMeasureDbo | undefined> {
    const unit = await db.unitsOfMeasure.get(localId);
    if (unit && unit.localId) {
      db.unitsOfMeasure.update(unit.localId, { lastAccessed: new Date() }).catch(err => {
        console.error(`Failed to update lastAccessed for unit with localId ${localId}:`, err);
      });
    }
    return unit;
  }
};
