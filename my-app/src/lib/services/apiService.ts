import { offlineStore } from '../stores/offlineStore';
import { Result } from '../types/result'; // Updated import
import { get } from 'svelte/store';
import { sessionStore } from '../stores/sessionStore'; // Import sessionStore
import { authService } from './authService';     // Import authService

const API_BASE_URL = 'https://nrwv6zf9-9080.use.devtunnels.ms/api'; // Updated API_BASE_URL

// Define public paths that do not require authentication or token refresh logic
const PUBLIC_PATHS = [
    '/Auth/login',
    '/Auth/refresh-token',
    '/health', // Ensure /api/health is present
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
): Promise<Result<T>> { // Updated return type
  const isPublicPath = PUBLIC_PATHS.some(path => endpoint.startsWith(path));

  if (get(offlineStore).isOffline && !isPublicPath) { // Public paths might still be accessible if specifically needed
    return Result.FailureFromErrors<T>(['Application is in offline mode. Request not sent.']);
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
                  resolve(Result.FailureFromErrors<T>(['Token refresh failed, request not retried.']));
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
                      resolve(Result.FailureFromErrors<T>(['Token refresh failed, request not retried.']));
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
        return Result.FailureFromErrors<T>(['Session expired or token refresh failed. Please log in again.']);
      }
    }

    if (response.status === 500 && !isPublicPath) { // Server error
      offlineStore.setOfflineMode(true); // Go offline on server errors for non-public paths
      const errorMsg = `Server error: ${response.statusText || 'Internal Server Error'}`;
      return Result.FailureFromErrors<T>([errorMsg]);
    }

    if (!response.ok) {
      let errorBodyText: string = 'Could not retrieve error body.';
      try {
        const errorBody = await response.json(); // Try to parse error body as JSON
        errorBodyText = JSON.stringify(errorBody);
      } catch (e) {
        try {
            errorBodyText = await response.text(); // Fallback to text
        } catch (e2) {
            // errorBodyText remains 'Could not retrieve error body.'
        }
      }
      const errorMsg = `API request failed: ${response.statusText || 'Error'} (Status: ${response.status}). Body: ${errorBodyText}`;
      return Result.FailureFromErrors<T>([errorMsg]);
    }

    if (response.status === 204) {
      return Result.Success<T>(null as T); // Use null as T for 204 No Content
    }

    //const data: T = await response.json();
    //return Result.Success<T>(data);
    console.log(`API response from ${endpoint}:`, response);
    //const data = await response.json(); // data is already Result<T>
    //return data;
    return await response.json() as Result<T>;
  } catch (error) {
    console.error(`Error during API request to ${endpoint}:`, error);
    const errorMessages: string[] = [];
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      // If browser thinks it's online but fetch fails, suspect underlying connectivity issues.
      if (typeof window !== 'undefined' && window.navigator.onLine) {
        offlineStore.suspectConnectivity(); // Inform offlineStore
      }
      errorMessages.push('Network error: Failed to fetch. Server may be unreachable.');
    } else if (error instanceof Error) { // General Error instance check
      errorMessages.push(`Network or other processing error: ${error.message}`);
    } else {
      errorMessages.push('An unknown error occurred during API request.');
    }
    return Result.FailureFromErrors<T>(errorMessages);
  }
}

// Define checkHealth function separately to maintain cleaner object definition
async function checkHealth(): Promise<Result<any>> {
  // Endpoint is '/api/health'. It's public.
  // Assuming a 200 OK with any content means healthy.
  // If the health endpoint returns specific JSON, T could be that type. For now, 'any' is fine.
  return fetchApi<any>('/health', { method: 'GET' });
}

export const apiService = {
  get: <T>(endpoint: string): Promise<Result<T>> => fetchApi<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body: unknown): Promise<Result<T>> => fetchApi<T>(endpoint, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  put: <T>(endpoint: string, body: unknown): Promise<Result<T>> => fetchApi<T>(endpoint, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  delete: <T>(endpoint: string): Promise<Result<T>> => fetchApi<T>(endpoint, { method: 'DELETE' }),
  checkHealth, // Add the new function here
  // A way to make calls without the default token handling, for authService itself
  // This is one way to break circular dependency if authService calls apiService.
  // Alternatively, authService can use `fetch` directly for its specific, public endpoints.
  // For now, assuming authService calls like /Auth/login are handled by PUBLIC_PATHS.
};

