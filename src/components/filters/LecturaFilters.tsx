import React, { ChangeEvent } from 'react';
import { Box, SimpleGrid, TextInput, Select, Group, Button, Switch, Stack, Autocomplete } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { IconSearch, IconClearAll } from '@tabler/icons-react';
import dayjs from 'dayjs';

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

  const handleDateChange = (field: 'fechaInicio' | 'fechaFin') => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    
    // Si está vacío, permitir el cambio
    if (!value) {
      handleChange({ [field]: '' });
      return;
    }

    // Validar formato DD/MM/YYYY
    const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = value.match(dateRegex);
    
    if (match) {
      const [_, day, month, year] = match;
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      // Validar rangos de fecha
      if (dayNum >= 1 && dayNum <= 31 && 
          monthNum >= 1 && monthNum <= 12 && 
          yearNum >= 1900 && yearNum <= 2100) {
        handleChange({ [field]: value });
      }
    } else if (value.length <= 10) { // Permitir escritura parcial
      handleChange({ [field]: value });
    }
  };

  const formatDateForInput = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return dayjs(dateStr).format('DD/MM/YYYY');
    } catch {
      return dateStr;
    }
  };

  // Nueva función para aplicar la lógica de GPS
  const handleFiltrarConLogicaGps = () => {
    let fechaInicio = filters.fechaInicio || '';
    let horaInicio = filters.horaInicio || '';
    let fechaFin = filters.fechaFin || '';
    let horaFin = filters.horaFin || '';
    // Si hay fecha inicio pero no hora, usar 00:00
    if (fechaInicio && !horaInicio) horaInicio = '00:00';
    // Si hay fecha fin pero no hora, usar 23:59
    if (fechaFin && !horaFin) horaFin = '23:59';
    // Si la fecha es igual y la hora fin < hora inicio, sumar un día a la fecha fin
    if (fechaInicio && fechaFin && fechaInicio === fechaFin && horaInicio && horaFin && horaFin < horaInicio) {
      const d = new Date(fechaFin);
      d.setDate(d.getDate() + 1);
      fechaFin = d.toISOString().slice(0, 10);
    }
    // Si no hay fecha, no enviar hora
    if (!fechaInicio) horaInicio = '';
    if (!fechaFin) horaFin = '';
    handleChange({ fechaInicio, horaInicio, fechaFin, horaFin });
    onFiltrar();
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
          onChange={(e) => handleChange({ fechaInicio: e.target.value })}
        />
        <TextInput
          label="Hora Inicio"
          type="time"
          value={filters.horaInicio}
          onChange={(e) => handleChange({ horaInicio: e.target.value })}
        />
      </Group>

      <Group grow>
        <TextInput
          label="Fecha Fin"
          type="date"
          value={filters.fechaFin}
          onChange={(e) => handleChange({ fechaFin: e.target.value })}
        />
        <TextInput
          label="Hora Fin"
          type="time"
          value={filters.horaFin}
          onChange={(e) => handleChange({ horaFin: e.target.value })}
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
          onClick={handleFiltrarConLogicaGps}
          loading={loading}
        >
          Aplicar Filtros
        </Button>
      </Group>
    </Stack>
  );
};

export default LecturaFilters; 