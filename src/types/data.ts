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
  Fecha_y_Hora: string; // Considerar usar Date | string
  Carril?: string | null;
  Velocidad?: number | null;
  ID_Lector?: string | null;
  Coordenada_X?: number | null;
  Coordenada_Y?: number | null;
  Tipo_Fuente: string;
  // Añadir campos que faltan según el linter
  relevancia?: { ID_Relevante: number, Nota?: string | null } | null; // Asumiendo que relevancia también es global
  lector?: Lector | null; // Relación con Lector
  pasos?: number; // Campo calculado o de la API
  // Otros campos existentes...
  ID_Vehiculo?: number | null;
  FotoMatricula?: string | null;
  Confiabilidad?: string | null;
  Procesado?: boolean;
  // Asegúrate de que todos los campos usados en la app estén aquí
}

// --- NUEVA INTERFAZ LECTURA RELEVANTE ---
export interface LecturaRelevante {
  ID_Relevante: number;
  ID_Lectura: number;
  Fecha_Marcada: string; // Datetime viene como string ISO
  Nota?: string | null;
}

// --- NUEVO: Interfaz para respuesta paginada de lecturas ---
export interface LecturasResponse {
  total_count: number;
  lecturas: Lectura[];
}

// --- NUEVO: Interfaz para respuesta de subida de archivo ---
export interface UploadResponse {
  archivo: ArchivoExcel; // Información del archivo creado en la BD
  nuevos_lectores_creados?: string[] | null; // Lista de IDs de lectores nuevos creados
}

// --- NUEVO: Interfaz para Lector (respuesta GET) ---
export interface Lector {
  ID_Lector: string;
  Nombre?: string | null;
  Carretera?: string | null;
  Provincia?: string | null;
  Localidad?: string | null;
  Sentido?: string | null;
  Orientacion?: string | null;
  Organismo_Regulador?: string | null;
  Contacto?: string | null;
  Coordenada_X?: number | null; // Longitud
  Coordenada_Y?: number | null; // Latitud
  Texto_Libre?: string | null;
  Imagen_Path?: string | null;
  // No incluimos las lecturas aquí por defecto para evitar cargas pesadas
}

// --- NUEVO: Interfaz para respuesta paginada de lectores ---
export interface LectoresResponse {
  total_count: number;
  lectores: Lector[];
}

// --- NUEVO: Interfaz para datos de actualización de Lector ---
export interface LectorUpdateData {
    Nombre?: string | null;
    Carretera?: string | null;
    Provincia?: string | null;
    Localidad?: string | null;
    Sentido?: string | null;
    Orientacion?: string | null;
    Organismo_Regulador?: string | null;
    Contacto?: string | null;
    UbicacionInput?: string | null; // Campo para pegar coords/enlace
    Texto_Libre?: string | null;
    Imagen_Path?: string | null;
}

// === NUEVO: Interfaz para datos de lector en el mapa ===
export interface LectorCoordenadas {
  ID_Lector: string;
  Nombre?: string | null;
  Carretera?: string | null;
  Provincia?: string | null;
  Organismo_Regulador?: string | null;
  Coordenada_Y: number; // Latitud
  Coordenada_X: number; // Longitud
  Sentido?: string | null;
}

// === NUEVO: Interfaz para Sugerencias de Edición ===
export interface LectorSugerenciasResponse {
  provincias: string[];
  localidades: string[];
  carreteras: string[];
  organismos: string[];
  contactos: string[];
}

// --- Tipos para Búsquedas Guardadas --- 
export interface SavedSearch {
    id: number;
    caso_id: number;
    nombre: string;
    filtros: any; // O un tipo más específico: CurrentLprFilters normalizado?
    color: string | null;
    notas: string | null;
    result_count: number | null;
    unique_plates: string[] | null;
    // Podríamos añadir fecha_creacion si existe en backend
}

// Payload para actualizar una búsqueda guardada (solo campos editables)
export interface SavedSearchUpdatePayload {
    nombre: string;
    color: string | null;
    notas: string | null;
}

// Podrías añadir interfaces para Vehiculo, etc. si las necesitas 

// --- NUEVO: Interfaz para Vehiculo (respuesta GET) ---
export interface Vehiculo {
    ID_Vehiculo: number;
    Matricula: string;
    Marca: string | null;
    Modelo: string | null;
    Color: string | null;
    Propiedad: string | null;
    Alquiler: boolean;
    Observaciones: string | null;
    Comprobado: boolean;
    Sospechoso: boolean;
    total_lecturas_lpr_caso?: number;
    // Podríamos añadir aquí el recuento de lecturas si la API lo devuelve en el futuro
    // totalLecturas?: number;
} 