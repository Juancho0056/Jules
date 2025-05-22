<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let id: string;
  export let name: string;
  export let label: string;
  export let value: any = '';
  export let options: Array<{ value: any; text: string; parentValue: any }> = [];
  export let parentValue: any;
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let errorMessage: string | undefined = undefined;
  export let placeholder: string | undefined = "Select an option"; // Default placeholder

  const dispatch = createEventDispatcher();

  let filteredOptions: Array<{ value: any; text: string }> = [];

  $: {
    // Filter options based on parentValue
    if (parentValue !== undefined && parentValue !== null) {
      filteredOptions = options.filter(opt => opt.parentValue === parentValue);
    } else {
      filteredOptions = []; // No parent value, so no options unless specifically handled
    }

    // Check if the current value is still valid among the new filtered options
    const currentSelectionStillValid = filteredOptions.some(opt => opt.value === value);
    if (!currentSelectionStillValid && value !== "") {
      value = ""; // Reset value
      dispatch('change', { value }); // Notify parent of value change
    } else if (filteredOptions.length === 0 && value !== "") {
      // If no options are available for the current parentValue, reset
      value = "";
      dispatch('change', { value });
    }
  }

  function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    value = target.value; // Update the bound value
    dispatch('change', { value }); // Dispatch change event
  }
</script>

<div class="form-control">
  <label for={id} class="label">{label}{#if required}<span class="required-asterisk">*</span>{/if}</label>
  <select
    {id}
    {name}
    bind:value
    on:change={handleChange}
    {disabled}
    {required}
    class:error={errorMessage}
    aria-invalid={errorMessage ? 'true' : undefined}
    aria-describedby={errorMessage ? `${id}-error` : undefined}
  >
    {#if placeholder}
      <option value="" disabled selected>{placeholder}</option>
    {/if}
    {#each filteredOptions as option (option.value)}
      <option value={option.value}>{option.text}</option>
    {/each}
  </select>
  {#if errorMessage}
    <p class="error-message" id={`${id}-error`}>{errorMessage}</p>
  {/if}
</div>

<style>
  .form-control {
    width: 100%;
    margin-bottom: 1rem;
  }
  .label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: bold;
  }
  .required-asterisk {
    color: red;
    margin-left: 0.25rem;
  }
  select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
    font-size: 1rem;
    background-color: white;
    min-height: 44px; /* Ensure minimum touch target height */
    appearance: none; /* Consistent styling, though native arrow is fine */
    -webkit-appearance: none;
    -moz-appearance: none;
  }
  select:focus {
    border-color: #007bff;
    outline: none;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }
  select.error {
    border-color: red;
  }
  .error-message {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
  /* Basic responsive styling: inputs take full width */
  @media (max-width: 600px) {
    select {
      font-size: 1.1rem; /* Slightly larger for mobile touch */
    }
  }
</style>
