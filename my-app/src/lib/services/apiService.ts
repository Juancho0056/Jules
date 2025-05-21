import { offlineStore } from '../stores/offlineStore';
import type { Result } from '../types/result';
import { success, failure } from '../types/result';
import { get } from 'svelte/store';
import { sessionStore } from '../stores/sessionStore'; // Import sessionStore
import { authService } from './authService';     // Import authService

const API_BASE_URL = 'https://api.example.com'; // Placeholder

// Define public paths that do not require authentication or token refresh logic
const PUBLIC_PATHS = [
    '/Auth/login',
    '/Auth/refresh-token',
    '/api/health', // Added /api/health for connectivity checks
    // Add other public paths if needed
];

export class ApiError extends Error {
  constructor(message: string, public status?: number, public errorBody?: any) {
    super(message);
    this.name = 'ApiError';
    if (status) this.status = status;
    if (errorBody) this.errorBody = errorBody;
  }
}

let isRefreshingToken = false; // Global flag to prevent multiple refresh attempts
let tokenRefreshSubscribers: ((token: string | null) => void)[] = []; // Queue for requests waiting for token refresh

const onTokenRefreshed = (token: string | null) => {
    tokenRefreshSubscribers.forEach(callback => callback(token));
    tokenRefreshSubscribers = [];
};


async function fetchApi<T>(
    endpoint: string, 
    options: RequestInit = {}, 
    isRetry: boolean = false // Flag to prevent infinite refresh loops
): Promise<Result<T, ApiError>> {
  const isPublicPath = PUBLIC_PATHS.some(path => endpoint.startsWith(path));

  if (get(offlineStore).isOffline && !isPublicPath) { // Public paths might still be accessible if specifically needed
    return failure(new ApiError('Application is in offline mode. Request not sent.', -100));
  }

  // Add token to headers if available and not a public path
  const currentToken = get(sessionStore).token;
  if (currentToken && !isPublicPath) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${currentToken}`,
    };
  }
  
  // If a token refresh is already in progress, queue this request
  if (isRefreshingToken && !isPublicPath && !isRetry) {
      return new Promise((resolve) => {
          tokenRefreshSubscribers.push((newToken) => {
              if (newToken) {
                  // Re-apply new token before retrying
                  const newOptions = { ...options };
                  newOptions.headers = {
                    ...newOptions.headers,
                    'Authorization': `Bearer ${newToken}`,
                  };
                  resolve(fetchApi<T>(endpoint, newOptions, true)); // Retry with new token
              } else {
                  resolve(failure(new ApiError('Token refresh failed, request not retried.', 401)));
              }
          });
      });
  }

  try {
    // Ensure endpoint starts with / if API_BASE_URL is defined, or handle full URLs
    const requestUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
    const response = await fetch(requestUrl, options);

    if (response.status === 401 && !isPublicPath && !isRetry) {
      // Check again for isRefreshingToken in case it was set while this request was in flight
      if (isRefreshingToken) { 
           return new Promise((resolve) => {
              tokenRefreshSubscribers.push((newToken) => {
                  if (newToken) {
                      const newOptions = { ...options };
                      newOptions.headers = {
                          ...newOptions.headers,
                          'Authorization': `Bearer ${newToken}`,
                      };
                      resolve(fetchApi<T>(endpoint, newOptions, true));
                  } else {
                      resolve(failure(new ApiError('Token refresh failed, request not retried.', 401)));
                  }
              });
           });
      }
      isRefreshingToken = true;
      sessionStore.setLoading(true); // Indicate activity for token refresh

      const refreshedSuccessfully = await authService.refreshToken();
      
      // Store the new token from sessionStore *after* refreshToken() has completed
      const newTokenAfterRefresh = get(sessionStore).token; 
      isRefreshingToken = false;
      sessionStore.setLoading(false); // Reset loading state from sessionStore
      onTokenRefreshed(newTokenAfterRefresh); // Notify queued requests with the new token

      if (refreshedSuccessfully && newTokenAfterRefresh) {
        // Token has been updated in sessionStore by authService.refreshToken
        // Retry the original request with the new token
        console.log(`Token refreshed successfully. Retrying request to ${endpoint}`);
        options.headers = { // Re-apply headers with new token
          ...options.headers,
          'Authorization': `Bearer ${newTokenAfterRefresh}`,
        };
        return fetchApi<T>(endpoint, options, true); // Pass true for isRetry
      } else {
        // Refresh failed, authService.refreshToken should have handled logout.
        // Do not retry the request.
        return failure(new ApiError('Session expired or token refresh failed. Please log in again.', 401));
      }
    }

    if (response.status === 500 && !isPublicPath) { // Server error
      offlineStore.setOfflineMode(true); // Go offline on server errors for non-public paths
      return failure(new ApiError(`Server error: ${response.statusText || 'Internal Server Error'}`, response.status));
    }

    if (!response.ok) {
      let errorBody: any;
      try {
        errorBody = await response.json(); // Try to parse error body as JSON
      } catch (e) {
        try {
            errorBody = await response.text(); // Fallback to text
        } catch (e2) {
            errorBody = 'Could not retrieve error body.';
        }
      }
      return failure(new ApiError(`API request failed: ${response.statusText || 'Error'}`, response.status, errorBody));
    }

    if (response.status === 204) {
      return success(null as unknown as T);
    }

    const data: T = await response.json();
    return success(data);
  } catch (error) {
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      // If browser thinks it's online but fetch fails, suspect underlying connectivity issues.
      if (typeof window !== 'undefined' && window.navigator.onLine) {
        offlineStore.suspectConnectivity(); // Inform offlineStore
      }
      return failure(new ApiError('Network error: Failed to fetch. Server may be unreachable.', -101));
    }
    if (error instanceof Error) { // General Error instance check
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
  // A way to make calls without the default token handling, for authService itself
  // This is one way to break circular dependency if authService calls apiService.
  // Alternatively, authService can use `fetch` directly for its specific, public endpoints.
  // For now, assuming authService calls like /Auth/login are handled by PUBLIC_PATHS.
};
```
