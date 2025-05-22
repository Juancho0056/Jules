<script lang="ts">
  import { sessionStore, type UserProfile } from '$lib/stores/sessionStore';
  import { AppClaims } from '$lib/config/appClaims';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';

  export let showMobileMenu: boolean = false;

  interface NavLink {
    path: string;
    label: string;
    requiredClaim?: string; // Claim is optional, e.g. for public links or auth-status links
  }

  const navLinks: NavLink[] = [
    { path: '/app/dashboard', label: 'Dashboard', requiredClaim: AppClaims.Security_View }, // Example, change claim
    { path: '/app/units', label: 'Units of Measure', requiredClaim: AppClaims.UnidadMedida_View },
    { path: '/app/products', label: 'Products', requiredClaim: AppClaims.Producto_View },
    { path: '/app/customers', label: 'Customers', requiredClaim: AppClaims.Cliente_View },
    // Add more links as needed based on AppClaims
    // Example: { path: '/app/users', label: 'Users', requiredClaim: AppClaims.User_View },
  ];

  let currentUserClaims: string[] = [];
  const unsubscribeSession = sessionStore.subscribe(session => {
    currentUserClaims = session.user?.claims || [];
  });

  function hasClaim(claim?: string): boolean {
    if (!claim) return true; // No claim required, link is public or for all authenticated users
    if (!$sessionStore.isAuthenticated || !currentUserClaims.length) return false;
    return currentUserClaims.includes(claim);
  }

  function handleLinkClick(path: string) {
    goto(path);
    showMobileMenu = false; // Hide menu on navigation
  }
  
  onDestroy(() => {
    if (unsubscribeSession) {
      unsubscribeSession();
    }
  });
</script>

<aside 
  class="bg-gray-800 text-white w-64 min-h-screen fixed left-0 top-0 pt-16 shadow-lg z-40 
         transform {showMobileMenu ? 'translate-x-0' : '-translate-x-full'} 
         transition-transform duration-300 ease-in-out 
         md:translate-x-0 md:block"
>
  <nav class="p-4">
    <ul class="space-y-2">
      {#if $sessionStore.isAuthenticated}
        {#each navLinks as link}
          {#if hasClaim(link.requiredClaim)}
            <li>
              <button 
                on:click={() => handleLinkClick(link.path)}
                class="w-full text-left block p-2 hover:bg-gray-700 rounded focus:outline-none focus:bg-gray-600"
              >
                {link.label}
              </button>
            </li>
          {/if}
        {/each}
      {:else}
        <li>
          <button 
            on:click={() => handleLinkClick('/login')}
            class="w-full text-left block p-2 hover:bg-gray-700 rounded focus:outline-none focus:bg-gray-600"
          >
            Login
          </button>
        </li>
      {/if}
    </ul>
  </nav>
</aside>
