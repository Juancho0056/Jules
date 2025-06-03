<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let id: string = "";
  export let name: string = "";
  export let label: string = "";
  export let value: number | null = null;
  export let placeholder: string = "";
  export let disabled: boolean = false;
  export let required: boolean = false;
  export let errorMessage: string = "";

  export let min: number | undefined;
  export let max: number | undefined;
  export let step: number | undefined;
  export let allowDecimals: boolean = true;
  export let stepButtons: boolean = false;

  const dispatch = createEventDispatcher();

  let holdInterval: ReturnType<typeof setInterval>;
  let activeButton: "increment" | "decrement" | null = null;

  function handleInput(event: Event) {
    const input = event.target as HTMLInputElement;
    let raw = input.value;

    const regex = allowDecimals ? /[^\d.-]/g : /[^\d-]/g;
    let cleaned = raw.replace(regex, "");

    if (allowDecimals) {
      cleaned = cleaned.replace(/(?!^)-/g, "").replace(/(\..*?)\..*/g, "$1");
    } else {
      cleaned = cleaned.replace(/-/g, "").replace(/\..*/g, "");
    }

    input.value = cleaned;

    const numericValue = parseFloat(cleaned);
    const isValid = !isNaN(numericValue);

    value = isValid ? numericValue : null;

    dispatch("input", {
      value: isValid ? numericValue : null,
    });
  }

  function updateValue(delta: number) {
    const current = value ?? 0;
    const next = current + delta;

    if (min !== undefined && next < min) return;
    if (max !== undefined && next > max) return;

    value = next;
    dispatch("input", { value });
  }

  function startHold(delta: number) {
    updateValue(delta);
    activeButton = delta > 0 ? "increment" : "decrement";
    holdInterval = setInterval(() => updateValue(delta), 150);
  }

  function stopHold() {
    activeButton = null;
    clearInterval(holdInterval);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!stepButtons || disabled) return;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      updateValue(step ?? 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      updateValue(-(step ?? 1));
    }
  }
</script>

<div class="form-control">
  <label for={id} class="label">
    {label}
    {#if required}
      <span class="required-asterisk">*</span>
    {/if}
  </label>

  {#if stepButtons}
    <div class="step-container">
      <button
        type="button"
        class="step-btn {activeButton === 'decrement' ? 'active' : ''}"
        on:mousedown={() => startHold(-(step ?? 1))}
        on:mouseup={stopHold}
        on:mouseleave={stopHold}
        on:touchstart={() => startHold(-(step ?? 1))}
        on:touchend={stopHold}
        {disabled}>−</button
      >

      <input
        {id}
        {name}
        type="number"
        value={value === null ? "" : value}
        readonly
        {min}
        {max}
        {step}
        {disabled}
        on:keydown={handleKeyDown}
        tabindex="0"
        aria-invalid={errorMessage ? "true" : undefined}
        aria-describedby={errorMessage ? `${id}-error` : undefined}
      />

      <button
        type="button"
        class="step-btn {activeButton === 'increment' ? 'active' : ''}"
        on:mousedown={() => startHold(step ?? 1)}
        on:mouseup={stopHold}
        on:mouseleave={stopHold}
        on:touchstart={() => startHold(step ?? 1)}
        on:touchend={stopHold}
        {disabled}>+</button
      >
    </div>
  {:else}
    <input
      {id}
      {name}
      class:error={errorMessage}
      type="number"
      inputmode="numeric"
      pattern={allowDecimals ? "[0-9]*[.]?[0-9]*" : "[0-9]*"}
      value={value === null ? "" : value}
      {placeholder}
      {disabled}
      {required}
      {min}
      {max}
      {step}
      on:input={handleInput}
      aria-invalid={errorMessage ? "true" : undefined}
      aria-describedby={errorMessage ? `${id}-error` : undefined}
    />
  {/if}

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

  input {
    width: 100%;
    padding: 0.75rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
    font-size: 1rem;
    line-height: 1.5;
  }

  input[readonly] {
    text-align: center;
    background-color: #f9f9f9;
    pointer-events: none;
  }

  input:focus {
    border-color: #007bff;
    outline: none;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }

  input.error {
    border-color: red;
  }

  .step-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .step-btn {
    padding: 0.4rem 0.8rem;
    font-size: 1.2rem;
    font-weight: bold;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f0f0f0;
    cursor: pointer;
    transition:
      background-color 0.2s,
      box-shadow 0.2s;
  }

  .step-btn.active {
    background-color: #007bff;
    color: white;
    box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.2);
  }

  .step-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-message {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }
</style>
