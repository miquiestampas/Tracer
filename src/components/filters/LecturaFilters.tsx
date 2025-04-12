import React from 'react';
import { Box, SimpleGrid, TextInput, Select, Group, Button, Switch } from '@mantine/core';
import { TimeInput } from '@mantine/dates';
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
  loading: boolean; // Para deshabilitar el botón de filtrar mientras carga
  showLectorIdFilter?: boolean; // Prop opcional para mostrar/ocultar filtro Lector ID
}

const LecturaFilters: React.FC<LecturaFiltersProps> = ({
  filters,
  onFilterChange,
  onFiltrar,
  onLimpiar,
  loading,
  showLectorIdFilter = true, // Valor por defecto true si no se proporciona
}) => {

  // Helper para manejar cambios en inputs y llamar a onFilterChange
  const handleChange = (updates: Partial<FilterState>) => {
    onFilterChange(updates);
  };

  return (
    <Box mb="lg">
      {/* Fila 1: Matricula, Lector (condicional), Relevantes */}
      {/* Ajustar cols dinámicamente basado en showLectorIdFilter */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: showLectorIdFilter ? 3 : 2 }} spacing="md" mb="md">
          <TextInput
              label="Matrícula"
              placeholder="Buscar matrícula..."
              value={filters.matricula}
              onChange={(event) => handleChange({ matricula: event.currentTarget.value })}
          />
          {/* Renderizar Lector ID condicionalmente */}
          {showLectorIdFilter && (
            <TextInput
                label="ID Lector"
                placeholder="Filtrar por ID lector..."
                value={filters.lectorId}
                onChange={(event) => handleChange({ lectorId: event.currentTarget.value })}
            />
          )}
           {/* Mover Switch aquí para mejor alineación */}
          <Switch
              label="Mostrar solo relevantes"
              checked={filters.soloRelevantes}
              onChange={(event) => handleChange({ soloRelevantes: event.currentTarget.checked })}
              mt="xl" // Alinear verticalmente
          />
         {/* Tipo Fuente ya no se filtra aquí, se controla por pestaña padre */}
      </SimpleGrid>

      {/* Fila 2: Fecha/Hora Inicio y Fin */}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {/* Grupo Fecha/Hora Inicio */}
          <Group grow preventGrowOverflow={false} wrap="nowrap">
              <TextInput
                  label="Fecha Inicio"
                  placeholder="DD/MM/YYYY"
                  value={filters.fechaInicio}
                  onChange={(event) => handleChange({ fechaInicio: event.currentTarget.value })}
                  style={{ flexBasis: '60%' }}
              />
              <TimeInput
                  label="Hora Inicio"
                  placeholder="HH:MM"
                  value={filters.horaInicio}
                  onChange={(event) => handleChange({ horaInicio: event.currentTarget.value })}
                  style={{ flexBasis: '40%' }}
              />
          </Group>

          {/* Grupo Fecha/Hora Fin */}
          <Group grow preventGrowOverflow={false} wrap="nowrap">
              <TextInput
                  label="Fecha Fin"
                  placeholder="DD/MM/YYYY"
                  value={filters.fechaFin}
                  onChange={(event) => handleChange({ fechaFin: event.currentTarget.value })}
                  style={{ flexBasis: '60%' }}
              />
              <TimeInput
                  label="Hora Fin"
                  placeholder="HH:MM"
                  value={filters.horaFin}
                  onChange={(event) => handleChange({ horaFin: event.currentTarget.value })}
                  style={{ flexBasis: '40%' }}
              />
          </Group>
      </SimpleGrid>

      {/* Fila 3: Botones */}
      <Group justify="flex-end" mt="md">
          <Button
              variant="outline"
              leftSection={<IconClearAll size={16} />}
              onClick={onLimpiar}
          >
              Limpiar Filtros
          </Button>
          <Button
              leftSection={<IconSearch size={16} />}
              onClick={onFiltrar}
              disabled={loading}
          >
              Aplicar Filtros
          </Button>
      </Group>
    </Box>
  );
};

export default LecturaFilters; 