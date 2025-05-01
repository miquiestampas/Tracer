export interface Lector {
    ID_Lector: string;
    Nombre: string;
    Carretera: string;
    Sentido: string;
    Orientacion?: string;
}

export interface Lectura {
    ID_Lectura: number;
    ID_Archivo: number;
    Matricula: string;
    Fecha_y_Hora: string;
    Carril?: string | null;
    Velocidad?: number | null;
    ID_Lector?: string | null;
    Coordenada_X?: number | null;
    Coordenada_Y?: number | null;
    Tipo_Fuente: string;
    relevancia?: { 
        ID_Relevante: number;
        Nota?: string | null;
    } | null;
    lector?: {
        ID_Lector: string;
        Nombre?: string | null;
        Carretera?: string | null;
        Provincia?: string | null;
        Localidad?: string | null;
        Sentido?: string | null;
        Orientacion?: string | null;
        Coordenada_X?: number | null;
        Coordenada_Y?: number | null;
        Organismo_Regulador?: string | null;
    } | null;
    pasos?: number;
}

export interface LecturaRelevanteUpdate {
    caso_id?: number;
    Nota?: string | null;
} 