<script lang="ts">
  import { toastStore, type ToastMessage } from '$lib/stores/toastStore';
  import { fly } from 'svelte/transition'; // For a simple animation

  const getTypeClasses = (type: ToastMessage['type']): string => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-black';
      case 'info':
      default:
        return 'bg-blue-500 text-white';
    }
  };
</script>

{#if $toastStore.length > 0}
  <div class="fixed bottom-4 right-4 z-50 space-y-2">
    {#each $toastStore as toast (toast.id)}
      <div
        in:fly={{ y: 20, duration: 300 }}
        out:fly={{ y: 20, duration: 200 }}
        class="p-4 rounded-md shadow-lg flex items-center justify-between {getTypeClasses(toast.type)}"
        role="alert"
      >
        <span>{toast.message}</span>
        <button
          on:click={() => toastStore.removeToast(toast.id)}
          class="ml-4 text-lg font-semibold leading-none hover:opacity-75"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Additional global styles or component-specific styles can go here if needed */
</style>
