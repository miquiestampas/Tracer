import React, { useState, useEffect } from 'react';
import { Modal, TextInput, NumberInput, Textarea, Button, Group, SimpleGrid, LoadingOverlay, Select } from '@mantine/core';
import type { Lector, LectorUpdateData } from '../../types/data';

// Opciones para el selector de Orientación
const ORIENTACION_OPTIONS = [
  { value: 'N', label: 'Norte (N)' },
  { value: 'NE', label: 'Noreste (NE)' },
  { value: 'E', label: 'Este (E)' },
  { value: 'SE', label: 'Sureste (SE)' },
  { value: 'S', label: 'Sur (S)' },
  { value: 'SO', label: 'Suroeste (SO)' },
  { value: 'O', label: 'Oeste (O)' },
  { value: 'NO', label: 'Noroeste (NO)' },
];

interface EditLectorModalProps {
  opened: boolean;
  onClose: () => void;
  lector: Lector | null; // Lector actual para pre-rellenar el formulario
  onSave: (lectorId: string, data: LectorUpdateData) => Promise<void>; // Función para guardar cambios
}

const EditLectorModal: React.FC<EditLectorModalProps> = ({ 
  opened, 
  onClose, 
  lector, 
  onSave 
}) => {
  // Estado local para los campos del formulario
  const [formData, setFormData] = useState<LectorUpdateData>({});
  const [isSaving, setIsSaving] = useState(false);

  // Pre-rellenar formulario cuando el lector cambie
  useEffect(() => {
    if (lector) {
      setFormData({
        // Usar ID_Lector como default para Nombre si Nombre está vacío/null
        Nombre: lector.Nombre || lector.ID_Lector, 
        Carretera: lector.Carretera || '',
        Provincia: lector.Provincia || '',
        Localidad: lector.Localidad || '',
        Sentido: lector.Sentido || '',
        Orientacion: lector.Orientacion || null,
        Organismo_Regulador: lector.Organismo_Regulador || '',
        Contacto: lector.Contacto || '',
        // Si existen coords X/Y, podríamos pre-rellenar UbicacionInput
        UbicacionInput: (lector.Coordenada_Y != null && lector.Coordenada_X != null) 
                        ? `${lector.Coordenada_Y}, ${lector.Coordenada_X}` 
                        : '', 
        Texto_Libre: lector.Texto_Libre || '',
        Imagen_Path: lector.Imagen_Path || ''
      });
    } else {
      // Resetear si no hay lector
      setFormData({});
    }
  }, [lector]);

  // Manejar cambios en los inputs
  const handleChange = (field: keyof LectorUpdateData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleGuardarClick = async () => {
    if (!lector) return;

    setIsSaving(true);
    try {
      // Asegurarse de que el valor de Orientacion sea string o null
      const dataToSend: LectorUpdateData = {
        ...formData,
        Orientacion: formData.Orientacion || null, 
        // Aquí podríamos añadir lógica para intentar parsear UbicacionInput
        // y rellenar Coordenada_X/Y si el backend lo esperase, 
        // pero por ahora lo pasamos tal cual (o lo quitamos si no existe en LectorUpdateData)
        // Asumiendo que el backend manejará UbicacionInput si se añade a LectorUpdateData
        UbicacionInput: formData.UbicacionInput?.trim() || null,
      };
      
      // Limpiar campos que no deberían enviarse si no se usan
      // delete dataToSend.Coordenada_X; 
      // delete dataToSend.Coordenada_Y;

      await onSave(lector.ID_Lector, dataToSend);
    } catch (error) {
      // El error se maneja en la página padre, aquí solo detenemos el loading
      console.error("Error guardando lector desde modal:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleModalClose = () => {
    setIsSaving(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title={`Editar Lector: ${lector?.ID_Lector || ''}`}
      size="xl" // Modal más grande para todos los campos
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      <LoadingOverlay visible={isSaving} overlayProps={{ blur: 2 }} />
      <SimpleGrid cols={2} spacing="md">
        <TextInput
          label="Nombre"
          placeholder="Nombre descriptivo del lector"
          value={formData.Nombre || ''}
          onChange={(e) => handleChange('Nombre', e.currentTarget.value)}
          disabled={isSaving}
        />
        <TextInput
          label="Carretera / Vía"
          placeholder="Ej: A-4, M-30, C/ Alcalá"
          value={formData.Carretera || ''}
          onChange={(e) => handleChange('Carretera', e.currentTarget.value)}
          disabled={isSaving}
        />
        <TextInput
          label="Provincia"
          placeholder="Ej: Madrid"
          value={formData.Provincia || ''}
          onChange={(e) => handleChange('Provincia', e.currentTarget.value)}
          disabled={isSaving}
        />
        <TextInput
          label="Localidad"
          placeholder="Ej: Getafe"
          value={formData.Localidad || ''}
          onChange={(e) => handleChange('Localidad', e.currentTarget.value)}
          disabled={isSaving}
        />
         <TextInput
          label="Sentido"
          placeholder="Ej: Creciente, Decreciente, Norte, Sur..."
          value={formData.Sentido || ''}
          onChange={(e) => handleChange('Sentido', e.currentTarget.value)}
          disabled={isSaving}
        />
         <Select
            label="Orientación Cámara"
            placeholder="Selecciona una orientación"
            data={ORIENTACION_OPTIONS}
            value={formData.Orientacion}
            onChange={(value) => handleChange('Orientacion', value)}
            disabled={isSaving}
            clearable
        />
        <TextInput
          label="Organismo Regulador"
          placeholder="Ej: DGT, Ayuntamiento..."
          value={formData.Organismo_Regulador || ''}
          onChange={(e) => handleChange('Organismo_Regulador', e.currentTarget.value)}
          disabled={isSaving}
        />
         <TextInput
          label="Contacto"
          placeholder="Email o teléfono de contacto"
          value={formData.Contacto || ''}
          onChange={(e) => handleChange('Contacto', e.currentTarget.value)}
          disabled={isSaving}
        />
        {/* Podría ser un input de archivo en el futuro */}
         <TextInput
          label="Ruta Imagen (Opcional)"
          placeholder="Ej: /static/lector_1.jpg"
          value={formData.Imagen_Path || ''}
          onChange={(e) => handleChange('Imagen_Path', e.currentTarget.value)}
          disabled={isSaving}
          // Considerar añadir un FileInput o similar aquí
        />
      </SimpleGrid>
      <Textarea
        label="Ubicación (Coordenadas / Enlace Google Maps)"
        placeholder="Pega aquí las coordenadas (ej: 40.416775, -3.703790) o un enlace de Google Maps"
        value={formData.UbicacionInput || ''}
        onChange={(e) => handleChange('UbicacionInput', e.currentTarget.value)}
        mt="md"
        minRows={2}
        autosize
        disabled={isSaving}
      />
      <Textarea
          label="Texto Libre / Notas"
          placeholder="Añade información adicional sobre el lector..."
          value={formData.Texto_Libre || ''}
          onChange={(e) => handleChange('Texto_Libre', e.currentTarget.value)}
          mt="md"
          minRows={3}
          autosize
          disabled={isSaving}
        />
      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={handleModalClose} disabled={isSaving}>
          Cancelar
        </Button>
        <Button onClick={handleGuardarClick} loading={isSaving}>
          Guardar Cambios
        </Button>
      </Group>
    </Modal>
  );
};

export default EditLectorModal; 