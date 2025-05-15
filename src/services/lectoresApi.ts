import apiClient from './api';
import type { Lector, LectoresResponse, LectorUpdateData, LectorCoordenadas, LectorSugerenciasResponse } from '../types/data';
import axios from 'axios';

/**
 * Parámetros para obtener la lista de lectores (incluye paginación y filtros).
 */
interface GetLectoresParams {
  skip?: number;
  limit?: number;
  id_lector?: string;
  nombre?: string;
  carretera?: string;
  provincia?: string;
  organismo?: string;
  sentido?: string;
  texto_libre?: string;
}

/**
 * Obtiene una lista paginada y filtrada de lectores desde la API.
 * @param params Objeto con parámetros de paginación y filtros
 * @returns Promise<LectoresResponse> - Objeto con conteo total y lista de lectores.
 */
export const getLectores = async (params: GetLectoresParams = {}): Promise<LectoresResponse> => {
  try {
    // Filtrar parámetros nulos, undefined o vacíos antes de enviar
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v != null && v !== '')
    );
    
    console.log('Obteniendo lectores con filtros:', cleanParams);
    
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
        // Considerar manejo específico si hay lecturas asociadas (error 400 del backend)
        if (axios.isAxiosError(error) && error.response?.status === 400) {
             throw new Error(error.response?.data?.detail || 'No se puede eliminar, tiene lecturas asociadas.');
        }
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
        await apiClient.delete(`/lectores/${encodeURIComponent(lectorId)}`);
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
  errores: string[];
}

/**
 * Normaliza el valor del campo Sentido a "Decreciente" o "Creciente"
 */
