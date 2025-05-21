<script lang="ts">
  import { goto } from '$app/navigation';
  import { authService } from '$lib/services/authService';
  import { sessionStore }from '$lib/stores/sessionStore'; // To read error messages
  // import { toastStore } from '$lib/stores/toastStore'; // Optional for direct toasts

  let email = '';
  let password = '';
  let captchaToken = ''; // For now, a simple text input

  let isLoading = false;
  let errorMessage = ''; // Local error message state

  // Subscribe to sessionStore.error for reactive error message display
  sessionStore.subscribe(currentSession => {
    if (currentSession.error) {
      errorMessage = currentSession.error;
    } else {
      errorMessage = ''; // Clear local error if sessionStore error is cleared
    }
  });

  const handleLogin = async () => {
    isLoading = true;
    errorMessage = ''; // Clear previous errors before new attempt
    sessionStore.clearError(); // Clear error in store before login attempt

    const success = await authService.login(email, password, captchaToken);

    if (success) {
      await goto('/'); // Navigate to the dashboard or home page
    } else {
      // Error message is already being updated by the subscription to sessionStore.error
      // If sessionStore itself is not updated by authService on failure, then:
      // errorMessage = $sessionStore.error || 'Login failed. Please try again.';
      // toastStore.addToast(errorMessage, 'error'); // Or use toast
    }
    isLoading = false;
  };
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-100">
  <div class="px-8 py-6 mt-4 text-left bg-white shadow-lg rounded-lg">
    <h3 class="text-2xl font-bold text-center">Login</h3>
    <form on:submit|preventDefault={handleLogin}>
      <div class="mt-4">
        <div>
          <label class="block" for="email">Email</label>
          <input
            type="email"
            placeholder="Email"
            bind:value={email}
            required
            class="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
        <div class="mt-4">
          <label class="block" for="password">Password</label>
          <input
            type="password"
            placeholder="Password"
            bind:value={password}
            required
            class="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
          />
        </div>
        <div class="mt-4">
          <label class="block" for="captcha">Captcha</label>
          <input
            type="text"
            placeholder="Captcha Token"
            bind:value={captchaToken}
            required
            class="w-full px-4 py-2 mt-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-600"
            aria-describedby="captchaHelp"
          />
          <p id="captchaHelp" class="text-xs text-gray-500 mt-1">
            Captcha integration is pending. Enter any text for now.
          </p>
        </div>
        {#if errorMessage}
          <div class="mt-4 text-red-500 text-sm">
            {errorMessage}
          </div>
        {/if}
        <div class="flex items-baseline justify-between">
          <button
            type="submit"
            class="px-6 py-2 mt-4 text-white bg-blue-600 rounded-lg hover:bg-blue-900 disabled:opacity-50"
            disabled={isLoading}
          >
            {#if isLoading}Loading...{:else}Login{/if}
          </button>
          <!-- Optional: Add a link to a registration page or password reset -->
        </div>
      </div>
    </form>
  </div>
</div>
