import { writable, get } from 'svelte/store';
import type { UnitOfMeasure } from '../types/unitOfMeasure';
import { apiService, ApiError } from '../services/apiService';
import { syncService } from '../services/syncService';
import { offlineStore } from './offlineStore'; // Corrected path per example

export interface UnitOfMeasureState {
  units: UnitOfMeasure[];
  isLoading: boolean;
  error: ApiError | null;
}

const initialUnitOfMeasureState: UnitOfMeasureState = {
  units: [],
  isLoading: false,
  error: null,
};

// Placeholder for local storage caching functions
const UNITS_CACHE_KEY = 'unitOfMeasureCache';

const saveUnitsToLocalStorage = (units: UnitOfMeasure[]) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(UNITS_CACHE_KEY, JSON.stringify(units));
  }
};

const getUnitsFromLocalStorage = (): UnitOfMeasure[] => {
  if (typeof localStorage !== 'undefined') {
    const cached = localStorage.getItem(UNITS_CACHE_KEY);
    return cached ? JSON.parse(cached) : [];
  }
  return [];
};

function createUnitOfMeasureStore() {
  const { subscribe, update, set } = writable<UnitOfMeasureState>(initialUnitOfMeasureState);

  const fetchAll = async () => {
    update(state => ({ ...state, isLoading: true, error: null }));

    if (get(offlineStore).isOffline) {
      const localUnits = getUnitsFromLocalStorage();
      // if (localUnits.length > 0) { // Only update if cache has items, otherwise show error
      //   update(state => ({ ...state, units: localUnits, isLoading: false }));
      //   return;
      // }
      // Always set units from cache, even if empty, then decide on error.
      update(state => ({ ...state, units: localUnits, isLoading: false }));
      if (localUnits.length === 0) { // Show error only if cache is empty
        update(state => ({ ...state, error: new ApiError("Offline: Cannot fetch new data and no local cache available.") }));
      }
      return;
    }

    const result = await apiService.get<UnitOfMeasure[]>('/units');
    if (result.ok) {
      update(state => ({ ...state, units: result.value, isLoading: false }));
      saveUnitsToLocalStorage(result.value);
    } else {
      update(state => ({ ...state, isLoading: false, error: result.error }));
      // Optional: if API fails, load from cache as a fallback
      // const localUnits = getUnitsFromLocalStorage();
      // if (localUnits.length > 0) {
      //   update(state => ({ ...state, units: localUnits }));
      // }
    }
  };
  
  // Initial load from local storage cache if available, then fetch from network
  if (typeof localStorage !== 'undefined') {
      const cachedUnits = getUnitsFromLocalStorage();
      if (cachedUnits.length > 0) {
          update(state => ({ ...state, units: cachedUnits }));
      }
  }


  const add = async (unitData: Omit<UnitOfMeasure, 'id' | 'createdAt' | 'updatedAt'>) => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    // Provide all fields for UnitOfMeasure, including optional ones
    const optimisticUnit: UnitOfMeasure = { 
        ...unitData, 
        id: tempId, 
        createdAt: new Date().toISOString(), 
        updatedAt: new Date().toISOString() 
    };

    update(state => {
        const newUnits = [...state.units, optimisticUnit];
        saveUnitsToLocalStorage(newUnits);
        return { ...state, units: newUnits, error: null };
    });


    if (get(offlineStore).isOffline) {
      // Pass the full optimistic unit to the queue, as it includes tempId and timestamps
      syncService.addToQueue('POST', '/units', optimisticUnit ); 
      return;
    }

    // Create a payload for the API that matches what the backend expects (likely no tempId or local timestamps)
    const apiPayload = { ...unitData }; 
    const result = await apiService.post<UnitOfMeasure>('/units', apiPayload);

    if (result.ok) {
      update(state => {
        const newUnits = state.units.map(u => u.id === tempId ? result.value : u);
        saveUnitsToLocalStorage(newUnits);
        return { ...state, units: newUnits };
      });
    } else {
      update(state => {
        const revertedUnits = state.units.filter(u => u.id !== tempId);
        saveUnitsToLocalStorage(revertedUnits);
        return { ...state, units: revertedUnits, error: result.error };
      });
      // Optionally, if API call fails right away, still add to queue for later retry
      // syncService.addToQueue('POST', '/units', optimisticUnit); 
    }
  };

  const updateUnit = async (id: string, unitData: Partial<Omit<UnitOfMeasure, 'id' | 'createdAt' | 'updatedAt'>>) => {
    let originalUnit: UnitOfMeasure | undefined;
    let unitToUpdate: UnitOfMeasure | undefined;

    update(state => {
      originalUnit = state.units.find(u => u.id === id);
      if (!originalUnit) return state; // Should not happen if UI is correct

      unitToUpdate = { ...originalUnit, ...unitData, updatedAt: new Date().toISOString() };
      const updatedUnits = state.units.map(u => u.id === id ? unitToUpdate! : u);
      saveUnitsToLocalStorage(updatedUnits);
      return { ...state, units: updatedUnits, error: null };
    });

    if (!originalUnit) {
        console.error("Original unit not found for update:", id);
        return; // Or handle error appropriately
    }
    
    // If it's a unit that hasn't been synced yet (created offline)
    if (id.startsWith('temp-')) {
        // The item in queue should be a POST. We update the payload for that POST.
        // This requires syncService to have a method like updateInQueueByTempId or similar.
        // For now, we'll queue a new POST with the updated data, and syncService needs to be smart enough
        // to replace the old one or handle duplicates (e.g. by tempId if passed to queue)
        // A simpler approach for this example: assume syncService.addToQueue can handle this via an ID
        // Or, more realistically, the user would wait for the initial POST to sync.
        // For this iteration: queue a PUT, which will fail if ID is temp. Or, if syncService is smart, it maps tempId.
        // Let's assume syncService's addToQueue for POST is what we use for temp items.
        // We are updating the payload of an existing item in the queue.
        // This is a complex part of offline handling. A simple approach:
        // If the item is still temp, it means its 'POST' is in the queue.
        // We are essentially modifying that 'POST' payload.
        // syncService.addToQueue('POST', '/units', unitToUpdate); // This would add a *new* POST. Not ideal.
        // The provided example code for syncService doesn't have update-in-queue logic.
        // So, for an item still with 'temp-' id, we will assume its original 'POST' in queue handles it.
        // Or, we can queue a 'PUT' with the tempId, and the backend/sync processor needs to handle it.
        // For now, let's stick to the pattern: if offline or temp, queue it.
        // If it's a temp item, it means the original POST is in the queue.
        // We are updating it *before* it has been successfully POSTed.
        // The `syncService.addToQueue` would need to be intelligent to update an existing queued item
        // or the `processQueue` would need to handle multiple entries for the same conceptual item.
        // Given the current `syncService`, let's assume if it's temp, the already queued POST will eventually run.
        // Any changes made locally are on the optimistic `unitToUpdate`.
        // If the app goes online, that POST runs. If it's different, server wins or error.
        // This simplification means local updates to temp items might not correctly reflect in the synced item
        // without more advanced queue management in syncService.
        // However, if we *are* offline when updating a temp item:
        if (get(offlineStore).isOffline || id.startsWith('temp-')) {
             // We are essentially modifying the payload of the original POST request for this temp item.
             // The current syncService will just add another item to the queue.
             // This is not ideal. A real syncService would need a way to update existing queued items.
             // For this exercise, we will queue a PUT with the tempId and hope the backend/sync layer can reconcile it
             // or acknowledge that this part is a simplification.
             // A better way for temp items: update the object that the original syncService.addToQueue('POST',...) call used.
             // But that object is not stored in this store.
             // So, we queue a PUT, which is what would happen if it had a real ID.
             syncService.addToQueue('PUT', `/units/${id}`, unitData);
             return;
        }
    }


    if (get(offlineStore).isOffline) {
      syncService.addToQueue('PUT', `/units/${id}`, unitData);
      return;
    }
    
    const apiPayload = { ...unitData }; // Backend expects only the changed fields
    const result = await apiService.put<UnitOfMeasure>(`/units/${id}`, apiPayload);

    if (result.ok) {
      update(state => {
        // Update with the server's response, which might include new updatedAt, etc.
        const newUnits = state.units.map(u => u.id === id ? result.value : u);
        saveUnitsToLocalStorage(newUnits);
        return { ...state, units: newUnits };
      });
    } else {
      update(state => {
        // Revert optimistic update to the original state before this update attempt
        const revertedUnits = state.units.map(u => u.id === id ? originalUnit! : u);
        saveUnitsToLocalStorage(revertedUnits);
        return { ...state, units: revertedUnits, error: result.error };
      });
      // syncService.addToQueue('PUT', `/units/${id}`, unitData); // Optional: queue if API fails
    }
  };

  const remove = async (id: string) => {
    let originalUnitsState: UnitOfMeasure[] = [];
    update(state => {
        originalUnitsState = [...state.units]; 
        const newUnits = state.units.filter(u => u.id !== id);
        saveUnitsToLocalStorage(newUnits);
        return { ...state, units: newUnits, error: null };
    });

    if (id.startsWith('temp-')) {
        // If it's a temporary unit, it was created offline.
        // We need to remove it from the syncService queue if its 'POST' is there.
        // This requires syncService to expose a method like `removeFromQueueByTempId(tempId)` or
        // `removeFromQueueByMatcher(predicate)`.
        // Assuming syncService.addToQueue for a POST used the tempId in its payload,
        // or the QueuedRequest has an `id` field that matches our `tempId`.
        // For now, we can't directly remove from queue here without modifying syncService.
        // The item will be removed locally. If syncService tries to POST it later,
        // it might result in an error or be handled by the backend.
        // This is a common challenge in offline-first apps.
        // console.log(`Removed temp item ${id} locally. syncService may need manual queue adjustment.`);
        return; // Removed locally, and assumed its POST in queue will eventually fail or be ignored.
    }
    
    if (get(offlineStore).isOffline) {
      syncService.addToQueue('DELETE', `/units/${id}`);
      return;
    }

    const result = await apiService.delete<void>(`/units/${id}`); 
    if (!result.ok) {
      update(state => {
        saveUnitsToLocalStorage(originalUnitsState);
        return { ...state, units: originalUnitsState, error: result.error };
      });
      // syncService.addToQueue('DELETE', `/units/${id}`); // Optional: queue if API fails
    }
    // If successful, local state is already updated.
  };
  
  // Subscribe to offlineStore to refetch data when coming online
  if (typeof window !== 'undefined') { // Ensure this only runs in browser
    offlineStore.subscribe(async ($offlineStore) => {
        if (!$offlineStore.isOffline) {
            const storeData = get({subscribe});
            if(storeData.isLoading) return; // Do not run if already loading

            console.log('App is online. Processing queue and refetching data.');
            await syncService.processQueue(); 
            await fetchAll();
        }
    });
  }
  
  // Initial data load
  fetchAll();


  return {
    subscribe,
    fetchAll,
    add,
    update: updateUnit, 
    remove,
  };
}

export const unitOfMeasureStore = createUnitOfMeasureStore();
