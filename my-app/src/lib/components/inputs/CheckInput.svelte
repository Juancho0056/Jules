<script lang="ts">
  export let id: string;
  export let name: string;
  export let label: string;
  export let checked: boolean = false;
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let errorMessage: string | undefined = undefined;
</script>

<div class="check-input-container">
  <label for={id} class="checkbox-label">
    <input
      type="checkbox"
      {id}
      {name}
      bind:checked={checked}
      {disabled}
      {required}
      aria-invalid={errorMessage ? true : undefined}
      aria-describedby={errorMessage ? `${id}-error` : undefined}
    />
    <span class="label-text">{label}</span>
  </label>
  {#if errorMessage}
    <p class="error-message" id={`${id}-error`}>{errorMessage}</p>
  {/if}
</div>

<style>
  .check-input-container {
    width: 100%;
    margin-bottom: 1rem;
    display: flex; /* Aligns label and potential error message */
    flex-direction: column; /* Stacks label/checkbox and error message */
  }

  .checkbox-label {
    display: flex; /* Aligns checkbox and text */
    align-items: center; /* Vertically centers checkbox and text */
    cursor: pointer;
    font-weight: bold;
  }

  input[type="checkbox"] {
    margin-right: 0.5rem; /* Space between checkbox and label text */
    width: 1.5rem; /* Increased size for better touch */
    height: 1.5rem; /* Increased size for better touch */
    min-width: 24px; /* Ensure minimum even if rem is small */
    min-height: 24px; /* Ensure minimum even if rem is small */
    accent-color: blue; /* Optional: custom color for the check mark */
    /* Removing fixed width/height allows it to scale with font if needed, but fixed can be more predictable */
  }

  input[type="checkbox"]:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(0, 0, 255, 0.2); /* Focus ring */
  }

  input[type="checkbox"][disabled] {
    cursor: not-allowed;
    accent-color: #ccc;
  }

  .label-text {
    /* Styles for the text part of the label, if needed */
  }

  .error-message {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem; /* Space between checkbox/label and error message */
  }
</style>
