import { writable, derived } from 'svelte/store';

// --- Configuration ---
export const ROLES = {
  ADMIN: 'admin',
  VENDEDOR: 'vendedor',
  SUPERVISOR: 'supervisor',
  NONE: 'none', // For logged-out state or no specific role
};

export type Role = typeof ROLES[keyof typeof ROLES];

export const PERMISSIONS = {
  // UnidadMedida Permissions
  CREATE_UNIDAD: 'create_unidad',
  EDIT_UNIDAD: 'edit_unidad',
  DELETE_UNIDAD: 'delete_unidad',
  VIEW_UNIDAD: 'view_unidad', // Assuming a general view permission might be useful

  // Product Permissions (example)
  CREATE_PRODUCT: 'create_product',
  EDIT_PRODUCT: 'edit_product',
  DELETE_PRODUCT: 'delete_product',
  VIEW_PRODUCT: 'view_product',

  // Sale Permissions (example)
  CREATE_SALE: 'create_sale',
  VIEW_SALES_REPORTS: 'view_sales_reports',

  // Settings (example)
  VIEW_SETTINGS: 'view_settings',
  EDIT_SETTINGS: 'edit_settings',

  // Clientes Permissions
  CREATE_CLIENTE: 'create_cliente',
  EDIT_CLIENTE: 'edit_cliente',
  DELETE_CLIENTE: 'delete_cliente',
  VIEW_CLIENTE: 'view_cliente',

  // Campanas Permissions
  CREATE_CAMPANA: 'create_campana',
  EDIT_CAMPANA: 'edit_campana',
  DELETE_CAMPANA: 'delete_campana',
  VIEW_CAMPANA: 'view_campana',

  // Departamentos Permissions
  CREATE_DEPARTAMENTO: 'create_departamento',
  EDIT_DEPARTAMENTO: 'edit_departamento',
  DELETE_DEPARTAMENTO: 'delete_departamento',
  VIEW_DEPARTAMENTO: 'view_departamento',

  // ListasPrecio Permissions
  CREATE_LISTAPRECIO: 'create_listaprecio',
  EDIT_LISTAPRECIO: 'edit_listaprecio',
  DELETE_LISTAPRECIO: 'delete_listaprecio',
  VIEW_LISTAPRECIO: 'view_listaprecio',

  // Municipios Permissions
  CREATE_MUNICIPIO: 'create_municipio',
  EDIT_MUNICIPIO: 'edit_municipio',
  DELETE_MUNICIPIO: 'delete_municipio',
  VIEW_MUNICIPIO: 'view_municipio',
};

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const rolePermissions: Record<Role, Permission[]> = {
  [ROLES.ADMIN]: [
    PERMISSIONS.CREATE_UNIDAD,
    PERMISSIONS.EDIT_UNIDAD,
    PERMISSIONS.DELETE_UNIDAD,
    PERMISSIONS.VIEW_UNIDAD,
    PERMISSIONS.CREATE_PRODUCT,
    PERMISSIONS.EDIT_PRODUCT,
    PERMISSIONS.DELETE_PRODUCT,
    PERMISSIONS.VIEW_PRODUCT,
    PERMISSIONS.CREATE_SALE, // Admin might do everything
    PERMISSIONS.VIEW_SALES_REPORTS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.EDIT_SETTINGS,
    // Admin gets all new permissions
    PERMISSIONS.CREATE_CLIENTE,
    PERMISSIONS.EDIT_CLIENTE,
    PERMISSIONS.DELETE_CLIENTE,
    PERMISSIONS.VIEW_CLIENTE,
    PERMISSIONS.CREATE_CAMPANA,
    PERMISSIONS.EDIT_CAMPANA,
    PERMISSIONS.DELETE_CAMPANA,
    PERMISSIONS.VIEW_CAMPANA,
    PERMISSIONS.CREATE_DEPARTAMENTO,
    PERMISSIONS.EDIT_DEPARTAMENTO,
    PERMISSIONS.DELETE_DEPARTAMENTO,
    PERMISSIONS.VIEW_DEPARTAMENTO,
    PERMISSIONS.CREATE_LISTAPRECIO,
    PERMISSIONS.EDIT_LISTAPRECIO,
    PERMISSIONS.DELETE_LISTAPRECIO,
    PERMISSIONS.VIEW_LISTAPRECIO,
    PERMISSIONS.CREATE_MUNICIPIO,
    PERMISSIONS.EDIT_MUNICIPIO,
    PERMISSIONS.DELETE_MUNICIPIO,
    PERMISSIONS.VIEW_MUNICIPIO,
  ],
  [ROLES.VENDEDOR]: [
    PERMISSIONS.VIEW_UNIDAD, // Can view units but not change them
    PERMISSIONS.VIEW_PRODUCT,
    PERMISSIONS.CREATE_SALE,
    PERMISSIONS.VIEW_CLIENTE,
    PERMISSIONS.VIEW_CAMPANA,
    PERMISSIONS.VIEW_DEPARTAMENTO,
    PERMISSIONS.VIEW_LISTAPRECIO,
    PERMISSIONS.VIEW_MUNICIPIO,
  ],
  [ROLES.SUPERVISOR]: [
    PERMISSIONS.VIEW_UNIDAD,
    PERMISSIONS.CREATE_PRODUCT, // Can create products
    PERMISSIONS.EDIT_PRODUCT,   // Can edit products
    PERMISSIONS.VIEW_PRODUCT,
    PERMISSIONS.VIEW_SALES_REPORTS,
    PERMISSIONS.VIEW_CLIENTE,
    PERMISSIONS.VIEW_CAMPANA,
    PERMISSIONS.VIEW_DEPARTAMENTO,
    PERMISSIONS.VIEW_LISTAPRECIO,
    PERMISSIONS.VIEW_MUNICIPIO,
  ],
  [ROLES.NONE]: [],
};

// --- Stores ---
export const currentUserRole = writable<Role>(ROLES.ADMIN); // Default to ADMIN for testing

export const currentUserPermissions = derived(
  currentUserRole,
  ($role) => {
    return rolePermissions[$role] || [];
  }
);

// --- Functions ---
export function setCurrentUserRole(role: Role) {
  if (rolePermissions[role]) {
    currentUserRole.set(role);
  } else {
    console.warn(`Role "${role}" not found. Setting to NONE.`);
    currentUserRole.set(ROLES.NONE);
  }
}

/**
 * Checks if the current user has a specific permission.
 * @param permission The permission to check.
 * @returns True if the user has the permission, false otherwise.
 */
export function hasPermission(permission: Permission): boolean {
  let _permissions: Permission[] = [];
  const unsubscribe = currentUserPermissions.subscribe(value => {
    _permissions = value;
  });
  unsubscribe(); // Immediately unsubscribe as we only need the current value
  return _permissions.includes(permission);
}

// Example of how to use in a component:
// import { currentUserRole, currentUserPermissions, setCurrentUserRole, hasPermission, ROLES, PERMISSIONS } from './authStore';
//
// // To change role (e.g., on login)
// setCurrentUserRole(ROLES.VENDEDOR);
//
// // To check permission
// if (hasPermission(PERMISSIONS.CREATE_SALE)) { ... }
//
// // To reactively use permissions in Svelte template:
// // {#if $currentUserPermissions.includes(PERMISSIONS.EDIT_PRODUCT)}
// //   <button>Edit Product</button>
// // {/if}
