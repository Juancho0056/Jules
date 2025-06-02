import { writable, derived, get } from 'svelte/store';
// Importar syncService directamente aquí crearía una dependencia circular si syncService importa este store.
// En lugar de eso, syncService llamará a funciones exportadas de este store o directamente a los .set de los writables.
// Para getQueueStatus, syncService puede seguir siendo la fuente de verdad, y este store la consume.
// O bien, las funciones de actualización se definen aquí y son llamadas por syncService.

export interface SyncQueueStatus {
  pending: number;
  failedRetryable: number;
  failedPermanent: number;
  total: number;
}

const initialQueueStatus: SyncQueueStatus = {
  pending: 0,
  failedRetryable: 0,
  failedPermanent: 0,
  total: 0,
};

export const syncQueueStatus = writable<SyncQueueStatus>(initialQueueStatus);
export const lastSyncAttempt = writable<Date | null>(null);
export const lastSuccessfulSync = writable<Date | null>(null);
export const isSyncing = writable<boolean>(false);

// syncService necesitará una forma de obtener getQueueStatus.
// Esta función de actualización es la que syncService llamará.
// Para evitar dependencias circulares, syncService no debería ser importado aquí directamente
// si este store es importado por syncService.
// Una alternativa es que syncService pase la función getQueueStatus como parámetro a una función de inicialización aquí,
// o que syncService directamente actualice los stores.
// Se optará por la segunda: syncService actualiza directamente estos stores.

// Ejemplo de cómo syncService podría llamar a esto (o directamente a syncQueueStatus.set):
// export function setSyncStatus(status: SyncQueueStatus) {
//   syncQueueStatus.set(status);
// }

// Derivar un mensaje de estado de sincronización más amigable
// Se importa offlineStore aquí ya que es una dependencia para el mensaje.
import { offlineStore } from './offlineStore';

export const syncStatusMessage = derived(
  [offlineStore, syncQueueStatus, isSyncing, lastSuccessfulSync],
  ([$offlineStore, $syncQueueStatus, $isSyncing, $lastSuccessfulSync]) => {
    if ($offlineStore.isOffline) return "Offline";

    // Priorizar errores permanentes
    if ($syncQueueStatus.failedPermanent > 0) return `Error de sincronización (${$syncQueueStatus.failedPermanent} operaciòn/es con error permanente).`;

    // Luego errores reintentables
    if ($syncQueueStatus.failedRetryable > 0) return `Sincronización reintentando (${$syncQueueStatus.failedRetryable} operaciòn/es pendientes).`;

    // Si está sincronizando activamente
    if ($isSyncing) {
      if ($syncQueueStatus.pending > 0) return `Sincronizando... (${$syncQueueStatus.pending} operaciòn/es restantes).`;
      return "Sincronizando..."; // Caso general de 'isSyncing' true pero 'pending' es 0 (ej. durante fetchAll)
    }

    // Si hay operaciones pendientes pero no está 'isSyncing' (podría ser justo antes de que comience)
    if ($syncQueueStatus.pending > 0) return `Sincronización pendiente (${$syncQueueStatus.pending} operaciòn/es).`;

    // Si no hay errores, ni pendientes, y no está sincronizando activamente
    if ($syncQueueStatus.total === 0) {
      let message = "Sincronizado";
      if ($lastSuccessfulSync) {
        // Mostrar solo la hora si es de hoy, si no, la fecha también
        const today = new Date().toLocaleDateString();
        const syncDate = $lastSuccessfulSync.toLocaleDateString();
        if (today === syncDate) {
          message += ` (Hoy ${$lastSuccessfulSync.toLocaleTimeString()})`;
        } else {
          message += ` (${$lastSuccessfulSync.toLocaleString()})`;
        }
      }
      return message;
    }

    // Fallback por si alguna combinación no fue cubierta
    return "Estado de sincronización desconocido.";
  }
);

// Función para ser llamada por syncService para actualizar el estado de la cola.
// Esto evita la dependencia circular y mantiene la lógica de obtener el estado en syncService.
// Sin embargo, el plan actual es que syncService actualice los stores directamente.
// Para updateSyncQueueStatus, syncService.getQueueStatus() será llamado dentro de syncService,
// y luego el resultado se usará para hacer .set(result) en syncQueueStatus.
// Así que no se necesita una función aquí para eso.

// Si se necesita forzar una actualización del mensaje derivado (syncStatusMessage)
// porque sus dependencias no han cambiado "de valor" pero sí de "contenido interno" (poco común para estos stores),
// se podría hacer un re-set de uno de los stores, pero no es lo habitual.
// Por ejemplo: lastSuccessfulSync.set(get(lastSuccessfulSync));
// Esto normalmente no es necesario.
