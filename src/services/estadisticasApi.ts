import apiClient from './api';

export interface EstadisticasGlobales {
    total_casos: number;
    total_lecturas: number;
    total_vehiculos: number;
    tamanio_bd: string;
}

export const getEstadisticasGlobales = async (): Promise<EstadisticasGlobales> => {
    try {
        const response = await apiClient.get<EstadisticasGlobales>('/api/estadisticas');
        return response.data;
    } catch (error) {
        console.error('Error al obtener estadísticas globales:', error);
        throw error;
    }
}; 