import React, { useState, useCallback, useMemo } from 'react';
import { TextInput, Button, Paper, Stack, Group, Text, Badge, Divider } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { buscarVehiculo } from '../../services/dashboardApi';
import type { Lectura } from '../../types/data';

interface QuickSearchProps {
  onSearch: (matricula: string) => void;
}

interface VehiculoSearchResult {
  matricula: string;
  lecturas: {
    id: number;
    fecha: string;
    lector: string;
    caso: string;
  }[];
}

export function QuickSearch({ onSearch }: QuickSearchProps) {
  const [matricula, setMatricula] = useState('');
  const [debouncedMatricula] = useDebouncedValue(matricula, 500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<VehiculoSearchResult | null>(null);

  const handleSearch = useCallback(async () => {
    if (!debouncedMatricula.trim()) return;
    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const resultado = await buscarVehiculo(debouncedMatricula);
      setResultado(resultado);
      onSearch(debouncedMatricula);
    } catch (err: any) {
      setError(err.message || 'Error al buscar el vehículo');
    } finally {
      setLoading(false);
    }
  }, [debouncedMatricula, onSearch]);

  // Agrupar lecturas por caso y ordenar casos por la fecha más reciente
  const casosOrdenados = useMemo(() => {
    if (!resultado) return [];
    const agrupado: Record<string, typeof resultado.lecturas> = {};
    resultado.lecturas.forEach(lectura => {
      const caso = lectura.caso || 'SIN CASO';
      if (!agrupado[caso]) agrupado[caso] = [];
      agrupado[caso].push(lectura);
    });
    // Ordenar lecturas dentro de cada caso por fecha descendente
    Object.values(agrupado).forEach(arr =>
      arr.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
    );
    // Ordenar los casos por la fecha más reciente de sus lecturas
    return Object.entries(agrupado)
      .sort(([, lecturasA], [, lecturasB]) =>
        new Date(lecturasB[0].fecha).getTime() - new Date(lecturasA[0].fecha).getTime()
      )
      .slice(0, 5); // Limitar a 5 casos más recientes
  }, [resultado]);

  return (
    <Paper p="md" withBorder shadow="md" radius="md" style={{ width: '100%' }}>
      <Stack>
        <Group>
          <TextInput
            placeholder="Introduce una matrícula..."
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            style={{ flex: 1 }}
          />
          <Button onClick={handleSearch} loading={loading}>
            Buscar
          </Button>
          <Button
            variant="light"
            color="gray"
            onClick={() => {
              setMatricula('');
              setResultado(null);
              setError(null);
            }}
            disabled={loading}
          >
            Limpiar
          </Button>
        </Group>

        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}

        {resultado && (
          <Paper p="md" withBorder>
            <Stack>
              <Group>
                <Text fw={500} size="lg">
                  Matrícula: {resultado.matricula}
                </Text>
                <Badge size="lg" variant="light">
                  {resultado.lecturas.length} lecturas
                </Badge>
              </Group>

              {resultado.lecturas.length === 0 ? (
                <Text c="dimmed">No se encontraron lecturas para esta matrícula</Text>
              ) : (
                <>
                  <Stack>
                    <Group>
                      <IconMapPin size={16} />
                      <Text fw={500}>Casos encontrados:</Text>
                    </Group>
                    <Group>
                      {casosOrdenados.map(([caso, lecturas]) => (
                        <Badge key={caso} size="md" variant="filled">
                          {caso} ({lecturas.length})
                        </Badge>
                      ))}
                      {resultado.lecturas.length > 5 && (
                        <Badge size="md" variant="light">
                          +{resultado.lecturas.length - 5} más
                        </Badge>
                      )}
                    </Group>
                  </Stack>
                  <Divider />
                  <Stack>
                    <Text fw={500}>Últimas lecturas:</Text>
                    {resultado.lecturas
                      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                      .slice(0, 5)
                      .map((lectura) => (
                        <Group key={lectura.id} justify="space-between">
                          <Stack gap={0}>
                            <Text size="sm" fw={500}>
                              {lectura.lector}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {new Date(lectura.fecha).toLocaleString()}
                            </Text>
                          </Stack>
                          <Badge size="sm" variant="light">
                            {lectura.caso || 'SIN CASO'}
                          </Badge>
                        </Group>
                      ))}
                  </Stack>
                </>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
}

export default QuickSearch; 