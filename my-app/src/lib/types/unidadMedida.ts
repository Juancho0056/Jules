// my-app/src/lib/types/unidadMedida.ts
export interface BaseAuditableEntity {
    Estado: boolean;
    FechaHoraCreacion: string; // Using string for ISO date strings
    UsuarioCreacion?: string | null;
    FechaHoraModificacion: string; // Using string for ISO date strings
    UsuarioModificacion?: string | null;
}



export interface UnidadMedida  {
    codigo: string; // This maps to 'Id' in the backend's BaseEntity<string>
    nombre: string;
    abreviatura?: string | null;
    orden: number;
    estado: boolean; // This directly maps to BaseAuditableEntity.Estado
    fechaHoraCreacion: string; // Using string for ISO date strings
    fechaHoraModificacion: string; // Using string for ISO date strings
}

export interface CreateUnidadMedidaCommand {
    codigo: string; // This maps to 'Id' in the backend's BaseEntity<string>
    nombre: string;
    abreviatura?: string | null;
    orden: number;
    estado: boolean; // This directly maps to BaseAuditableEntity.Estado
}

export interface UpdateUnidadMedidaCommand {
    codigo: string; // This is the server's existing Id for the entity to update
    nombre: string;
    abreviatura?: string | null;
    orden: number;
    estado: boolean; // This directly maps to BaseAuditableEntity.Estado
}
