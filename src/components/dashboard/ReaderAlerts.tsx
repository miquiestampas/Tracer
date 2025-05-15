import React, { useEffect, useState } from 'react';
import { Paper, Text, List, ThemeIcon, Badge, Group, Button, Loader, Alert } from '@mantine/core';
import { IconAlertCircle, IconChevronRight, IconMapPin } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { getLectoresSinCoordenadas, getLectores } from '../../services/lectoresApi';
import type { Lector } from '../../types/data';

interface ReaderAlert {
  id: number;
  name: string;
  issues: string[];
}

interface ReaderAlertsProps {
  alerts: ReaderAlert[];
}

export function ReaderAlerts({ alerts }: ReaderAlertsProps) {
  return (
    <Paper shadow="sm" p="md" withBorder>
      <Group justify="space-between" mb="md">
        <Text size="lg" fw={500}>Alertas de Lectores</Text>
        <Badge color="red" variant="light">{alerts.length}</Badge>
      </Group>
      
      <List
        spacing="xs"
        size="sm"
        center
        icon={
          <ThemeIcon color="red" size={24} radius="xl">
            <IconAlertCircle size="1rem" />
          </ThemeIcon>
        }
      >
        {alerts.map((alert) => (
          <List.Item key={alert.id}>
            <Group justify="space-between">
              <div>
                <Text fw={500}>{alert.name}</Text>
                <Text size="xs" c="dimmed">
                  {alert.issues.join(', ')}
                </Text>
              </div>
              <Button
                component={Link}
                to={`/lectores/${alert.id}`}
                variant="subtle"
                size="xs"
                rightSection={<IconChevronRight size={14} />}
              >
                Ver
              </Button>
            </Group>
          </List.Item>
        ))}
      </List>
    </Paper>
  );
}

export function ReaderGeoAlerts() {
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLectores = async () => {
      setLoading(true);
      setError(null);
      try {
        const { total_count } = await getLectores();
        setTotal(total_count);
      } catch (err) {
        setError('No se pudo obtener la información de los lectores.');
      } finally {
        setLoading(false);
      }
    };
    fetchLectores();
  }, []);

  if (loading) {
    return <Paper shadow="sm" p="md" withBorder mb="md" mt="md"><Loader size="sm" /></Paper>;
  }

  if (error) {
    return <Paper shadow="sm" p="md" withBorder mb="md" mt="md"><Alert color="red">{error}</Alert></Paper>;
  }

  return (
    <Paper shadow="sm" p="md" withBorder mb="md" mt="md">
      <Group justify="space-between" mb="xs">
        <Group>
          <IconAlertCircle color="#2ecc40" size={20} />
          <Text fw={500} size="sm">Total de lectores en el sistema</Text>
        </Group>
        <Badge color="green" variant="light">{total}</Badge>
      </Group>
      <Text size="xs">
        Este es el número total de lectores actualmente registrados en el sistema.
      </Text>
    </Paper>
  );
}

export default ReaderAlerts; 