import React, { useState, useEffect } from 'react';
import { Box, Group, Button, TextInput, Title, Table, LoadingOverlay, MultiSelect, ActionIcon, Loader } from '@mantine/core';
import { IconSearch, IconArrowUp, IconArrowDown, IconArrowsSort } from '@tabler/icons-react';
import CountryFlag from 'react-country-flag';
import { platePatterns } from '../../utils/platePatterns';
import { useParams } from 'react-router-dom';

interface MatriculaLectura {
  Matricula: string;
  Fecha_y_Hora: string;
  ID_Lector?: string;
}

interface Props {
  loading?: boolean;
}

const countryOptions = Object.entries(platePatterns)
  .filter(([code]) => code !== 'ES')
  .map(([code, { name }]) => ({
    value: code,
    label: name
  }));

function getCountryForPlate(plate: string): { code: string; name: string; isPotentiallyIncomplete?: boolean } | null {
  // Primero verificar si podría ser una matrícula española incompleta
  const spanishPattern = /^[0-9]{3}[A-Z]{3}$/;
  if (spanishPattern.test(plate)) {
    return { code: 'ES', name: 'España', isPotentiallyIncomplete: true };
  }

  for (const [code, { name, regex }] of Object.entries(platePatterns)) {
    if (regex.test(plate)) {
      // Para matrículas francesas e italianas, devolver un código especial
      if (code === 'FR' || code === 'IT') {
        return { code: 'FRIT', name: 'Francia / Italia' };
      }
      return { code, name };
    }
  }
  return null;
}

type SortField = 'pais' | 'matricula' | 'fecha' | 'lector';
type SortDirection = 'asc' | 'desc';

export default function MatriculasExtranjerasPanel({ loading: externalLoading }: Props) {
  const { idCaso } = useParams<{ idCaso: string }>();
  const [matricula, setMatricula] = useState('');
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [resultados, setResultados] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [lecturas, setLecturas] = useState<MatriculaLectura[]>([]);
  const [loadingLecturas, setLoadingLecturas] = useState(true);
  const [sortField, setSortField] = useState<SortField>('fecha');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Cargar lecturas del caso
  useEffect(() => {
    const fetchLecturas = async () => {
      if (!idCaso) return;
      setLoadingLecturas(true);
      // Buscar en sessionStorage
      const cacheKey = `lecturas_caso_${idCaso}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          setLecturas(parsed);
          setLoadingLecturas(false);
          return;
        } catch (e) {
          // Si hay error en el parseo, continuar con la petición normal
        }
      }
      try {
        const response = await fetch(`http://localhost:8000/casos/${idCaso}/lecturas`);
        if (!response.ok) throw new Error('Error al cargar lecturas');
        const data = await response.json();
        setLecturas(data);
      } catch (error) {
        console.error('Error fetching lecturas:', error);
        // Aquí podrías mostrar un mensaje de error si lo deseas
      } finally {
        setLoadingLecturas(false);
      }
    };
    fetchLecturas();
    // Limpieza al desmontar: elimina cualquier cache de este panel
    return () => {
      const cacheKey = `lecturas_caso_${idCaso}`;
      sessionStorage.removeItem(cacheKey);
    };
  }, [idCaso]);

  const handleBuscar = () => {
    setSearching(true);
    setTimeout(() => {
      let filtradas = lecturas.filter(l => {
        // Primero verificar que no sea una matrícula española
        const pais = getCountryForPlate(l.Matricula);
        if (!pais || pais.code === 'ES') return false;
        
        if (matricula && !l.Matricula.includes(matricula.toUpperCase())) return false;
        if (fechaInicio && new Date(l.Fecha_y_Hora) < fechaInicio) return false;
        if (fechaFin && new Date(l.Fecha_y_Hora) > fechaFin) return false;
        if (selectedCountries.length > 0 && !selectedCountries.includes(pais.code)) return false;
        return true;
      });
      setResultados(filtradas.map(l => ({
        ...l,
        pais: getCountryForPlate(l.Matricula)
      })));
      setSearching(false);
      // Elimina cache tras cada búsqueda
      const cacheKey = `lecturas_caso_${idCaso}`;
      sessionStorage.removeItem(cacheKey);
    }, 200);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedResults = [...resultados].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'pais':
        comparison = (a.pais?.name || '').localeCompare(b.pais?.name || '');
        break;
      case 'matricula':
        comparison = a.Matricula.localeCompare(b.Matricula);
        break;
      case 'fecha':
        comparison = new Date(a.Fecha_y_Hora).getTime() - new Date(b.Fecha_y_Hora).getTime();
        break;
      case 'lector':
        comparison = (a.ID_Lector || '').localeCompare(b.ID_Lector || '');
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const isLoading = externalLoading || loadingLecturas || searching;

  return (
    <Box>
      <Group justify="space-between" mb="md">
        <Title order={4}>Búsqueda de Matrículas Extranjeras</Title>
      </Group>
      <Group justify="space-between" mb="md">
        <Group>
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
      </Group>
      {loadingLecturas && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.35)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Loader size={64} color="blue" />
          <div style={{
            marginTop: 32,
            fontSize: 32,
            color: '#fff',
            fontWeight: 600,
            textShadow: '0 2px 8px rgba(0,0,0,0.4)'
          }}>
            Indexando lecturas en segundo plano...
          </div>
        </div>
      )}
      <Box style={{ position: 'relative' }}>
        <LoadingOverlay visible={isLoading && !loadingLecturas} />
        <Table striped highlightOnHover withColumnBorders>
          <thead>
            <tr>
              <th>
                <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => handleSort('pais')}>
                  País
                  {sortField === 'pais' ? (
                    sortDirection === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />
                  ) : (
                    <IconArrowsSort size={14} />
                  )}
                </Group>
              </th>
              <th>
                <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => handleSort('matricula')}>
                  Matrícula
                  {sortField === 'matricula' ? (
                    sortDirection === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />
                  ) : (
                    <IconArrowsSort size={14} />
                  )}
                </Group>
              </th>
              <th>
                <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => handleSort('fecha')}>
                  Fecha/Hora
                  {sortField === 'fecha' ? (
                    sortDirection === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />
                  ) : (
                    <IconArrowsSort size={14} />
                  )}
                </Group>
              </th>
              <th>
                <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => handleSort('lector')}>
                  Lector
                  {sortField === 'lector' ? (
                    sortDirection === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />
                  ) : (
                    <IconArrowsSort size={14} />
                  )}
                </Group>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>No hay resultados.</td>
              </tr>
            ) : (
              sortedResults.map((r, i) => (
                <tr key={i}>
                  <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.pais && (
                      <>
                        {r.pais.code === 'FRIT' ? (
                          <>
                            <CountryFlag countryCode="FR" svg style={{ width: 24 }} />
                            <CountryFlag countryCode="IT" svg style={{ width: 24 }} />
                          </>
                        ) : (
                          <CountryFlag countryCode={r.pais.code} svg style={{ width: 24 }} />
                        )}
                        {r.pais.name}
                        {r.pais.isPotentiallyIncomplete && (
                          <span style={{ color: 'orange', marginLeft: '8px' }}>
                            (Posible lectura incompleta)
                          </span>
                        )}
                      </>
                    )}
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