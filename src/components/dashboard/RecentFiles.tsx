import React from 'react';
import { Paper, Text, SimpleGrid, Group, Badge, ThemeIcon } from '@mantine/core';
import { IconFile, IconFileText, IconFileSpreadsheet } from '@tabler/icons-react';

interface RecentFile {
  id: number;
  name: string;
  type: 'excel' | 'pdf' | 'other';
  size: string;
  lastModified: string;
  caseName?: string;
}

interface RecentFilesProps {
  files: RecentFile[];
}

export function RecentFiles({ files }: RecentFilesProps) {
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'excel':
        return <IconFileSpreadsheet size={24} />;
      case 'pdf':
        return <IconFileText size={24} />;
      default:
        return <IconFile size={24} />;
    }
  };

  return (
    <Paper shadow="sm" p="md" withBorder>
      <Text size="lg" fw={500} mb="md">Archivos Recientes</Text>
      
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {files.map((file) => (
          <Paper key={file.id} p="sm" withBorder>
            <Group>
              <ThemeIcon size="lg" variant="light">
                {getFileIcon(file.type)}
              </ThemeIcon>
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={500} lineClamp={1}>
                  {file.name}
                </Text>
                <Group gap="xs">
                  <Badge size="xs" variant="light">
                    {file.size}
                  </Badge>
                  {file.caseName && (
                    <Text size="xs" c="dimmed">
                      {file.caseName}
                    </Text>
                  )}
                </Group>
                <Text size="xs" c="dimmed" mt={4}>
                  {file.lastModified}
                </Text>
              </div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </Paper>
  );
}

export default RecentFiles; 