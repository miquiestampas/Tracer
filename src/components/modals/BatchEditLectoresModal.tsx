import React, { useState } from 'react';
import { Modal, TextInput, Select, Button, Group, Text, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { updateLector } from '../../services/lectoresApi';
import type { LectorUpdateData } from '../../types/data';

interface BatchEditLectoresModalProps {
  opened: boolean;
  onClose: () => void;
  selectedLectorIds: string[];
  onSave: () => void;
  provincias: string[];
  localidades: string[];
  carreteras: string[];
  organismos: string[];
  sentidos?: string[];
}

function BatchEditLectoresModal({ opened, onClose, selectedLectorIds, onSave, provincias, localidades, carreteras, organismos, sentidos = ['Creciente', 'Decreciente'] }: BatchEditLectoresModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<LectorUpdateData>>({
    Provincia: undefined,
    Carretera: undefined,
    Organismo_Regulador: undefined,
    Sentido: undefined,
    Localidad: undefined,
  });

  const handleSave = async () => {
    if (selectedLectorIds.length === 0) return;

    setLoading(true);
    try {
      const updatePromises = selectedLectorIds.map(id => 
        updateLector(id, formData as LectorUpdateData)
      );

      await Promise.all(updatePromises);

      notifications.show({
        title: 'Actualización Completada',
        message: `Se han actualizado ${selectedLectorIds.length} lectores correctamente.`,
        color: 'green'
      });

      onSave();
      onClose();
    } catch (error) {
      console.error('Error al actualizar lectores:', error);
      notifications.show({
        title: 'Error en la Actualización',
        message: 'Hubo un error al actualizar los lectores. Por favor, inténtalo de nuevo.',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      opened={opened} 
      onClose={onClose}
      title={`Editar ${selectedLectorIds.length} lectores`}
      size="md"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Los campos que dejes vacíos no se modificarán en los lectores seleccionados.
        </Text>

        <Select
          label="Localidad"
          placeholder="Dejar vacío para no modificar"
          data={localidades}
          value={formData.Localidad || ''}
          onChange={(value) => setFormData(prev => ({ ...prev, Localidad: value || undefined }))}
          searchable
          clearable
        />

        <Select
          label="Provincia"
          placeholder="Dejar vacío para no modificar"
          data={provincias}
          value={formData.Provincia || ''}
          onChange={(value) => setFormData(prev => ({ ...prev, Provincia: value || undefined }))}
          searchable
          clearable
        />

        <Select
          label="Carretera"
          placeholder="Dejar vacío para no modificar"
          data={carreteras}
          value={formData.Carretera || ''}
          onChange={(value) => setFormData(prev => ({ ...prev, Carretera: value || undefined }))}
          searchable
          clearable
        />

        <Select
          label="Organismo Regulador"
          placeholder="Dejar vacío para no modificar"
          data={organismos}
          value={formData.Organismo_Regulador || ''}
          onChange={(value) => setFormData(prev => ({ ...prev, Organismo_Regulador: value || undefined }))}
          searchable
          clearable
        />

        <Select
          label="Sentido"
          placeholder="Dejar vacío para no modificar"
          data={sentidos}
          value={formData.Sentido || ''}
          onChange={(value) => setFormData(prev => ({ ...prev, Sentido: value || undefined }))}
          clearable
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            loading={loading}
            disabled={selectedLectorIds.length === 0}
          >
            Guardar Cambios
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default BatchEditLectoresModal; 