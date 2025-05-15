import apiClient from './api';
import type { Caso, CasoCreate, ArchivoExcel, CasoEstadoUpdate, EstadoCaso, SavedSearch, SavedSearchUpdatePayload } from '../types/data'; // Añadir ArchivoExcel y Lectura

// Obtener todos los casos
export const getCasos = async (): Promise<Caso[]> => {
  try {
    const response = await apiClient.get<Caso[]>('/casos');
    return response.data;
  } catch (error) {
    console.error('Error al obtener casos:', error);
    throw error; // Relanzar para manejo en el componente
  }
};

// Crear un nuevo caso
export const createCaso = async (nuevoCaso: CasoCreate): Promise<Caso> => {
  try {
    const response = await apiClient.post<Caso>('/casos', nuevoCaso);
    return response.data;
  } catch (error) {
    console.error('Error al crear caso:', error);
    throw error;
  }
};

// Obtener un caso específico (lo necesitaremos más adelante)
export const getCasoById = async (id: number): Promise<Caso> => {
    try {
      const response = await apiClient.get<Caso>(`/casos/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error al obtener caso ${id}:`, error);
      throw error;
    }
  };

// Obtener los archivos Excel asociados a un caso específico
export const getArchivosPorCaso = async (casoId: number): Promise<ArchivoExcel[]> => {
  try {
    const response = await apiClient.get<ArchivoExcel[]>(`/casos/${casoId}/archivos`);
    return response.data;
  } catch (error) {
    console.error(`Error al obtener archivos para el caso ${casoId}:`, error);
    throw error;
  }
};

// Actualizar un caso (lo necesitaremos más adelante)
export const updateCaso = async (id: number, casoData: Partial<CasoCreate>): Promise<Caso> => {
  try {
    const response = await apiClient.patch<Caso>(`/casos/${id}`, casoData);
    return response.data;
  } catch (error) {
    console.error(`Error al actualizar caso ${id}:`, error);
    throw error;
  }
};

// Eliminar un caso (lo necesitaremos más adelante)
export const deleteCaso = async (casoId: number): Promise<void> => {
  try {
    await apiClient.delete(`/casos/${casoId}`);
  } catch (error) {
    console.error(`Error al eliminar el caso ID ${casoId}:`, error);
    throw error; // Relanzar para manejo en el componente
  }
};

// === NUEVA FUNCIÓN PARA ACTUALIZAR ESTADO ===
/**
 * Actualiza el estado de un caso específico.
 * @param casoId ID del caso a actualizar.
 * @param nuevoEstado El nuevo estado para el caso.
 * @returns Promise<Caso> - El caso actualizado con el nuevo estado.
 */
export const updateCasoEstado = async (casoId: number, nuevoEstado: EstadoCaso): Promise<Caso> => {
  try {
    const payload: CasoEstadoUpdate = { Estado: nuevoEstado };
    const response = await apiClient.put<Caso>(`/casos/${casoId}/estado`, payload);
    return response.data;
  } catch (error) {
    console.error(`Error al actualizar el estado del caso ID ${casoId} a ${nuevoEstado}:`, error);
    throw error; // Relanzar para manejo en el componente
  }
};

// Obtener los vehículos de un caso específico
export const getVehiculosPorCaso = async (casoId: number) => {
  try {
    const response = await apiClient.get(`/casos/${casoId}/vehiculos`);
    return response.data;
  } catch (error) {
    console.error(`Error al obtener vehículos para el caso ${casoId}:`, error);
    throw error;
  }
};

// --- FUNCIONES RELACIONADAS CON LECTURAS (SE MUEVEN A archivosApi.ts) ---

// === SE MUEVE getLecturas A archivosApi.ts ===
/*
export const getLecturas = async (params: {
    caso_id?: number | string; 
    archivo_id?: number;
    matricula?: string;
    limit?: number;
    skip?: number;
} = {}): Promise<Lectura[]> => { // Asume que tienes un tipo Lectura en ../types/data
    try {
        const response = await apiClient.get<Lectura[]>('/lecturas', {
            params: params // Axios pasa esto como query parameters
        });
        return response.data;
    } catch (error) {
        console.error('Error al obtener las lecturas:', error);
        throw error;
    }
};
*/ 

// --- FUNCIONES PARA SAVED SEARCHES (Podrían ir en su propio archivo) ---

// Actualizar Nombre, Color, Notas de una Búsqueda Guardada
export const updateSavedSearch = async (searchId: number, updateData: SavedSearchUpdatePayload): Promise<SavedSearch> => {
    try {
        const response = await apiClient.put<SavedSearch>(`/saved_searches/${searchId}`, updateData);
        return response.data;
    } catch (error) {
        console.error(`Error al actualizar búsqueda guardada ${searchId}:`, error);
        // Re-lanzar para que el componente lo maneje (ej. mostrar notificación)
        throw error; 
    }
}; 