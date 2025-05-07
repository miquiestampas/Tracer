import React from 'react';
import { Paper, Text, Timeline, Group, Badge } from '@mantine/core';
import { IconFileImport, IconCheck } from '@tabler/icons-react';

interface ImportEvent {
  id: number;
  fileName: string;
  timestamp: string;
  status: 'success' | 'error';
  recordsCount?: number;
}

interface ImportTimelineProps {
  events: ImportEvent[];
}

export function ImportTimeline({ events }: ImportTimelineProps) {
  return (
    <Paper shadow="sm" p="md" withBorder>
      <Text size="lg" fw={500} mb="md">Últimas Importaciones</Text>
      
      <Timeline active={events.length - 1} bulletSize={24} lineWidth={2}>
        {events.map((event) => (
          <Timeline.Item
            key={event.id}
            bullet={<IconFileImport size={12} />}
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
                      {event.recordsCount} registros
                    </Group>
                  ) : (
                    'Error'
                  )}
                </Badge>
              </Group>
            }
          >
            <Text size="xs" c="dimmed" mt={4}>
              {event.timestamp}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Paper>
  );
}

export default ImportTimeline; 