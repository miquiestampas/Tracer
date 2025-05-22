import React, { useState, useEffect } from 'react';
import { Box, Text, Select, Button, Alert, Table, LoadingOverlay, Group, Stack, MultiSelect, Paper, SimpleGrid, Badge, Divider, ActionIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconSearch, IconFileExcel, IconFileWord } from '@tabler/icons-react';
import apiClient from '../../services/api';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface Caso {
  ID_Caso: number;
  Nombre_del_Caso: string;
  Año: number;
}

interface Lectura {
  ID_Lectura: number;
  Matricula: string;
  Fecha_y_Hora: string;
  ID_Caso: number;
  Nombre_del_Caso: string;
  ID_Lector: string;
  Coordenada_X?: string;
  Coordenada_Y?: string;
}

interface VehiculoCoincidente {
  matricula: string;
  casos: {
    id: number;
    nombre: string;
    lecturas: Lectura[];
  }[];
}

function BusquedaMulticasoPanel() {
  const [casos, setCasos] = useState<Caso[]>([]);
  const [selectedCasos, setSelectedCasos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [coincidencias, setCoincidencias] = useState<VehiculoCoincidente[]>([]);
  const [loadingCasos, setLoadingCasos] = useState(true);

  // Cargar lista de casos
  useEffect(() => {
    const fetchCasos = async () => {
      try {
        const response = await apiClient.get<Caso[]>('/casos');
        setCasos(response.data);
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'No se pudieron cargar los casos',
          color: 'red',
        });
      } finally {
        setLoadingCasos(false);
      }
    };

    fetchCasos();
  }, []);

  const handleBuscar = async () => {
    setLoading(true);
    try {
      // Si no hay casos seleccionados, buscar en todos los casos
      const casosABuscar = selectedCasos.length > 0 ? selectedCasos.map(Number) : casos.map(c => c.ID_Caso);
      
      const response = await apiClient.post<VehiculoCoincidente[]>('/busqueda/multicaso', {
        casos: casosABuscar,
      });
      setCoincidencias(response.data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'No se pudo realizar la búsqueda',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  // --- Exportar a Excel ---
  const exportarMatriculaExcel = (vehiculo: VehiculoCoincidente) => {
    // Unir todas las lecturas de todos los casos
    const lecturas = vehiculo.casos.flatMap(caso =>
      caso.lecturas.map(lectura => ({
        Matrícula: lectura.Matricula,
        Caso: caso.nombre,
        Fecha_y_Hora: dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
        ID_Lector: lectura.ID_Lector,
        Coordenada_X: lectura.Coordenada_X ?? '',
        Coordenada_Y: lectura.Coordenada_Y ?? '',
      }))
    );
    if (lecturas.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(lecturas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lecturas');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const data = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(data, `lecturas_${vehiculo.matricula}.xlsx`);
  };

  // --- Exportar a Word (Arial 12) ---
  const exportarMatriculaWord = (vehiculo: VehiculoCoincidente) => {
    const lecturas = vehiculo.casos.flatMap(caso =>
      caso.lecturas.map(lectura => ({
        Matrícula: lectura.Matricula,
        Caso: caso.nombre,
        Fecha_y_Hora: dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss'),
        ID_Lector: lectura.ID_Lector,
        Coordenada_X: lectura.Coordenada_X ?? '',
        Coordenada_Y: lectura.Coordenada_Y ?? '',
      }))
    );
    if (lecturas.length === 0) return;
    // Crear tabla HTML
    let table = `<table style='border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12pt;'>`;
    table += `<thead><tr><th style='border:1px solid black;padding:8px;'>Matrícula</th><th style='border:1px solid black;padding:8px;'>Caso</th><th style='border:1px solid black;padding:8px;'>Fecha y Hora</th><th style='border:1px solid black;padding:8px;'>ID Lector</th><th style='border:1px solid black;padding:8px;'>Coordenada X</th><th style='border:1px solid black;padding:8px;'>Coordenada Y</th></tr></thead><tbody>`;
    lecturas.forEach(l => {
      table += `<tr>`;
      table += `<td style='border:1px solid black;padding:8px;'>${l.Matrícula}</td>`;
      table += `<td style='border:1px solid black;padding:8px;'>${l.Caso}</td>`;
      table += `<td style='border:1px solid black;padding:8px;'>${l.Fecha_y_Hora}</td>`;
      table += `<td style='border:1px solid black;padding:8px;'>${l.ID_Lector}</td>`;
      table += `<td style='border:1px solid black;padding:8px;'>${l.Coordenada_X}</td>`;
      table += `<td style='border:1px solid black;padding:8px;'>${l.Coordenada_Y}</td>`;
      table += `</tr>`;
    });
    table += `</tbody></table>`;
    const html = `
      <html>
        <head>
          <meta charset='UTF-8'>
          <style>
            table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12pt; }
            th, td { border: 1px solid black; padding: 8px; font-family: Arial, sans-serif; font-size: 12pt; }
          </style>
        </head>
        <body>${table}</body>
      </html>
    `;
    const blob = new Blob([html], { type: 'application/msword' });
    saveAs(blob, `lecturas_${vehiculo.matricula}.doc`);
  };

  return (
    <Box>
      <Stack gap="md">
        <Group>
          <MultiSelect
            label="Seleccionar Casos (opcional)"
            placeholder="Elige los casos a comparar"
            data={casos.map(caso => ({
              value: caso.ID_Caso.toString(),
              label: `${caso.Nombre_del_Caso} (${caso.Año})`
            }))}
            value={selectedCasos}
            onChange={setSelectedCasos}
            searchable
            clearable
            style={{ flex: 1 }}
            disabled={loadingCasos}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={handleBuscar}
            loading={loading}
            style={{ marginTop: 24 }}
          >
            Buscar Coincidencias
          </Button>
        </Group>

        {coincidencias.length > 0 && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Vehículos encontrados en múltiples casos"
            color="blue"
          >
            Se encontraron {coincidencias.length} vehículos que aparecen en más de un caso.
          </Alert>
        )}

        {coincidencias.length > 0 && (
          <SimpleGrid cols={3} spacing="lg">
            {coincidencias.map((vehiculo) => (
              <Paper key={vehiculo.matricula} shadow="md" p="md" radius="md" withBorder style={{ minWidth: 320, maxWidth: 420, width: '100%' }}>
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Text size="lg" fw={700} color="blue.8">{vehiculo.matricula}</Text>
                  <Group gap={4}>
                    <Badge color="blue" variant="light">{vehiculo.casos.length} caso{vehiculo.casos.length > 1 ? 's' : ''}</Badge>
                    <ActionIcon
                      variant="light"
                      color="green"
                      onClick={() => exportarMatriculaExcel(vehiculo)}
                      title="Exportar a Excel"
                    >
                      <IconFileExcel size={20} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => exportarMatriculaWord(vehiculo)}
                      title="Exportar a Word (Arial 12)"
                    >
                      <IconFileWord size={20} />
                    </ActionIcon>
                  </Group>
                </Group>
                <Divider my={6} />
                <Stack gap={4}>
                  {vehiculo.casos.map((caso) => (
                    <Box key={caso.id}>
                      <Group justify="space-between" align="center">
                        <Text fw={600} size="sm">{caso.nombre}</Text>
                        <Badge color="gray" variant="light" size="sm">{caso.lecturas.length} lecturas</Badge>
                      </Group>
                      {caso.lecturas && caso.lecturas.length > 0 && (
                        <Group gap={6} mt={2}>
                          {caso.lecturas.slice(0, 3).map(lectura => (
                            <Badge key={lectura.ID_Lectura} color="teal" variant="outline" size="xs">
                              {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm')}
                            </Badge>
                          ))}
                          {caso.lecturas.length > 3 && (
                            <Text size="xs" c="dimmed">+{caso.lecturas.length - 3} más</Text>
                          )}
                        </Group>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Box>
  );
}

export default BusquedaMulticasoPanel; 