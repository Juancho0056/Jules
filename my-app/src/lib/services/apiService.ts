import { offlineStore } from '../stores/offlineStore';
import type { Result } from '../types/result'; // Ensure 'type' keyword is used for type-only imports if your tsconfig enforces it
import { success, failure } from '../types/result';
import { get } from 'svelte/store';

const API_BASE_URL = 'https://api.example.com'; // Placeholder

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
    // Ensuring 'status' is captured if provided
    if (status) {
      this.status = status;
    }
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<Result<T, ApiError>> {
  if (get(offlineStore).isOffline) {
    // Using a specific status or code for "offline" can be helpful for client-side logic
    return failure(new ApiError('Application is in offline mode. Request not sent.', -100)); 
  }

  try {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, options);

    if (response.status === 500) {
      offlineStore.setOfflineMode(true);
      return failure(new ApiError(`Server error: ${response.statusText || 'Internal Server Error'}`, response.status));
    }

    if (!response.ok) {
      // Attempt to get more details from response body if possible
      let errorBody = '';
      try {
        errorBody = await response.text(); // Use .text() first to avoid JSON parse error if not JSON
      } catch (e) {
        // Ignore if error body cannot be read or is not text
      }
      return failure(new ApiError(`API request failed: ${response.statusText || 'Error'} ${errorBody}`.trim(), response.status));
    }

    if (response.status === 204) { 
      // For 204 No Content, the body is empty, so return success with null (or undefined, depending on T)
      return success(null as unknown as T); // Cast to unknown first, then to T for type safety
    }

    const data: T = await response.json();
    return success(data);
  } catch (error) {
    // Handle network errors or other issues during fetch
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
        // This specific error often indicates a network issue or CORS problem
        // Depending on strategy, you might want to trigger offline mode here too,
        // but the current plan only mentions 500 errors for automatic switch.
        return failure(new ApiError('Network error: Failed to fetch. The server may be unreachable or check CORS policy.', -101));
    }
    if (error instanceof Error) {
      return failure(new ApiError(`Network or other processing error: ${error.message}`));
    }
    return failure(new ApiError('An unknown error occurred during API request.'));
  }
}

export const apiService = {
  get: <T>(endpoint: string): Promise<Result<T, ApiError>> => fetchApi<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown): Promise<Result<T, ApiError>> => fetchApi<T>(endpoint, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  put: <T>(endpoint: string, body: unknown): Promise<Result<T, ApiError>> => fetchApi<T>(endpoint, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  delete: <T>(endpoint: string): Promise<Result<T, ApiError>> => fetchApi<T>(endpoint, { method: 'DELETE' }),
  // It's good practice to type the 'body' as 'unknown' for post/put and let validation/serialization handle it.
};
