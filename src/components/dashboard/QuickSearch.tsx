import React, { useState, useMemo } from 'react';
import { TextInput, Button, Group, Paper, Text, Stack, Loader, Alert, Badge, Divider } from '@mantine/core';
import { IconSearch, IconClock, IconMapPin } from '@tabler/icons-react';
import { buscarVehiculo } from '../../services/dashboardApi';

interface QuickSearchProps {
  onSearch: (matricula: string) => void;
}

interface Lectura {
  id: number;
  fecha: string;
  lector: string;
  caso: string;
}

interface ResultadoBusqueda {
  matricula: string;
  lecturas: Lectura[];
}

export function QuickSearch({ onSearch }: QuickSearchProps) {
  const [matricula, setMatricula] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null);

  const handleSearch = async () => {
    if (!matricula.trim()) return;
    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const resultado = await buscarVehiculo(matricula);
      setResultado(resultado);
      onSearch(matricula);
    } catch (err: any) {
      setError(err.message || 'Error al buscar el vehículo');
    } finally {
      setLoading(false);
    }
  };

  // Agrupar lecturas por caso y ordenar casos por la fecha más reciente
  const casosOrdenados = useMemo(() => {
    if (!resultado) return [];
    const agrupado: Record<string, Lectura[]> = {};
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
      );
  }, [resultado]);

  return (
    <Stack>
      <Paper p="md" withBorder>
        <Group>
          <TextInput
            placeholder="Buscar matrícula..."
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            style={{ flex: 1 }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            leftSection={<IconSearch size={16} />}
            onClick={handleSearch}
            loading={loading}
          >
            Buscar
          </Button>
        </Group>
      </Paper>

      {error && (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      )}

      {loading && (
        <Group justify="center" p="md">
          <Loader size="sm" />
        </Group>
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
                  </Group>
                </Stack>
                <Divider />
                <Stack>
                  <Text fw={500} size="md">Lecturas por caso:</Text>
                  {casosOrdenados.map(([caso, lecturas]) => (
                    <Stack key={caso} mt="sm">
                      <Group>
                        <Badge size="md" variant="filled">{caso}</Badge>
                        <Text size="sm" c="dimmed">
                          {lecturas.length} lecturas encontradas
                        </Text>
                      </Group>
                      {lecturas.slice(0, 5).map((lectura) => (
                        <Paper key={lectura.id} p="xs" withBorder>
                          <Stack gap="xs">
                            <Group>
                              <Text size="sm" fw={500}>
                                {lectura.fecha}
                              </Text>
                            </Group>
                            <Text size="xs" c="dimmed">
                              Lector: {lectura.lector}
                            </Text>
                          </Stack>
                        </Paper>
                      ))}
                      {lecturas.length > 5 && (
                        <Text size="sm" c="dimmed">
                          Y {lecturas.length - 5} lecturas más en este caso...
                        </Text>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

export default QuickSearch; 