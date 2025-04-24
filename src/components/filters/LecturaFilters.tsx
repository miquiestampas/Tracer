import React, { ChangeEvent } from 'react';
import { Box, SimpleGrid, TextInput, Select, Group, Button, Switch, Stack, Autocomplete } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { IconSearch, IconClearAll } from '@tabler/icons-react';

// Exportar la interfaz FilterState para que pueda ser usada por el padre
export interface FilterState {
    matricula: string;
    fechaInicio: string;
    horaInicio: string;
    fechaFin: string;
    horaFin: string;
    lectorId: string;
    soloRelevantes: boolean;
    // tipoFuente no es necesario aquí si se maneja por pestañas separadas
}

// Definir las props que recibirá el componente (actualizado)
interface LecturaFiltersProps {
  filters: FilterState;
  onFilterChange: (updates: Partial<FilterState>) => void;
  onFiltrar: () => void; // Función para ejecutar al hacer clic en Filtrar
  onLimpiar: () => void; // Función para ejecutar al hacer clic en Limpiar
  loading?: boolean; // Para deshabilitar el botón de filtrar mientras carga
  hideMatricula?: boolean; // Prop opcional para ocultar el campo de matrícula
  lectorSuggestions?: string[]; // Nuevo prop para sugerencias de lectores
}

const LecturaFilters: React.FC<LecturaFiltersProps> = ({
  filters,
  onFilterChange: handleChange,
  onFiltrar,
  onLimpiar,
  loading = false,
  hideMatricula = false,
  lectorSuggestions = [] // Valor por defecto array vacío
}) => {
  const handleInputChange = (field: keyof FilterState) => (value: string | null) => {
    handleChange({ [field]: value || '' });
  };

  const handleTimeChange = (field: 'horaInicio' | 'horaFin') => (event: ChangeEvent<HTMLInputElement>) => {
    handleChange({ [field]: event.currentTarget.value || '' });
  };

  return (
    <Stack gap="md">
      <Group grow>
        {!hideMatricula && (
          <Autocomplete
            label="Matrícula"
            placeholder="Buscar matrícula..."
            value={filters.matricula}
            onChange={handleInputChange('matricula')}
            data={[]}
          />
        )}
        <Autocomplete
          label="ID Lector"
          placeholder="Filtrar por ID lector..."
          value={filters.lectorId}
          onChange={handleInputChange('lectorId')}
          data={lectorSuggestions}
          limit={10}
          maxDropdownHeight={200}
        />
      </Group>

      <Group grow>
        <DateInput
          label="Fecha Inicio"
          placeholder="DD/MM/YYYY"
          value={filters.fechaInicio ? new Date(filters.fechaInicio) : null}
          onChange={(date) => handleChange({ fechaInicio: date ? date.toISOString().split('T')[0] : '' })}
          valueFormat="YYYY-MM-DD"
        />
        <TimeInput
          label="Hora Inicio"
          placeholder="HH:MM"
          value={filters.horaInicio}
          onChange={handleTimeChange('horaInicio')}
        />
        <DateInput
          label="Fecha Fin"
          placeholder="DD/MM/YYYY"
          value={filters.fechaFin ? new Date(filters.fechaFin) : null}
          onChange={(date) => handleChange({ fechaFin: date ? date.toISOString().split('T')[0] : '' })}
          valueFormat="YYYY-MM-DD"
        />
        <TimeInput
          label="Hora Fin"
          placeholder="HH:MM"
          value={filters.horaFin}
          onChange={handleTimeChange('horaFin')}
        />
      </Group>

      <Group justify="space-between">
        <Switch
          label="Solo Relevantes"
          checked={filters.soloRelevantes}
          onChange={(e) => handleChange({ soloRelevantes: e.currentTarget.checked })}
        />
        <Group>
          <Button
            variant="light"
            leftSection={<IconClearAll size={16} />}
            onClick={onLimpiar}
            disabled={loading}
          >
            Limpiar Filtros
          </Button>
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={onFiltrar}
            loading={loading}
          >
            Aplicar Filtros
          </Button>
        </Group>
      </Group>
    </Stack>
  );
};

export default LecturaFilters; 