import React, { useState, useEffect, useCallback } from 'react';
import { 
    Box, 
    Text, 
    Select, 
    Radio, 
    Group, 
    FileInput, 
    Button, 
    Loader, 
    Alert, 
    Stack,
    Modal,
    Divider,
    LoadingOverlay,
    rem,
    Table,
    Anchor,
    Title,
    ActionIcon,
    Tooltip
} from '@mantine/core';
import { IconUpload, IconAlertCircle, IconFileSpreadsheet, IconSettings, IconCheck, IconX, IconDownload, IconTrash } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { getCasos } from '../services/casosApi';
import { uploadArchivoExcel, getArchivosPorCaso, deleteArchivo } from '../services/archivosApi';
import apiClient from '../services/api';
import type { Caso, ArchivoExcel } from '../types/data';
import * as XLSX from 'xlsx'; // Importar librería xlsx

// Definir los campos requeridos - SEPARANDO Fecha y Hora
const REQUIRED_FIELDS: { [key in 'LPR' | 'GPS']: string[] } = {
  LPR: ['Matricula', 'Fecha', 'Hora', 'ID_Lector'], // Fecha y Hora separadas
  GPS: ['Matricula', 'Fecha', 'Hora', 'Coordenada_X', 'Coordenada_Y'], // Fecha y Hora separadas
};
// Campos opcionales
const OPTIONAL_FIELDS: { [key in 'LPR' | 'GPS']: string[] } = {
    LPR: ['Carril', 'Velocidad', 'Coordenada_X', 'Coordenada_Y'],
    GPS: ['Velocidad']
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

  // --- NUEVO: Efecto para cargar archivos cuando cambia el caso seleccionado ---
  useEffect(() => {
    if (selectedCasoId) {
      fetchArchivos(selectedCasoId);
    } else {
      setArchivosList([]); // Limpiar lista si no hay caso seleccionado
      setErrorArchivos(null); // Limpiar error
    }
  }, [selectedCasoId, fetchArchivos]); // Depender de selectedCasoId y fetchArchivos

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
            .filter(([key, value]) => value !== null)
            .reduce((obj, [key, value]) => {
                obj[key] = value as string;
                return obj;
            }, {} as { [key: string]: string });

        const resultado: ArchivoExcel = await uploadArchivoExcel(
            selectedCasoId,
            fileType,
            selectedFile,
            JSON.stringify(finalMapping)
        );

        notifications.show({
            title: 'Éxito',
            message: `Archivo "${resultado.Nombre_del_Archivo}" importado. ID Archivo: ${resultado.ID_Archivo}`,
            color: 'green'
        });

        // Limpiar formulario
        setSelectedFile(null);
        setExcelHeaders([]);
        setColumnMapping({});
        // No reseteamos el caso o tipo por si quiere importar otro al mismo

        // --- RECARGAR LISTA DE ARCHIVOS ---
        if (selectedCasoId) {
            await fetchArchivos(selectedCasoId);
        } else {
            console.warn("selectedCasoId es null, no se pudo recargar la lista de archivos después de la importación.");
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

  // --- Renderizado del Componente ---
  return (
    <Box p="md">
      <Title order={2} mb="xl">Importar Datos desde Excel</Title>
      <LoadingOverlay visible={isUploading || isReadingHeaders} overlayProps={{ radius: "sm", blur: 2 }} />

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
        <Stack gap="md">
            {isReadingHeaders && <Loader />}
            {!isReadingHeaders && excelHeaders.length === 0 && !mappingError && <Text>Selecciona un archivo para ver las columnas.</Text>}
            {!isReadingHeaders && mappingError && <Alert color="red">{mappingError}</Alert>}
            {!isReadingHeaders && excelHeaders.length > 0 && (
                <>
                    <Text size="sm">Asigna las columnas de tu archivo Excel a los campos requeridos y opcionales de la base de datos.</Text>
                    <Divider label="Campos Requeridos" labelPosition="center" />
                    {REQUIRED_FIELDS[fileType].map(field => (
                        <Select
                            key={`req-${field}`}
                            label={field}
                            placeholder="Selecciona columna del Excel..."
                            data={excelHeaders}
                            value={columnMapping[field]}
                            onChange={(value) => handleMappingChange(field, value)}
                            required
                            clearable
                        />
                    ))}
                    <Divider label="Campos Opcionales" labelPosition="center" mt="md"/>
                    {OPTIONAL_FIELDS[fileType].map(field => (
                         <Select
                            key={`opt-${field}`}
                            label={field}
                            placeholder="Selecciona columna del Excel (opcional)..."
                            data={excelHeaders}
                            value={columnMapping[field]}
                            onChange={(value) => handleMappingChange(field, value)}
                            clearable
                        />
                    ))}
                    <Button onClick={saveMapping} mt="lg">Guardar Mapeo</Button>
                </>
            )}
        </Stack>
      </Modal>

      {/* --- NUEVA SECCIÓN: TABLA DE ARCHIVOS --- */}
      {selectedCasoId && ( // Solo mostrar si hay un caso seleccionado
        <Box mt="xl">
            <Divider my="lg" label="Archivos Importados" labelPosition="center" />
            {/* --- Título Dinámico --- */}
            {selectedCasoName && (
                <Title order={4} mb="md" c="tracerBlue.7">
                    Archivos para el caso: {selectedCasoName}
                </Title>
            )}
            {/* --- Fin Título Dinámico --- */}

            <LoadingOverlay visible={loadingArchivos} overlayProps={{ radius: "sm", blur: 2 }} />
            {/* Mensaje de error */}
            {!loadingArchivos && errorArchivos && (
                <Alert color="red" title="Error al cargar archivos" icon={<IconAlertCircle />}>
                    {errorArchivos}
                </Alert>
            )}
            {/* Tabla o mensaje de "no hay archivos" */}
            {!loadingArchivos && !errorArchivos && (
                archivosList.length > 0 ? (
                    <Table striped highlightOnHover withTableBorder withColumnBorders>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Nombre del Archivo</Table.Th>
                                <Table.Th>Tipo</Table.Th>
                                <Table.Th>Acciones</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {archivosList.map((archivo) => (
                                <Table.Tr key={archivo.ID_Archivo}>
                                    <Table.Td>{archivo.Nombre_del_Archivo}</Table.Td>
                                    <Table.Td>{archivo.Tipo_de_Archivo}</Table.Td>
                                    <Table.Td>
                                        <Group gap="xs">
                                            <Tooltip label="Descargar Archivo Original">
                                                <Anchor
                                                    href={`${apiClient.defaults.baseURL}/archivos/${archivo.ID_Archivo}/download`}
                                                    download={archivo.Nombre_del_Archivo} 
                                                    target="_blank" 
                                                >
                                                    <ActionIcon variant="subtle" color="blue">
                                                        <IconDownload size={16} />
                                                    </ActionIcon>
                                                </Anchor>
                                            </Tooltip>

                                            <Tooltip label="Eliminar Archivo y Lecturas">
                                                <ActionIcon 
                                                    variant="subtle" 
                                                    color="red" 
                                                    onClick={() => handleDeleteArchivo(archivo.ID_Archivo)}
                                                    loading={deletingArchivoId === archivo.ID_Archivo}
                                                    disabled={deletingArchivoId !== null}
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
                ) : (
                    // Mensaje si no hay archivos
                    <Text>No hay archivos importados para este caso.</Text>
                )
            )}
        </Box>
      )}
    </Box>
  );
}

export default ImportarPage; 