import { writable } from 'svelte/store';

export interface UserProfile { // Example, adjust as per your API's user object
  id: string;
  email: string;
  name?: string;
  claims?: UserClaims;
  // roles, permissions, etc.
}
export interface UserClaims {
  email: string;
  sub: string;
  roles: string[];
  [key: string]: any;
}
export interface SessionState {
  isAuthenticated: boolean;
  token: string | null;
  // refreshToken is primarily stored securely (e.g. Dexie), 
  // but store might reflect its existence or related data like expiration.
  refreshTokenPresent: boolean; 
  tokenExpiration: Date | null; 
  user: UserProfile | null;
  claims?: UserClaims;
  error: string | null;
  isLoading: boolean;
}

const initialSessionState: SessionState = {
  isAuthenticated: false,
  token: null,
  refreshTokenPresent: false,
  tokenExpiration: null,
  user: null,
  error: null,
  isLoading: false,
};

const createSessionStore = () => {
  const { subscribe, update, set } = writable<SessionState>(initialSessionState);

  return {
    subscribe,
    setSession: (
        token: string, 
        refreshTokenExists: boolean, // Indicates if a new refresh token was set in Dexie
        tokenExpiresAt: Date, 
        userData?: UserProfile | null,
        claims?: UserClaims | null
    ) => {
      update(state => ({
        ...state,
        isAuthenticated: true,
        token: token,
        refreshTokenPresent: refreshTokenExists,
        tokenExpiration: tokenExpiresAt,
        user: userData || state.user || null, // Keep existing user data if not provided
        error: null,
        isLoading: false,
        claims: claims || state.claims // Keep existing claims if not provided
      }));
    },
    clearSession: () => {
      set(initialSessionState); // Reset to initial state
    },
    setError: (errorMessage: string) => {
      update(state => ({
        ...state,
        error: errorMessage,
        isLoading: false,
        isAuthenticated: false, // Usually, an error means not authenticated
        token: null,
        // refreshTokenPresent might remain true if it's still in Dexie but token failed
      }));
    },
    clearError: () => {
      update(state => ({
        ...state,
        error: null
      }));
    },
    setLoading: (loading: boolean = true) => {
      update(state => ({ ...state, isLoading: loading, error: null /* Clear error on new loading */ }));
    },
    // Optionally, a method to update just the token if refreshed without changing user data
    setRefreshedToken: (newToken: string, newExpiration: Date) => {
        update(state => ({
            ...state,
            token: newToken,
            tokenExpiration: newExpiration,
            isAuthenticated: true, // Should be true if token refreshed successfully
            isLoading: false,
            error: null,
        }));
    }
  };
};

export const sessionStore = createSessionStore();
