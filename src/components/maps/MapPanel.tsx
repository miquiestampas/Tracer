import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Stack, Paper, Title, Text, Select, Group, Badge } from '@mantine/core';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LecturaFilters from '../filters/LecturaFilters';
import type { Lectura, LectorCoordenadas, Vehiculo } from '../../types/data';
import apiClient from '../../services/api';
import dayjs from 'dayjs';

// Estilos CSS en línea para el contenedor del mapa
const mapContainerStyle = {
  height: '100%',
  width: '100%'
};

// Estilos CSS en línea para los iconos personalizados
const markerIconStyle = {
  background: 'transparent',
  border: 'none'
};

// Crear iconos personalizados para los marcadores
const lectorIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #4a4a4a; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const lecturaGPSIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #ff0000; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4]
});

const lecturaLPRIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #0000ff; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4]
});

// Función para crear un icono de marcador con contador
const createMarkerIcon = (count: number, tipo: 'lector' | 'gps' | 'lpr') => {
  const size = tipo === 'lector' ? 12 : 8;
  const colors = {
    lector: '#4a4a4a',
    gps: '#ff0000',
    lpr: '#0000ff'
  };
  const color = colors[tipo];
  
  // Si hay múltiples lecturas, crear un marcador con contador
  if (count > 1) {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="position: relative;">
          <div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; ${tipo === 'lector' ? 'border: 2px solid white;' : ''} box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>
          <div style="position: absolute; top: -8px; right: -8px; background-color: #ff4d4f; color: white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; box-shadow: 0 0 4px rgba(0,0,0,0.4);">
            ${count}
          </div>
        </div>
      `,
      iconSize: [size + 16, size + 16], // Aumentar tamaño para acomodar el contador
      iconAnchor: [(size + 16)/2, (size + 16)/2]
    });
  }
  
  // Si es una sola lectura, usar el icono normal
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; ${tipo === 'lector' ? 'border: 2px solid white;' : ''} box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2]
  });
};

interface MapPanelProps {
  casoId: number;
}

const MapPanel: React.FC<MapPanelProps> = ({ casoId }) => {
  const [lectores, setLectores] = useState<LectorCoordenadas[]>([]);
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [loading, setLoading] = useState(false);
  const [vehiculosInteres, setVehiculosInteres] = useState<Vehiculo[]>([]);
  const [selectedMatricula, setSelectedMatricula] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    matricula: '',
    fechaInicio: '',
    horaInicio: '',
    fechaFin: '',
    horaFin: '',
    lectorId: '',
    soloRelevantes: false
  });

  // Cargar vehículos de interés
  useEffect(() => {
    const fetchVehiculosInteres = async () => {
      try {
        const response = await apiClient.get<Vehiculo[]>(`/casos/${casoId}/vehiculos`);
        setVehiculosInteres(response.data);
      } catch (error) {
        console.error('Error al obtener vehículos de interés:', error);
      }
    };

    fetchVehiculosInteres();
  }, [casoId]);

  // Función para manejar cambios en los filtros
  const handleFilterChange = useCallback((updates: Partial<typeof filters>) => {
    setFilters(prev => ({ ...prev, ...updates }));
  }, []);

  // Función optimizada para aplicar los filtros
  const handleFiltrar = useCallback(async () => {
    if (!selectedMatricula) {
      setLecturas([]);
      return;
    }

    setLoading(true);
    try {
      // Cargar lectores y lecturas en paralelo
      const [lectoresResponse, lecturasResponse] = await Promise.all([
        apiClient.get<LectorCoordenadas[]>(`/casos/${casoId}/lectores`),
        apiClient.get<Lectura[]>(`/casos/${casoId}/lecturas`, {
          params: {
            matricula: selectedMatricula,
            fecha_inicio: filters.fechaInicio,
            hora_inicio: filters.horaInicio,
            fecha_fin: filters.fechaFin,
            hora_fin: filters.horaFin,
            lector_id: filters.lectorId,
            solo_relevantes: filters.soloRelevantes
          }
        })
      ]);

      const lectoresData = lectoresResponse.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
      const lecturasData = lecturasResponse.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
      
      setLectores(lectoresData);
      setLecturas(lecturasData);
    } catch (error) {
      console.error('Error al filtrar:', error);
    } finally {
      setLoading(false);
    }
  }, [casoId, filters, selectedMatricula]);

  // Función para limpiar los filtros
  const handleLimpiar = useCallback(() => {
    setFilters({
      matricula: '',
      fechaInicio: '',
      horaInicio: '',
      fechaFin: '',
      horaFin: '',
      lectorId: '',
      soloRelevantes: false
    });
    setSelectedMatricula(null);
    setLecturas([]);
  }, []);

  // Cargar datos iniciales de lectores
  useEffect(() => {
    const fetchLectores = async () => {
      try {
        const response = await apiClient.get<LectorCoordenadas[]>(`/casos/${casoId}/lectores`);
        const lectoresData = response.data.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
        setLectores(lectoresData);
      } catch (error) {
        console.error('Error al cargar lectores:', error);
      }
    };

    fetchLectores();
  }, [casoId]);

  // Calcular centro y zoom inicial
  const centroInicial = useMemo(() => {
    if (lectores.length > 0) {
      const validLectores = lectores.filter(l => l.Coordenada_X != null && l.Coordenada_Y != null);
      if (validLectores.length === 0) return [40.416775, -3.703790] as L.LatLngExpression;
      
      const centroY = validLectores.reduce((sum, l) => sum + l.Coordenada_Y!, 0) / validLectores.length;
      const centroX = validLectores.reduce((sum, l) => sum + l.Coordenada_X!, 0) / validLectores.length;
      return [centroY, centroX] as L.LatLngExpression;
    }
    return [40.416775, -3.703790] as L.LatLngExpression;
  }, [lectores]);

  const zoomInicial = lectores.length > 0 ? 13 : 6;

  // Preparar datos para el Select de vehículos
  const vehiculosOptions = useMemo(() => 
    vehiculosInteres.map(v => ({
      value: v.Matricula,
      label: `${v.Matricula}${v.Marca ? ` - ${v.Marca}` : ''}${v.Modelo ? ` ${v.Modelo}` : ''}`
    })), [vehiculosInteres]);

  // Función para agrupar lecturas por lector
  const lecturasPorLector = useMemo(() => {
    const grupos = new Map<string, Lectura[]>();
    lecturas.forEach(lectura => {
      if (lectura.ID_Lector) {
        const lecturas = grupos.get(lectura.ID_Lector) || [];
        lecturas.push(lectura);
        grupos.set(lectura.ID_Lector, lecturas);
      }
    });
    return grupos;
  }, [lecturas]);

  // Función para ordenar lecturas por fecha
  const ordenarLecturasPorFecha = (lecturas: Lectura[]) => {
    return [...lecturas].sort((a, b) => 
      new Date(a.Fecha_y_Hora).getTime() - new Date(b.Fecha_y_Hora).getTime()
    );
  };

  return (
    <Stack gap="md">
      <Paper p="md" withBorder>
        <Title order={2} mb="md">Mapa de Lecturas</Title>
        <Group grow mb="md">
          <Select
            label="Vehículo de Interés"
            placeholder="Seleccionar vehículo..."
            value={selectedMatricula}
            onChange={(value) => {
              setSelectedMatricula(value);
              handleFilterChange({ matricula: value || '' });
            }}
            data={vehiculosOptions}
            searchable
            clearable
          />
        </Group>
        <LecturaFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onFiltrar={handleFiltrar}
          onLimpiar={handleLimpiar}
          loading={loading}
          hideMatricula={true}
        />
      </Paper>

      <Paper p="md" withBorder style={{ height: '600px' }}>
        {lectores.length === 0 ? (
          <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">No hay lectores con coordenadas válidas para mostrar en el mapa.</Text>
          </Box>
        ) : (
          <MapContainer 
            key={`${lectores.length}-${lecturas.length}`}
            center={centroInicial} 
            zoom={zoomInicial} 
            scrollWheelZoom={true} 
            style={mapContainerStyle}
          >
            <style>
              {`
                .leaflet-div-icon {
                  background: transparent !important;
                  border: none !important;
                }
                .custom-div-icon {
                  background: transparent !important;
                  border: none !important;
                }
                .lectura-popup {
                  max-height: 200px;
                  overflow-y: auto;
                }
              `}
            </style>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* Renderizar lectores */}
            {lectores.map((lector) => {
              const lecturasEnLector = lecturasPorLector.get(lector.ID_Lector) || [];
              return (
                <Marker 
                  key={lector.ID_Lector} 
                  position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
                  icon={createMarkerIcon(lecturasEnLector.length, 'lector')}
                >
                  <Popup>
                    <div className="lectura-popup">
                      <b>Lector:</b> {lector.ID_Lector} <br />
                      {lector.Nombre && <><b>Nombre:</b> {lector.Nombre}<br /></>}
                      {lector.Carretera && <><b>Carretera:</b> {lector.Carretera}<br /></>}
                      {lector.Provincia && <><b>Provincia:</b> {lector.Provincia}<br /></>}
                      {lector.Organismo_Regulador && <><b>Organismo:</b> {lector.Organismo_Regulador}<br /></>}
                      <b>Coords:</b> {lector.Coordenada_Y?.toFixed(5)}, {lector.Coordenada_X?.toFixed(5)}<br />
                      {lecturasEnLector.length > 0 && (
                        <>
                          <br />
                          <b>Pasos registrados ({lecturasEnLector.length}):</b><br />
                          {ordenarLecturasPorFecha(lecturasEnLector).map((lectura, idx) => (
                            <div key={lectura.ID_Lectura} style={{ marginTop: '8px', padding: '4px', backgroundColor: idx % 2 === 0 ? '#f5f5f5' : 'transparent' }}>
                              <Badge 
                                color={lectura.Tipo_Fuente === 'GPS' ? 'red' : 'blue'}
                                variant="light"
                                size="sm"
                              >
                                {lectura.Tipo_Fuente}
                              </Badge>
                              <div style={{ marginTop: '2px' }}>
                                <small>
                                  {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')}
                                  {lectura.Velocidad && ` - ${lectura.Velocidad} km/h`}
                                  {lectura.Carril && ` - Carril ${lectura.Carril}`}
                                </small>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
            {/* Renderizar lecturas individuales (GPS/LPR) que no están asociadas a lectores */}
            {lecturas.filter(l => !l.ID_Lector).map((lectura) => (
              <Marker 
                key={lectura.ID_Lectura} 
                position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]}
                icon={createMarkerIcon(1, lectura.Tipo_Fuente.toLowerCase() as 'gps' | 'lpr')}
              >
                <Popup>
                  <b>Matrícula:</b> {lectura.Matricula} <br />
                  <b>Fecha y Hora:</b> {dayjs(lectura.Fecha_y_Hora).format('DD/MM/YYYY HH:mm:ss')} <br />
                  {lectura.Carril && <><b>Carril:</b> {lectura.Carril}<br /></>}
                  {lectura.Velocidad && <><b>Velocidad:</b> {lectura.Velocidad} km/h<br /></>}
                  <b>Tipo:</b> {lectura.Tipo_Fuente}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </Paper>
    </Stack>
  );
};

export default MapPanel; 