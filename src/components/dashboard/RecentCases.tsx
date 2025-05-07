import React from 'react';
import { Card, Text, Badge, Button, Group, Box, Title } from '@mantine/core';
import { IconFolder } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { Caso } from '../../types/data';

interface RecentCasesProps {
  cases: Caso[];
}

// Asignar color según estado
const estadoColor: Record<string, string> = {
  'Nuevo': 'green',
  'Esperando Archivos': 'blue',
  'En Análisis': 'orange',
  'Pendiente Informe': 'red',
  'Cerrado': 'gray',
};

const estadoPrioridad: Record<string, number> = {
  'Nuevo': 1,
  'Pendiente Informe': 2,
  'En Análisis': 3,
  'Esperando Archivos': 4,
  'Cerrado': 99,
};

export function RecentCases({ cases }: RecentCasesProps) {
  // Filtrar y ordenar por prioridad y fecha
  const filtered = cases.filter(c => c.Estado !== 'Cerrado');
  const sorted = [...filtered]
    .sort((a, b) => {
      const pa = estadoPrioridad[a.Estado] || 99;
      const pb = estadoPrioridad[b.Estado] || 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.Fecha_de_Creacion).getTime() - new Date(a.Fecha_de_Creacion).getTime();
    })
    .slice(0, 4);

  return (
    <>
      <Title order={3} mb="sm">Casos Recientes</Title>
      <Group gap="md" wrap="nowrap">
        {sorted.map((caso) => (
          <Card key={caso.ID_Caso} shadow="sm" padding="lg" radius="sm" withBorder style={{ width: 320, minWidth: 260 }}>
            <Card.Section h={60} style={{ background: `var(--mantine-color-${estadoColor[caso.Estado] || 'gray'}-6)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IconFolder size={32} color="#fff" />
            </Card.Section>
            <Group justify="space-between" mt="md" mb="xs">
              <Text fw={500} truncate>{caso.Nombre_del_Caso}</Text>
              <Badge color={estadoColor[caso.Estado] || 'gray'}>{caso.Estado}</Badge>
            </Group>
            <Text size="xs" c="dimmed" mb={4}>Año: {caso.Año}</Text>
            {caso.Descripcion && <Text size="sm" c="dimmed" lineClamp={2}>{caso.Descripcion}</Text>}
            <Button
              color={estadoColor[caso.Estado] || 'blue'}
              fullWidth
              mt="md"
              radius="sm"
              component={Link}
              to={`/casos/detalle/${caso.ID_Caso}`}
            >
              Ver caso
            </Button>
          </Card>
        ))}
      </Group>
    </>
  );
}

export default RecentCases; 