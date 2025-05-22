<script lang="ts">
  export let id: string;
  export let name: string;
  export let label: string;
  export let value: string = "";
  export let placeholder: string = "";
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let errorMessage: string | undefined = undefined;
</script>

<div class="text-input-container">
  <label for={id}>{label}</label>
  <input
    type="text"
    {id}
    {name}
    bind:value={value}
    {placeholder}
    {disabled}
    {required}
    aria-invalid={errorMessage ? true : undefined}
    aria-describedby={errorMessage ? `${id}-error` : undefined}
  />
  {#if errorMessage}
    <p class="error-message" id={`${id}-error`}>{errorMessage}</p>
  {/if}
</div>

<style>
  .text-input-container {
    width: 100%;
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: bold;
  }

  input[type="text"] {
    width: 100%;
    padding: 0.75rem 0.5rem; /* Increased padding for better touch */
    min-height: 44px; /* Ensure minimum touch target height */
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box; /* Ensures padding and border don't add to width */
    font-size: 1rem;
  }

  input[type="text"]:focus {
    outline: none;
    border-color: blue;
    box-shadow: 0 0 0 2px rgba(0, 0, 255, 0.2);
  }

  input[type="text"][disabled] {
    background-color: #eee;
    cursor: not-allowed;
  }

  .error-message {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
</style>
