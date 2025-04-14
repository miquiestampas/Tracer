import React, { useState, useEffect } from 'react';
import { Modal, TextInput, NumberInput, Textarea, Button, Group, SimpleGrid, LoadingOverlay, Select, Combobox, useCombobox, InputBase, CheckIcon, Pill, Loader, Input, InputWrapper, Text } from '@mantine/core';
import type { Lector, LectorUpdateData, LectorSugerenciasResponse } from '../../types/data';
import { getLectorSugerencias } from '../../services/lectoresApi';

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

// *** Añadir de nuevo: Opciones para el selector de Sentido ***
const SENTIDO_OPTIONS = [
    { value: 'Creciente', label: 'Creciente' },
    { value: 'Decreciente', label: 'Decreciente' },
];

interface EditLectorModalProps {
  opened: boolean;
  onClose: () => void;
  lector: Lector | null; // Lector actual para pre-rellenar el formulario
  onSave: (lectorId: string, data: LectorUpdateData) => Promise<void>; // Función para guardar cambios
}

// Componente auxiliar para el Combobox (Versión Corregida)
function SuggestionCombobox({ placeholder, value, onChange, data, loading, disabled }: {
    placeholder: string;
    value: string | null;
    onChange: (value: string) => void;
    data: string[];
    loading: boolean;
    disabled?: boolean;
}) {
    const combobox = useCombobox({
        // onOptionSubmit se elimina, se maneja en Combobox.Option o Input
    });

    const [search, setSearch] = useState(value || '');

    useEffect(() => {
        setSearch(value || '');
    }, [value]);

    const filteredOptions = data.filter((item) => 
        item.toLowerCase().includes(search.toLowerCase().trim())
    );

    const options = filteredOptions.map((item) => (
        <Combobox.Option value={item} key={item}>
            {item}
        </Combobox.Option>
    ));

    return (
        <Combobox
            store={combobox}
            withinPortal={false}
            onOptionSubmit={(val) => {
                onChange(val);
                setSearch(val);
                combobox.closeDropdown();
            }}
            disabled={disabled}
        >
            <Combobox.Target>
                {/* Usar Input en lugar de InputBase para placeholder y control más simple */}
                <Input
                    placeholder={placeholder}
                    value={search}
                    onChange={(event) => {
                        setSearch(event.currentTarget.value);
                        onChange(event.currentTarget.value);
                        combobox.openDropdown();
                        combobox.updateSelectedOptionIndex();
                    }}
                    onClick={() => combobox.openDropdown()}
                    onFocus={() => combobox.openDropdown()}
                    onBlur={() => {
                         setTimeout(() => combobox.closeDropdown(), 150); 
                     }}
                     rightSection={loading ? <Loader size="xs" /> : null}
                     disabled={disabled}
                />
            </Combobox.Target>

            <Combobox.Dropdown>
                <Combobox.Options>
                    {loading && <Combobox.Empty>Cargando...</Combobox.Empty>}
                    {!loading && options.length === 0 && <Combobox.Empty>No hay sugerencias. Escribe para añadir.</Combobox.Empty>}
                    {options}
                </Combobox.Options>
            </Combobox.Dropdown>
        </Combobox>
    );
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
  // Estado para sugerencias
  const [sugerencias, setSugerencias] = useState<LectorSugerenciasResponse | null>(null);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);

  // Cargar sugerencias cuando se abre el modal
  useEffect(() => {
    if (opened && !sugerencias && !loadingSugerencias) {
        setLoadingSugerencias(true);
        console.log("[EditModal] Abierto y sin sugerencias, llamando a getLectorSugerencias...");
        getLectorSugerencias()
            .then(data => {
                console.log("[EditModal] Sugerencias recibidas de API:", data);
                setSugerencias(data)
            })
            .catch(err => {
                console.error("[EditModal] Error cargando sugerencias:", err);
                // Asegurarse de setear a un objeto vacío en error para evitar null
                setSugerencias({ provincias: [], localidades: [], carreteras: [], organismos: [], contactos: [] });
            })
            .finally(() => setLoadingSugerencias(false));
    }
  }, [opened, sugerencias, loadingSugerencias]);

  // Log para ver el estado de sugerencias en cada render
  console.log("[EditModal] Renderizando. Estado sugerencias:", sugerencias);

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
        // y rellenar Coordenada_X/Y si el backend lo esperase, 
        // pero por ahora lo pasamos tal cual (o lo quitamos si no existe en LectorUpdateData)
        // Asumiendo que el backend manejará UbicacionInput si se añade a LectorUpdateData
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

  // Log para ver el estado de sugerencias y los datos que se pasarán a los combobox ANTES del return
  console.log("[EditModal] Renderizando.");
  console.log("  Estado sugerencias:", sugerencias);
  console.log("  Datos para Combobox Carretera:", sugerencias?.carreteras || []);
  console.log("  Datos para Combobox Provincia:", sugerencias?.provincias || []);
  console.log("  Datos para Combobox Localidad:", sugerencias?.localidades || []);
  console.log("  Datos para Combobox Organismo:", sugerencias?.organismos || []);
  console.log("  Datos para Combobox Contacto:", sugerencias?.contactos || []);

  return (
    <Modal
      opened={opened}
      onClose={handleModalClose}
      title={`Editar Lector: ${lector?.ID_Lector || ''}`}
      size="xl" // Modal más grande para todos los campos
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      <LoadingOverlay visible={isSaving || loadingSugerencias} overlayProps={{ blur: 2 }} />
      <SimpleGrid cols={2} spacing="md">
        <TextInput
          label="Nombre"
          placeholder="Nombre descriptivo del lector"
          value={formData.Nombre || ''}
          onChange={(e) => handleChange('Nombre', e.currentTarget.value)}
          disabled={isSaving}
        />
        <Input.Wrapper label="Carretera / Vía">
          <SuggestionCombobox
            placeholder="Ej: A-4, M-30..."
            value={formData.Carretera || null}
            onChange={(val) => handleChange('Carretera', val)}
            data={sugerencias?.carreteras || []}
            loading={loadingSugerencias}
            disabled={isSaving}
          />
        </Input.Wrapper>
        <Input.Wrapper label="Provincia">
          <SuggestionCombobox
            placeholder="Ej: Madrid..."
            value={formData.Provincia || null}
            onChange={(val) => handleChange('Provincia', val)}
            data={sugerencias?.provincias || []}
            loading={loadingSugerencias}
            disabled={isSaving}
          />
        </Input.Wrapper>
        <Input.Wrapper label="Localidad">
          <SuggestionCombobox
            placeholder="Ej: Getafe..."
            value={formData.Localidad || null}
            onChange={(val) => handleChange('Localidad', val)}
            data={sugerencias?.localidades || []}
            loading={loadingSugerencias}
            disabled={isSaving}
          />
        </Input.Wrapper>
        <Select
          label="Sentido"
          placeholder="Selecciona el sentido"
          value={formData.Sentido || null}
          onChange={(value) => handleChange('Sentido', value)}
          data={SENTIDO_OPTIONS}
          clearable
          disabled={isSaving}
        />
        <Select
          label="Orientación"
          placeholder="Selecciona la orientación"
          value={formData.Orientacion || null}
          onChange={(value) => handleChange('Orientacion', value)}
          data={ORIENTACION_OPTIONS}
          clearable
          disabled={isSaving}
        />
        <Input.Wrapper label="Organismo Regulador">
          <SuggestionCombobox
            placeholder="Ej: DGT, Ayuntamiento..."
            value={formData.Organismo_Regulador || null}
            onChange={(val) => handleChange('Organismo_Regulador', val)}
            data={sugerencias?.organismos || []}
            loading={loadingSugerencias}
            disabled={isSaving}
          />
        </Input.Wrapper>
        <Input.Wrapper label="Contacto">
          <SuggestionCombobox
            placeholder="Ej: policia@municipio.es..."
            value={formData.Contacto || null}
            onChange={(val) => handleChange('Contacto', val)}
            data={sugerencias?.contactos || []}
            loading={loadingSugerencias}
            disabled={isSaving}
          />
        </Input.Wrapper>
        <TextInput
          label="Ubicación (Lat, Lon / Enlace Maps)"
          placeholder="Ej: 40.123, -3.456 o enlace Google Maps"
          value={formData.UbicacionInput || ''}
          onChange={(e) => handleChange('UbicacionInput', e.currentTarget.value)}
          disabled={isSaving}
        />
        <TextInput
          label="Ruta Imagen (opcional)"
          placeholder="Ej: /static/images/lector1.jpg"
          value={formData.Imagen_Path || ''}
          onChange={(e) => handleChange('Imagen_Path', e.currentTarget.value)}
          disabled={isSaving}
        />
      </SimpleGrid>
      <Textarea
        label="Texto Libre / Notas"
        placeholder="Añade información adicional sobre el lector"
        value={formData.Texto_Libre || ''}
        onChange={(e) => handleChange('Texto_Libre', e.currentTarget.value)}
        rows={3}
        disabled={isSaving}
        mt="md"
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