import React, { useState, useEffect } from 'react';
import { Modal, Textarea, Button, Group, LoadingOverlay } from '@mantine/core';
import type { LecturaRelevante } from '../../types/data';

interface EditNotaModalProps {
  opened: boolean;
  onClose: () => void;
  lecturaRelevante: LecturaRelevante | null;
  onSave: (idRelevante: number, nuevaNota: string | null) => Promise<void>; // Función para guardar
}

const EditNotaModal: React.FC<EditNotaModalProps> = ({ 
  opened, 
  onClose, 
  lecturaRelevante, 
  onSave 
}) => {
  const [nota, setNota] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Actualizar el estado local de la nota cuando cambia la lectura relevante seleccionada
  useEffect(() => {
    if (lecturaRelevante) {
      setNota(lecturaRelevante.Nota || '');
    } else {
      setNota(''); // Resetear si no hay lectura seleccionada
    }
  }, [lecturaRelevante]);

  const handleGuardarClick = async () => {
    if (!lecturaRelevante) return; // No debería pasar si el modal está abierto

    setIsSaving(true);
    try {
      // Llamar a la función onSave pasada desde el padre
      await onSave(lecturaRelevante.ID_Relevante, nota.trim() || null); // Enviar null si la nota está vacía
      // onClose() se llamará desde el padre si onSave tiene éxito (en handleUpdateNota)
    } catch (error) {
      // El manejo de errores (notificación) se hace en el padre (handleUpdateNota)
      console.error("Error guardando nota desde modal:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Asegurarse de que al cerrar se resetee el estado de guardado
  const handleModalClose = () => {
    setIsSaving(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title={lecturaRelevante ? `Editar Nota - Lectura ID: ${lecturaRelevante.ID_Lectura}` : 'Editar Nota'}
      overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
      }}
    >
      <LoadingOverlay visible={isSaving} overlayProps={{ blur: 2 }} />
      <Textarea
        label="Nota de Relevancia"
        placeholder="Añade o edita tu nota aquí..."
        value={nota}
        onChange={(event) => setNota(event.currentTarget.value)}
        minRows={3}
        autosize
        disabled={isSaving}
      />
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={handleModalClose} disabled={isSaving}>
          Cancelar
        </Button>
        <Button onClick={handleGuardarClick} loading={isSaving}>
          Guardar Nota
        </Button>
      </Group>
    </Modal>
  );
};

export default EditNotaModal; 