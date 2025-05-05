import React, { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import ReactDOMServer from 'react-dom/server';
import { Card, Group, Text, Badge, Tooltip, Button, ActionIcon } from '@mantine/core';
import { IconClock, IconGauge, IconCompass, IconMapPin, IconHome, IconStar, IconFlag, IconUser, IconBuilding, IconBriefcase, IconAlertCircle, IconX, IconChevronUp, IconChevronDown } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../../types/data';
import HeatmapLayer from './HeatmapLayer';

interface GpsMapStandaloneProps {
  lecturas: GpsLectura[];
  capas: GpsCapa[];
  localizaciones: LocalizacionInteres[];
  mapControls: {
    visualizationType: 'standard' | 'satellite' | 'toner';
    showHeatmap: boolean;
    showPoints: boolean;
    optimizePoints: boolean;
  };
  mostrarLocalizaciones: boolean;
  onGuardarLocalizacion: (lectura: GpsLectura) => void;
  playbackLayer?: GpsCapa | null;
  currentPlaybackIndex?: number;
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
const InfoBanner = ({ info, onClose, onEditLocalizacion, isLocalizacion, onNavigate }: {
  info: any;
  onClose: () => void;
  onEditLocalizacion?: () => void;
  isLocalizacion?: boolean;
  onNavigate?: (direction: 'prev' | 'next') => void;
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
        <Group mt="xs" gap="xs">
          {!isLocalizacion && onNavigate && (
            <>
              <Button 
                size="xs" 
                variant="light" 
                color="blue" 
                leftSection={<IconChevronUp size={12} />}
                onClick={() => onNavigate('prev')}
                style={{ flex: 1 }}
              >
                Anterior
              </Button>
              <Button 
                size="xs" 
                variant="light" 
                color="blue" 
                leftSection={<IconChevronDown size={12} />}
                onClick={() => onNavigate('next')}
                style={{ flex: 1 }}
              >
                Siguiente
              </Button>
            </>
          )}
          {isLocalizacion && onEditLocalizacion && (
            <Button 
              size="xs" 
              variant="light" 
              color="blue" 
              fullWidth
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
              leftSection={<IconMapPin size={12} />}
              onClick={info.onGuardarLocalizacion}
            >
              Guardar Localización
            </Button>
          )}
        </Group>
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

// Función para calcular la distancia entre dos puntos usando la fórmula de Haversine
const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Función para calcular el ángulo entre tres puntos
const calculateAngle = (p1: GpsLectura, p2: GpsLectura, p3: GpsLectura) => {
  const lat1 = p1.Coordenada_Y;
  const lon1 = p1.Coordenada_X;
  const lat2 = p2.Coordenada_Y;
  const lon2 = p2.Coordenada_X;
  const lat3 = p3.Coordenada_Y;
  const lon3 = p3.Coordenada_X;

  const angle1 = Math.atan2(lon2 - lon1, lat2 - lat1);
  const angle2 = Math.atan2(lon3 - lon2, lat3 - lat2);
  let angle = Math.abs(angle1 - angle2) * 180 / Math.PI;
  return angle > 180 ? 360 - angle : angle;
};

// Función para decimar puntos GPS
const decimatePoints = (points: GpsLectura[], options = {
  minDistance: 0.05, // km
  maxAngle: 30, // grados
  keepStops: true,
  keepSpeedChanges: true,
  speedThreshold: 10 // km/h
}) => {
  if (points.length <= 2) return points;

  const result: GpsLectura[] = [points[0]]; // Siempre mantener el primer punto
  let lastKeptPoint = points[0];
  let isLinearMovement = false; // Flag para detectar movimiento lineal

  for (let i = 1; i < points.length - 1; i++) {
    const currentPoint = points[i];
    const nextPoint = points[i + 1];
    
    // Calcular distancias
    const distanceToLast = haversineDistance(
      lastKeptPoint.Coordenada_Y,
      lastKeptPoint.Coordenada_X,
      currentPoint.Coordenada_Y,
      currentPoint.Coordenada_X
    );

    // Calcular ángulo con el siguiente punto
    const angle = i > 0 && i < points.length - 1 ? 
      calculateAngle(points[i-1], currentPoint, nextPoint) : 0;

    // Detectar movimiento lineal
    const isMoving = (currentPoint.Velocidad || 0) > 5; // Considerar en movimiento si velocidad > 5 km/h
    const isLinear = angle < options.maxAngle && isMoving;
    
    // Actualizar estado de movimiento lineal
    if (isLinear) {
      isLinearMovement = true;
    } else {
      isLinearMovement = false;
    }

    // Mantener puntos importantes
    const isStop = currentPoint.duracion_parada_min && currentPoint.duracion_parada_min > 0;
    const hasSignificantSpeedChange = Math.abs(
      (currentPoint.Velocidad || 0) - (lastKeptPoint.Velocidad || 0)
    ) > options.speedThreshold;

    // Usar distancia mínima mayor para movimiento lineal
    const effectiveMinDistance = isLinearMovement ? 0.1 : options.minDistance;

    if (
      // Mantener si es una parada
      (options.keepStops && isStop) ||
      // Mantener si hay cambio significativo de velocidad
      (options.keepSpeedChanges && hasSignificantSpeedChange) ||
      // Mantener si la distancia es mayor que el mínimo (ajustado según movimiento)
      distanceToLast > effectiveMinDistance ||
      // Mantener si hay un cambio de dirección significativo
      (i > 0 && i < points.length - 1 && angle > options.maxAngle)
    ) {
      result.push(currentPoint);
      lastKeptPoint = currentPoint;
    }
  }

  // Siempre mantener el último punto
  if (points.length > 1) {
    result.push(points[points.length - 1]);
  }

  return result;
};

const GpsMapStandalone = React.memo(forwardRef<any, GpsMapStandaloneProps>(({
  lecturas,
  capas,
  localizaciones,
  mapControls,
  mostrarLocalizaciones,
  onGuardarLocalizacion,
  playbackLayer,
  currentPlaybackIndex
}, ref): React.ReactElement => {
  const mapRef = useRef<L.Map | null>(null);
  const [infoBanner, setInfoBanner] = useState<{ info: any; isLocalizacion: boolean } | null>(null);

  // Disparar resize al montar
  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);
  }, []);

  // Exponer funciones del mapa
  useImperativeHandle(ref, () => ({
    refrescarMapa: () => {
      window.dispatchEvent(new Event('resize'));
    },
    getMap: () => mapRef.current,
    setView: (lat: number, lng: number, zoom?: number) => {
      if (mapRef.current) {
        mapRef.current.setView([lat, lng], zoom || mapRef.current.getZoom());
      }
    }
  }));

  // Optimizar puntos si está activado
  const optimizedLecturas = useMemo(() => {
    if (!mapControls.optimizePoints || !Array.isArray(lecturas)) return lecturas;
    return decimatePoints(lecturas);
  }, [lecturas, mapControls.optimizePoints]);

  // Obtener todas las lecturas de las capas activas
  const activeLayerLecturas = useMemo(() => {
    if (!Array.isArray(capas)) return [];
    return capas
      .filter(capa => capa.activa)
      .flatMap(capa => capa.lecturas);
  }, [capas]);

  // Combinar lecturas activas con las lecturas actuales
  const allLecturas = useMemo(() => {
    return [...optimizedLecturas, ...activeLayerLecturas];
  }, [optimizedLecturas, activeLayerLecturas]);

  // Solo calcula el centro y zoom inicial una vez
  const primeraLectura = Array.isArray(allLecturas) && allLecturas.length > 0
    ? allLecturas.find(l => typeof l.Coordenada_Y === 'number' && typeof l.Coordenada_X === 'number' && !isNaN(l.Coordenada_Y) && !isNaN(l.Coordenada_X))
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

  // --- Cálculo de puntos para el heatmap ---
  let heatmapPoints: Array<[number, number, number]> = [];
  if (mapControls.showHeatmap && Array.isArray(allLecturas) && allLecturas.length > 0) {
    // Agrupa por coordenada redondeada
    const agrupadas: Record<string, { lat: number, lng: number, tiempo: number }> = {};
    allLecturas.forEach(l => {
      const lat = Number(l.Coordenada_Y?.toFixed(5));
      const lng = Number(l.Coordenada_X?.toFixed(5));
      if (isNaN(lat) || isNaN(lng)) return;
      const key = `${lat},${lng}`;
      // Usa duracion_parada_min si está disponible, si no, asigna 0.1 min como base
      const tiempo = typeof l.duracion_parada_min === 'number' && !isNaN(l.duracion_parada_min) ? l.duracion_parada_min : 0.1;
      if (!agrupadas[key]) {
        agrupadas[key] = { lat, lng, tiempo: 0 };
      }
      agrupadas[key].tiempo += tiempo;
    });
    // Normaliza intensidades
    const tiempos = Object.values(agrupadas).map(p => p.tiempo);
    const maxTiempo = Math.max(...tiempos, 1); // evita división por cero
    heatmapPoints = Object.values(agrupadas).map(p => [p.lat, p.lng, Math.max(0.1, p.tiempo / maxTiempo)]);
  }

  // Filtra puntos válidos para el heatmap (más estricto)
  const validHeatmapPoints = heatmapPoints.filter(
    p =>
      Array.isArray(p) &&
      p.length === 3 &&
      typeof p[0] === 'number' && !isNaN(p[0]) && p[0] >= -90 && p[0] <= 90 &&
      typeof p[1] === 'number' && !isNaN(p[1]) && p[1] >= -180 && p[1] <= 180 &&
      typeof p[2] === 'number' && !isNaN(p[2]) && p[2] > 0
  );

  // Función para navegar entre puntos
  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!infoBanner || infoBanner.isLocalizacion) return;

    const currentIndex = allLecturas.findIndex(
      l => l.ID_Lectura === infoBanner.info.ID_Lectura
    );

    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : allLecturas.length - 1;
    } else {
      newIndex = currentIndex < allLecturas.length - 1 ? currentIndex + 1 : 0;
    }

    const newPoint = allLecturas[newIndex];
    setInfoBanner({ 
      info: { 
        ...newPoint, 
        onGuardarLocalizacion: () => onGuardarLocalizacion(newPoint) 
      }, 
      isLocalizacion: false 
    });

    // Centrar el mapa en el nuevo punto
    if (mapRef.current) {
      mapRef.current.setView(
        [newPoint.Coordenada_Y, newPoint.Coordenada_X],
        mapRef.current.getZoom()
      );
    }
  };

  // Renderizar puntos del recorrido
  const renderRoutePoints = useMemo(() => {
    if (!playbackLayer || currentPlaybackIndex === undefined) return null;
    
    return playbackLayer.lecturas.map((lectura, index) => {
      const isVisited = index <= currentPlaybackIndex;
      return (
        <Marker
          key={`route-point-${index}`}
          position={[lectura.Coordenada_Y, lectura.Coordenada_X]}
          icon={L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="
              background: ${isVisited ? playbackLayer.color : '#adb5bd'};
              width: 8px;
              height: 8px;
              border-radius: 50%;
              border: 2px solid white;
              box-shadow: 0 0 4px rgba(0,0,0,0.2);
              opacity: ${isVisited ? 0.15 : 1};
              transition: opacity 0.2s ease-in-out;
            "></div>`,
            iconSize: [8, 8],
            iconAnchor: [4, 4]
          })}
        />
      );
    });
  }, [playbackLayer, currentPlaybackIndex]);

  // Obtener el punto actual para el reproductor
  const currentPlaybackPoint = useMemo(() => {
    if (!playbackLayer || currentPlaybackIndex === undefined || currentPlaybackIndex < 0) return null;
    return playbackLayer.lecturas[currentPlaybackIndex];
  }, [playbackLayer, currentPlaybackIndex]);

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
        {/* Renderizar puntos del recorrido */}
        {renderRoutePoints}
        {/* Renderizar punto actual del reproductor */}
        {currentPlaybackPoint && playbackLayer && (
          <Marker
            position={[currentPlaybackPoint.Coordenada_Y, currentPlaybackPoint.Coordenada_X]}
            icon={L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 44px; height: 44px; left: -16px; top: -16px; border-radius: 50%; background: ${playbackLayer.color}20; border: 2.5px solid ${playbackLayer.color}40; box-shadow: 0 0 12px ${playbackLayer.color};"></div>
                <div style="background: ${playbackLayer.color}; width: 24px; height: 24px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 12px ${playbackLayer.color}; outline: 3px solid ${playbackLayer.color};"></div>
              </div>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22]
            })}
          />
        )}
        {/* Renderizar heatmap si está activado */}
        {mapControls.showHeatmap && validHeatmapPoints.length > 0 && (
          <HeatmapLayer points={validHeatmapPoints} options={{ radius: 18, blur: 16, maxZoom: 17 } as any} />
        )}
        {/* Renderizar puntos individuales */}
        {mapControls.showPoints && allLecturas.map((lectura, idx) => {
          const capa = capas.find(c => c.activa && c.lecturas.some(l => l.ID_Lectura === lectura.ID_Lectura));
          const color = capa ? capa.color : '#228be6';
          const isSelected = infoBanner && !infoBanner.isLocalizacion && infoBanner.info?.ID_Lectura === lectura.ID_Lectura;
          const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="position: relative; display: flex; align-items: center; justify-content: center;">
              ${isSelected ? `<div style='position: absolute; width: 44px; height: 44px; left: -16px; top: -16px; border-radius: 50%; background: ${color}20; border: 2.5px solid ${color}40; box-shadow: 0 0 12px ${color};'></div>` : ''}
              <div style="background: ${isSelected ? color : color}; width: ${isSelected ? 24 : 12}px; height: ${isSelected ? 24 : 12}px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 12px ${isSelected ? color : 'rgba(0,0,0,0.4)'}; outline: ${isSelected ? '3px solid ' + color : 'none'};"></div>
            </div>`,
            iconSize: [isSelected ? 44 : 12, isSelected ? 44 : 12],
            iconAnchor: [isSelected ? 22 : 6, isSelected ? 22 : 6]
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
        onNavigate={handleNavigate}
      />
    </div>
  );
}));

export default GpsMapStandalone; 