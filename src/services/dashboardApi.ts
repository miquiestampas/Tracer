import apiClient from './api';
import type { ArchivoExcel } from '../types/data';

interface ImportEvent {
  id: number;
  fileName: string;
  timestamp: string;
  status: 'success' | 'error';
  recordsCount?: number;
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
      caseName: archivo.caso?.Nombre_del_Caso || archivo.ID_Caso || 'Sin caso'
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
      timestamp: new Date(archivo.Fecha_de_Importacion).toLocaleString('es-ES'),
      status: 'success',
      recordsCount: archivo.Total_Registros
    }));
  } catch (error) {
    console.error('Error al obtener importaciones recientes:', error);
    throw error;
  }
};

export const getLectoresIncompletos = async (): Promise<ReaderAlert[]> => {
  try {
    const response = await apiClient.get('/lectores/incompletos');
    return response.data.map((lector: any) => ({
      id: lector.ID_Lector,
      name: lector.Nombre || lector.ID_Lector,
      issues: [
        ...(!lector.Coordenada_X || !lector.Coordenada_Y ? ['Falta configuración GPS'] : []),
        ...(!lector.Carretera ? ['Sin carretera definida'] : []),
        ...(!lector.Provincia ? ['Sin provincia definida'] : []),
        ...(!lector.Sentido ? ['Sin sentido definido'] : [])
      ]
    })).filter((lector: ReaderAlert) => lector.issues.length > 0);
  } catch (error) {
    console.error('Error al obtener lectores incompletos:', error);
    throw error;
  }
}; 