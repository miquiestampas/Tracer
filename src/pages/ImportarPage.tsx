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
    LoadingOverlay
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
const REQUIRED_FIELDS: { [key in 'LPR' | 'GPS']: string[] } = {
  LPR: ['Matricula', 'Fecha', 'Hora', 'ID_Lector'],
  GPS: ['Matricula', 'Fecha', 'Hora', 'ID_Lector'],
};
// Campos opcionales
const OPTIONAL_FIELDS: { [key in 'LPR' | 'GPS']: string[] } = {
    LPR: ['Carril', 'Sentido', 'Velocidad', 'Coordenada_X', 'Coordenada_Y'],
    GPS: ['Sentido', 'Velocidad', 'Coordenada_X', 'Coordenada_Y'],
};

// --- NUEVO: Diccionario de Términos para Auto-Mapeo ---
// (Convertir a minúsculas para comparación insensible)
const AUTO_MAP_TERMS: { [key: string]: string[] } = {
  Matricula: ['matricula', 'matrícula', 'plate', 'license', 'licensenumber', 'numplaca', 'patente', 'licenseplate'],
  Fecha: ['fecha', 'date', 'fec'],
  Hora: ['hora', 'time', 'timestamp'], // Timestamp podría requerir dividir fecha/hora después
  ID_Lector: ['id_lector', 'idlector', 'lector', 'camara', 'cámara', 'device', 'reader', 'dispositivo'],
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
  const [fileType, setFileType] = useState<'LPR' | 'GPS'>('LPR');
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

  // Estados para la ayuda
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  // Estado para advertencia visual de importación
  const [importWarning, setImportWarning] = useState<React.ReactNode | null>(null);

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

  // --- MODIFICADO: Leer cabeceras y aplicar auto-mapeo ---
  const readExcelHeaders = useCallback(async (file: File) => {
    setIsReadingHeaders(true);
    setExcelHeaders([]);
    setColumnMapping({}); 
    setMappingError(null);
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
          const mappedHeaders = new Set<string>(); // Para evitar mapear la misma cabecera a múltiples campos

          allFields.forEach(field => {
            initialMapping[field] = null; // Inicializar a null
            const terms = AUTO_MAP_TERMS[field];
            if (terms) {
              // Buscar la primera cabecera que coincida y no esté ya mapeada
              for (const header of headers) {
                  const lowerHeader = header.toLowerCase();
                  if (terms.includes(lowerHeader) && !mappedHeaders.has(lowerHeader)) {
                      initialMapping[field] = header; // Usar el nombre original de la cabecera
                      mappedHeaders.add(lowerHeader);
                      break; // Pasar al siguiente campo una vez encontrado
                  }
              }
            }
          });
          // --- Fin Auto-Mapeo ---

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
        setMappingError(`Error al leer las cabeceras: ${error.message}`)
        notifications.show({ title: 'Error de Lectura', message: `No se pudieron leer las cabeceras del Excel: ${error.message}`, color: 'red' });
        setSelectedFile(null); 
      } finally {
        setIsReadingHeaders(false);
      }
    };

    reader.onerror = (error) => {
        setMappingError('Error al leer el archivo.')
        notifications.show({ title: 'Error de Archivo', message: 'Ocurrió un error al intentar leer el archivo seleccionado.', color: 'red' });
        setSelectedFile(null);
        setIsReadingHeaders(false);
    };

    reader.readAsArrayBuffer(file);
  }, [fileType]); // Asegurar que fileType está en dependencias para que se re-evalúe si cambia

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

  // Manejar el envío del formulario de importación
  const handleImport = async () => {
    if (!selectedCasoId || !selectedFile) {
      notifications.show({ title: 'Faltan datos', message: 'Selecciona un caso y un archivo.', color: 'orange' });
      return;
    }
    if (!isMappingComplete()) {
        notifications.show({ title: 'Mapeo Incompleto', message: 'Configura el mapeo de columnas antes de importar.', color: 'orange' });
        openMappingModal();
        return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
        const finalMapping = Object.entries(columnMapping)
            .filter(([_, value]) => value !== null)
            .reduce((obj, [key, value]) => {
                obj[key] = value as string;
                return obj;
            }, {} as { [key: string]: string });

        const resultado: UploadResponse = await uploadArchivoExcel(
            selectedCasoId,
            fileType,
            selectedFile,
            JSON.stringify(finalMapping)
        );

        // En handleImport, reemplazar notificación flotante por setImportWarning
        if (resultado.total_registros === 0 && resultado.lecturas_duplicadas && resultado.lecturas_duplicadas.length > 0) {
          setImportWarning(
            <Alert color="yellow" title="No se importó ningún registro" icon={<IconAlertCircle size={18} />} mt="md">
              <Text size="sm" fw={500} c="yellow.8">Todos los registros del archivo ya existían en el sistema y fueron ignorados como duplicados.</Text>
              <Text size="sm" mt="xs">Ejemplos de duplicados:</Text>
              <Text size="xs" component="ul" mt="xs">
                {resultado.lecturas_duplicadas.slice(0, 5).map((duplicado, index) => (
                  <li key={index}>{duplicado}</li>
                ))}
                {resultado.lecturas_duplicadas.length > 5 && (
                  <li>...y {resultado.lecturas_duplicadas.length - 5} más</li>
                )}
              </Text>
            </Alert>
          );
        } else if (resultado.total_registros === 0) {
          setImportWarning(
            <Alert color="yellow" title="No se importó ningún registro" icon={<IconAlertCircle size={18} />} mt="md">
              No se importaron registros. Esto puede deberse a que el archivo está vacío, los datos no son válidos o todos los registros ya existían previamente (duplicados).
            </Alert>
          );
        } else {
        notifications.show({
            title: resultado.lecturas_duplicadas && resultado.lecturas_duplicadas.length > 0 ? 'Importación con Advertencias' : 'Éxito',
            message: (
              <Box>
                <Text size="sm">Archivo "{resultado.archivo.Nombre_del_Archivo}" importado correctamente</Text>
                <Text size="sm">Total de registros importados: {resultado.total_registros}</Text>
                {resultado.lecturas_duplicadas && resultado.lecturas_duplicadas.length > 0 && (
                  <Alert color="yellow" title="¡Atención! Se encontraron lecturas duplicadas" mt="xs" icon={<IconAlertCircle size={16} />}> 
                    <Text size="sm" fw={500}>Se ignoraron {resultado.lecturas_duplicadas.length} lecturas duplicadas:</Text>
                    <Text size="xs" component="ul" mt="xs">
                      {resultado.lecturas_duplicadas.slice(0, 5).map((duplicado, index) => (
                        <li key={index}>{duplicado}</li>
                      ))}
                      {resultado.lecturas_duplicadas.length > 5 && (
                        <li>...y {resultado.lecturas_duplicadas.length - 5} más</li>
                      )}
                    </Text>
                    <Text size="xs" mt="xs" c="dimmed">Estas lecturas ya existían en el sistema y no fueron importadas.</Text>
                  </Alert>
                )}
              </Box>
            ),
            color: resultado.lecturas_duplicadas && resultado.lecturas_duplicadas.length > 0 ? 'yellow' : 'green',
            autoClose: false
        });
        }

        // --- Notificación de Nuevos Lectores --- 
        if (resultado.nuevos_lectores_creados && resultado.nuevos_lectores_creados.length > 0) {
            const numNuevos = resultado.nuevos_lectores_creados.length;
            notifications.show({
                title: 'Lectores Nuevos Creados',
                message: (
                    <Box>
                        <Text size="sm">Se crearon automáticamente {numNuevos} lectores nuevos.</Text>
                        <Text size="sm">Se recomienda revisar y completar su información.</Text>
                        <Button 
                            size="xs" 
                            variant="light" 
                            mt="xs" 
                            onClick={() => navigate('/lectores')} // O la ruta correcta
                        >
                            Ir a Gestión de Lectores
                        </Button>
                    </Box>
                ),
                color: 'blue',
                autoClose: 10000, // Dar más tiempo para leer y hacer clic
                withCloseButton: true,
            });
        }
        // --- Fin Notificación --- 

        // Limpiar formulario
        setSelectedFile(null);
        setExcelHeaders([]);
        setColumnMapping({});

        // Recargar lista de archivos
        if (selectedCasoId) {
            await fetchArchivos(selectedCasoId);
        }

    } catch (err: any) {
        let message = 'Error al importar el archivo.';
        let detail = err.response?.data?.detail; // Obtener el detalle

        console.error("Error completo recibido:", err.response || err); // Loguear el error completo en consola del navegador

        if (detail) {
            // Intentar formatear el detalle, sea string, objeto o array
            try {
                if (typeof detail === 'string') {
                    message = `${message} Detalle: ${detail}`;
                } else {
                    // Convertir objeto/array a JSON string formateado
                    message = `${message} Detalle: \n${JSON.stringify(detail, null, 2)}`;
                }
            } catch (jsonError) {
                message = `${message} (No se pudo formatear detalle del error)`;
            }
        } else if (err.message) {
            message = `${message} Mensaje: ${err.message}`;
        }
        // Limitar longitud del mensaje para que quepa en el Alert
        if (message.length > 500) {
            message = message.substring(0, 497) + "...";
        }
        setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  // --- NUEVO: Manejar la eliminación de un archivo ---
  const handleDeleteArchivo = async (archivoId: number) => {
    // Pedir confirmación
    if (!window.confirm(`¿Estás seguro de que quieres eliminar el archivo ID ${archivoId} y todas sus lecturas asociadas? Esta acción no se puede deshacer.`)) {
      return;
    }

    setDeletingArchivoId(archivoId); // Mostrar indicador de carga
    try {
      await deleteArchivo(archivoId);
      notifications.show({
        title: 'Archivo Eliminado',
        message: `El archivo ID ${archivoId} ha sido eliminado correctamente.`,
        color: 'teal',
        icon: <IconCheck size={18} />
      });
      // Actualizar la lista de archivos localmente para reflejar la eliminación
      setArchivosList(prevList => prevList.filter(archivo => archivo.ID_Archivo !== archivoId));
      
    } catch (err: any) {
      console.error("Error al eliminar archivo:", err);
      notifications.show({
        title: 'Error al Eliminar',
        message: err.response?.data?.detail || err.message || 'No se pudo eliminar el archivo.',
        color: 'red',
        icon: <IconAlertCircle />
      });
    } finally {
      setDeletingArchivoId(null); // Ocultar indicador de carga
    }
  };

  // Subir el archivo al backend
  const handleUpload = async () => {
    if (!selectedFile || !selectedCasoId || Object.keys(columnMapping).length === 0) {
      notifications.show({
        title: 'Faltan Datos',
        message: 'Selecciona un caso, un archivo y configura el mapeo de columnas.',
        color: 'orange'
      });
      return;
    }

    // Validar mapeo antes de subir
    const missingMappings = REQUIRED_FIELDS[fileType].filter(field => !columnMapping[field]);
    if (missingMappings.length > 0) {
        notifications.show({
            title: 'Mapeo Incompleto',
            message: `Completa el mapeo para los campos requeridos: ${missingMappings.join(', ')}`,
            color: 'orange'
        });
        return;
    }

    // Convertir el mapeo a JSON string para enviarlo
    const mappingJson = JSON.stringify(columnMapping);

    setIsUploading(true);
    setUploadError(null);

    try {
      const response = await uploadArchivoExcel(
        selectedCasoId,
        fileType,
        selectedFile,
        mappingJson
      );
      
      // Mostrar advertencia visual de importación (igual que en handleImport)
      if (response.total_registros === 0 && response.lecturas_duplicadas && response.lecturas_duplicadas.length > 0) {
        setImportWarning(
          <Alert color="yellow" title="No se importó ningún registro" icon={<IconAlertCircle size={18} />} mt="md">
            <Text size="sm" fw={500} c="yellow.8">Todos los registros del archivo ya existían en el sistema y fueron ignorados como duplicados.</Text>
            <Text size="sm" mt="xs">Ejemplos de duplicados:</Text>
            <Text size="xs" component="ul" mt="xs">
              {response.lecturas_duplicadas.slice(0, 5).map((duplicado, index) => (
                <li key={index}>{duplicado}</li>
              ))}
              {response.lecturas_duplicadas.length > 5 && (
                <li>...y {response.lecturas_duplicadas.length - 5} más</li>
              )}
            </Text>
          </Alert>
        );
      } else if (response.total_registros === 0) {
        setImportWarning(
          <Alert color="yellow" title="No se importó ningún registro" icon={<IconAlertCircle size={18} />} mt="md">
            No se importaron registros. Esto puede deberse a que el archivo está vacío, los datos no son válidos o todos los registros ya existían previamente (duplicados).
          </Alert>
        );
      } else {
        setImportWarning(null);
      notifications.show({
          title: response.lecturas_duplicadas && response.lecturas_duplicadas.length > 0 ? 'Importación con Advertencias' : 'Éxito',
        message: (
          <Box>
            <Text size="sm">Archivo "{response.archivo.Nombre_del_Archivo}" importado correctamente</Text>
            <Text size="sm">Total de registros importados: {response.total_registros}</Text>
            {response.lecturas_duplicadas && response.lecturas_duplicadas.length > 0 && (
                <Alert color="yellow" title="¡Atención! Se encontraron lecturas duplicadas" mt="xs" icon={<IconAlertCircle size={16} />}> 
                  <Text size="sm" fw={500}>Se ignoraron {response.lecturas_duplicadas.length} lecturas duplicadas:</Text>
                <Text size="xs" component="ul" mt="xs">
                    {response.lecturas_duplicadas.slice(0, 5).map((duplicado, index) => (
                    <li key={index}>{duplicado}</li>
                  ))}
                    {response.lecturas_duplicadas.length > 5 && (
                      <li>...y {response.lecturas_duplicadas.length - 5} más</li>
                    )}
                </Text>
                  <Text size="xs" mt="xs" c="dimmed">Estas lecturas ya existían en el sistema y no fueron importadas.</Text>
              </Alert>
            )}
          </Box>
        ),
          color: response.lecturas_duplicadas && response.lecturas_duplicadas.length > 0 ? 'yellow' : 'green',
        autoClose: false
      });
        // Limpiar el formulario solo si la importación fue exitosa
      setSelectedFile(null);
      setExcelHeaders([]);
      setColumnMapping({});
      // Recargar la lista de archivos
      fetchArchivos(selectedCasoId);
      }
    } catch (error: any) {
      console.error('Error al subir el archivo:', error);
      setUploadError(error instanceof Error ? error.message : 'Error al subir el archivo');
      
      // Mostrar notificación de error específica para archivos duplicados
      if (error.response?.data?.detail?.includes('Ya existe un archivo con el nombre')) {
        notifications.show({
          title: 'Archivo Duplicado',
          message: error.response.data.detail,
          color: 'red',
          icon: <IconAlertCircle />
        });
      } else {
        notifications.show({
          title: 'Error',
          message: 'No se pudo subir el archivo. Por favor, intenta de nuevo.',
          color: 'red'
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Limpiar advertencia al cambiar de archivo, caso o tipo
  useEffect(() => {
    setImportWarning(null);
  }, [selectedFile, selectedCasoId, fileType]);

  // --- Renderizado del Componente ---
  return (
    <Box p="md" style={{ paddingLeft: 32, paddingRight: 32 }}>
      <Group justify="flex-end" mb="xs">
        <Button
          variant="light"
          color="blue"
          size="xs"
          onClick={() => setAyudaAbierta((v) => !v)}
        >
          {ayudaAbierta ? 'Ocultar ayuda' : 'Mostrar ayuda'}
        </Button>
      </Group>
      <Collapse in={ayudaAbierta}>
        <Alert color="blue" title="¿Cómo funciona la pestaña Archivos Importados?" mb="md">
          <Text size="sm">
            <b>¿Qué es esta pestaña?</b><br />
            Aquí puedes importar archivos Excel con lecturas LPR o GPS y gestionarlos para su análisis en el caso.<br /><br />
            <b>¿Cómo importar?</b><br />
            1. Selecciona el caso al que quieres asociar los archivos.<br />
            2. Elige el tipo de archivo (LPR o GPS).<br />
            3. Sube el archivo Excel y mapea las columnas a los campos requeridos.<br />
            4. Confirma la importación y revisa los archivos ya cargados.<br /><br />
            <b>Consejos:</b><br />
            - Asegúrate de que tu archivo tenga cabeceras claras y todos los campos obligatorios.<br />
            - Puedes eliminar archivos importados si te has equivocado.<br />
            - El sistema intentará mapear automáticamente las columnas, pero revisa siempre el mapeo antes de confirmar.<br />
          </Text>
        </Alert>
      </Collapse>
      <Title order={2} mb="xl">Importar Datos desde Excel</Title>
      
      {/* Overlay global de carga */}
      {(isUploading || isReadingHeaders) && (
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

      {/* Formulario de importación principal */}
      <Stack gap="lg">
        {/* Selector de Caso */}
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
          mb="md"
          required
        />

        {/* Tipo de Archivo */}
        <Radio.Group
          name="fileType"
          label="Tipo de Archivo a Importar"
          value={fileType}
          onChange={(value) => setFileType(value as 'LPR' | 'GPS')}
          required
          mb="md"
        >
          <Group mt="xs">
            <Radio value="LPR" label="Datos LPR" disabled={isUploading || isReadingHeaders} />
            <Radio value="GPS" label="Datos GPS" disabled={isUploading || isReadingHeaders} />
          </Group>
        </Radio.Group>

        {/* Input de Archivo */}
        <FileInput
          label="Archivo Excel"
          placeholder={selectedFile ? selectedFile.name : "Selecciona o arrastra un archivo (.xlsx, .xls)"}
          leftSection={<IconFileSpreadsheet size={rem(18)} />}
          value={selectedFile}
          onChange={setSelectedFile}
          accept=".xlsx, .xls"
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
        {uploadError && <Alert title="Error de Importación" color="red" withCloseButton onClose={() => setUploadError(null)} icon={<IconAlertCircle />}>{uploadError}</Alert>}

        {/* Alerta de advertencia de importación */}
        {importWarning}
      </Stack>

      {/* Modal de Mapeo */}
      <Modal
        opened={mappingModalOpened}
        onClose={closeMappingModal}
        title={`Mapeo de Columnas para Archivo ${fileType}`}
        size="lg"
        centered
        overlayProps={{
            backgroundOpacity: 0.55,
            blur: 3,
        }}
      >
        <Stack>
          <Text size="sm" mb="md">
            Asocia las columnas de tu archivo Excel con los campos del sistema.
            Los campos marcados con * son obligatorios.
          </Text>

          <SimpleGrid cols={2} spacing="xl">
            {/* Columna Izquierda: Campos Requeridos */}
            <Box>
              <Text fw={500} mb="xs" c="red">Campos Requeridos *</Text>
              {REQUIRED_FIELDS[fileType].map((field) => (
                <Select
                  key={field}
                  label={field}
                  placeholder="Seleccionar columna"
                  data={excelHeaders}
                  value={columnMapping[field] || null}
                  onChange={(value) => handleMappingChange(field, value)}
                  required
                  mb="xs"
                />
              ))}
            </Box>

            {/* Columna Derecha: Campos Opcionales */}
            <Box>
              <Text fw={500} mb="xs" c="dimmed">Campos Opcionales</Text>
              {OPTIONAL_FIELDS[fileType].map((field) => (
                <Select
                  key={field}
                  label={field}
                  placeholder="Seleccionar columna"
                  data={excelHeaders}
                  value={columnMapping[field] || null}
                  onChange={(value) => handleMappingChange(field, value)}
                  clearable
                  mb="xs"
                />
              ))}
            </Box>
          </SimpleGrid>

          {/* Vista previa de cabeceras */}
          {excelHeaders.length > 0 && (
            <Box mt="md">
              <Text fw={500} mb="xs">Cabeceras del Excel</Text>
              <Text size="sm" c="dimmed">
                {excelHeaders.join(', ')}
              </Text>
            </Box>
          )}

          <Group justify="flex-end" mt="xl">
            <Button variant="default" onClick={closeMappingModal}>
              Cancelar
            </Button>
            <Button onClick={saveMapping} disabled={!isMappingComplete()}>
              Guardar Mapeo
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Tabla de Archivos Importados */}
      {selectedCasoId && (
        <Box mt="xl">
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
                    <Tooltip label="Eliminar Archivo">
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        onClick={() => handleDeleteArchivo(archivo.ID_Archivo)}
                        loading={deletingArchivoId === archivo.ID_Archivo}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}

export default ImportarPage;