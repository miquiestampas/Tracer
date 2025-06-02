import React, { useState, useEffect } from 'react';
import { Paper, Title, Box, Loader, Alert } from '@mantine/core';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getLectoresParaMapa } from '../../services/lectoresApi';
import type { LectorCoordenadas } from '../../types/data';

// Configuración de iconos de Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

export function ReadersMap() {
  const [lectores, setLectores] = useState<LectorCoordenadas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLectores = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLectoresParaMapa();
        setLectores(data);
      } catch (err) {
        setError('Error al cargar los lectores para el mapa.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLectores();
  }, []);

  // Calcular centro y zoom inicial
  const centroInicial = lectores.length > 0
    ? [lectores[0].Coordenada_Y!, lectores[0].Coordenada_X!]
    : [40.416775, -3.703790];
  
  const zoomInicial = lectores.length > 0 ? 13 : 6;

  if (loading) {
    return (
      <Paper shadow="sm" p="md" withBorder style={{ height: '640px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size="lg" />
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper shadow="sm" p="md" withBorder style={{ height: '640px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Alert color="red" title="Error">{error}</Alert>
      </Paper>
    );
  }

  return (
    <Paper shadow="sm" p="md" withBorder>
      <Title order={3} mb="md">Mapa de Lectores</Title>
      <Box style={{ height: '640px', width: '100%', position: 'relative' }}>
        <MapContainer
          center={centroInicial as L.LatLngExpression}
          zoom={zoomInicial}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          {lectores.map((lector) => (
            <Marker
              key={lector.ID_Lector}
              position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `
                  <div style="
                    background-color: #3388ff;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    display: inline-block;
                    border: 2px solid white;
                    box-shadow: 0 0 4px rgba(0,0,0,0.4);
                  "></div>
                `,
                iconSize: [12, 12],
                iconAnchor: [6, 6]
              })}
            />
          ))}
        </MapContainer>
      </Box>
    </Paper>
  );
} 