import apiClient from './api';
import type { Lector, LectoresResponse, LectorUpdateData, LectorCoordenadas, LectorSugerenciasResponse } from '../types/data';
import axios from 'axios';

/**
 * Parámetros para obtener la lista de lectores (incluye paginación).
 */
interface GetLectoresParams {
  skip?: number;
  limit?: number;
  // Podrían añadirse filtros de búsqueda aquí en el futuro (ej. por ID, nombre, etc.)
}

/**
 * Obtiene una lista paginada de lectores desde la API.
 * @param params Objeto con parámetros de paginación (skip, limit).
 * @returns Promise<LectoresResponse> - Objeto con conteo total y lista de lectores.
 */
export const getLectores = async (params: GetLectoresParams = {}): Promise<LectoresResponse> => {
  try {
    // Filtrar parámetros nulos o indefinidos antes de enviar
    const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, v]) => v != null)
    );
    const response = await apiClient.get<LectoresResponse>('/lectores', {
      params: cleanParams
    });
    return response.data;
  } catch (error) {
    console.error('Error al obtener los lectores:', error);
    throw error;
  }
};

/*
// --- Funciones futuras ---

// Interface para datos de actualización de Lector (similar a LectorUpdate en schemas.py)
export interface LectorUpdateData {
    Nombre?: string | null;
    Carretera?: string | null;
    Provincia?: string | null;
    Localidad?: string | null;
    Sentido?: string | null;
    Orientacion?: string | null;
    Organismo_Regulador?: string | null;
    Contacto?: string | null;
    Coordenada_X?: number | null;
    Coordenada_Y?: number | null;
    Texto_Libre?: string | null;
    Imagen_Path?: string | null;
}

export const updateLector = async (lectorId: string, data: LectorUpdateData): Promise<Lector> => {
    try {
        const response = await apiClient.put<Lector>(`/lectores/${lectorId}`, data);
        return response.data;
    } catch (error) {
        console.error(`Error al actualizar el lector ${lectorId}:`, error);
        throw error;
    }
};

export const deleteLector = async (lectorId: string): Promise<void> => {
    try {
        await apiClient.delete(`/lectores/${lectorId}`);
    } catch (error) {
        console.error(`Error al eliminar el lector ${lectorId}:`, error);
        throw error;
    }
};

*/ 

/**
 * Actualiza los datos de un lector existente.
 * @param lectorId ID del lector a actualizar.
 * @param data Objeto con los campos a actualizar.
 * @returns Promise<Lector> - El lector actualizado.
 */
export const updateLector = async (lectorId: string, data: LectorUpdateData): Promise<Lector> => {
    try {
        const response = await apiClient.put<Lector>(`/lectores/${lectorId}`, data);
        return response.data;
    } catch (error) {
        console.error(`Error al actualizar el lector ${lectorId}:`, error);
        throw error;
    }
};

/**
 * Elimina un lector.
 * @param lectorId ID del lector a eliminar.
 * @returns Promise<void>
 */
export const deleteLector = async (lectorId: string): Promise<void> => {
    try {
        await apiClient.delete(`/lectores/${lectorId}`);
    } catch (error) {
        console.error(`Error al eliminar el lector ${lectorId}:`, error);
        // Considerar manejo específico si hay lecturas asociadas (error 400 del backend)
        if (axios.isAxiosError(error) && error.response?.status === 400) {
             throw new Error(error.response?.data?.detail || 'No se puede eliminar, tiene lecturas asociadas.');
        }
        throw error;
    }
};

/**
 * Obtiene la lista de lectores con coordenadas válidas para mostrar en el mapa.
 * @returns Promise<LectorCoordenadas[]> - Lista de lectores con ID, Nombre, Lat y Lon.
 */
export const getLectoresParaMapa = async (): Promise<LectorCoordenadas[]> => {
  try {
    const response = await apiClient.get<LectorCoordenadas[]>('/lectores/coordenadas');
    return response.data;
  } catch (error) {
    console.error('Error al obtener los lectores para el mapa:', error);
    throw error;
  }
};

/**
 * Obtiene listas de valores únicos para sugerencias en formularios de lector.
 * @returns Promise<LectorSugerenciasResponse> - Objeto con listas de sugerencias.
 */
export const getLectorSugerencias = async (): Promise<LectorSugerenciasResponse> => {
  try {
    const response = await apiClient.get<LectorSugerenciasResponse>('/lectores/sugerencias');
    // Devolver un objeto con listas vacías si la respuesta no es la esperada, por seguridad
    return response.data || { provincias: [], localidades: [], carreteras: [], organismos: [], contactos: [] };
  } catch (error) {
    console.error('Error al obtener las sugerencias para lectores:', error);
    // Devolver listas vacías en caso de error para no bloquear el UI
    return { provincias: [], localidades: [], carreteras: [], organismos: [], contactos: [] };
  }
};

