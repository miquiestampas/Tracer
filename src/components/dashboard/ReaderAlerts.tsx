import React from 'react';
import { Paper, Text, List, ThemeIcon, Badge, Group, Button } from '@mantine/core';
import { IconAlertCircle, IconChevronRight } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

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

export default ReaderAlerts; 