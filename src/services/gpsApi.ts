import apiClient from './api';
import type { GpsLectura } from '../types/data';

export const getLecturasGps = async (casoId: number, params?: {
    fecha_inicio?: string;
    hora_inicio?: string;
    fecha_fin?: string;
    hora_fin?: string;
    velocidad_min?: number;
    velocidad_max?: number;
    duracion_parada?: number;
    zona_seleccionada?: {
        latMin: number;
        latMax: number;
        lonMin: number;
        lonMax: number;
    };
    matricula?: string;
}) => {
    // Asegurarnos de que el tipo_fuente está establecido
    const paramsWithType = {
        ...params,
        tipo_fuente: 'GPS'
    };
    
    const response = await apiClient.get<GpsLectura[]>(`/casos/${casoId}/lecturas`, { params: paramsWithType });
    return response.data;
};

export const getParadasGps = async (casoId: number, params?: {
    fecha_inicio?: string;
    hora_inicio?: string;
    fecha_fin?: string;
    hora_fin?: string;
    duracion_minima?: number;
    zona_seleccionada?: {
        latMin: number;
        latMax: number;
        lonMin: number;
        lonMax: number;
    };
}) => {
    const response = await apiClient.get<GpsLectura[]>(`/casos/${casoId}/paradas_gps`, { params });
    return response.data;
};

export const getCoincidenciasGps = async (casoId: number, params?: {
    fecha_inicio?: string;
    hora_inicio?: string;
    fecha_fin?: string;
    hora_fin?: string;
    radio_proximidad?: number;
    tiempo_proximidad?: number;
}) => {
    const response = await apiClient.get<{
        lat: number;
        lon: number;
        vehiculos: string[];
        fechas: string[];
    }[]>(`/casos/${casoId}/coincidencias_gps`, { params });
    return response.data;
}; 