<script lang="ts">
  export let id: string;
  export let name: string;
  export let label: string;
  export let value: string = "";
  export let options: Array<{ value: string; text: string }> = [];
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let errorMessage: string | undefined = undefined;
</script>

<div class="select-input-container">
  <label for={id}>{label}</label>
  <select
    {id}
    {name}
    bind:value={value}
    {disabled}
    {required}
    aria-invalid={errorMessage ? true : undefined}
    aria-describedby={errorMessage ? `${id}-error` : undefined}
  >
    {#each options as option}
      <option value={option.value}>{option.text}</option>
    {/each}
  </select>
  {#if errorMessage}
    <p class="error-message" id={`${id}-error`}>{errorMessage}</p>
  {/if}
</div>

<style>
  .select-input-container {
    width: 100%;
    margin-bottom: 1rem;
  }

  label {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: bold;
  }

  select {
    width: 100%;
    padding: 0.75rem 0.5rem; /* Increased padding for better touch */
    min-height: 44px; /* Ensure minimum touch target height */
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box; /* Ensures padding and border don't add to width */
    font-size: 1rem;
    background-color: white; /* Ensure select is not transparent */
    appearance: none; /* Remove default system appearance for custom styling if needed, but native often better for UX */
    -webkit-appearance: none; /* Safari */
    -moz-appearance: none; /* Firefox */
    /* Add a background arrow for custom appearance; for now, keep native */
    /* background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23007BC2%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); */
    /* background-repeat: no-repeat; */
    /* background-position: right .7em top 50%, 0 0; */
    /* background-size: .65em auto, 100%; */
  }

  select:focus {
    outline: none;
    border-color: blue;
    box-shadow: 0 0 0 2px rgba(0, 0, 255, 0.2);
  }

  select[disabled] {
    background-color: #eee;
    cursor: not-allowed;
  }

  .error-message {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
</style>
