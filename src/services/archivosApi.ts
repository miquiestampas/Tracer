import apiClient from './api';
import type { ArchivoExcel, Lectura, LecturaRelevante, LecturasResponse, UploadResponse } from '../types/data'; // Importa la interfaz ArchivoExcel, Lectura y LecturaRelevante

/**
 * Sube un archivo Excel al backend para ser procesado e importado.
 * @param casoId ID del caso al que pertenece el archivo.
 * @param tipoArchivo Tipo de archivo ('LPR' o 'GPS').
 * @param archivo El objeto File del archivo Excel seleccionado.
 * @param columnMappingJson String JSON que contiene el mapeo de columnas.
 * @returns Promise<UploadResponse> - Respuesta con info del archivo y lectores nuevos.
 */
export const uploadArchivoExcel = async (
  casoId: string | number, // Aceptar number también por si acaso
  tipoArchivo: 'LPR' | 'GPS',
  archivo: File,
  columnMappingJson: string
): Promise<UploadResponse> => {
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
    const response = await apiClient.post<UploadResponse>(
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
 * Obtiene las lecturas filtrando opcionalmente y con paginación.
 * @param params Objeto con parámetros de filtro y paginación opcionales: caso_id, matricula, ..., skip, limit
 * @returns Promise<LecturasResponse> - Un objeto con el conteo total y la lista de lecturas para la página.
 */
export const getLecturas = async (params: {
    caso_id?: number | string;
    archivo_id?: number;
    matricula?: string;
    fecha_hora_inicio?: string;
    fecha_hora_fin?: string;
    lector_id?: string;
    tipo_fuente?: string;
    solo_relevantes?: boolean; // Añadido para el filtro
    skip?: number; // Añadido para paginación
    limit?: number; // Añadido para paginación
} = {}): Promise<LecturasResponse> => {
    try {
        const cleanParams = Object.fromEntries(
            Object.entries(params).filter(([_, v]) => v != null && v !== '')
        );
        // El tipo genérico de la respuesta también debe coincidir
        const response = await apiClient.get<LecturasResponse>('/lecturas', {
            params: cleanParams
        });
        return response.data;
    } catch (error) {
        console.error('Error al obtener las lecturas:', error);
        throw error;
    }
};

/**
 * Marca una lectura como relevante.
 * @param idLectura El ID de la lectura a marcar.
 * @param nota Opcional: Una nota a añadir a la marca de relevancia.
 * @returns Promise<LecturaRelevante> - Los detalles de la lectura relevante creada.
 */
export const marcarLecturaRelevante = async (
  idLectura: number,
  nota?: string | null
): Promise<LecturaRelevante> => {
  try {
    const payload = nota ? { Nota: nota } : {}; // Enviar objeto vacío si no hay nota
    const response = await apiClient.post<LecturaRelevante>(
      `/lecturas/${idLectura}/relevante`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error(`Error al marcar la lectura ${idLectura} como relevante:`, error);
    throw error;
  }
};

/**
 * Desmarca una lectura como relevante.
 * @param idLectura El ID de la lectura a desmarcar.
 * @returns Promise<void> - No devuelve nada si tiene éxito.
 */
export const desmarcarLecturaRelevante = async (idLectura: number): Promise<void> => {
  try {
    await apiClient.delete(`/lecturas/${idLectura}/relevante`);
  } catch (error) {
    console.error(`Error al desmarcar la lectura ${idLectura} como relevante:`, error);
    throw error;
  }
};

/**
 * Actualiza la nota de una lectura relevante existente.
 * @param idRelevante El ID de la entrada LecturaRelevante.
 * @param nota La nueva nota (puede ser string vacío o null para borrarla, según API).
 * @returns Promise<LecturaRelevante> - Los detalles actualizados de la lectura relevante.
 */
export const actualizarNotaLecturaRelevante = async (
  idRelevante: number,
  nota: string | null
): Promise<LecturaRelevante> => {
  try {
    const payload = { Nota: nota }; // Siempre enviar el campo Nota
    const response = await apiClient.put<LecturaRelevante>(
      `/lecturas/relevante/${idRelevante}`,
      payload
    );
    return response.data;
  } catch (error) {
    console.error(`Error al actualizar la nota para la lectura relevante ${idRelevante}:`, error);
    throw error;
  }
}; 