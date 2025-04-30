export interface Lector {
    ID_Lector: string;
    Nombre: string;
    Carretera: string;
    Sentido: string;
    Orientacion?: string;
}

export interface Lectura {
    ID_Lectura: number;
    Matricula: string;
    Fecha_y_Hora: string;
    lector?: Lector;
    relevancia?: { ID_Relevante: number; Nota?: string | null } | null;
}

export interface LecturaRelevanteUpdate {
    caso_id?: number;
    Nota?: string | null;
} 