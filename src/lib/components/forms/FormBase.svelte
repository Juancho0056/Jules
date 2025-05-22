<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import TextInput from '../inputs/TextInput.svelte';
  import SelectInput from '../inputs/SelectInput.svelte';
  import DateInput from '../inputs/DateInput.svelte';
  import CheckInput from '../inputs/CheckInput.svelte';
  import DependentSelect from '../inputs/DependentSelect.svelte';
  // TextAreaInput would be a new simple component or handled directly

  export let fields: Array<any> = [];
  export let initialData: Record<string, any> = {};

  let formData: Record<string, any> = {};
  let formErrors: Record<string, string> = {};

  const dispatch = createEventDispatcher();

  onMount(() => {
    initializeForm();
  });

  function initializeForm() {
    const newFormData = { ...initialData }; // Start with initialData
    const newFormErrors = {};
    fields.forEach(field => {
      // If not already in initialData, use the field's default value or a sensible default
      if (newFormData[field.name] === undefined) {
        newFormData[field.name] = field.value !== undefined ? field.value : getDefaultValue(field.type);
      }
      newFormErrors[field.name] = '';
    });
    formData = newFormData;
    formErrors = newFormErrors;
  }

  function getDefaultValue(type: string) {
    switch (type) {
      case 'text':
      case 'textarea':
      case 'date':
      case 'select':
      case 'dependent-select':
        return '';
      case 'checkbox':
        return false;
      default:
        return undefined;
    }
  }
  
  // Debounce timer id
  let debounceTimer: number;

  function handleInputChange(fieldName: string, newValue: any) {
    formData[fieldName] = newValue;
    formData = { ...formData }; // Trigger reactivity for dependent selects

    // Clear previous debounce timer
    clearTimeout(debounceTimer);

    // Set a new debounce timer
    debounceTimer = window.setTimeout(() => {
        validateField(fieldName, newValue);
        dispatch('change', { fieldName, newValue, currentFormData: { ...formData } });
    }, 300); // 300ms debounce
  }

  function validateField(fieldName: string, value: any): boolean {
    const fieldConfig = fields.find(f => f.name === fieldName);
    if (fieldConfig?.validation) {
      const error = fieldConfig.validation(value, formData);
      formErrors[fieldName] = error;
      formErrors = { ...formErrors }; // Trigger reactivity
      return !error;
    }
    formErrors[fieldName] = ''; // Clear error if no validation function or no error
    formErrors = { ...formErrors };
    return true;
  }

  function validateForm(): boolean {
    let isValid = true;
    const newFormErrors = { ...formErrors }; // Operate on a copy
    fields.forEach(field => {
      if (field.validation) {
        const error = field.validation(formData[field.name], formData);
        newFormErrors[field.name] = error;
        if (error) isValid = false;
      } else {
        newFormErrors[field.name] = ''; // Ensure field error is cleared if no validation
      }
    });
    formErrors = newFormErrors; // Assign back to trigger reactivity
    return isValid;
  }

  function handleSave() {
    if (validateForm()) {
      dispatch('save', { ...formData });
    } else {
      dispatch('error', { ...formErrors });
      // Optionally, focus the first field with an error
      const firstErrorField = fields.find(f => formErrors[f.name]);
      if (firstErrorField) {
        const el = document.querySelector(`[name="${firstErrorField.name}"]`);
        if (el && typeof (el as HTMLElement).focus === 'function') {
          (el as HTMLElement).focus();
        }
      }
    }
  }

  function handleCancel() {
    dispatch('cancel');
    // Optionally, reset form to initial state or let parent handle it
    // initializeForm(); 
  }

  // Reactive statement to re-initialize form if fields or initialData props change
  $: if (fields || initialData) {
    initializeForm();
  }

</script>

