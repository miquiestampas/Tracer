import React, { useState, useRef, useCallback } from 'react';
import { 
  Modal, 
  Button, 
  Group, 
  Text, 
  Select, 
  Box, 
  SimpleGrid, 
  LoadingOverlay, 
  FileInput, 
  Table, 
  Title,
  Divider,
  Card,
  Radio,
  Space,
  MultiSelect,
  Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconUpload, IconFileSpreadsheet, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import proj4 from 'proj4'; // Importar proj4js
import { ProgressOverlay } from '../common/ProgressOverlay';

// Interfaz para las propiedades del componente
interface ImportarLectoresModalProps {
  opened: boolean;
  onClose: () => void;
  onImport: (lectores: any[]) => Promise<{imported: number, updated: number} | void>;
}

// Opciones para el formato de coordenadas
const COORDINATE_FORMAT_OPTIONS = [
  { value: 'decimal', label: 'Decimales (ej: 40.416775, -3.703790) - Mapear a Latitud y Longitud' },
  { value: 'sexagesimal', label: 'Sexagesimales (ej: 40°25\'0.39"N, 3°42\'13.64"W) - Mapear a Latitud y Longitud' },
  { value: 'utm', label: 'UTM - Mapear a UTM X (Easting) y UTM Y (Northing)' }
];

// Campos requeridos para la importación de lectores
const REQUIRED_FIELDS = ['ID_Lector', 'Nombre'];

// Campos disponibles para mapear
const AVAILABLE_FIELDS = [
  // Campos requeridos
  { value: 'ID_Lector', label: 'ID Lector (requerido)', group: 'Identificación' },
  { value: 'Nombre', label: 'Nombre (requerido)', group: 'Identificación' },
  
  // Información de ubicación
  { value: 'Carretera', label: 'Carretera', group: 'Ubicación' },
  { value: 'Provincia', label: 'Provincia', group: 'Ubicación' },
  { value: 'Localidad', label: 'Localidad', group: 'Ubicación' },
  { value: 'Sentido', label: 'Sentido de circulación', group: 'Ubicación' },
  { value: 'Orientacion', label: 'Orientación', group: 'Ubicación' },
  
  // Coordenadas
  { value: 'Latitud', label: 'Latitud (Decimal / Sexagesimal)', group: 'Coordenadas' },
  { value: 'Longitud', label: 'Longitud (Decimal / Sexagesimal)', group: 'Coordenadas' },
  { value: 'UTM_Easting', label: 'Coordenada UTM X (Easting)', group: 'Coordenadas' },
  { value: 'UTM_Northing', label: 'Coordenada UTM Y (Northing)', group: 'Coordenadas' },
  
  // Información adicional
  { value: 'Organismo_Regulador', label: 'Organismo', group: 'Información Adicional' },
  { value: 'Notas', label: 'Notas', group: 'Información Adicional' }
];

// --- Definiciones de Sistemas de Coordenadas para Proj4 --- 
// WGS84 (Latitud/Longitud Decimales - EPSG:4326)
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
// UTM Zone 30N (España Peninsular y Baleares - ETRS89 - EPSG:25830)
// Nota: Si necesitas otras zonas (ej: Canarias), se requeriría lógica adicional para determinar la zona.
proj4.defs('EPSG:25830', '+proj=utm +zone=30 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Definir un tipo para las proyecciones por si acaso
const utmZone30N = 'EPSG:25830';
const wgs84 = 'EPSG:4326';
// --- Fin Definiciones Proj4 ---

// Función para convertir coordenadas sexagesimales a decimales
const sexagesimalToDecimal = (coordStr: string): number | null => {
  try {
    // Implementación simplificada - en un entorno real necesitaría ser más robusta
    const regex = /(\d+)°(\d+)'(\d+(\.\d+)?)"([NS|EW])/;
    const matches = coordStr.match(regex);
    
    if (!matches) return null;
    
    const degrees = parseFloat(matches[1]);
    const minutes = parseFloat(matches[2]);
    const seconds = parseFloat(matches[3]);
    const direction = matches[5];
    
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    
    // Si es dirección Sur u Oeste, convertir a negativo
    if (direction === 'S' || direction === 'W') {
      decimal = -decimal;
    }
    
    return decimal;
  } catch (error) {
    console.error("Error convirtiendo sexagesimal a decimal:", error);
    return null;
  }
};

// Función para convertir UTM a coordenadas decimales (¡Implementación REAL!)
const utmToDecimal = (easting: number, northing: number, sourceProjection: string = utmZone30N): [number, number] | null => {
  try {
    if (isNaN(easting) || isNaN(northing)) {
        console.error("Valores UTM inválidos (Easting/Northing no son números):", easting, northing);
        return null;
    }

    // Verificar si la proyección de origen es conocida
    if (!proj4.defs[sourceProjection]) {
       console.error(`Proyección UTM de origen desconocida para proj4: ${sourceProjection}`);
       // Podríamos intentar definirla aquí si tenemos la cadena proj4, o simplemente fallar.
       return null;
    }

    // Realizar la conversión usando proj4
    // proj4(origen, destino, [longitud/este, latitud/norte])
    const [lon, lat] = proj4(sourceProjection, wgs84, [easting, northing]);
    
    // Validar si los resultados son números válidos
    if (isNaN(lat) || isNaN(lon)) {
        console.error("Resultado de conversión proj4 es NaN:", { easting, northing, lat, lon });
        return null;
    }
    
     // No necesitamos la validación de rango aquí, proj4 debería dar resultados correctos
     // if (lat < -90 || lat > 90 || lon < -180 || lon > 180) { ... }

    // Devolver [latitud, longitud]
    return [lat, lon];

  } catch (error) {
    console.error(`Error durante la conversión UTM con proj4 (${easting}, ${northing}):`, error);
    return null;
  }
};

const ImportarLectoresModal: React.FC<ImportarLectoresModalProps> = ({ 
  opened, 
  onClose, 
  onImport 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [coordFormat, setCoordFormat] = useState<string>('decimal');
  const [processingStep, setProcessingStep] = useState<'upload' | 'mapping' | 'preview'>('upload');

  // Cargar y procesar el archivo Excel
  const handleFileUpload = async (file: File | null) => {
    if (!file) return;
    
    setFile(file);
    setIsLoading(true);
    
    try {
      // Leer el archivo con SheetJS
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // Obtener la primera hoja
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convertir a JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      // Extraer cabeceras (primera fila)
      if (jsonData.length > 0) {
        const headers = jsonData[0] as string[];
        setFileColumns(headers);
        
        // Inicializar mapeo automático si las columnas coinciden con campos esperados
        const initialMapping: Record<string, string> = {};
        headers.forEach((header) => {
          const normalizedHeader = header.trim().toLowerCase();
          
          // Buscar coincidencias en los campos disponibles
          const matchedField = AVAILABLE_FIELDS.find(field => 
            field.value.toLowerCase() === normalizedHeader || 
            field.label.toLowerCase().includes(normalizedHeader)
          );
          
          if (matchedField) {
            initialMapping[header] = matchedField.value;
          }
        });
        
        setColumnMapping(initialMapping);
        
        // Obtener datos de muestra (hasta 5 filas)
        const sampleData = jsonData.slice(1, 6).map((row: any) => {
          const rowData: Record<string, any> = {};
          headers.forEach((header, index) => {
            rowData[header] = row[index];
          });
          return rowData;
        });
        
        setPreviewData(sampleData);
        setProcessingStep('mapping');
      }
    } catch (error) {
      console.error("Error procesando archivo Excel:", error);
      notifications.show({
        title: 'Error al procesar archivo',
        message: 'No se pudo leer el archivo Excel. Asegúrate de que sea un formato válido.',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Procesar y generar vista previa de importación
  const handleGeneratePreview = () => {
    // Verificar que todos los campos requeridos estén mapeados
    const mappedRequiredFields = REQUIRED_FIELDS.filter(field => 
      Object.values(columnMapping).includes(field)
    );
    
    if (mappedRequiredFields.length < REQUIRED_FIELDS.length) {
      notifications.show({
        title: 'Campos requeridos faltantes',
        message: 'Debes mapear todos los campos requeridos (ID Lector y Nombre) para continuar.',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
      return;
    }
    
    setProcessingStep('preview');
  };

  // Procesar y enviar la importación final
  const handleImport = async () => {
    if (!file) return;
    
    setIsLoading(true);
    
    try {
      // Leer el archivo con SheetJS
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // Obtener la primera hoja
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Convertir a JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      console.log("Datos Excel cargados:", jsonData);
      
      const processedData = jsonData.map((row: any, index) => {
        const mappedRow: Record<string, any> = {};
        
        // Aplicar mapeo de columnas estándar
        Object.entries(columnMapping).forEach(([fileColumn, fieldName]) => {
          // Evitar procesar aquí los campos de coordenadas que trataremos después
          if (!['Latitud', 'Longitud', 'UTM_Easting', 'UTM_Northing'].includes(fieldName)) {
             if (row[fileColumn] !== undefined) {
                // Asegurar que ID_Lector sea string
                if (fieldName === 'ID_Lector') {
                  mappedRow[fieldName] = String(row[fileColumn]);
                } else {
                  mappedRow[fieldName] = row[fileColumn];
                }
             }
          }
        });
        
        // --- Procesamiento de Coordenadas --- 
        let lat: number | null = null;
        let lon: number | null = null;
        
        if (coordFormat === 'decimal' || coordFormat === 'sexagesimal') {
            const latColumn = Object.entries(columnMapping).find(([_, field]) => field === 'Latitud')?.[0];
            const lonColumn = Object.entries(columnMapping).find(([_, field]) => field === 'Longitud')?.[0];

            if (latColumn && lonColumn && row[latColumn] !== undefined && row[lonColumn] !== undefined) {
                const latStr = String(row[latColumn]);
                const lonStr = String(row[lonColumn]);
                
                if (coordFormat === 'decimal') {
                    lat = parseFloat(latStr);
                    lon = parseFloat(lonStr);
                } else { // sexagesimal
                    lat = sexagesimalToDecimal(latStr);
                    lon = sexagesimalToDecimal(lonStr);
                }
                 // Validación básica de coordenadas decimales/sexagesimales
                if (lat === null || lon === null || isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                    console.warn(`Fila ${index + 1}: Coordenadas decimales/sexagesimales inválidas o fuera de rango (${latStr}, ${lonStr}). Se omitirán.`);
                    lat = null;
                    lon = null;
                }

            } else {
                 console.warn(`Fila ${index + 1}: Faltan columnas mapeadas a Latitud/Longitud para formato ${coordFormat}.`);
            }
        } else if (coordFormat === 'utm') {
            const eastingColumn = Object.entries(columnMapping).find(([_, field]) => field === 'UTM_Easting')?.[0];
            const northingColumn = Object.entries(columnMapping).find(([_, field]) => field === 'UTM_Northing')?.[0];

            if (eastingColumn && northingColumn && row[eastingColumn] !== undefined && row[northingColumn] !== undefined) {
                const eastingVal = parseFloat(String(row[eastingColumn]));
                const northingVal = parseFloat(String(row[northingColumn]));

                if (!isNaN(eastingVal) && !isNaN(northingVal)) {
                    // Llamar a la función (placeholder) utmToDecimal con valores numéricos
                    const utmCoords = utmToDecimal(eastingVal, northingVal); 
                    if (utmCoords) {
                        [lat, lon] = utmCoords;
                        console.log(`Fila ${index + 1}: Coords UTM (${eastingVal}, ${northingVal}) -> Decimal (placeholder) (${lat}, ${lon})`);
                    } else {
                         console.warn(`Fila ${index + 1}: La conversión UTM (placeholder) falló para (${eastingVal}, ${northingVal}).`);
                    }
                } else {
                    console.warn(`Fila ${index + 1}: Valores UTM no numéricos (${row[eastingColumn]}, ${row[northingColumn]}).`);
                }
            } else {
                 console.warn(`Fila ${index + 1}: Faltan columnas mapeadas a UTM_Easting/UTM_Northing para formato UTM.`);
            }
        }
        
        // Asignar coordenadas procesadas si son válidas
        if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
          mappedRow['Coordenada_Y'] = lat; // Latitud va en Y
          mappedRow['Coordenada_X'] = lon; // Longitud va en X
        }
        // --- Fin Procesamiento de Coordenadas ---

        // Añadir log para debuggear fila completa
        console.log(`Transformando fila ${index+1}:`, { original: row, mapped: mappedRow });
        
        // Verificar que tenga los campos requeridos (después de todo el procesamiento)
        if (!mappedRow['ID_Lector'] || !mappedRow['Nombre']) {
          console.warn(`Fila ${index+1} sin ID_Lector o Nombre, será ignorada:`, mappedRow);
          return null; // Devolver null para filtrar esta fila después
        }
        
        return mappedRow;
      }).filter(row => row !== null); // Filtrar filas nulas (las que no tenían ID/Nombre)
      
      const validData = processedData; // Ya filtrado arriba
      
      if (validData.length < jsonData.length) {
        const ignoredCount = jsonData.length - validData.length;
        console.warn(`Se ignoraron ${ignoredCount} filas por falta de ID_Lector/Nombre o errores de coordenadas.`);
        notifications.show({
          title: 'Advertencia en Procesamiento',
          message: `Se ignoraron ${ignoredCount} filas por falta de ID_Lector/Nombre o errores de coordenadas. Revisa la consola.`, 
          color: 'yellow',
        });
      }
      
      if (validData.length === 0) {
        throw new Error('No hay datos válidos para importar. Asegúrate de mapear correctamente ID_Lector y Nombre, y que las coordenadas sean válidas.');
      }
      
      console.log("Datos procesados listos para importar:", validData);
      
      // Enviar datos al servidor (ahora debería incluir Organismo_Regulador y Coordenada_X/Y si se procesaron)
      const result = await onImport(validData);
      
      // Cerrar modal y mostrar notificación de éxito
      notifications.show({
        title: 'Importación completada',
        message: result ? 
          `Se han importado ${result.imported} lectores nuevos y actualizado ${result.updated} existentes` : 
          `Se han procesado ${validData.length} lectores correctamente.`,
        color: 'green'
      });
      
      handleModalClose();
    } catch (error) {
      console.error("Error en la importación (modal):", error);
      notifications.show({
        title: 'Error en la importación',
        message: error instanceof Error ? error.message : 'Ocurrió un error durante la importación.',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reiniciar todo al cerrar el modal
  const handleModalClose = () => {
    setFile(null);
    setPreviewData([]);
    setFileColumns([]);
    setColumnMapping({});
    setCoordFormat('decimal');
    setProcessingStep('upload');
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title="Importar Lectores"
      size="xl"
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      <ProgressOverlay 
        visible={isLoading} 
        progress={isLoading ? 100 : 0} 
        label="Procesando archivo..."
      />
      
      {/* Paso 1: Subir archivo */}
      {processingStep === 'upload' && (
        <Box p="md">
          <Title order={4} mb="md">Paso 1: Seleccionar archivo</Title>
          <Text mb="md">
            Selecciona un archivo Excel (.xlsx) con los datos de los lectores a importar.
            El archivo debe contener al menos las columnas para ID Lector y Nombre.
          </Text>
          
          <FileInput
            label="Archivo Excel"
            placeholder="Seleccionar archivo"
            accept=".xlsx,.xls"
            value={file}
            onChange={handleFileUpload}
            leftSection={<IconFileSpreadsheet size={16} />}
            required
          />
          
          <Alert color="blue" title="Información" icon={<IconInfoCircle />} mt="lg">
            Asegúrate de que tu archivo Excel tenga una fila de encabezados clara. 
            En el siguiente paso podrás mapear las columnas a los campos del sistema.
          </Alert>
        </Box>
      )}
      
      {/* Paso 2: Mapeo de columnas */}
      {processingStep === 'mapping' && (
        <Box p="md">
          <Title order={4} mb="md">Paso 2: Mapear columnas</Title>
          <Text mb="md">
            Asocia las columnas de tu archivo con los campos del sistema. 
            Los campos marcados como requeridos son obligatorios.
          </Text>
          
          <Card withBorder p="md" radius="md" mb="md">
            <Title order={5} mb="sm">Formato de coordenadas</Title>
            <Radio.Group
              name="coordFormat"
              value={coordFormat}
              onChange={setCoordFormat}
              label="Selecciona el formato de las coordenadas en tu archivo:"
            >
              {COORDINATE_FORMAT_OPTIONS.map(option => (
                <Radio 
                  key={option.value} 
                  value={option.value} 
                  label={option.label} 
                  mt="xs"
                />
              ))}
            </Radio.Group>
            {coordFormat === 'utm' && (
              <Text size="xs" c="dimmed" mt="sm">
                Nota: Para UTM, mapea las columnas de Este (X) y Norte (Y) a los campos 'Coordenada UTM X' y 'Coordenada UTM Y' respectivamente.
              </Text>
            )}
          </Card>
          
          <Divider my="md" />
          
          <SimpleGrid cols={2} mb="md">
            {fileColumns.map(column => (
              <Select
                key={column}
                label={`Columna "${column}"`}
                placeholder="Seleccionar campo"
                data={AVAILABLE_FIELDS.map(field => ({
                  value: field.value,
                  label: field.label,
                  group: field.group
                }))}
                value={columnMapping[column] || null}
                onChange={(value) => {
                  if (value) {
                    setColumnMapping(prev => ({...prev, [column]: value}));
                  } else {
                    const newMapping = {...columnMapping};
                    delete newMapping[column];
                    setColumnMapping(newMapping);
                  }
                }}
                clearable
              />
            ))}
          </SimpleGrid>
          
          {previewData.length > 0 && (
            <>
              <Divider my="md" />
              <Title order={5} mb="sm">Vista previa de datos</Title>
              <Box style={{ overflowX: 'auto' }}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      {fileColumns.map(header => (
                        <Table.Th key={header}>{header}</Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {previewData.map((row, rowIndex) => (
                      <Table.Tr key={rowIndex}>
                        {fileColumns.map(header => (
                          <Table.Td key={`${rowIndex}-${header}`}>
                            {row[header] !== undefined ? String(row[header]) : ''}
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            </>
          )}
          
          <Group justify="right" mt="xl">
            <Button variant="outline" onClick={() => setProcessingStep('upload')}>
              Atrás
            </Button>
            <Button onClick={handleGeneratePreview}>
              Continuar
            </Button>
          </Group>
        </Box>
      )}
      
      {/* Paso 3: Vista previa e importación */}
      {processingStep === 'preview' && (
        <Box p="md">
          <Title order={4} mb="md">Paso 3: Confirmar importación</Title>
          <Text mb="md">
            Revisa la configuración y confirma la importación.
          </Text>
          
          <Card withBorder p="md" radius="md" mb="md">
            <Title order={5} mb="sm">Resumen de mapeo</Title>
            <SimpleGrid cols={2}>
              {Object.entries(columnMapping).map(([fileColumn, fieldName]) => (
                <Text key={fileColumn}>
                  <strong>{fileColumn}</strong> → {fieldName}
                </Text>
              ))}
            </SimpleGrid>
          </Card>
          
          <Card withBorder p="md" radius="md" mb="md">
            <Title order={5} mb="sm">Formato de coordenadas</Title>
            <Text>
              {COORDINATE_FORMAT_OPTIONS.find(option => option.value === coordFormat)?.label}
            </Text>
          </Card>
          
          <Alert color="yellow" title="Importante" icon={<IconAlertCircle />}>
            Esta acción importará los datos al sistema. Asegúrate de que el mapeo sea correcto.
            Los lectores con ID repetido actualizarán los existentes.
          </Alert>
          
          <Group justify="right" mt="xl">
            <Button variant="outline" onClick={() => setProcessingStep('mapping')}>
              Atrás
            </Button>
            <Button color="green" leftSection={<IconUpload size={16} />} onClick={handleImport}>
              Importar Lectores
            </Button>
          </Group>
        </Box>
      )}
    </Modal>
  );
};

export default ImportarLectoresModal; 