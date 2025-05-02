import React, { useState } from 'react';
import { Box, Group, Button, TextInput, Title, Table, LoadingOverlay, MultiSelect } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import CountryFlag from 'react-country-flag';
import { platePatterns } from '../../utils/platePatterns';

interface MatriculaLectura {
  Matricula: string;
  Fecha_y_Hora: string;
  ID_Lector?: string;
  // ...otros campos si quieres
}

interface Props {
  lecturas: MatriculaLectura[];
  loading?: boolean;
}

const countryOptions = Object.entries(platePatterns)
  .filter(([code]) => code !== 'ES')
  .map(([code, { name }]) => ({
    value: code,
    label: name
  }));

function getCountryForPlate(plate: string): { code: string; name: string } | null {
  for (const [code, { name, regex }] of Object.entries(platePatterns)) {
    if (regex.test(plate)) {
      return { code, name };
    }
  }
  return null;
}

export default function MatriculasExtranjerasPanel({ lecturas, loading }: Props) {
  const [matricula, setMatricula] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [resultados, setResultados] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  const handleBuscar = () => {
    setSearching(true);
    setTimeout(() => {
      let filtradas = lecturas.filter(l => {
        if (matricula && !l.Matricula.includes(matricula.toUpperCase())) return false;
        if (fechaInicio && new Date(l.Fecha_y_Hora) < fechaInicio) return false;
        if (fechaFin && new Date(l.Fecha_y_Hora) > fechaFin) return false;
        const pais = getCountryForPlate(l.Matricula);
        if (!pais) return false;
        if (selectedCountries.length > 0 && !selectedCountries.includes(pais.code)) return false;
        return true;
      });
      setResultados(filtradas.map(l => ({
        ...l,
        pais: getCountryForPlate(l.Matricula)
      })));
      setSearching(false);
    }, 200); // Simula retardo
  };

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Title order={4}>Búsqueda de Matrículas Extranjeras</Title>
      </Group>
      <Group mb="md" align="flex-end">
        <MultiSelect
          label="Países (opcional)"
          placeholder="Todos los países"
          data={countryOptions.map(opt => ({
            value: opt.value,
            label: opt.label
          }))}
          value={selectedCountries}
          onChange={setSelectedCountries}
          searchable
          clearable
          maxDropdownHeight={300}
          renderOption={({ option }) => (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountryFlag countryCode={option.value} svg style={{ width: 20 }} /> {option.label}
            </span>
          )}
        />
        <TextInput
          label="Matrícula (opcional)"
          value={matricula}
          onChange={e => setMatricula(e.target.value)}
          placeholder="Ej: 1234ABC"
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>Fecha inicio (opcional)</span>
          <TextInput
            type="date"
            value={fechaInicio ? fechaInicio.toISOString().split('T')[0] : ''}
            onChange={e => setFechaInicio(e.target.value ? new Date(e.target.value) : null)}
            style={{ minWidth: 160 }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>Fecha fin (opcional)</span>
          <TextInput
            type="date"
            value={fechaFin ? fechaFin.toISOString().split('T')[0] : ''}
            onChange={e => setFechaFin(e.target.value ? new Date(e.target.value) : null)}
            style={{ minWidth: 160 }}
          />
        </div>
        <Button leftSection={<IconSearch size={16} />} onClick={handleBuscar} loading={searching}>
          Buscar
        </Button>
      </Group>
      <Box style={{ position: 'relative' }}>
        <LoadingOverlay visible={loading || searching} />
        <Table striped highlightOnHover withColumnBorders>
          <thead>
            <tr>
              <th>País</th>
              <th>Matrícula</th>
              <th>Fecha/Hora</th>
              <th>Lector</th>
            </tr>
          </thead>
          <tbody>
            {resultados.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>No hay resultados.</td>
              </tr>
            ) : (
              resultados.map((r, i) => (
                <tr key={i}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.pais && <CountryFlag countryCode={r.pais.code} svg style={{ width: 24 }} />} {r.pais?.name || '-'}
                  </td>
                  <td>{r.Matricula}</td>
                  <td>{new Date(r.Fecha_y_Hora).toLocaleString()}</td>
                  <td>{r.ID_Lector || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Box>
    </Box>
  );
} 