<form on:submit|preventDefault={handleSave} class="form-base">
  {#each fields as field (field.name)}
    <div class="form-field-container">
      {#if field.type === 'text'}
        <TextInput
          id={field.name}
          name={field.name}
          label={field.label}
          bind:value={formData[field.name]}
          on:input={(e) => handleInputChange(field.name, (e.target as HTMLInputElement).value)}
          placeholder={field.placeholder}
          disabled={field.disabled}
          required={field.required}
          errorMessage={formErrors[field.name]}
        />
      {:else if field.type === 'select'}
        <SelectInput
          id={field.name}
          name={field.name}
          label={field.label}
          bind:value={formData[field.name]}
          on:change={(e) => handleInputChange(field.name, (e.target as HTMLSelectElement).value)}
          options={field.options}
          disabled={field.disabled}
          required={field.required}
          errorMessage={formErrors[field.name]}
        />
      {:else if field.type === 'dependent-select'}
        <DependentSelect
          id={field.name}
          name={field.name}
          label={field.label}
          bind:value={formData[field.name]}
          on:change={(e) => handleInputChange(field.name, e.detail.value !== undefined ? e.detail.value : (e.target as HTMLSelectElement).value)}
          options={field.options}
          parentValue={formData[field.parentField]}
          disabled={field.disabled}
          required={field.required}
          errorMessage={formErrors[field.name]}
          placeholder={field.placeholder}
        />
      {:else if field.type === 'date'}
        <DateInput
          id={field.name}
          name={field.name}
          label={field.label}
          bind:value={formData[field.name]}
          on:input={(e) => handleInputChange(field.name, (e.target as HTMLInputElement).value)}
          disabled={field.disabled}
          required={field.required}
          errorMessage={formErrors[field.name]}
        />
      {:else if field.type === 'checkbox'}
        <CheckInput
          id={field.name}
          name={field.name}
          label={field.label}
          bind:checked={formData[field.name]}
          on:change={(e) => handleInputChange(field.name, (e.target as HTMLInputElement).checked)}
          disabled={field.disabled}
          required={field.required} /* Technically for checkbox, required means it must be checked */
          errorMessage={formErrors[field.name]}
        />
      {:else if field.type === 'textarea'}
        <div class="form-control">
          <label for={field.name} class="label">{field.label}{#if field.required}<span class="required-asterisk">*</span>{/if}</label>
          <textarea
            id={field.name}
            name={field.name}
            bind:value={formData[field.name]}
            on:input={(e) => handleInputChange(field.name, (e.target as HTMLTextAreaElement).value)}
            placeholder={field.placeholder}
            disabled={field.disabled}
            required={field.required}
            rows={field.rows || 3}
            class:error={formErrors[field.name]}
            aria-invalid={formErrors[field.name] ? 'true' : undefined}
            aria-describedby={formErrors[field.name] ? `${field.name}-error` : undefined}
          ></textarea>
          {#if formErrors[field.name]}
            <p class="error-message" id={`${field.name}-error`}>{formErrors[field.name]}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}

  <div class="form-actions">
    <button type="submit" class="btn btn-primary">Save</button>
    <button type="button" on:click={handleCancel} class="btn btn-secondary">Cancel</button>
  </div>
</form>

<style>
  .form-base {
    display: flex;
    flex-direction: column;
    gap: 0.5rem; /* Reduced gap between fields for more compact POS view */
  }
  .form-field-container {
    /* Styles for individual field containers if needed, e.g. for complex layouts */
  }
  .form-actions {
    margin-top: 1.5rem;
    display: flex;
    gap: 1rem;
    justify-content: flex-end; /* Align buttons to the right */
  }
  .btn {
    padding: 0.6rem 1.2rem; /* Slightly smaller padding for POS */
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem; /* Slightly smaller font for POS */
    text-transform: uppercase;
    font-weight: bold;
  }
  .btn-primary {
    background-color: #007bff;
    color: white;
  }
  .btn-primary:hover {
    background-color: #0056b3;
  }
  .btn-secondary {
    background-color: #6c757d;
    color: white;
  }
  .btn-secondary:hover {
    background-color: #545b62;
  }

  /* Inherit styles from input components for consistency or override here */
  /* Styling for textarea if not a separate component */
  .form-control { /* Copied from TextInput for consistency for direct textarea */
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
  textarea {
    width: 100%;
    padding: 0.75rem 0.5rem; /* Consistent with other inputs */
    min-height: 88px; /* Approx 2 lines of text + padding, or 44px * 2 */
    border: 1px solid #ccc;
    border-radius: 4px;
    box-sizing: border-box;
    font-size: 1rem;
    line-height: 1.5;
    font-family: inherit; /* Ensure consistent font */
  }
  textarea:focus {
    border-color: #007bff;
    outline: none;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }
  textarea.error {
    border-color: red;
  }
  .error-message {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  /* Responsive adjustments */
  @media (max-width: 600px) {
    .form-actions {
      flex-direction: column; /* Stack buttons on small screens */
    }
    .btn {
      width: 100%;
      font-size: 1rem; /* Larger buttons for touch on mobile */
      padding: 0.8rem 1.5rem;
    }
  }
</style>
