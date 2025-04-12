import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { Lectura } from '../../types/data';
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
  lecturas: Lectura[] | undefined; // Permitir undefined
}

const CasoMap: React.FC<CasoMapProps> = ({ lecturas }) => {

  // **Añadir comprobación inicial para lecturas**
  if (!Array.isArray(lecturas)) {
    // Si lecturas no es un array, no intentar renderizar el mapa o acceder a .length
    // Podríamos mostrar un loader aquí si supiéramos el estado de carga, 
    // pero por ahora, mostraremos un mensaje o nada.
    console.log('CasoMap re-renderizando, pero lecturas no es un array válido.');
    return (
        <Box style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">Esperando datos de lecturas para el mapa...</Text>
        </Box>
    ); 
  }

  // Si llegamos aquí, lecturas es un array (puede ser vacío)
  console.log('CasoMap re-renderizando. Número de lecturas recibidas:', lecturas.length);

  // Filtrar lecturas que tengan coordenadas válidas
  const lecturasConCoordenadas = lecturas.filter(
    (l) => l.Coordenada_Y != null && l.Coordenada_X != null && isFinite(l.Coordenada_Y) && isFinite(l.Coordenada_X)
  );

  console.log('Lecturas con coordenadas válidas para el mapa:', lecturasConCoordenadas.length);

  // Calcular centro inicial y zoom
  const centroInicial: L.LatLngExpression = 
    lecturasConCoordenadas.length > 0 
      ? [lecturasConCoordenadas[0].Coordenada_Y!, lecturasConCoordenadas[0].Coordenada_X!] 
      : [40.416775, -3.703790]; 
  
  const zoomInicial = lecturasConCoordenadas.length > 0 ? 13 : 6;

  // Si no hay lecturas CON COORDENADAS, mostrar un mensaje en lugar del mapa vacío
  if (lecturasConCoordenadas.length === 0) {
     return (
        <Box style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed">No hay lecturas con coordenadas válidas para mostrar en el mapa.</Text>
        </Box>
    ); 
  }

  return (
    <MapContainer 
      key={lecturasConCoordenadas.length}
      center={centroInicial} 
      zoom={zoomInicial} 
      scrollWheelZoom={true} 
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {lecturasConCoordenadas.map((lectura) => (
        <Marker 
          key={lectura.ID_Lectura} 
          position={[lectura.Coordenada_Y!, lectura.Coordenada_X!]} // Latitud, Longitud
        >
          <Popup>
            <b>Matrícula:</b> {lectura.Matricula} <br />
            <b>Fecha/Hora:</b> {new Date(lectura.Fecha_y_Hora).toLocaleString()} <br />
            {lectura.ID_Lector && <><b>Lector:</b> {lectura.ID_Lector}<br /></>}
            {lectura.Velocidad != null && <><b>Velocidad:</b> {lectura.Velocidad.toFixed(1)} km/h<br /></>}
            <b>Fuente:</b> {lectura.Tipo_Fuente}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default CasoMap; 