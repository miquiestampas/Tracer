import React, { ChangeEvent } from 'react';
import { Box, SimpleGrid, TextInput, Select, Group, Button, Switch, Stack, Autocomplete } from '@mantine/core';
import { TimeInput, DateInput } from '@mantine/dates';
import { IconSearch, IconClearAll } from '@tabler/icons-react';

// Exportar la interfaz FilterState para que pueda ser usada por el padre
export interface FilterState {
    fechaInicio: string;
    horaInicio: string;
    fechaFin: string;
    horaFin: string;
    lectorId: string;
}

// Definir las props que recibirá el componente (actualizado)
interface LecturaFiltersProps {
  filters: FilterState;
  onFilterChange: (updates: Partial<FilterState>) => void;
  onFiltrar: () => void;
  onLimpiar: () => void;
  loading?: boolean;
  lectorSuggestions?: string[];
}

const LecturaFilters: React.FC<LecturaFiltersProps> = ({
  filters,
  onFilterChange: handleChange,
  onFiltrar,
  onLimpiar,
  loading = false,
  lectorSuggestions = []
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
        <TextInput
          label="Fecha Inicio"
          type="date"
          value={filters.fechaInicio}
          onChange={e => handleChange({ fechaInicio: e.target.value })}
        />
        <TextInput
          label="Hora Inicio"
          type="time"
          value={filters.horaInicio}
          onChange={e => handleChange({ horaInicio: e.target.value })}
        />
        <TextInput
          label="Fecha Fin"
          type="date"
          value={filters.fechaFin}
          onChange={e => handleChange({ fechaFin: e.target.value })}
        />
        <TextInput
          label="Hora Fin"
          type="time"
          value={filters.horaFin}
          onChange={e => handleChange({ horaFin: e.target.value })}
        />
      </Group>

      <Group justify="flex-end">
        <Button
          variant="outline"
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
    </Stack>
  );
};

export default LecturaFilters; 