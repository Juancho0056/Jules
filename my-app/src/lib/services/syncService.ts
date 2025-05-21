import { offlineStore } from '../stores/offlineStore';
import { apiService, ApiError } from './apiService'; // Assuming ApiError is exported from apiService
import { get } from 'svelte/store';

const REQUEST_QUEUE_KEY = 'apiRequestQueue';

export interface QueuedRequest {
  id: string; // Unique ID for the request, e.g., UUID or timestamp-based
  method: 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  payload?: unknown; // Using unknown for better type safety, similar to apiService
  timestamp: number;
}

const getQueue = (): QueuedRequest[] => {
  const storedQueue = localStorage.getItem(REQUEST_QUEUE_KEY);
  return storedQueue ? JSON.parse(storedQueue) : [];
};

const saveQueue = (queue: QueuedRequest[]): void => {
  localStorage.setItem(REQUEST_QUEUE_KEY, JSON.stringify(queue));
};

const addToQueue = (method: 'POST' | 'PUT' | 'DELETE', endpoint: string, payload?: unknown): void => {
  // Ensure localStorage is available (it's not in SSR)
  if (typeof localStorage === 'undefined') {
    console.warn('localStorage is not available. Request not added to offline queue.');
    // Optionally, you could have a fallback or notify the user differently.
    return;
  }
  const queue = getQueue();
  const newRequest: QueuedRequest = {
    id: `${new Date().getTime()}-${Math.random().toString(36).substring(2, 9)}`, // Simple unique ID
    method,
    endpoint,
    payload,
    timestamp: new Date().getTime(),
  };
  queue.push(newRequest);
  saveQueue(queue);
  console.log('Request added to offline queue:', newRequest);
};

const processQueue = async (): Promise<void> => {
  // Ensure localStorage is available
  if (typeof localStorage === 'undefined') {
    console.warn('localStorage is not available. Cannot process queue.');
    return;
  }
  if (get(offlineStore).isOffline) {
    console.log('Offline, not processing queue.');
    return;
  }

  let queue = getQueue();
  if (queue.length === 0) {
    // console.log('Queue is empty, nothing to process.'); // Less noisy
    return;
  }

  console.log('Processing offline queue...', queue);
  const remainingQueue: QueuedRequest[] = [];

  for (const request of queue) {
    let success = false;
    try {
      let result;
      switch (request.method) {
        case 'POST':
          result = await apiService.post(request.endpoint, request.payload);
          break;
        case 'PUT':
          result = await apiService.put(request.endpoint, request.payload);
          break;
        case 'DELETE':
          result = await apiService.delete(request.endpoint);
          break;
        default:
          console.warn('Unsupported method in queue:', request.method, 'for request ID:', request.id);
          remainingQueue.push(request); // Keep unsupported methods
          continue;
      }

      if (result.ok) {
        console.log(`Request ${request.id} (${request.method} ${request.endpoint}) processed successfully.`);
        success = true;
      } else {
        console.error(`Failed to process queued request ${request.id}:`, result.error.message, result.error);
        // More specific error handling can be added here.
        // For example, if result.error is an instance of ApiError and result.error.status is 400,
        // it might mean the request is malformed and should not be retried indefinitely.
        // For now, all failed requests are kept.
      }
    } catch (error) {
      // This catch block handles errors thrown directly by apiService calls (e.g., network issues not caught inside apiService)
      // or errors within the processQueue logic itself.
      console.error(`Error during processing of queued request ${request.id}:`, error);
    }

    if (!success) {
      remainingQueue.push(request);
    }
  }

  saveQueue(remainingQueue);
  if (remainingQueue.length > 0 && remainingQueue.length !== queue.length) {
    console.log('Some requests were processed, but others remain in queue:', remainingQueue);
  } else if (remainingQueue.length === 0 && queue.length > 0) {
    console.log('Offline queue processed successfully. All items cleared.');
  } else if (remainingQueue.length > 0){
     console.log('No requests could be processed, all remain in queue:', remainingQueue);
  }
};

// Automatically try to process the queue when the app comes online
// Ensure this subscription logic only runs in the browser context
if (typeof window !== 'undefined') {
  offlineStore.subscribe(state => {
    if (!state.isOffline) {
      console.log('Application is now online. Attempting to process queue.');
      processQueue();
    }
  });
} else {
  // Optional: log if not in browser, indicating auto-processing won't be set up
  // console.log('Not in browser environment, offline queue auto-processing will not be initialized.');
}


export const syncService = {
  addToQueue,
  processQueue, // Expose for manual trigger if needed
  getQueue,     // Expose for debugging or UI display
};
