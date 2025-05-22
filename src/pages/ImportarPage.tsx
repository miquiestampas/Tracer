import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, 
    Text, 
    Select, 
    Radio, 
    Group, 
    FileInput, 
    Button, 
    Alert, 
    Stack,
    Modal,
    Divider,
    rem,
    Table,
    Anchor,
    Title,
    ActionIcon,
    Tooltip,
    Collapse,
    SimpleGrid,
    LoadingOverlay,
    Paper,
    TextInput,
    Checkbox
} from '@mantine/core';
import { IconUpload, IconAlertCircle, IconFileSpreadsheet, IconSettings, IconCheck, IconX, IconDownload, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { getCasos } from '../services/casosApi';
import { uploadArchivoExcel, getArchivosPorCaso, deleteArchivo } from '../services/archivosApi';
import apiClient from '../services/api';
import type { Caso, ArchivoExcel, UploadResponse } from '../types/data';
import * as XLSX from 'xlsx'; // Importar librería xlsx
import { useNavigate, useLocation } from 'react-router-dom';
import { ProgressOverlay } from '../components/common/ProgressOverlay';

// Definir los campos requeridos - SEPARANDO Fecha y Hora
const REQUIRED_FIELDS: { [key in 'LPR' | 'GPS' | 'GPX_KML']: string[] } = {
  LPR: ['Matricula', 'Fecha', 'Hora', 'ID_Lector'],
  GPS: ['Matricula', 'Fecha', 'Hora'],
  GPX_KML: ['Fecha', 'Hora', 'Coordenada_X', 'Coordenada_Y'],
};
// Campos opcionales
const OPTIONAL_FIELDS: { [key in 'LPR' | 'GPS' | 'GPX_KML']: string[] } = {
    LPR: ['Carril', 'Sentido', 'Velocidad', 'Coordenada_X', 'Coordenada_Y'],
    GPS: ['ID_Lector', 'Sentido', 'Velocidad', 'Coordenada_X', 'Coordenada_Y'],
    GPX_KML: ['Velocidad', 'Altitud', 'Precision'],
};

// --- NUEVO: Diccionario de Términos para Auto-Mapeo ---
// (Convertir a minúsculas para comparación insensible)
const AUTO_MAP_TERMS: { [key: string]: string[] } = {
  Matricula: ['matricula', 'matrícula', 'plate', 'license', 'licensenumber', 'numplaca', 'patente', 'licenseplate'],
  Fecha: ['fecha', 'date', 'fec'],
  Hora: ['hora', 'time', 'timestamp'], // Timestamp podría requerir dividir fecha/hora después
  ID_Lector: [
    'id_lector', 'idlector', 'lector', 'camara', 'cámara', 'device', 'reader', 'dispositivo',
    'camera', 'cam', 'cam_id', 'device_id', 'deviceid', 'reader_id', 'readerid',
    'sensor', 'detector', 'scanner', 'scanner_id', 'scannerid',
    'equipo', 'equipment', 'equipment_id', 'equipmentid',
    'unidad', 'unit', 'unit_id', 'unitid',
    'terminal', 'terminal_id', 'terminalid',
    'estacion', 'station', 'station_id', 'stationid',
    'punto', 'point', 'point_id', 'pointid',
    'nodo', 'node', 'node_id', 'nodeid',
    'devicename', 'device_name', 'device-name', 'devicename_id', 'device_name_id',
    'nombre_dispositivo', 'nombre_equipo', 'nombre_lector', 'nombre_camara'
  ],
  Coordenada_X: ['coordenada_x', 'coord_x', 'coordx', 'longitud', 'longitude', 'lon', 'x', 'este', 'easting'],
  Coordenada_Y: ['coordenada_y', 'coord_y', 'coordy', 'latitud', 'latitude', 'lat', 'y', 'norte', 'northing'],
  Velocidad: ['velocidad', 'speed', 'vel', 'v', 'kmh'],
  Carril: ['carril', 'lane', 'via']
};

// Tipado para el mapeo
type ColumnMapping = { [key: string]: string | null };

function ImportarPage() {
  // Estados para el formulario principal
  const [casosList, setCasosList] = useState<{ value: string; label: string }[]>([]);
  const [loadingCasos, setLoadingCasos] = useState(true);
  const [errorCasos, setErrorCasos] = useState<string | null>(null);
  const [selectedCasoId, setSelectedCasoId] = useState<string | null>(null);
  const [selectedCasoName, setSelectedCasoName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'LPR' | 'GPS' | 'GPX_KML'>('LPR');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Estados para el mapeo
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [mappingModalOpened, { open: openMappingModal, close: closeMappingModal }] = useDisclosure(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({}); // Almacena el mapeo { CampoRequerido: CabeceraExcel }
  const [isReadingHeaders, setIsReadingHeaders] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  // Estados para la subida
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Estados para la lista de archivos
  const [archivosList, setArchivosList] = useState<ArchivoExcel[]>([]);
  const [loadingArchivos, setLoadingArchivos] = useState(false);
  const [errorArchivos, setErrorArchivos] = useState<string | null>(null);
  const [deletingArchivoId, setDeletingArchivoId] = useState<number | null>(null);

  const navigate = useNavigate(); // Hook para navegación
  const location = useLocation(); // <-- Hook para obtener estado de ruta

  // Estado para advertencia visual de importación
  const [importWarning, setImportWarning] = useState<React.ReactNode | null>(null);

  const [matriculaModalOpened, { open: openMatriculaModal, close: closeMatriculaModal }] = useDisclosure(false);
  const [matricula, setMatricula] = useState<string>('');
  const [processedGpxKmlData, setProcessedGpxKmlData] = useState<any[]>([]);

  // --- NUEVO: Estado para el modal de confirmación de eliminación ---
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [archivoToDelete, setArchivoToDelete] = useState<ArchivoExcel | null>(null);

  const [fechaHoraCombinada, setFechaHoraCombinada] = useState(false);
  const [formatoFechaHora, setFormatoFechaHora] = useState('DD/MM/YYYY HH:mm:ss');

  // Cargar casos para el selector
  useEffect(() => {
    const fetchCasosForSelect = async () => {
      setLoadingCasos(true);
      setErrorCasos(null);
      try {
        const data = await getCasos();
        const options = data.map((caso) => ({
          value: caso.ID_Caso.toString(),
          label: `${caso.ID_Caso} - ${caso.Nombre_del_Caso} (${caso.Año})`,
        }));
        setCasosList(options);
      } catch (err) {
        setErrorCasos('Error al cargar la lista de casos.');
      } finally {
        setLoadingCasos(false);
      }
    };
    fetchCasosForSelect();
  }, []);

  // --- NUEVO: Efecto para establecer el caso preseleccionado ---
  useEffect(() => {
    const preselectedId = location.state?.preselectedCasoId;
    // Solo intentar preseleccionar si hay un ID, la lista de casos está cargada y no hay ya un caso seleccionado
    if (preselectedId !== null && preselectedId !== undefined && casosList.length > 0 && !selectedCasoId) {
        const preselectedIdStr = String(preselectedId);
        // Verificar que el ID preseleccionado existe en la lista
        const casoExists = casosList.some(caso => caso.value === preselectedIdStr);
        if (casoExists) {
            console.log(`[ImportarPage] Preseleccionando caso ID: ${preselectedIdStr}`);
            setSelectedCasoId(preselectedIdStr);
            // Opcional: Actualizar también el nombre si se usa en algún sitio
            const casoName = casosList.find(caso => caso.value === preselectedIdStr)?.label;
            if(casoName) setSelectedCasoName(casoName.split(' - ')[1]?.split(' (')[0] || 'Caso seleccionado'); // Extraer nombre
        } else {
            console.warn(`[ImportarPage] El ID de caso preseleccionado (${preselectedIdStr}) no se encontró en la lista.`);
            // Limpiar el estado de la ruta para evitar reintentos?
            // navigate('.', { replace: true, state: {} }); // Podría ser útil
        }
    }
    // Depender de location.state y casosList. Se ejecutará si cambia el estado o carga la lista.
  }, [location.state, casosList, selectedCasoId, navigate]); // Añadir selectedCasoId y navigate a dependencias

  // --- NUEVO: Función para cargar archivos ---
  const fetchArchivos = useCallback(async (casoId: string) => {
      setLoadingArchivos(true);
      setErrorArchivos(null);
      try {
          // console.log(`Fetching archivos for caso ID: ${casoId}`); // Debug
          const data = await getArchivosPorCaso(casoId);
          setArchivosList(data);
          // console.log("Archivos fetched:", data); // Debug
      } catch (err) {
          setErrorArchivos('Error al cargar la lista de archivos para este caso.');
          console.error("Error fetching archivos:", err);
          setArchivosList([]); // Limpiar en caso de error
      } finally {
          setLoadingArchivos(false);
      }
  }, []); // useCallback para evitar re-creaciones innecesarias

  // --- Efecto para cargar archivos cuando cambia el caso seleccionado ---
  useEffect(() => {
    if (selectedCasoId) {
      fetchArchivos(selectedCasoId);
    } else {
      setArchivosList([]); // Limpiar lista si no hay caso seleccionado
      setErrorArchivos(null); // Limpiar error
    }
  }, [selectedCasoId, fetchArchivos]);

  // --- NUEVO: Función para procesar archivos GPX/KML ---
  const processGpxKmlFile = async (file: File): Promise<{ headers: string[], data: any[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          if (!content) throw new Error('No se pudo leer el archivo');

          let points: any[] = [];
          
          if (file.name.toLowerCase().endsWith('.gpx')) {
            // Procesar archivo GPX
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, 'text/xml');
            const trackPoints = xmlDoc.getElementsByTagName('trkpt');
            
            points = Array.from(trackPoints).map(point => {
              const lat = parseFloat(point.getAttribute('lat') || '0');
              const lon = parseFloat(point.getAttribute('lon') || '0');
              const time = point.getElementsByTagName('time')[0]?.textContent || '';
              const ele = point.getElementsByTagName('ele')[0]?.textContent || '';
              const speed = point.getElementsByTagName('speed')[0]?.textContent || '';
              
              const date = new Date(time);
              
              return {
                Fecha: date.toISOString().split('T')[0],
                Hora: date.toTimeString().split(' ')[0],
                Coordenada_X: lon,
                Coordenada_Y: lat,
                Altitud: ele ? parseFloat(ele) : null,
                Velocidad: speed ? parseFloat(speed) : null
              };
            });
          } else if (file.name.toLowerCase().endsWith('.kml')) {
            // Procesar archivo KML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, 'text/xml');
            const coordinates = xmlDoc.getElementsByTagName('coordinates')[0]?.textContent || '';
            
            points = coordinates.split(' ').filter(coord => coord.trim()).map(coord => {
              const [lon, lat, alt] = coord.split(',').map(Number);
              const date = new Date(); // KML no suele incluir timestamp, usamos fecha actual
              
              return {
                Fecha: date.toISOString().split('T')[0],
                Hora: date.toTimeString().split(' ')[0],
                Coordenada_X: lon,
                Coordenada_Y: lat,
                Altitud: alt || null
              };
            });
          }

          if (points.length === 0) {
            throw new Error('No se encontraron puntos en el archivo');
          }

          // Crear cabeceras basadas en los campos disponibles
          const headers = Object.keys(points[0]);
          
          resolve({
            headers,
            data: points
          });
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'));
      };

      reader.readAsText(file);
    });
  };

  // --- MODIFICADO: Leer cabeceras y aplicar auto-mapeo ---
  const readExcelHeaders = useCallback(async (file: File) => {
    setIsReadingHeaders(true);
    setExcelHeaders([]);
    setColumnMapping({}); 
    setMappingError(null);

    try {
      if (fileType === 'GPX_KML') {
        const { headers, data } = await processGpxKmlFile(file);
        setExcelHeaders(headers);
        
        // Auto-mapeo para GPX/KML
        const initialMapping: ColumnMapping = {};
        const allFields = [...REQUIRED_FIELDS[fileType], ...OPTIONAL_FIELDS[fileType]];
        
        allFields.forEach(field => {
          initialMapping[field] = headers.find(h => h === field) || null;
        });
        
        setColumnMapping(initialMapping);
        
        // Guardar los datos procesados para la subida
        setProcessedGpxKmlData(data);
        
        notifications.show({ 
          title: 'Archivo Procesado', 
          message: `Se procesaron ${data.length} puntos del archivo ${file.name.toLowerCase().endsWith('.gpx') ? 'GPX' : 'KML'}.`, 
          color: 'blue', 
          autoClose: 5000 
        });

        // Abrir modal para solicitar matrícula
        openMatriculaModal();
      } else {
        // Lógica existente para Excel
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            if (!data) throw new Error('No se pudo leer el archivo');
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (jsonData && jsonData.length > 0) {
              const headers = jsonData[0]
                                .map(header => String(header || '').trim())
                                .filter(header => header.length > 0);
              setExcelHeaders(headers);

              // --- Lógica de Auto-Mapeo ---
              const initialMapping: ColumnMapping = {};
              const allFields = [...REQUIRED_FIELDS[fileType], ...OPTIONAL_FIELDS[fileType]];
              const lowercaseHeaders = headers.map(h => h.toLowerCase());
              const mappedHeaders = new Set<string>();

              allFields.forEach(field => {
                initialMapping[field] = null;
                const terms = AUTO_MAP_TERMS[field];
                if (terms) {
                  for (const header of headers) {
                    const lowerHeader = header.toLowerCase();
                    if (terms.includes(lowerHeader) && !mappedHeaders.has(lowerHeader)) {
                      initialMapping[field] = header;
                      mappedHeaders.add(lowerHeader);
                      break;
                    }
                  }
                }
              });

              setColumnMapping(initialMapping);
              notifications.show({ 
                title: 'Cabeceras Leídas', 
                message: 'Se intentó un mapeo automático. Revisa la configuración.', 
                color: 'blue', 
                autoClose: 5000 
              });
            } else {
              throw new Error('El archivo Excel está vacío o no tiene cabeceras.');
            }
          } catch (error: any) {
            setMappingError(`Error al leer las cabeceras: ${error.message}`);
            notifications.show({ 
              title: 'Error de Lectura', 
              message: `No se pudieron leer las cabeceras: ${error.message}`, 
              color: 'red' 
            });
            setSelectedFile(null);
          } finally {
            setIsReadingHeaders(false);
          }
        };

        reader.onerror = () => {
          setMappingError('Error al leer el archivo.');
          notifications.show({ 
            title: 'Error de Archivo', 
            message: 'Ocurrió un error al intentar leer el archivo seleccionado.', 
            color: 'red' 
          });
          setSelectedFile(null);
          setIsReadingHeaders(false);
        };

        reader.readAsArrayBuffer(file);
      }
    } catch (error: any) {
      setMappingError(`Error al procesar el archivo: ${error.message}`);
      notifications.show({ 
        title: 'Error de Procesamiento', 
        message: error.message, 
        color: 'red' 
      });
      setSelectedFile(null);
      setIsReadingHeaders(false);
    }
  }, [fileType, openMatriculaModal]);

  // Efecto para leer cabeceras cuando cambia el archivo
  useEffect(() => {
    if (selectedFile) {
      readExcelHeaders(selectedFile);
    } else {
      // Limpiar si se deselecciona el archivo
      setExcelHeaders([]);
      setColumnMapping({});
      setMappingError(null);
    }
  }, [selectedFile, readExcelHeaders]);

  // Resetear mapeo si cambia el tipo de archivo mientras hay un archivo seleccionado
  useEffect(() => {
      if(selectedFile) {
          const initialMapping: ColumnMapping = {};
          REQUIRED_FIELDS[fileType].forEach(field => initialMapping[field] = null);
          OPTIONAL_FIELDS[fileType].forEach(field => initialMapping[field] = null);
          setColumnMapping(initialMapping);
      }
  }, [fileType, selectedFile]);

  // Manejar cambio en los Select del modal de mapeo
  const handleMappingChange = (requiredField: string, selectedExcelHeader: string | null) => {
    setColumnMapping(prev => ({ ...prev, [requiredField]: selectedExcelHeader }));
  };

  // Validar y guardar el mapeo desde el modal
  const saveMapping = () => {
      const missingMappings = REQUIRED_FIELDS[fileType].filter(field => !columnMapping[field]);
      if (missingMappings.length > 0) {
          notifications.show({
              title: 'Mapeo Incompleto',
              message: `Debes seleccionar una columna del Excel para los siguientes campos requeridos: ${missingMappings.join(', ')}`,
              color: 'orange'
          });
          return;
      }
      notifications.show({ title: 'Mapeo Guardado', message: 'La configuración del mapeo se ha guardado.', color: 'teal', icon: <IconCheck size={18} /> });
      closeMappingModal();
  }

  // Verificar si el mapeo está completo y es válido
  const isMappingComplete = () => {
    return REQUIRED_FIELDS[fileType].every(field => !!columnMapping[field]);
  }

  // --- NUEVO: Función para procesar datos con matrícula ---
  const processDataWithMatricula = (data: any[], matricula: string) => {
    return data.map(point => ({
      ...point,
      Matricula: matricula
    }));
  };

  // --- MODIFICADO: Manejar el envío del formulario de importación ---
  const handleImport = async () => {
    setUploadError(null);
    setImportWarning(null);
    setIsUploading(true);
    try {
      const finalMapping = Object.entries(columnMapping)
        .filter(([_, value]) => value !== null)
        .reduce((obj, [key, value]) => {
          obj[key] = value as string;
          return obj;
        }, {} as { [key: string]: string });

      // Añadir formato de fecha/hora si está combinada
      if (fechaHoraCombinada) {
        finalMapping['formato_fecha_hora'] = formatoFechaHora;
      }

      let resultado: UploadResponse | undefined;

      if (fileType === 'GPX_KML') {
        // Procesar archivo GPX/KML con matrícula
        const dataWithMatricula = processDataWithMatricula(processedGpxKmlData, matricula);
        const ws = XLSX.utils.json_to_sheet(dataWithMatricula);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Datos");
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const processedFile = new File([blob], selectedFile.name.replace(/\.(gpx|kml)$/i, '.xlsx'), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        resultado = await uploadArchivoExcel(
          selectedCasoId,
          'GPS',
          processedFile,
          JSON.stringify(finalMapping)
        );
      } else {
        resultado = await uploadArchivoExcel(
          selectedCasoId,
          fileType,
          selectedFile,
          JSON.stringify(finalMapping)
        );
      }
      // Si la respuesta es exitosa pero no contiene el archivo, mostrar advertencia de procesamiento
      if (!resultado || !resultado.archivo) {
        setImportWarning(
          <Alert color="blue" title="Procesando archivo..." icon={<IconUpload />} mt="md">
            El archivo se está procesando en segundo plano. Aparecerá en la lista de archivos importados en unos segundos.
          </Alert>
        );
        // Refrescar la lista de archivos tras unos segundos
        setTimeout(() => {
          fetchArchivos(selectedCasoId);
        }, 5000);
      } else {
        // Si todo fue bien, refrescar la lista de archivos
        fetchArchivos(selectedCasoId);
      }
      setSelectedFile(null);
      setExcelHeaders([]);
      setColumnMapping({});
    } catch (err: any) {
      let message = 'Error al importar el archivo.';
      let detail = err.response?.data?.detail;
      if (detail) {
        try {
          if (typeof detail === 'string') {
            message = `${message} Detalle: ${detail}`;
          } else {
            message = `${message} Detalle: \n${JSON.stringify(detail, null, 2)}`;
          }
        } catch (jsonError) {
          message = `${message} (No se pudo formatear detalle del error)`;
        }
      } else if (err.message) {
        message = `${message} Mensaje: ${err.message}`;
      }
      if (message.length > 500) {
        message = message.substring(0, 497) + "...";
      }
      setUploadError(message);
    } finally {
      setIsUploading(false);
      setIsReadingHeaders(false);
    }
  };

  // --- NUEVO: Manejar la eliminación de un archivo ---
  const handleDeleteArchivo = async (archivoId: number) => {
    // Buscar el archivo a eliminar
    const archivo = archivosList.find(a => a.ID_Archivo === archivoId) || null;
    setArchivoToDelete(archivo);
    setDeleteModalOpened(true);
  };

  // --- NUEVO: Confirmar eliminación ---
  const confirmDeleteArchivo = async () => {
    if (!archivoToDelete) return;
    setDeletingArchivoId(archivoToDelete.ID_Archivo); // Mostrar indicador de carga
    setDeleteModalOpened(false);
    try {
      await deleteArchivo(archivoToDelete.ID_Archivo);
      notifications.show({
        title: 'Archivo Eliminado',
        message: `El archivo ID ${archivoToDelete.ID_Archivo} ha sido eliminado correctamente.`,
        color: 'teal',
        icon: <IconCheck size={18} />
      });
      setArchivosList(prevList => prevList.filter(archivo => archivo.ID_Archivo !== archivoToDelete.ID_Archivo));
    } catch (err: any) {
      console.error("Error al eliminar archivo:", err);
      notifications.show({
        title: 'Error al Eliminar',
        message: err.response?.data?.detail || err.message || 'No se pudo eliminar el archivo.',
        color: 'red',
        icon: <IconAlertCircle />
      });
    } finally {
      setDeletingArchivoId(null);
      setArchivoToDelete(null);
    }
  };

  // Limpiar advertencia al cambiar de archivo, caso o tipo
  useEffect(() => {
    setImportWarning(null);
  }, [selectedFile, selectedCasoId, fileType]);

  // --- Renderizado del Componente ---
  return (
    <Box p="md" style={{ paddingLeft: 32, paddingRight: 32 }}>
      <Title order={2} mb="xl">Importar Datos desde Excel</Title>
      
      {/* Overlay global de carga - Solo mostrar si no está abierto el modal de matrícula */}
      {(isUploading || isReadingHeaders) && !matriculaModalOpened && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.35)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            marginTop: 32,
            fontSize: 32,
            color: '#fff',
            fontWeight: 600,
            textShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}>
            {isUploading ? 'Subiendo archivo...' : 'Leyendo encabezados...'}
          </div>
          <div style={{ width: 400, marginTop: 32 }}>
            <div style={{ height: 16, background: '#e0e0e0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                width: isUploading ? '75%' : '25%',
                height: '100%',
                background: '#228be6',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ color: '#fff', marginTop: 8, fontSize: 18, textAlign: 'center' }}>{isUploading ? '75%' : '25%'}</div>
          </div>
        </div>
      )}

      <Paper shadow="sm" p="md" withBorder>
        {/* Formulario de importación principal */}
        <Stack gap="lg">
          {/* Selector de Caso y botón Ir al Caso */}
          <Group align="flex-end" justify="space-between" mb="md">
            <Box style={{ flex: 1 }}>
              <Select
                label="Selecciona un Caso"
                placeholder="Elige el caso al que importar el archivo"
                data={casosList}
                value={selectedCasoId}
                onChange={(value) => {
                  setSelectedCasoId(value);
                  // --- Buscar y guardar el nombre del caso ---
                  const selectedOption = casosList.find(option => option.value === value);
                  setSelectedCasoName(selectedOption ? selectedOption.label.split(' - ')[1].split(' (')[0] : null);
                  // --- Fin Buscar y guardar el nombre ---
                  // Limpiar errores y estado del archivo al cambiar de caso
                  setSelectedFile(null);
                  setExcelHeaders([]);
                  setColumnMapping({});
                  setUploadError(null);
                  setMappingError(null);
                }}
                searchable
                nothingFoundMessage="No se encontraron casos"
                disabled={loadingCasos || isUploading}
                error={errorCasos}
                required
              />
            </Box>
            <Button
              leftSection={<IconFileSpreadsheet size={18} />}
              onClick={() => navigate(`/casos/${selectedCasoId}`)}
              disabled={!selectedCasoId}
              variant="filled"
              color="#234be7"
              style={{ minWidth: 160 }}
            >
              Ir al Caso
            </Button>
          </Group>

          {/* Tipo de Archivo */}
          <Radio.Group
            name="fileType"
            label="Tipo de Archivo a Importar"
            value={fileType}
            onChange={(value) => setFileType(value as 'LPR' | 'GPS' | 'GPX_KML')}
            required
            mb="md"
          >
            <Group mt="xs">
              <Radio value="LPR" label="Datos LPR" disabled={isUploading || isReadingHeaders} />
              <Radio value="GPS" label="Datos GPS" disabled={isUploading || isReadingHeaders} />
              <Radio value="GPX_KML" label="Archivo GPX/KML" disabled={isUploading || isReadingHeaders} />
            </Group>
          </Radio.Group>

          {/* Input de Archivo */}
          <FileInput
            label="Archivo"
            placeholder={
              fileType === 'GPX_KML' 
                ? "Selecciona o arrastra un archivo (.gpx, .kml)" 
                : "Selecciona o arrastra un archivo (.xlsx, .xls)"
            }
            leftSection={<IconFileSpreadsheet size={rem(18)} />}
            value={selectedFile}
            onChange={setSelectedFile}
            accept={fileType === 'GPX_KML' ? ".gpx,.kml" : ".xlsx,.xls"}
            disabled={!selectedCasoId || isUploading || isReadingHeaders}
            clearable
            required
          />

          {/* Botón Configurar Mapeo */}
          <Button
              leftSection={<IconSettings size={18} />}
              onClick={openMappingModal}
              disabled={!selectedFile || isUploading || isReadingHeaders}
              variant="outline"
              mt="xs"
          >
              Configurar Mapeo de Columnas
          </Button>

          {/* Alerta de error de mapeo */}
          {mappingError && <Alert title="Error de Lectura" color="red" icon={<IconAlertCircle />}>{mappingError}</Alert>}

          {/* Botón Importar */}
          <Button
            leftSection={<IconUpload size={18} />}
            onClick={handleImport}
            loading={isUploading}
            disabled={!selectedCasoId || !selectedFile || !isMappingComplete() || isReadingHeaders}
            mt="lg"
            fullWidth
          >
            Importar Archivo
          </Button>

          {/* Alerta de error de subida */}
          {uploadError && <Alert title="Error de Subida" color="red" icon={<IconAlertCircle />}>{uploadError}</Alert>}

          {/* Advertencia de importación */}
          {importWarning}
        </Stack>
      </Paper>

      {selectedCasoId && (
        <Paper shadow="sm" p="md" withBorder mt="xl">
          <Title order={3} mb="md">Archivos Importados</Title>
          
          <LoadingOverlay visible={loadingArchivos} />
          {errorArchivos && <Alert color="red" title="Error" mb="md">{errorArchivos}</Alert>}
          
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Nombre Archivo</Table.Th>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Importado</Table.Th>
                <Table.Th>Registros</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {archivosList.map((archivo) => (
                <Table.Tr key={archivo.ID_Archivo}>
                  <Table.Td>{archivo.ID_Archivo}</Table.Td>
                  <Table.Td>
                    <Text truncate="end" style={{ maxWidth: '300px' }}>
                      {archivo.Nombre_del_Archivo}
                    </Text>
                  </Table.Td>
                  <Table.Td>{archivo.Tipo_de_Archivo}</Table.Td>
                  <Table.Td>
                    {new Date(archivo.Fecha_de_Importacion).toLocaleString('es-ES', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Table.Td>
                  <Table.Td>{archivo.Total_Registros}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Tooltip label="Descargar">
                        <ActionIcon
                          variant="subtle"
                          color="blue"
                          onClick={() => window.open(`/api/archivos/${archivo.ID_Archivo}/download`, '_blank')}
                        >
                          <IconDownload size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Eliminar">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => handleDeleteArchivo(archivo.ID_Archivo)}
                          loading={deletingArchivoId === archivo.ID_Archivo}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {/* Modal de Mapeo */}
      <Modal
        opened={mappingModalOpened}
        onClose={closeMappingModal}
        title="Configurar Mapeo de Columnas"
        size="lg"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Selecciona qué columna del archivo Excel corresponde a cada campo requerido.
          </Text>
          
          <Divider my="sm" />

          {/* Opción para fecha/hora combinada */}
          <Checkbox
            label="La fecha y hora vienen en una sola columna"
            checked={fechaHoraCombinada}
            onChange={(event) => setFechaHoraCombinada(event.currentTarget.checked)}
          />

          {fechaHoraCombinada && (
            <Select
              label="Formato de fecha y hora"
              placeholder="Selecciona el formato"
              value={formatoFechaHora}
              onChange={(value) => setFormatoFechaHora(value || 'DD/MM/YYYY HH:mm:ss')}
              data={[
                { value: 'DD/MM/YYYY HH:mm:ss', label: 'DD/MM/YYYY HH:mm:ss' },
                { value: 'YYYY-MM-DD HH:mm:ss', label: 'YYYY-MM-DD HH:mm:ss' },
                { value: 'DD-MM-YYYY HH:mm:ss', label: 'DD-MM-YYYY HH:mm:ss' },
                { value: 'MM/DD/YYYY HH:mm:ss', label: 'MM/DD/YYYY HH:mm:ss' },
                { value: 'YYYY/MM/DD HH:mm:ss', label: 'YYYY/MM/DD HH:mm:ss' },
              ]}
            />
          )}
          
          <Divider my="sm" />
          
          <SimpleGrid cols={2}>
            {REQUIRED_FIELDS[fileType].map((field) => {
              // Si fecha y hora están combinadas, solo mostrar uno de los campos
              if (fechaHoraCombinada && (field === 'Hora' || field === 'Fecha')) {
                if (field === 'Hora') return null; // Ocultar el campo Hora
                return (
                  <Select
                    key={field}
                    label="Fecha y Hora"
                    placeholder="Selecciona columna para Fecha y Hora"
                    data={excelHeaders}
                    value={columnMapping[field] || null}
                    onChange={(value) => {
                      handleMappingChange('Fecha', value);
                      handleMappingChange('Hora', value);
                    }}
                    required
                  />
                );
              }
              return (
                <Select
                  key={field}
                  label={field}
                  placeholder={`Selecciona columna para ${field}`}
                  data={excelHeaders}
                  value={columnMapping[field] || null}
                  onChange={(value) => handleMappingChange(field, value)}
                  required
                />
              );
            })}
          </SimpleGrid>

          <Divider my="sm" />

          <Text size="sm" fw={500}>Campos Opcionales</Text>
          <Text size="xs" c="dimmed" mb="md">
            Estos campos no son obligatorios, pero si están disponibles en tu archivo, puedes mapearlos.
          </Text>

          <SimpleGrid cols={2}>
            {OPTIONAL_FIELDS[fileType].map((field) => (
              <Select
                key={field}
                label={field}
                placeholder={`Selecciona columna para ${field}`}
                data={excelHeaders}
                value={columnMapping[field] || null}
                onChange={(value) => handleMappingChange(field, value)}
                clearable
              />
            ))}
          </SimpleGrid>

          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={closeMappingModal}>
              Cancelar
            </Button>
            <Button onClick={saveMapping}>
              Guardar Mapeo
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal de Matrícula para GPX/KML */}
      <Modal
        opened={matriculaModalOpened}
        onClose={() => {
          closeMatriculaModal();
          setIsUploading(false);
          setIsReadingHeaders(false);
        }}
        title="Especificar Matrícula"
        size="md"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Para procesar correctamente los datos GPX/KML, necesitamos asignar una matrícula a los puntos.
          </Text>
          
          <TextInput
            label="Matrícula"
            placeholder="Ingresa la matrícula del vehículo"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            required
          />

          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={() => {
              closeMatriculaModal();
              setIsUploading(false);
              setIsReadingHeaders(false);
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={async () => {
                if (!matricula) {
                  notifications.show({
                    title: 'Matrícula Requerida',
                    message: 'Debes especificar una matrícula para continuar.',
                    color: 'red'
                  });
                  return;
                }
                closeMatriculaModal();
                setTimeout(() => { handleImport(); }, 0);
              }}
            >
              Continuar
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal de Confirmación de Eliminación */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => { setDeleteModalOpened(false); setArchivoToDelete(null); }}
        title="Confirmar Eliminación"
        size="md"
        centered
      >
        <Stack>
          <Text size="md">
            ¿Estás seguro de que quieres eliminar el archivo <b>{archivoToDelete?.Nombre_del_Archivo}</b> (ID {archivoToDelete?.ID_Archivo}) y todas sus lecturas asociadas?
          </Text>
          <Text size="sm" c="red.7">
            Esta acción no se puede deshacer.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="outline" onClick={() => { setDeleteModalOpened(false); setArchivoToDelete(null); }}>
              Cancelar
            </Button>
            <Button color="red" onClick={confirmDeleteArchivo} loading={deletingArchivoId === archivoToDelete?.ID_Archivo}>
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

export default ImportarPage;