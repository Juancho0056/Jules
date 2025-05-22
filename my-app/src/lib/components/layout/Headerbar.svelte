<script lang="ts">
  import { sessionStore } from '$lib/stores/sessionStore';
  import { authService } from '$lib/services/authService';
  import { goto } from '$app/navigation';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  async function handleLogout() {
    await authService.logout();
    goto('/login');
  }
</script>

<header class="bg-blue-600 text-white p-4 shadow-md fixed top-0 left-0 right-0 z-50">
  <div class="container mx-auto flex justify-between items-center">
    <!-- Mobile Menu Toggle Button -->
    <button 
      on:click={() => dispatch('toggleMobileMenu')}
      class="md:hidden p-2 rounded-md text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
      aria-label="Open main menu"
    >
      <svg class="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
      </svg>
    </button>

    <div class="text-xl font-semibold hidden md:block">MyApp</div>
    
    <div class="flex items-center">
      {#if $sessionStore.isAuthenticated && $sessionStore.user}
        <span class="mr-4 hidden sm:inline">Welcome, {$sessionStore.user.name || $sessionStore.user.email}</span>
        <button 
          on:click={handleLogout}
          class="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
        >
          Logout
        </button>
      {:else if !$sessionStore.isAuthenticated}
        <!-- Optionally, add a login link here if needed, though sidebar has one -->
        <!-- <a href="/login" class="hover:underline">Login</a> -->
      {/if}
    </div>
  </div>
</header>

<!-- Spacer div to prevent content from being obscured by the fixed header -->
<div class="pt-16"></div>
