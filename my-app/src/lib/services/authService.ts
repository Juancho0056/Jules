import { apiService } from './apiService'; // ApiError is no longer directly used here
import { db } from './dbService';
import { sessionStore, type UserProfile } from '../stores/sessionStore';
import { toastStore } from '../stores/toastStore';
import { jwtDecode } from 'jwt-decode';
// import { goto } from '$app/navigation'; // Example for SvelteKit navigation

const TOKEN_KEY = 'app_Token';
const REFRESH_TOKEN_KEY = 'app_refreshToken';
const TOKEN_EXPIRATION_KEY = 'app_tokenExpiration';

// Define a type for the decoded JWT payload
interface DecodedJwt {
  id: string; // Standard claim for user ID
  email: string; // Standard claim for email
  permissions?: string[]; // Custom claim for permissions
  exp?: number; // Standard claim for expiration time
  // Add other claims you expect in your JWT
}

interface LoginResponse {
  token: string;
  refreshToken: string;
  expiration: string; // ISO date string
  user?: UserProfile; // Optional user profile data from backend
}

interface RefreshResponse {
  token: string;
  refreshToken: string;
  expiration: string; // ISO date string
}

const login = async (email: string, password: string, captchaToken?: string): Promise<boolean> => {
  sessionStore.setLoading(true);
  try {
    // Adjust endpoint and payload as per your backend API for login
    const response = await apiService.post<LoginResponse>(
        '/Auth/login', // Actual API endpoint
        { email, password, captchaToken }
    );
    console.log("Login response:", response);
    if (response.isSuccess && response.value) {
      console.log("Login response:", response);
      const { token, refreshToken, expiration, user: backendUser } = response.value;
      const expirationDate = new Date(expiration);

      // Decode token to get claims and potentially user info
      const decodedToken = jwtDecode<DecodedJwt>(token);
      const claims = decodedToken.permissions || [];
      
      // Construct user profile, prioritizing backend-provided user data
      let userProfile: UserProfile = {
        id: backendUser?.id || decodedToken.id,
        email: backendUser?.email || decodedToken.email,
        name: backendUser?.name, // Take name from backend if available
        claims: claims,
      };
      
      // If backendUser exists, spread its properties (like name) and then add/override claims
      if (backendUser) {
        userProfile = { ...backendUser, claims: claims };
      }


      await db.appConfig.bulkPut([
        { key: REFRESH_TOKEN_KEY, value: refreshToken },
        { key: TOKEN_EXPIRATION_KEY, value: expirationDate.toISOString() },
        { key: TOKEN_KEY, value: token },
      ]);
      
      sessionStore.setSession(token, true, expirationDate, userProfile);
      toastStore.addToast('Login successful!', 'success');
      // await goto('/'); // Navigate to dashboard or home page
      return true;
    } else {
      // Use Errors array from Result object
      const errorMsg = response.errors?.join(', ') || 'Login failed due to unknown server error.';
      sessionStore.setError(errorMsg);
      toastStore.addToast(`Login failed: ${errorMsg}`, 'error');
      return false;
    }
  } catch (error: any) {
    // Catch any network or unexpected errors not handled by apiService's Result
    const errorMsg = error.message || 'An unexpected error occurred during login.';
    sessionStore.setError(errorMsg);
    toastStore.addToast(`Login error: ${errorMsg}`, 'error');
    return false;
  } finally {
    sessionStore.setLoading(false);
  }
};

