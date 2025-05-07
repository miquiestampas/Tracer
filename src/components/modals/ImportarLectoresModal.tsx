import React, { useState } from 'react';
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
  Alert
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconUpload, IconFileSpreadsheet, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { ProgressOverlay } from '../common/ProgressOverlay';

interface ImportarLectoresModalProps {
  opened: boolean;
  onClose: () => void;
  onImport: (lectores: any[]) => Promise<{imported: number, updated: number} | void>;
}

// Campos disponibles para mapear
const AVAILABLE_FIELDS = [
  { value: 'ID_Lector', label: 'ID Lector' },
  { value: 'Nombre', label: 'Nombre' },
  { value: 'Carretera', label: 'Carretera' },
  { value: 'Provincia', label: 'Provincia' },
  { value: 'Localidad', label: 'Localidad' },
  { value: 'Sentido', label: 'Sentido de circulación' },
  { value: 'Orientacion', label: 'Orientación' },
  { value: 'Coordenada_Y', label: 'Latitud' },
  { value: 'Coordenada_X', label: 'Longitud' },
  { value: 'Organismo_Regulador', label: 'Organismo' },
  { value: 'Notas', label: 'Notas' }
];

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
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');

  // Cargar y procesar el archivo Excel
  const handleFileUpload = async (file: File | null) => {
    if (!file) {
      setFile(null);
      setFileColumns([]);
      setPreviewData([]);
      setColumnMapping({});
      setStep('upload');
      return;
    }
    
    setFile(file);
    setIsLoading(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length > 0) {
        // Asegurarse de que los headers sean strings válidos
        const headers = (jsonData[0] as any[]).map(header => 
          String(header || '').trim()
        ).filter(header => header !== '');
        
        if (headers.length === 0) {
          throw new Error('No se encontraron encabezados válidos en el archivo.');
        }

        setFileColumns(headers);
        
        // Inicializar mapeo automático
        const initialMapping: Record<string, string> = {};
        headers.forEach((header) => {
          const normalizedHeader = header.toLowerCase();
          const matchedField = AVAILABLE_FIELDS.find(field => 
            field.value.toLowerCase() === normalizedHeader || 
            field.label.toLowerCase().includes(normalizedHeader)
          );
          
          if (matchedField) {
            initialMapping[header] = matchedField.value;
          }
        });
        
        setColumnMapping(initialMapping);
        
        // Obtener datos de muestra (máximo 5 filas)
        const sampleData = jsonData.slice(1, 6).map((row: any) => {
          const rowData: Record<string, any> = {};
          headers.forEach((header, index) => {
            rowData[header] = row[index] !== undefined ? String(row[index]) : '';
          });
          return rowData;
        });
        
        setPreviewData(sampleData);
        setStep('mapping');
      } else {
        throw new Error('El archivo está vacío.');
      }
    } catch (error) {
      console.error("Error procesando archivo Excel:", error);
      notifications.show({
        title: 'Error al procesar archivo',
        message: error instanceof Error ? error.message : 'No se pudo leer el archivo Excel. Asegúrate de que sea un formato válido.',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
      // Resetear estados en caso de error
      setFile(null);
      setFileColumns([]);
      setPreviewData([]);
      setColumnMapping({});
      setStep('upload');
    } finally {
      setIsLoading(false);
    }
  };

  // Procesar y generar vista previa
  const handleGeneratePreview = () => {
    // Verificar que al menos se haya mapeado un campo
    if (Object.keys(columnMapping).length === 0) {
      notifications.show({
        title: 'Mapeo incompleto',
        message: 'Debes mapear al menos un campo para continuar.',
        color: 'red',
        icon: <IconAlertCircle size={16} />
      });
      return;
    }
    
    setStep('preview');
  };

  // Procesar y enviar la importación
  const handleImport = async () => {
    if (!file) return;
    
    setIsLoading(true);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);
      
      const processedData = jsonData.map((row: any) => {
        const mappedRow: Record<string, any> = {};
        
        // Primero procesar las coordenadas
        const latColumn = Object.keys(columnMapping).find(col => columnMapping[col] === 'Coordenada_Y');
        const lonColumn = Object.keys(columnMapping).find(col => columnMapping[col] === 'Coordenada_X');
        
        if (latColumn && lonColumn && row[latColumn] !== undefined && row[lonColumn] !== undefined) {
          const latValue = String(row[latColumn]).replace(',', '.').trim();
          const lonValue = String(row[lonColumn]).replace(',', '.').trim();
          
          const latNum = parseFloat(latValue);
          const lonNum = parseFloat(lonValue);
          
          if (!isNaN(latNum) && !isNaN(lonNum)) {
            mappedRow['Coordenada_Y'] = latNum;
            mappedRow['Coordenada_X'] = lonNum;
          }
        }

        // Luego procesar el resto de campos
        Object.entries(columnMapping).forEach(([fileColumn, fieldName]) => {
          if (row[fileColumn] !== undefined && fieldName !== 'Coordenada_Y' && fieldName !== 'Coordenada_X') {
            mappedRow[fieldName] = String(row[fileColumn]);
          }
        });

        // Validar que el lector tenga ID
        if (!mappedRow.ID_Lector) {
          console.warn('Lector sin ID encontrado:', row);
          return null;
        }

        // Asegurar que el ID_Lector sea string
        mappedRow.ID_Lector = String(mappedRow.ID_Lector).trim();
        if (!mappedRow.ID_Lector) {
          console.warn('ID de lector vacío después de trim:', row);
          return null;
        }

        return mappedRow;
      }).filter((row): row is Record<string, any> => row !== null && Object.keys(row).length > 0);
      
      if (processedData.length === 0) {
        throw new Error('No hay datos válidos para importar.');
      }

      console.log('Datos procesados para importar:', processedData);
      
      const result = await onImport(processedData);
      
      notifications.show({
        title: 'Importación completada',
        message: result ? 
          `Se han importado ${result.imported} lectores nuevos y actualizado ${result.updated} existentes` : 
          `Se han procesado ${processedData.length} lectores correctamente.`,
        color: 'green'
      });
      
      handleModalClose();
    } catch (error) {
      console.error("Error en la importación:", error);
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
    setStep('upload');
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
      <LoadingOverlay visible={isLoading} />
      
      {step === 'upload' && (
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
      
      {step === 'mapping' && fileColumns.length > 0 && (
        <Box p="md">
          <Title order={4} mb="md">Paso 2: Mapear columnas</Title>
          <Text mb="md">
            Asigna cada columna del archivo a su correspondiente campo en el sistema.
            Los campos marcados como "requerido" deben ser mapeados obligatoriamente.
          </Text>
          
          <SimpleGrid cols={2} mb="md">
            {fileColumns.map(column => (
              <Select
                key={column}
                label={`Columna "${column}"`}
                placeholder="Seleccionar campo"
                data={[
                  { value: '', label: 'Seleccionar campo', disabled: true },
                  ...AVAILABLE_FIELDS
                ]}
                value={columnMapping[column] || ''}
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
                searchable
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
            <Button variant="outline" onClick={() => setStep('upload')}>
              Atrás
            </Button>
            <Button onClick={handleGeneratePreview}>
              Continuar
            </Button>
          </Group>
        </Box>
      )}
      
      {step === 'preview' && (
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
          
          <Alert color="yellow" title="Importante" icon={<IconAlertCircle />}>
            Esta acción importará los datos al sistema. Asegúrate de que el mapeo sea correcto.
            Los lectores con ID repetido actualizarán los existentes.
          </Alert>
          
          <Group justify="right" mt="xl">
            <Button variant="outline" onClick={() => setStep('mapping')}>
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