import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { LectorCoordenadas } from '../../types/data';
import L from 'leaflet'; // Importar L para iconos personalizados si es necesario
import { Box, Text } from '@mantine/core'; // Importar para mostrar mensaje

// Opcional: Arreglo para el icono por defecto si no se carga bien (problema común con Webpack/Vite)
// import iconUrl from 'leaflet/dist/images/marker-icon.png';
// import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
// import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// delete L.Icon.Default.prototype._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: iconRetinaUrl,
//   iconUrl: iconUrl,
//   shadowUrl: shadowUrl,
// });

interface CasoMapProps {
  lectores: LectorCoordenadas[] | undefined;
}

const CasoMap: React.FC<CasoMapProps> = ({ lectores }) => {

  if (!Array.isArray(lectores)) {
    console.log('CasoMap re-renderizando, pero lectores no es un array válido.');
    return (
        <Box style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">Esperando datos de lectores para el mapa...</Text>
        </Box>
    ); 
  }

  console.log('CasoMap re-renderizando. Número de lectores recibidos:', lectores.length);

  if (lectores.length === 0) {
     return (
        <Box style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">No hay lectores con coordenadas válidas para mostrar en el mapa.</Text>
        </Box>
    ); 
  }
  
  const centroInicial: L.LatLngExpression = 
    lectores.length > 0 
      ? [lectores[0].Coordenada_Y!, lectores[0].Coordenada_X!] 
      : [40.416775, -3.703790];
  
  const zoomInicial = lectores.length > 0 ? 13 : 6;

  return (
    <MapContainer 
      key={lectores.length}
      center={centroInicial} 
      zoom={zoomInicial} 
      scrollWheelZoom={true} 
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {lectores.map((lector) => (
        <Marker 
          key={lector.ID_Lector} 
          position={[lector.Coordenada_Y!, lector.Coordenada_X!]}
        >
          <Popup>
            <b>Lector:</b> {lector.ID_Lector} <br />
            {lector.Nombre && <><b>Nombre:</b> {lector.Nombre}<br /></>}
            {lector.Carretera && <><b>Carretera:</b> {lector.Carretera}<br /></>}
            {lector.Provincia && <><b>Provincia:</b> {lector.Provincia}<br /></>}
            {lector.Organismo_Regulador && <><b>Organismo:</b> {lector.Organismo_Regulador}<br /></>}
            Coords: {lector.Coordenada_Y?.toFixed(5)}, {lector.Coordenada_X?.toFixed(5)}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default CasoMap; 