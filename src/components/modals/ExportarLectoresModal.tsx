import React, { useState } from 'react';
import { Modal, Button, Group, MultiSelect, TextInput, Stack, Text, LoadingOverlay } from '@mantine/core';
import * as XLSX from 'xlsx';
import { notifications } from '@mantine/notifications';
import { IconFileExport } from '@tabler/icons-react';

interface ExportarLectoresModalProps {
  opened: boolean;
  onClose: () => void;
  onExport: (filtros: any) => Promise<void>;
  sugerencias: {
    provincias: string[];
    carreteras: string[];
    organismos: string[];
    localidades: string[];
  };
}

export default function ExportarLectoresModal({ opened, onClose, onExport, sugerencias }: ExportarLectoresModalProps) {
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState({
    nombre: '',
    provincia: [] as string[],
    carretera: [] as string[],
    organismo: [] as string[],
    localidad: [] as string[],
  });

  const handleExport = async () => {
    setLoading(true);
    try {
      await onExport(filtros);
      notifications.show({
        title: 'Exportación Completada',
        message: 'Los lectores se han exportado correctamente',
        color: 'green',
      });
      onClose();
    } catch (error) {
      console.error('Error al exportar:', error);
      notifications.show({
        title: 'Error en la Exportación',
        message: error instanceof Error ? error.message : 'Error desconocido al exportar',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Exportar Lectores"
      size="lg"
    >
      <LoadingOverlay visible={loading} />
      <Stack>
        <Text size="sm" c="dimmed">
          Selecciona los filtros para exportar los lectores. Deja los campos vacíos para exportar todos los lectores.
        </Text>

        <TextInput
          label="Buscar por nombre"
          placeholder="Escribe para buscar..."
          value={filtros.nombre}
          onChange={(e) => setFiltros(prev => ({ ...prev, nombre: e.target.value }))}
        />

        <MultiSelect
          label="Filtrar por provincia"
          placeholder="Selecciona provincias"
          data={sugerencias.provincias}
          value={filtros.provincia}
          onChange={(value) => setFiltros(prev => ({ ...prev, provincia: value }))}
          searchable
          clearable
        />

        <MultiSelect
          label="Filtrar por carretera"
          placeholder="Selecciona carreteras"
          data={sugerencias.carreteras}
          value={filtros.carretera}
          onChange={(value) => setFiltros(prev => ({ ...prev, carretera: value }))}
          searchable
          clearable
        />

        <MultiSelect
          label="Filtrar por organismo"
          placeholder="Selecciona organismos"
          data={sugerencias.organismos}
          value={filtros.organismo}
          onChange={(value) => setFiltros(prev => ({ ...prev, organismo: value }))}
          searchable
          clearable
        />

        <MultiSelect
          label="Filtrar por localidad"
          placeholder="Selecciona localidades"
          data={sugerencias.localidades}
          value={filtros.localidad}
          onChange={(value) => setFiltros(prev => ({ ...prev, localidad: value }))}
          searchable
          clearable
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            leftSection={<IconFileExport size={18} />}
            onClick={handleExport}
            loading={loading}
          >
            Exportar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
} 