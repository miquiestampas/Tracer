import React, { useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import ReactDOMServer from 'react-dom/server';
import { Card, Group, Text, Badge, Tooltip, Button, ActionIcon } from '@mantine/core';
import { IconClock, IconGauge, IconCompass, IconMapPin, IconHome, IconStar, IconFlag, IconUser, IconBuilding, IconBriefcase, IconAlertCircle, IconX } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../../types/data';

interface GpsMapStandaloneProps {
  lecturas: GpsLectura[];
  capas: GpsCapa[];
  localizaciones: LocalizacionInteres[];
  mapControls: {
    visualizationType: 'standard' | 'satellite' | 'toner';
    showHeatmap: boolean;
    showPoints: boolean;
  };
  mostrarLocalizaciones: boolean;
  onGuardarLocalizacion: (lectura: GpsLectura) => void;
}

const ICONOS = [
  { name: 'home', icon: IconHome },
  { name: 'star', icon: IconStar },
  { name: 'flag', icon: IconFlag },
  { name: 'user', icon: IconUser },
  { name: 'pin', icon: IconMapPin },
  { name: 'building', icon: IconBuilding },
  { name: 'briefcase', icon: IconBriefcase },
  { name: 'alert', icon: IconAlertCircle },
];

// Banner de información
const InfoBanner = ({ info, onClose, onEditLocalizacion, isLocalizacion }: {
  info: any;
  onClose: () => void;
  onEditLocalizacion?: () => void;
  isLocalizacion?: boolean;
}) => {
  if (!info) return null;
  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      zIndex: 1000,
      background: 'white',
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      borderBottom: '2px solid #228be6',
      animation: 'slideDown 0.3s',
      fontFamily: 'inherit',
    }}>
      <Card shadow="sm" padding="md" radius="md" withBorder style={{ width: '100%', boxSizing: 'border-box', position: 'relative' }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
          onClick={onClose}
          aria-label="Cerrar info"
        >
          <IconX size={20} />
        </ActionIcon>
        <Card.Section withBorder inheritPadding py="sm">
          <Group justify="space-between" style={{ minWidth: 0, width: '100%' }}>
            <Text fw={700} size="sm" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isLocalizacion ? 'Localización de Interés' : 'Lectura GPS'}
            </Text>
            <Tooltip label={isLocalizacion ? info.titulo : info.Matricula} withArrow>
              <Badge
                color="blue"
                variant="light"
                size="sm"
                style={{
                  maxWidth: 80,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                  padding: '0 8px',
                }}
              >
                {isLocalizacion ? info.titulo : info.Matricula}
              </Badge>
            </Tooltip>
          </Group>
        </Card.Section>
        <div style={{ width: '100%', marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconClock size={14} style={{ color: 'gray' }} /></span>
            <span style={{ fontSize: 13, color: '#666', wordBreak: 'break-word' }}>{isLocalizacion ? info.fecha_hora : info.Fecha_y_Hora}</span>
          </div>
          {isLocalizacion && info.descripcion && (
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: '#228be6', wordBreak: 'break-word' }}><b>Descripción:</b> {info.descripcion}</span>
            </div>
          )}
          {!isLocalizacion && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconGauge size={14} style={{ color: 'gray' }} /></span>
              <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Velocidad:</b> {typeof info.Velocidad === 'number' && !isNaN(info.Velocidad) ? info.Velocidad.toFixed(1) : '?'} km/h</span>
            </div>
          )}
          {!isLocalizacion && typeof info.duracion_parada_min === 'number' && !isNaN(info.duracion_parada_min) && (
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconClock size={14} style={{ color: 'blue' }} /></span>
              <span style={{ fontSize: 13, color: '#228be6', wordBreak: 'break-word' }}><b>Duración parada:</b> {info.duracion_parada_min.toFixed(1)} min</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ width: 22, display: 'flex', justifyContent: 'center' }}><IconMapPin size={14} style={{ color: 'gray' }} /></span>
            <span style={{ fontSize: 13, wordBreak: 'break-word' }}><b>Coords:</b> {isLocalizacion
              ? `${typeof info.coordenada_y === 'number' && !isNaN(info.coordenada_y) ? info.coordenada_y.toFixed(5) : '?'}, ${typeof info.coordenada_x === 'number' && !isNaN(info.coordenada_x) ? info.coordenada_x.toFixed(5) : '?'}`
              : `${typeof info.Coordenada_Y === 'number' && !isNaN(info.Coordenada_Y) ? info.Coordenada_Y.toFixed(5) : '?'}, ${typeof info.Coordenada_X === 'number' && !isNaN(info.Coordenada_X) ? info.Coordenada_X.toFixed(5) : '?'}`
            }</span>
          </div>
        </div>
        {isLocalizacion && onEditLocalizacion && (
          <Button 
            size="xs" 
            variant="light" 
            color="blue" 
            fullWidth
            mt="xs"
            leftSection={<IconMapPin size={12} />}
            onClick={onEditLocalizacion}
          >
            Editar Localización
          </Button>
        )}
        {!isLocalizacion && (
          <Button 
            size="xs" 
            variant="light" 
            color="blue" 
            fullWidth
            mt="xs"
            leftSection={<IconMapPin size={12} />}
            onClick={info.onGuardarLocalizacion}
          >
            Guardar Localización
          </Button>
        )}
      </Card>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

