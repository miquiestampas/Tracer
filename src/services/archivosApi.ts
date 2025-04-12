import apiClient from './api';
import type { ArchivoExcel, Lectura } from '../types/data'; // Importa la interfaz ArchivoExcel y Lectura

/**
 * Sube un archivo Excel al backend para ser procesado e importado.
 * @param casoId ID del caso al que pertenece el archivo.
 * @param tipoArchivo Tipo de archivo ('LPR' o 'GPS').
 * @param archivo El objeto File del archivo Excel seleccionado.
 * @param columnMappingJson String JSON que contiene el mapeo de columnas.
 * @returns Promise<ArchivoExcel> - Los detalles del archivo creado en la BD.
 */
export const uploadArchivoExcel = async (
  casoId: string, 
  tipoArchivo: 'LPR' | 'GPS',
  archivo: File,
  columnMappingJson: string
): Promise<ArchivoExcel> => {
  // Crear un objeto FormData para enviar los datos
  const formData = new FormData();

  // Añadir los campos requeridos por el endpoint del backend
  formData.append('tipo_archivo', tipoArchivo);
  formData.append('column_mapping', columnMappingJson);
  formData.append('excel_file', archivo, archivo.name); // El tercer argumento es el nombre del archivo

  try {
    // Realizar la petición POST al endpoint específico
    // Es importante pasar el ID del caso en la URL
    // Axios detectará FormData y establecerá Content-Type: multipart/form-data
    const response = await apiClient.post<ArchivoExcel>(
      `/casos/${casoId}/archivos/upload`,
      formData
    );
    return response.data;
  } catch (error) {
    console.error('Error al subir el archivo Excel:', error);
    // Relanzar el error para que sea manejado por el componente que llama
    throw error;
  }
};

/**
 * Obtiene la lista de archivos Excel asociados a un caso específico.
 * @param casoId ID del caso del que se quieren obtener los archivos.
 * @returns Promise<ArchivoExcel[]> - Una lista de los archivos asociados al caso.
 */
export const getArchivosPorCaso = async (casoId: string | number): Promise<ArchivoExcel[]> => {
  try {
    const response = await apiClient.get<ArchivoExcel[]>(
      `/casos/${casoId}/archivos`
    );
    return response.data;
  } catch (error) {
    console.error(`Error al obtener los archivos para el caso ${casoId}:`, error);
    throw error;
  }
};

/**
 * Elimina un archivo Excel y sus lecturas asociadas.
 * @param archivoId ID del archivo a eliminar.
 * @returns Promise<void> - No devuelve nada si tiene éxito.
 */
export const deleteArchivo = async (archivoId: number): Promise<void> => {
  try {
    // Realizar la petición DELETE al endpoint del backend
    await apiClient.delete(
      `/archivos/${archivoId}`
    );
    // El backend devuelve 204 No Content, por lo que no hay datos en la respuesta
  } catch (error) {
    console.error(`Error al eliminar el archivo ID ${archivoId}:`, error);
    // Relanzar el error para que sea manejado por el componente que llama
    throw error;
  }
};

/**
 * Obtiene las lecturas filtrando opcionalmente por caso, archivo o matrícula.
 * @param params Objeto con parámetros de filtro opcionales: caso_id, archivo_id, matricula, limit, skip
 * @returns Promise<Lectura[]> - Una lista de lecturas que coinciden con los filtros.
 */
export const getLecturas = async (params: {
    caso_id?: number | string; 
    archivo_id?: number;
    matricula?: string;
    fecha_hora_inicio?: string; // ISO String o YYYY-MM-DD
    fecha_hora_fin?: string; // ISO String o YYYY-MM-DD
    lector_id?: string;
    tipo_fuente?: string; // Nuevo filtro
    limit?: number;
    skip?: number;
} = {}): Promise<Lectura[]> => {
    try {
        // Filtrar parámetros nulos o vacíos antes de enviar (opcional pero bueno)
        const cleanParams = Object.fromEntries(
            Object.entries(params).filter(([_, v]) => v != null && v !== '')
        );
        const response = await apiClient.get<Lectura[]>('/lecturas', {
            params: cleanParams // Enviar parámetros limpios
        });
        return response.data;
    } catch (error) {
        console.error('Error al obtener las lecturas:', error);
        throw error;
    }
}; 