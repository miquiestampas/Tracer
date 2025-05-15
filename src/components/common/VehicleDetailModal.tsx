import React, { useEffect, useState } from 'react';
import { Modal, Stack, Group, Avatar, Text, Divider, SimpleGrid, Box, Badge } from '@mantine/core';
import { IconCar, IconClock, IconMapPin } from '@tabler/icons-react';
import type { Vehiculo, Lectura } from '../../types/data';
import apiClient from '../../services/api';

interface VehicleDetailModalProps {
  opened: boolean;
  onClose: () => void;
  vehiculo: Vehiculo | null;
}

export function VehicleDetailModal({ opened, onClose, vehiculo }: VehicleDetailModalProps) {
  const [lecturas, setLecturas] = useState<Lectura[]>([]);

  useEffect(() => {
    if (opened && vehiculo) {
      const fetchLecturas = async () => {
        try {
          const response = await apiClient.get<Lectura[]>(`/vehiculos/${vehiculo.ID_Vehiculo}/lecturas`);
          setLecturas(response.data || []);
        } catch (err) {
          console.error('Error fetching lecturas:', err);
        }
      };
      fetchLecturas();
    }
  }, [opened, vehiculo]);

  if (!vehiculo) return null;

  const lecturasLPR = lecturas.filter(l => l.Tipo_Fuente === 'LPR');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Detalles del Vehículo ${vehiculo.Matricula}`}
      size="xl"
    >
      <Stack>
        <Group>
          <Avatar size="xl" color="blue" radius="xl">
            <IconCar size={32} />
          </Avatar>
          <div>
            <Text size="xl" fw={700}>{vehiculo.Matricula}</Text>
            <Text size="lg">{vehiculo.Marca} {vehiculo.Modelo}</Text>
            <Text size="sm" c="dimmed">{vehiculo.Propiedad || 'Propiedad no especificada'}</Text>
          </div>
        </Group>

        <Divider />

        <SimpleGrid cols={2}>
          <Box>
            <Text fw={500} mb="xs">Información del Vehículo</Text>
            <Stack gap="xs">
              <Group>
                <Text size="sm" fw={500}>Color:</Text>
                <Text size="sm">{vehiculo.Color || 'No especificado'}</Text>
              </Group>
              <Group>
                <Text size="sm" fw={500}>Alquiler:</Text>
                <Text size="sm">{vehiculo.Alquiler ? 'Sí' : 'No'}</Text>
              </Group>
              <Group>
                <Text size="sm" fw={500}>Estado:</Text>
                <Group gap="xs">
                  {vehiculo.Comprobado && (
                    <Badge color="green">Comprobado</Badge>
                  )}
                  {vehiculo.Sospechoso && (
                    <Badge color="red">Sospechoso</Badge>
                  )}
                </Group>
              </Group>
            </Stack>
          </Box>

          <Box>
            <Text fw={500} mb="xs">Observaciones</Text>
            <Text size="sm">{vehiculo.Observaciones || 'Sin observaciones'}</Text>
          </Box>
        </SimpleGrid>

        <Divider />

        <Box>
          <Text fw={500} mb="xs">Lecturas LPR ({lecturasLPR.length})</Text>
          {lecturasLPR.length > 0 ? (
            <Stack gap="xs">
              {lecturasLPR.map((lectura, index) => (
                <Group key={index} gap="xs">
                  <IconClock size={16} style={{ color: '#228be6' }} />
                  <Text size="sm">{new Date(lectura.Fecha_y_Hora).toLocaleString()}</Text>
                  <IconMapPin size={16} style={{ color: '#228be6' }} />
                  <Text size="sm">{lectura.lector?.Nombre || 'Lector desconocido'}</Text>
                </Group>
              ))}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">No hay lecturas LPR registradas</Text>
          )}
        </Box>
      </Stack>
    </Modal>
  );
} 