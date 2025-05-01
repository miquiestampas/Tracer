import apiClient from './api';
import type { SavedSearch, SavedSearchCreate, SavedSearchUpdate } from '../types/data';

/**
 * Crea una nueva búsqueda guardada
 */
export const createSavedSearch = async (casoId: number, data: SavedSearchCreate): Promise<SavedSearch> => {
    try {
        const response = await apiClient.post<SavedSearch>(`/casos/${casoId}/saved_searches`, data);
        return response.data;
    } catch (error) {
        console.error('Error al crear búsqueda guardada:', error);
        throw error;
    }
};

/**
 * Obtiene todas las búsquedas guardadas de un caso
 */
export const getSavedSearches = async (casoId: number): Promise<SavedSearch[]> => {
    try {
        const response = await apiClient.get<SavedSearch[]>(`/casos/${casoId}/saved_searches`);
        return response.data;
    } catch (error) {
        console.error('Error al obtener búsquedas guardadas:', error);
        throw error;
    }
};

/**
 * Actualiza una búsqueda guardada
 */
export const updateSavedSearch = async (searchId: number, data: SavedSearchUpdate): Promise<SavedSearch> => {
    try {
        const response = await apiClient.put<SavedSearch>(`/saved_searches/${searchId}`, data);
        return response.data;
    } catch (error) {
        console.error('Error al actualizar búsqueda guardada:', error);
        throw error;
    }
};

/**
 * Elimina una búsqueda guardada
 */
export const deleteSavedSearch = async (searchId: number): Promise<void> => {
    try {
        await apiClient.delete(`/saved_searches/${searchId}`);
    } catch (error) {
        console.error('Error al eliminar búsqueda guardada:', error);
        throw error;
    }
}; 