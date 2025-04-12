// Definiciones de tipos para los datos de la API

// Interfaz para leer un Caso
export interface Caso {
  ID_Caso: number;
  Nombre_del_Caso: string;
  Año: number; // Campo Año añadido y obligatorio
  Descripcion?: string | null;
  NIV?: string | null; // Campo NIV añadido y opcional
  Fecha_de_Creacion: string; // Formato ISO Date (YYYY-MM-DD)
}

// Interfaz para crear un Caso (sin ID ni fecha)
export interface CasoCreate {
  Nombre_del_Caso: string;
  Año: number; // Campo Año añadido y obligatorio
  Descripcion?: string | null;
  NIV?: string | null; // Campo NIV añadido y opcional
}

// Interfaz para leer un ArchivoExcel
export interface ArchivoExcel {
  ID_Archivo: number;
  ID_Caso: number;
  Nombre_del_Archivo: string;
  Tipo_de_Archivo: 'GPS' | 'LPR';
  Fecha_de_Importacion: string; // Formato ISO Date (YYYY-MM-DD)
}

// Puedes añadir aquí otras interfaces (Lector, Vehiculo, etc.) a medida que las necesites 