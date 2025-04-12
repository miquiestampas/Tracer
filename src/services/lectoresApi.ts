import apiClient from './api';
import type { Lector, LectoresResponse, LectorUpdateData, LectorCoordenadas } from '../types/data';
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