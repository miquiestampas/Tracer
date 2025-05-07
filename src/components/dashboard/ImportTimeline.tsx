import React from 'react';
import { Paper, Text, Timeline, Group, Badge, Box } from '@mantine/core';
import { IconFileImport, IconCheck, IconX, IconFolder } from '@tabler/icons-react';

interface ImportEvent {
  id: number;
  fileName: string;
  timestamp: string;
  status: 'success' | 'error';
  recordsCount?: number;
  caseName?: string;
}

interface ImportTimelineProps {
  events: ImportEvent[];
}

function formatFecha(fecha: string) {
  // Si viene solo YYYY-MM-DD, formatear a DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split('-');
    return `${d}/${m}/${y}`;
  }
  // Si viene string ISO, usar toLocaleString
  const dateObj = new Date(fecha);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }
  return fecha;
}

export function ImportTimeline({ events }: ImportTimelineProps) {
  // Ordenar de más reciente a más antiguo
  const sortedEvents = [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <Paper shadow="sm" p="md" withBorder>
      <Text size="lg" fw={500} mb="md">Últimas Importaciones</Text>
      <Timeline active={sortedEvents.length - 1} bulletSize={24} lineWidth={2}>
        {sortedEvents.map((event) => (
          <Timeline.Item
            key={event.id}
            bullet={event.status === 'success' ? <IconFileImport size={16} color="#2ecc40" /> : <IconX size={16} color="#e03131" />}
            title={
              <Group>
                <Text size="sm" fw={500}>{event.fileName}</Text>
                <Badge
                  color={event.status === 'success' ? 'green' : 'red'}
                  variant="light"
                  size="sm"
                >
                  {event.status === 'success' ? (
                    <Group gap={4}>
                      <IconCheck size={12} />
                      {typeof event.recordsCount === 'number' ? `${event.recordsCount} registros` : '0 registros'}
                    </Group>
                  ) : (
                    <Group gap={4}>
                      <IconX size={12} /> Error
                    </Group>
                  )}
                </Badge>
              </Group>
            }
          >
            <Box>
              <Text size="xs" c="dimmed" mt={4}>
                {formatFecha(event.timestamp)}
              </Text>
              {event.caseName && (
                <Group gap={4} mt={4}>
                  <IconFolder size={12} color="#234be7" />
                  <Text size="xs" c="blue.7">{event.caseName}</Text>
                </Group>
              )}
            </Box>
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  );
}

export default ImportTimeline; 