/**
 * Resultado de la importación, incluye errores si los hubo.
 */
interface ImportResult {
  imported: number;
  updated: number;
  errors: string[];
}

/**
 * Importa múltiples lectores al sistema.
 * Intenta actualizar si el lector tiene ID, si falla por no encontrado (404), intenta crearlo.
 * @param lectores Array de objetos con los datos de lectores a importar.
 * @returns Promise<ImportResult> - Contador de lectores importados/actualizados y lista de errores.
 */
export const importarLectores = async (lectores: any[]): Promise<ImportResult> => {
  let imported = 0;
  let updated = 0;
  const errores: string[] = [];
  
  console.log(`Intentando importar ${lectores.length} lectores`);
  
  const results = await Promise.allSettled(
    lectores.map(async (lector) => {
      const lectorData = {
        ...lector,
        ID_Lector: lector.ID_Lector ? String(lector.ID_Lector) : undefined
      };
      
      console.log(`Procesando lector:`, lectorData);
      
      try {
        if (lectorData.ID_Lector) {
          console.log(`Intentando actualizar (PUT) /lectores/${lectorData.ID_Lector}`);
          try {
            const response = await apiClient.put(`/lectores/${lectorData.ID_Lector}`, lectorData);
            console.log(`Respuesta actualización (PUT):`, response.data);
            return { status: 'updated', id: lectorData.ID_Lector, data: response.data };
          } catch (putError) {
            if (axios.isAxiosError(putError) && putError.response?.status === 404) {
              console.log(`Lector ${lectorData.ID_Lector} no encontrado, intentando crear (POST)...`);
              const { ID_Lector, ...dataToCreate } = lectorData; // Usar los datos originales para POST
              const response = await apiClient.post('/lectores', lectorData);
              console.log(`Respuesta creación (POST tras PUT fallido):`, response.data);
              return { status: 'created', id: response.data.ID_Lector, data: response.data };
            } else {
              throw putError; // Lanzar otros errores del PUT
            }
          }
        } else {
          console.log(`Intentando crear (POST) /lectores`);
          const response = await apiClient.post('/lectores', lectorData);
          console.log(`Respuesta creación (POST):`, response.data);
          return { status: 'created', id: response.data.ID_Lector, data: response.data };
        }
      } catch (error) {
        // Captura errores del POST inicial, POST tras PUT fallido, o errores no-404 del PUT
        console.error(`Error procesando lector ID=${lectorData.ID_Lector || 'N/A'}:`, error);
        let errorMessage = 'Error desconocido';
        if (axios.isAxiosError(error)) {
          const errorData = error.response?.data;
          errorMessage = `API (${error.response?.status}): ${errorData?.detail || error.message}`;
          console.error(`Error API detalle:`, errorData);
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        // Registrar el error y devolver un estado de error
        const errorMsg = `ID=${lectorData.ID_Lector || 'Nuevo (falló creación)'}: ${errorMessage}`;
        errores.push(errorMsg);
        return { 
          status: 'error', 
          id: lectorData.ID_Lector,
          error: errorMsg // Devolver el mensaje de error formateado
        };
      }
    })
  );
  
  // Contar resultados y recopilar errores finales
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      if (result.value.status === 'created') imported++;
      else if (result.value.status === 'updated') updated++;
      // Si el estado fue 'error', ya se añadió a 'errores' dentro del catch
    } else {
      // Capturar rechazos de Promise.allSettled (errores inesperados)
      console.error("Error no manejado en Promise.allSettled:", result.reason);
      errores.push(`Error inesperado en procesamiento: ${result.reason}`);
    }
  });

  console.warn(`Errores durante la importación:`, errores);
  
  // Lanzar error solo si NINGUNO se importó/actualizó
  if (imported === 0 && updated === 0 && errores.length > 0) {
    const errorDetails = errores.length <= 5 ? errores.join("; ") : `${errores.slice(0, 5).join("; ")} y ${errores.length - 5} más...`;
    throw new Error(`Ningún lector pudo ser importado o actualizado. Errores: ${errorDetails}`);
  } 
  
  console.log(`Importación finalizada: ${imported} nuevos, ${updated} actualizados, ${errores.length} errores`);
  // Devolver siempre la estructura completa, incluyendo la lista de errores
  return { imported, updated, errors: errores }; 
}; 