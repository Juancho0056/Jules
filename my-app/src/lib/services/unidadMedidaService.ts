import { db, type UnitOfMeasureDbo } from './dbService';

// Obtener todas las unidades de medida (ordenadas por el campo "orden")
export async function getAllUnidadMedida(): Promise<UnitOfMeasureDbo[]> {
  return await db.unitsOfMeasure.orderBy('orden').toArray();
}

// Agregar una nueva unidad de medida
export async function addUnidadMedida(unit: UnitOfMeasureDbo): Promise<number> {
  return await db.unitsOfMeasure.add({
    ...unit,
    sincronizado: false,
    fechaModificacion: new Date(),
  });
}

// Actualizar una unidad de medida (por localId)
export async function updateUnidadMedida(localId: number, changes: Partial<UnitOfMeasureDbo>): Promise<number> {
  return await db.unitsOfMeasure.update(localId, {
    ...changes,
    fechaModificacion: new Date(),
  });
}

// Eliminar una unidad de medida (por localId)
export async function deleteUnidadMedida(localId: number): Promise<void> {
  await db.unitsOfMeasure.delete(localId);
}