const GpsMapStandalone: React.FC<GpsMapStandaloneProps> = React.memo(({
  lecturas,
  capas,
  localizaciones,
  mapControls,
  mostrarLocalizaciones,
  onGuardarLocalizacion
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const [infoBanner, setInfoBanner] = useState<{ info: any; isLocalizacion: boolean } | null>(null);

  // Solo calcula el centro y zoom inicial una vez
  const primeraLectura = Array.isArray(lecturas) && lecturas.length > 0
    ? lecturas.find(l => typeof l.Coordenada_Y === 'number' && typeof l.Coordenada_X === 'number' && !isNaN(l.Coordenada_Y) && !isNaN(l.Coordenada_X))
    : null;
  const initialCenter = primeraLectura
    ? [primeraLectura.Coordenada_Y, primeraLectura.Coordenada_X]
    : [40.416775, -3.703790];
  const initialZoom = primeraLectura ? 13 : 10;

  // Selección dinámica de capa
  let tileLayerUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  let tileLayerAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  if (mapControls.visualizationType === 'satellite') {
    tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    tileLayerAttribution = 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
  } else if (mapControls.visualizationType === 'toner') {
    tileLayerUrl = 'https://tiles.stadiamaps.com/tiles/stamen_toner_lite/{z}/{x}/{y}{r}.png';
    tileLayerAttribution = 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under ODbL.';
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={initialCenter as [number, number]}
        zoom={initialZoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef as any}
      >
        <TileLayer
          attribution={tileLayerAttribution}
          url={tileLayerUrl}
        />
        {/* Renderizar puntos individuales */}
        {mapControls.showPoints && lecturas.map((lectura, idx) => {
          const capa = capas.find(c => c.activa && c.lecturas.some(l => l.ID_Lectura === lectura.ID_Lectura));
          const color = capa ? capa.color : '#228be6';
          const isSelected = infoBanner && !infoBanner.isLocalizacion && infoBanner.info?.ID_Lectura === lectura.ID_Lectura;
          const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="
              background: ${isSelected ? '#fff' : color};
              width: ${isSelected ? 28 : 12}px;
              height: ${isSelected ? 28 : 12}px;
              border-radius: 50%;
              border: ${isSelected ? '4px solid ' + color : '2px solid white'};
              box-shadow: 0 0 16px ${isSelected ? color : 'rgba(0,0,0,0.4)'};
              outline: ${isSelected ? '3px solid ' + color + '80' : 'none'};
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.15s cubic-bezier(.4,2,.6,1);
              transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
            "></div>`,
            iconSize: [isSelected ? 28 : 12, isSelected ? 28 : 12],
            iconAnchor: [isSelected ? 14 : 6, isSelected ? 14 : 6]
          });
          return (
            <Marker
              key={lectura.ID_Lectura + '-' + idx}
              position={[lectura.Coordenada_Y, lectura.Coordenada_X]}
              icon={customIcon}
              eventHandlers={{
                click: () => setInfoBanner({ info: { ...lectura, onGuardarLocalizacion: () => onGuardarLocalizacion(lectura) }, isLocalizacion: false })
              }}
            />
          );
        })}
        {/* Renderizar localizaciones de interés */}
        {mostrarLocalizaciones && localizaciones.map((loc, idx) => {
          const Icon = ICONOS.find(i => i.name === loc.icono)?.icon || IconMapPin;
          const isSelected = infoBanner && infoBanner.isLocalizacion && infoBanner.info?.id_lectura === loc.id_lectura;
          const svgIcon = ReactDOMServer.renderToStaticMarkup(
            <div style={{
              background: isSelected ? '#fff' : 'transparent',
              borderRadius: '50%',
              border: isSelected ? `2.5px solid ${loc.color}` : 'none',
              boxShadow: isSelected ? `0 0 16px ${loc.color}` : 'none',
              padding: isSelected ? 2 : 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: isSelected ? 36 : 22,
              height: isSelected ? 36 : 22,
              transition: 'all 0.15s cubic-bezier(.4,2,.6,1)',
              transform: isSelected ? 'scale(1.12)' : 'scale(1)'
            }}>
              {React.createElement(Icon, { size: isSelected ? 28 : 22, color: loc.color, stroke: 2 })}
            </div>
          );
          return (
            <Marker
              key={loc.id_lectura + '-' + idx}
              position={[
                typeof loc.coordenada_y === 'number' && !isNaN(loc.coordenada_y) ? loc.coordenada_y : 0,
                typeof loc.coordenada_x === 'number' && !isNaN(loc.coordenada_x) ? loc.coordenada_x : 0
              ]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="display: flex; flex-direction: column; align-items: center;">
                  <div style="
                    position: relative;
                    width: ${isSelected ? 56 : 40}px;
                    height: ${isSelected ? 56 : 40}px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: ${isSelected ? '#fff' : 'transparent'};
                    border-radius: 50%;
                    border: ${isSelected ? '4px solid ' + loc.color : '2px solid ' + loc.color + '40'};
                    box-shadow: 0 0 20px ${isSelected ? loc.color : 'rgba(0,0,0,0.2)'};
                    transition: all 0.15s cubic-bezier(.4,2,.6,1);
                    transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
                  ">
                    <div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background-color: ${loc.color}20;"></div>
                    <div style="position: relative; color: ${loc.color}; font-size: ${isSelected ? 28 : 22}px; width: ${isSelected ? 36 : 22}px; height: ${isSelected ? 36 : 22}px; display: flex; align-items: center; justify-content: center;">
                      ${svgIcon}
                    </div>
                  </div>
                  ${loc.titulo ? `<span style='background: white; color: black; font-size: 11px; border-radius: 3px; padding: 0 2px; margin-top: 2px;'>${loc.titulo}</span>` : ''}
                </div>`
              })}
              eventHandlers={{
                click: () => setInfoBanner({ info: loc, isLocalizacion: true })
              }}
            />
          );
        })}
      </MapContainer>
      <InfoBanner
        info={infoBanner?.info}
        isLocalizacion={infoBanner?.isLocalizacion}
        onClose={() => setInfoBanner(null)}
        onEditLocalizacion={infoBanner?.isLocalizacion ? () => onGuardarLocalizacion(infoBanner.info) : undefined}
      />
    </div>
  );
});

export default GpsMapStandalone; 