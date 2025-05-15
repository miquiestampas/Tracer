import React, { useEffect, useState } from 'react';
import { Card, Text, Badge, Button, Group, Box, Title, Avatar, Loader, Alert } from '@mantine/core';
import { IconAlertTriangle, IconCar } from '@tabler/icons-react';
import { getCasos, getVehiculosPorCaso } from '../../services/casosApi';
import type { Vehiculo, Caso } from '../../types/data';
import { VehicleDetailModal } from '../common/VehicleDetailModal';

interface SuspectVehicleCard {
  vehiculo: Vehiculo;
  caso: Caso;
}

export function RecentSuspectVehicles() {
  const [cards, setCards] = useState<SuspectVehicleCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehiculo | null>(null);
  const [modalOpened, setModalOpened] = useState(false);

  useEffect(() => {
    const fetchSuspects = async () => {
      setLoading(true);
      setError(null);
      try {
        const casos: Caso[] = await getCasos();
        let allSuspects: SuspectVehicleCard[] = [];
        for (const caso of casos) {
          const vehiculos: Vehiculo[] = await getVehiculosPorCaso(caso.ID_Caso);
          const sospechosos = vehiculos.filter(v => v.Sospechoso);
          sospechosos.forEach(v => {
            allSuspects.push({ vehiculo: v, caso });
          });
        }
        // Ordenar por cantidad de lecturas (si existe), si no por matrícula
        allSuspects.sort((a, b) => {
          const aLect = a.vehiculo.total_lecturas_lpr_caso || 0;
          const bLect = b.vehiculo.total_lecturas_lpr_caso || 0;
          if (bLect !== aLect) return bLect - aLect;
          return a.vehiculo.Matricula.localeCompare(b.vehiculo.Matricula);
        });
        setCards(allSuspects.slice(0, 4));
      } catch (err: any) {
        setError('No se pudieron cargar los vehículos sospechosos.');
      } finally {
        setLoading(false);
      }
    };
    fetchSuspects();
  }, []);

  const handleCardClick = (vehicle: Vehiculo) => {
    setSelectedVehicle(vehicle);
    setModalOpened(true);
  };

  return (
    <Box mt="xl">
      <Title order={3} mb="sm">Vehículos Sospechosos Recientes</Title>
      {loading ? (
        <Group justify="center" p="md"><Loader /></Group>
      ) : error ? (
        <Alert color="red">{error}</Alert>
      ) : cards.length === 0 ? (
        <Text c="dimmed">No hay vehículos sospechosos recientes.</Text>
      ) : (
        <Group gap="md" wrap="nowrap">
          {cards.map(({ vehiculo, caso }) => (
            <Card key={vehiculo.ID_Vehiculo + '-' + caso.ID_Caso} shadow="sm" padding="lg" radius="md" withBorder style={{ width: 320, minWidth: 260 }}>
              <Card.Section>
                <Box p="md" style={{ backgroundColor: '#f8f9fa' }}>
                  <Group>
                    <Avatar color="red" radius="xl">
                      <IconAlertTriangle size={24} />
                    </Avatar>
                    <div style={{ flex: 1 }}>
                      <Text fw={500} size="lg" truncate>{vehiculo.Matricula}</Text>
                      <Text size="sm" c="dimmed">{vehiculo.Marca || 'Sin marca'}{vehiculo.Modelo ? `, ${vehiculo.Modelo}` : ''}</Text>
                      <Text size="sm" c="dimmed">Color: {vehiculo.Color || 'N/D'}</Text>
                      <Text size="sm" c="dimmed">Caso: {caso.Nombre_del_Caso}</Text>
                    </div>
                    <Badge color="red">Sospechoso</Badge>
                  </Group>
                </Box>
              </Card.Section>
              <Box mt="md">
                {vehiculo.Observaciones && <Text size="sm" c="dimmed" lineClamp={2}>{vehiculo.Observaciones}</Text>}
                <Button
                  color="red"
                  fullWidth
                  mt="md"
                  radius="xs"
                  onClick={() => handleCardClick(vehiculo)}
                  leftSection={<IconCar size={16} />}
                >
                  Ver detalle
                </Button>
              </Box>
            </Card>
          ))}
        </Group>
      )}

      <VehicleDetailModal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        vehiculo={selectedVehicle}
      />
    </Box>
  );
}

export default RecentSuspectVehicles; 