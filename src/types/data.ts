// src/types/data.ts

// --- NUEVO: Tipo para Estados de Caso ---
export type EstadoCaso = 
  | "Nuevo"
  | "Esperando Archivos"
  | "En Análisis"
  | "Pendiente Informe"
  | "Cerrado";

// Interfaz para los datos de un Caso (respuesta de GET)
export interface Caso {
  ID_Caso: number;
  Nombre_del_Caso: string;
  Año: number;
  NIV?: string | null;
  Descripcion?: string | null;
  Fecha_de_Creacion: string; // Las fechas suelen venir como string ISO
  Estado: EstadoCaso; // Añadir campo Estado
}

// Interfaz para crear un Caso (payload de POST)
export interface CasoCreate {
  Nombre_del_Caso: string;
  Año: number;
  NIV?: string | null;
  Descripcion?: string | null;
  Estado?: EstadoCaso; // Opcional al crear, el backend pondrá 'Nuevo'
}

// Interfaz para actualizar estado (payload de PUT)
export interface CasoEstadoUpdate {
    Estado: EstadoCaso;
}

// Interfaz para ArchivoExcel (respuesta de GET)
export interface ArchivoExcel {
    ID_Archivo: number;
    ID_Caso: number;
    Nombre_del_Archivo: string;
    Tipo_de_Archivo: 'LPR' | 'GPS';
    Fecha_de_Importacion: string; // Fecha como string ISO
}

// --- NUEVA INTERFAZ LECTURA ---
export interface Lectura {
  ID_Lectura: number;
  ID_Archivo: number;
  Matricula: string;
  Fecha_y_Hora: string; // Datetime viene como string ISO
  Carril?: string | null;
  Velocidad?: number | null;
  ID_Lector?: string | null;
  Coordenada_X?: number | null;
  Coordenada_Y?: number | null;
  Tipo_Fuente: 'LPR' | 'GPS';
}

// Podrías añadir interfaces para Lector, Vehiculo, etc. si las necesitas 