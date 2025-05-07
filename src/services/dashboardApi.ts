import apiClient from './api';
import type { ArchivoExcel } from '../types/data';

interface ImportEvent {
  id: number;
  fileName: string;
  timestamp: string;
  status: 'success' | 'error';
  recordsCount?: number;
  caseName?: string;
}

interface ReaderAlert {
  id: number;
  name: string;
  issues: string[];
}

interface RecentFile {
  id: number;
  name: string;
  type: 'excel' | 'pdf' | 'other';
  size: string;
  lastModified: string;
  caseName?: string;
}

interface VehiculoSearchResult {
  matricula: string;
  lecturas: {
    id: number;
    fecha: string;
    lector: string;
    caso: string;
  }[];
}

export const buscarVehiculo = async (matricula: string): Promise<VehiculoSearchResult> => {
  try {
    const response = await apiClient.post('/lecturas/por_filtros', {
      matricula,
      tipo_fuente: 'LPR'
    });
    
    // Agrupar lecturas por matrícula
    const lecturas = response.data;
    if (!lecturas || lecturas.length === 0) {
      return {
        matricula,
        lecturas: []
      };
    }

    return {
      matricula,
      lecturas: lecturas.map((lectura: any) => ({
        id: lectura.ID_Lectura,
        fecha: new Date(lectura.Fecha_y_Hora).toLocaleString('es-ES'),
        lector: lectura.ID_Lector,
        caso: lectura.archivo?.caso?.Nombre_del_Caso || lectura.archivo?.ID_Caso || 'Sin caso'
      }))
    };
  } catch (error) {
    console.error('Error al buscar vehículo:', error);
    throw error;
  }
};

export const getArchivosRecientes = async (): Promise<RecentFile[]> => {
  try {
    const response = await apiClient.get<ArchivoExcel[]>('/archivos/recientes');
    return response.data.map(archivo => ({
      id: archivo.ID_Archivo,
      name: archivo.Nombre_del_Archivo,
      type: archivo.Tipo_de_Archivo === 'GPS' || archivo.Tipo_de_Archivo === 'LPR' ? 'excel' : 'other',
      size: 'N/A', // TODO: Implementar tamaño real
      lastModified: new Date(archivo.Fecha_de_Importacion).toLocaleString('es-ES'),
      caseName: archivo.caso?.Nombre_del_Caso || String(archivo.ID_Caso) || 'Sin caso'
    }));
  } catch (error) {
    console.error('Error al obtener archivos recientes:', error);
    throw error;
  }
};

export const getImportacionesRecientes = async (): Promise<ImportEvent[]> => {
  try {
    const response = await apiClient.get<ArchivoExcel[]>('/archivos/recientes');
    return response.data.map(archivo => ({
      id: archivo.ID_Archivo,
      fileName: archivo.Nombre_del_Archivo,
      timestamp: archivo.Fecha_de_Importacion,
      status: 'success',
      recordsCount: archivo.Total_Registros,
      caseName: archivo.caso?.Nombre_del_Caso || `Caso ${archivo.ID_Caso}`
    }));
  } catch (error) {
    console.error('Error al obtener importaciones recientes:', error);
    throw error;
  }
}; 