const refreshToken = async (): Promise<boolean> => {
  sessionStore.setLoading(true);
  try {
    const storedRefreshTokenItem = await db.appConfig.get(REFRESH_TOKEN_KEY);
    const storedRefreshToken = storedRefreshTokenItem?.value as string | undefined;

    console.log("Stored refresh token:", storedRefreshToken);
    if (!storedRefreshToken) {
      sessionStore.setError('No refresh token available.');
      // No toast here, as this might be part of a background check. Logout will show toast.
      await logout(false); // Pass false to avoid loop if logout calls refresh
      return false;
    }

    const response = await apiService.post<RefreshResponse>(
        '/Auth/refresh-token', // Actual API endpoint
        { refreshToken: storedRefreshToken }
    );
    console.log("Refresh token response:", response);
    
    if (response.isSuccess && response.value) {
      const { token, refreshToken: newRefreshToken, expiration } = response.value;
      const newExpirationDate = new Date(expiration);

      // Decode the new token to extract claims
      const decodedToken = jwtDecode<DecodedJwt>(token);
      const claims = decodedToken.permissions || [];

      await db.appConfig.bulkPut([
        { key: REFRESH_TOKEN_KEY, value: newRefreshToken },
        { key: TOKEN_EXPIRATION_KEY, value: newExpirationDate.toISOString() },
        { key: TOKEN_KEY, value: token },
      ]);
      
      // Pass claims to the updated setRefreshedToken method
      sessionStore.setRefreshedToken(token, newExpirationDate, claims);
      // toastStore.addToast('Session refreshed.', 'info'); // Often too noisy for auto-refresh
      return true;
    } else {
      // Use Errors array from Result object
      const errorMsg = response.errors?.join(', ') || 'Session refresh failed.';
      sessionStore.setError(errorMsg); // This might trigger UI to show login
      toastStore.addToast(errorMsg, 'error');
      await logout(false); // Critical: if refresh fails, logout to prevent corrupted state
      return false;
    }
  } catch (error: any) {
    // Catch any network or unexpected errors not handled by apiService's Result
    const errorMsg = error.message || 'An unexpected error occurred during token refresh.';
    sessionStore.setError(errorMsg);
    toastStore.addToast(`Refresh token error: ${errorMsg}`, 'error');
    await logout(false);
    return false;
  } finally {
    sessionStore.setLoading(false);
  }
};

// Parameter to prevent potential infinite loop if logout itself triggers a refresh attempt that fails
const logout = async (notify: boolean = true): Promise<void> => {
  sessionStore.setLoading(true); // Brief loading state
  
  // Optional: Call backend logout endpoint
  // try {
  //   await apiService.post('/Auth/logout', {}); // No body needed, or specific payload
  // } catch (e) {
  //   console.warn("Error calling backend logout, proceeding with client-side cleanup:", e);
  // }

  await db.appConfig.bulkDelete([REFRESH_TOKEN_KEY, TOKEN_EXPIRATION_KEY, TOKEN_KEY]);
  sessionStore.clearSession(); // Clears token from memory via sessionStore
  
  if (notify) {
    toastStore.addToast('Logged out successfully.', 'info');
  }
  // await goto('/login'); // Navigate to login page
  sessionStore.setLoading(false);
};

const initializeSession = async (): Promise<void> => {
  sessionStore.setLoading(true);
  try {

    const storedTokenItem = await db.appConfig.get(TOKEN_KEY);
  const storedToken = storedTokenItem?.value as string | undefined;

    const storedExpirationItem = await db.appConfig.get(TOKEN_EXPIRATION_KEY);
    const storedExpiration = storedExpirationItem?.value as string | undefined;
    
    const storedRefreshTokenItem = await db.appConfig.get(REFRESH_TOKEN_KEY);
    const storedRefreshToken = storedRefreshTokenItem?.value as string | undefined;
    console.log("Stored refresh token:", storedRefreshToken);
    console.log("Stored expiration date:", storedExpiration);

    if (storedRefreshToken && storedExpiration) {
      const expirationDate = new Date(storedExpiration);
      if (expirationDate > new Date()) { // If token is potentially valid (not expired)
        if (storedToken) {
          // Decode token to get claims and user info
          const decodedToken = jwtDecode<DecodedJwt>(storedToken);
          const claims = decodedToken.permissions || [];
          const userProfile: UserProfile = {
            id: decodedToken.id,
            email: decodedToken.email,
            // name: decodedToken.name, // Add if name is available in token
            claims: claims,
          };
          sessionStore.setSession(storedToken, true, new Date(storedExpiration), userProfile);
          console.log("Session restored from Dexie with claims.");
          return;
        }
        // If no token but refresh token exists and is valid, attempt refresh
        const refreshed = await refreshToken(); 
        if (!refreshed) {
            console.log("Session initialization: refresh token failed or token expired, session cleared.");
        } else {
            console.log("Session initialization: session successfully refreshed with claims via refreshToken.");
        }
      } else {
        // Token expired
        toastStore.addToast('Session expired. Please log in again.', 'warning');
        await logout(false); 
      }
    } else {
      sessionStore.clearSession(); 
      console.log("Session initialization: no session token found in storage.");
    }
  } catch (error: any) {
    console.error('Error during session initialization:', error.message || error);
    // Attempt to decode token even on error to see if it's a JWT error
    if (storedToken && (error.name === 'InvalidTokenError' || error.message?.includes('Invalid token'))) {
        console.error("Failed to decode stored token during initialization.");
    }
    await logout(false); 
  } finally {
    sessionStore.setLoading(false);
  }
};

export const authService = {
  login,
  refreshToken,
  logout,
  initializeSession,
};