const normalizarSentido = (sentido: string | null | undefined): string | null => {
  if (!sentido) return null;
  
  const sentidoLower = sentido.toLowerCase().trim();
  if (sentidoLower === 'decreciente') return 'Decreciente';
  if (sentidoLower === 'creciente') return 'Creciente';
  return null;
};

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
      // Limpiar y preparar los datos del Excel
      const lectorData = {
        ...lector,
        ID_Lector: lector.ID_Lector ? String(lector.ID_Lector).trim() : undefined,
        // Normalizar el campo Sentido
        Sentido: normalizarSentido(lector.Sentido),
        // Asegurar que las coordenadas sean números si existen
        Coordenada_X: lector.Coordenada_X ? Number(lector.Coordenada_X) : undefined,
        Coordenada_Y: lector.Coordenada_Y ? Number(lector.Coordenada_Y) : undefined
      };
      
      console.log(`Procesando lector:`, lectorData);
      
      try {
        if (lectorData.ID_Lector) {
          // Primero intentamos obtener el lector existente
          try {
            const existingLector = await apiClient.get<Lector>(`/lectores/${lectorData.ID_Lector}`);
            
            // Crear objeto con datos actualizados, manteniendo los existentes solo si no hay nuevos
            const updatedData = {
              ...existingLector.data,
              // Actualizar solo si hay nuevos datos
              Coordenada_X: lectorData.Coordenada_X !== undefined ? lectorData.Coordenada_X : existingLector.data.Coordenada_X,
              Coordenada_Y: lectorData.Coordenada_Y !== undefined ? lectorData.Coordenada_Y : existingLector.data.Coordenada_Y,
              Nombre: lectorData.Nombre || existingLector.data.Nombre,
              Carretera: lectorData.Carretera || existingLector.data.Carretera,
              Provincia: lectorData.Provincia || existingLector.data.Provincia,
              Localidad: lectorData.Localidad || existingLector.data.Localidad,
              Sentido: lectorData.Sentido || normalizarSentido(existingLector.data.Sentido),
              Orientacion: lectorData.Orientacion || existingLector.data.Orientacion,
              Organismo_Regulador: lectorData.Organismo_Regulador || existingLector.data.Organismo_Regulador,
              Contacto: lectorData.Contacto || existingLector.data.Contacto,
              Texto_Libre: lectorData.Texto_Libre || existingLector.data.Texto_Libre,
              Imagen_Path: lectorData.Imagen_Path || existingLector.data.Imagen_Path
            };

            console.log(`Actualizando lector ${lectorData.ID_Lector} con datos:`, updatedData);
            
            // Actualizar con datos combinados
            const response = await apiClient.put(`/lectores/${lectorData.ID_Lector}`, updatedData);
            console.log(`Respuesta actualización (PUT):`, response.data);
            return { status: 'updated', id: lectorData.ID_Lector, data: response.data };
          } catch (getError) {
            if (axios.isAxiosError(getError) && getError.response?.status === 404) {
              // Si no existe, intentamos crear
              try {
                const response = await apiClient.post('/lectores', lectorData);
                console.log(`Respuesta creación (POST):`, response.data);
                return { status: 'created', id: response.data.ID_Lector, data: response.data };
              } catch (postError) {
                if (axios.isAxiosError(postError) && postError.response?.status === 400) {
                  // Si falla por ID duplicado, intentamos obtener y actualizar de nuevo
                  const existingLector = await apiClient.get<Lector>(`/lectores/${lectorData.ID_Lector}`);
                  const updatedData = {
                    ...existingLector.data,
                    // Actualizar solo si hay nuevos datos
                    Coordenada_X: lectorData.Coordenada_X !== undefined ? lectorData.Coordenada_X : existingLector.data.Coordenada_X,
                    Coordenada_Y: lectorData.Coordenada_Y !== undefined ? lectorData.Coordenada_Y : existingLector.data.Coordenada_Y,
                    Nombre: lectorData.Nombre || existingLector.data.Nombre,
                    Carretera: lectorData.Carretera || existingLector.data.Carretera,
                    Provincia: lectorData.Provincia || existingLector.data.Provincia,
                    Localidad: lectorData.Localidad || existingLector.data.Localidad,
                    Sentido: lectorData.Sentido || normalizarSentido(existingLector.data.Sentido),
                    Orientacion: lectorData.Orientacion || existingLector.data.Orientacion,
                    Organismo_Regulador: lectorData.Organismo_Regulador || existingLector.data.Organismo_Regulador,
                    Contacto: lectorData.Contacto || existingLector.data.Contacto,
                    Texto_Libre: lectorData.Texto_Libre || existingLector.data.Texto_Libre,
                    Imagen_Path: lectorData.Imagen_Path || existingLector.data.Imagen_Path
                  };
                  const response = await apiClient.put(`/lectores/${lectorData.ID_Lector}`, updatedData);
                  console.log(`Respuesta actualización (PUT tras POST fallido):`, response.data);
                  return { status: 'updated', id: lectorData.ID_Lector, data: response.data };
                }
                throw postError;
              }
            }
            throw getError;
          }
        } else {
          throw new Error('ID de lector no proporcionado');
        }
      } catch (error) {
        console.error(`Error procesando lector ${lectorData.ID_Lector}:`, error);
        if (axios.isAxiosError(error)) {
          errores.push(`Error con lector ${lectorData.ID_Lector}: ${error.response?.data?.detail || error.message}`);
        } else {
          errores.push(`Error con lector ${lectorData.ID_Lector}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
        throw error;
      }
    })
  );

  // Procesar resultados
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      if (result.value.status === 'created') imported++;
      if (result.value.status === 'updated') updated++;
    }
  });

  return { imported, updated, errores };
};

// Devuelve los lectores que no tienen coordenadas válidas
export const getLectoresSinCoordenadas = async (): Promise<Lector[]> => {
  const { lectores } = await getLectores();
  return lectores.filter(l => {
    const x = l.Coordenada_X;
    const y = l.Coordenada_Y;
    // Considera como faltante: null, undefined, vacío, '-', 0 o no numérico
    const isMissing = (val: any) => val === null || val === undefined || val === '' || val === '-' || isNaN(Number(val)) || Number(val) === 0;
    return isMissing(x) || isMissing(y);
  });
}; 