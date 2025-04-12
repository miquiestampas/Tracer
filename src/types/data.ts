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
  relevancia?: LecturaRelevante | null; // Añadir información de relevancia
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
  Coordenada_Y: number; // Latitud
  Coordenada_X: number; // Longitud
  Provincia?: string | null;
  Carretera?: string | null;
}

// Podrías añadir interfaces para Vehiculo, etc. si las necesitas 