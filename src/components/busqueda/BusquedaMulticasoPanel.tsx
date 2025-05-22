import React, { useState, useEffect } from 'react';
import { Box, Text, Select, Button, Alert, Table, LoadingOverlay, Group, Stack, MultiSelect } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconSearch } from '@tabler/icons-react';
import apiClient from '../../services/api';
import dayjs from 'dayjs';

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

        <Box pos="relative">
          <LoadingOverlay visible={loading} />
          <Table striped highlightOnHover>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Matrícula</th>
                <th style={{ textAlign: 'center' }}>Casos</th>
                <th style={{ textAlign: 'center' }}>Lecturas</th>
              </tr>
            </thead>
            <tbody>
              {coincidencias.map((vehiculo, idx) => (
                <tr
                  key={vehiculo.matricula}
                  style={{ backgroundColor: idx % 2 === 0 ? '#e8f4fd' : '#fffbe6' }}
                >
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{vehiculo.matricula}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Stack gap="xs" align="center">
                      {vehiculo.casos.map(caso => (
                        <Text key={caso.id} size="sm">
                          {caso.nombre}
                        </Text>
                      ))}
                    </Stack>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <Stack gap="xs" align="center">
                      {vehiculo.casos.map(caso => (
                        <Box key={`${caso.id}-${caso.nombre}`}>
                          {caso.lecturas && caso.lecturas.length > 0 ? (
                            <>
                              {caso.lecturas.slice(0, 5).map(lectura => (
                                <Text key={`${lectura.ID_Lectura}-${lectura.Fecha_y_Hora}`} size="sm">
                                  {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}
                                </Text>
                              ))}
                              {caso.lecturas.length > 5 && (
                                <Text size="xs" c="dimmed">...y {caso.lecturas.length - 5} más</Text>
                              )}
                            </>
                          ) : (
                            <Text size="sm" c="dimmed">Sin lecturas</Text>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
      </Stack>
    </Box>
  );
}

export default BusquedaMulticasoPanel; 