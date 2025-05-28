import React, { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef, useCallback, memo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import ReactDOMServer from 'react-dom/server';
import { Card, Group, Text, Badge, Tooltip, Button, ActionIcon } from '@mantine/core';
import { IconClock, IconGauge, IconCompass, IconMapPin, IconHome, IconStar, IconFlag, IconUser, IconBuilding, IconBriefcase, IconAlertCircle, IconX, IconChevronLeft, IconChevronRight, IconDownload } from '@tabler/icons-react';
import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../../types/data';
import HeatmapLayer from './HeatmapLayer';
import MarkerClusterGroup from 'react-leaflet-markercluster';
import 'react-leaflet-markercluster/dist/styles.min.css';
import { debounce } from 'lodash';
import { gpsCache } from '../../services/gpsCache';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

interface GpsMapStandaloneProps {
  lecturas: GpsLectura[];
  capas: GpsCapa[];
  localizaciones: LocalizacionInteres[];
  mapControls: {
    visualizationType: 'standard' | 'satellite' | 'toner';
    showHeatmap: boolean;
    showPoints: boolean;
    optimizePoints: boolean;
    enableClustering: boolean;
  };
  mostrarLocalizaciones: boolean;
  onGuardarLocalizacion: (lectura: GpsLectura) => void;
  playbackLayer?: GpsCapa | null;
  currentPlaybackIndex?: number;
  puntoSeleccionado?: GpsLectura | null;
  heatmapMultiplier?: number;
}

interface GpsMapStandalonePropsWithFullscreen extends GpsMapStandaloneProps {
  fullscreenMap?: boolean;
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
      left: 0,
      bottom: 0,
      width: '100%',
      zIndex: 1000,
      background: 'rgba(60,60,60,0.65)',
      boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
      borderTop: '2px solid #228be6',
      animation: 'slideUp 0.3s',
      fontFamily: 'inherit',
      color: 'white',
      padding: 0,
      backdropFilter: 'blur(4px)'
    }}>
      <Card shadow="sm" padding="md" radius="md" withBorder style={{ width: '100%', boxSizing: 'border-box', position: 'relative', background: 'transparent', border: 'none', color: 'white', boxShadow: 'none' }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, color: 'white' }}
          onClick={onClose}
          aria-label="Cerrar info"
          size="sm"
        >
          <IconX size={18} />
        </ActionIcon>
        <Group justify="space-between" align="center" style={{ minWidth: 0, width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <Text fw={700} size="lg" style={{ color: 'white', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 18 }}>
              {isLocalizacion ? info.titulo : info.Matricula}
            </Text>
            <div style={{ marginTop: 2, fontSize: 16, fontWeight: 500, color: '#fff' }}>
              {(() => {
                const raw = isLocalizacion ? info.fecha_hora : info.Fecha_y_Hora;
                if (!raw) return null;
                const [date, time] = raw.split('T');
                return date && time ? `${date} - ${time.slice(0,8)}` : raw;
              })()}
            </div>
            <div style={{ marginTop: 4 }}>
              {!isLocalizacion && (
                <span style={{ marginLeft: 16, fontSize: 13, color: '#eee' }}><b>Velocidad:</b> {typeof info.Velocidad === 'number' && !isNaN(info.Velocidad) ? info.Velocidad.toFixed(1) : '?'} km/h</span>
              )}
              {!isLocalizacion && typeof info.duracion_parada_min === 'number' && !isNaN(info.duracion_parada_min) && info.duracion_parada_min >= 0.33 && (
                <span style={{ marginLeft: 16, fontSize: 13, color: '#ffd700' }}><b>Duración parada:</b> {info.duracion_parada_min.toFixed(1)} min</span>
              )}
              <span style={{ marginLeft: 16, fontSize: 13, color: '#eee' }}><b>Coords:</b> {isLocalizacion
                ? `${typeof info.coordenada_y === 'number' && !isNaN(info.coordenada_y) ? info.coordenada_y.toFixed(5) : '?'}, ${typeof info.coordenada_x === 'number' && !isNaN(info.coordenada_x) ? info.coordenada_x.toFixed(5) : '?'}`
                : `${typeof info.Coordenada_Y === 'number' && !isNaN(info.Coordenada_Y) ? info.Coordenada_Y.toFixed(5) : '?'}, ${typeof info.Coordenada_X === 'number' && !isNaN(info.Coordenada_X) ? info.Coordenada_X.toFixed(5) : '?'}`
              }</span>
            </div>
            {isLocalizacion && info.descripcion && (
              <div style={{ marginTop: 4 }}>
                <span style={{ fontSize: 13, color: '#ffd700', wordBreak: 'break-word' }}><b>Descripción:</b> {info.descripcion}</span>
              </div>
            )}
          </div>
          <Group gap={8} style={{ marginLeft: 16 }}>
            {onNavigate && !isLocalizacion && (
              <>
                <ActionIcon size="md" variant="filled" color="white" style={{ background: 'white', color: '#228be6' }} onClick={() => onNavigate('prev')}><IconChevronLeft size={20} /></ActionIcon>
                <ActionIcon size="md" variant="filled" color="white" style={{ background: 'white', color: '#228be6' }} onClick={() => onNavigate('next')}><IconChevronRight size={20} /></ActionIcon>
              </>
            )}
            {isLocalizacion && onEditLocalizacion && (
              <ActionIcon size="md" variant="filled" color="white" style={{ background: 'white', color: '#228be6' }} onClick={onEditLocalizacion}><IconMapPin size={20} /></ActionIcon>
            )}
            {!isLocalizacion && (
              <ActionIcon size="md" variant="filled" color="white" style={{ background: 'white', color: '#228be6' }} onClick={info.onGuardarLocalizacion}><IconMapPin size={20} /></ActionIcon>
            )}
          </Group>
        </Group>
      </Card>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
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

// Extender el tipo GpsLectura para incluir clusterSize
interface GpsLecturaWithCluster extends GpsLectura {
  clusterSize?: number;
}

// Función para agrupar puntos cercanos
const clusterPoints = (points: GpsLectura[], maxDistance: number = 0.0001) => {
  const clusters: GpsLectura[][] = [];
  const processed = new Set<number>();

  points.forEach((point, i) => {
    if (processed.has(i)) return;

    const cluster = [point];
    processed.add(i);

    points.forEach((otherPoint, j) => {
      if (i === j || processed.has(j)) return;

      const distance = haversineDistance(
        point.Coordenada_Y,
        point.Coordenada_X,
        otherPoint.Coordenada_Y,
        otherPoint.Coordenada_X
      );

      if (distance < maxDistance) {
        cluster.push(otherPoint);
        processed.add(j);
      }
    });

    clusters.push(cluster);
  });

  return clusters;
};

// Función para calcular el punto central de un cluster
const getClusterCenter = (cluster: GpsLectura[]): GpsLecturaWithCluster => {
  const sumLat = cluster.reduce((sum, p) => sum + p.Coordenada_Y, 0);
  const sumLng = cluster.reduce((sum, p) => sum + p.Coordenada_X, 0);
  return {
    ...cluster[0],
    Coordenada_Y: sumLat / cluster.length,
    Coordenada_X: sumLng / cluster.length,
    clusterSize: cluster.length
  };
};

// Utility functions for KML and GPX export
const generateKML = (lecturas: GpsLectura[], nombre: string) => {
  const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${nombre}</name>
    <Style id="track">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>${nombre}</name>
      <styleUrl>#track</styleUrl>
      <LineString>
        <coordinates>`;

  const coordinates = lecturas
    .filter(l => typeof l.Coordenada_X === 'number' && typeof l.Coordenada_Y === 'number' && !isNaN(l.Coordenada_X) && !isNaN(l.Coordenada_Y))
    .map(l => `${l.Coordenada_X},${l.Coordenada_Y},0`)
    .join('\n');

  const kmlFooter = `</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  return kmlHeader + coordinates + kmlFooter;
};

const generateGPX = (lecturas: GpsLectura[], nombre: string) => {
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LPR Tracer GPS Export"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${nombre}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${nombre}</name>
    <trkseg>`;

  const trackpoints = lecturas
    .filter(l => typeof l.Coordenada_X === 'number' && typeof l.Coordenada_Y === 'number' && !isNaN(l.Coordenada_X) && !isNaN(l.Coordenada_Y))
    .map(l => `    <trkpt lat="${l.Coordenada_Y}" lon="${l.Coordenada_X}">
      <time>${l.Fecha_y_Hora}</time>
      ${l.Velocidad ? `<speed>${l.Velocidad}</speed>` : ''}
    </trkpt>`)
    .join('\n');

  const gpxFooter = `
    </trkseg>
  </trk>
</gpx>`;

  return gpxHeader + trackpoints + gpxFooter;
};

const downloadFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Componente auxiliar para forzar el resize del mapa
const MapAutoResize = () => {
  const map = useMap();
  useEffect(() => {
    // Forzar resize al montar
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      map.invalidateSize();
    }, 200);

    // Forzar resize cuando cambie el tamaño del contenedor
    const container = map.getContainer();
    let observer: ResizeObserver | null = null;
    if (container && 'ResizeObserver' in window) {
      observer = new ResizeObserver(() => {
        map.invalidateSize();
      });
      observer.observe(container);
    }
    return () => {
      if (observer) observer.disconnect();
    };
  }, [map]);
  return null;
};

// Crear el worker
const worker = new Worker(new URL('../../workers/gpsWorker.ts', import.meta.url));

const GpsMapStandalone = React.memo(forwardRef<L.Map, GpsMapStandalonePropsWithFullscreen>(({
  lecturas,
  capas,
  localizaciones,
  mapControls,
  mostrarLocalizaciones,
  onGuardarLocalizacion,
  playbackLayer,
  currentPlaybackIndex,
  fullscreenMap,
  puntoSeleccionado,
  heatmapMultiplier = 1.65
}, ref): React.ReactElement => {
  const internalMapRef = useRef<L.Map | null>(null);
  const [selectedInfo, setSelectedInfo] = useState<any | null>(null);
  const [optimizedLecturas, setOptimizedLecturas] = useState<GpsLectura[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [animatedPosition, setAnimatedPosition] = useState<[number, number] | null>(null);

  // Memoizar el centro inicial
  const initialCenter: L.LatLngTuple = useMemo(() => {
    const primeraLecturaConCoordenadas = 
      Array.isArray(lecturas) && lecturas.length > 0
        ? lecturas.find(l => typeof l.Coordenada_Y === 'number' && typeof l.Coordenada_X === 'number' && !isNaN(l.Coordenada_Y) && !isNaN(l.Coordenada_X))
        : null;
    return primeraLecturaConCoordenadas
      ? [primeraLecturaConCoordenadas.Coordenada_Y, primeraLecturaConCoordenadas.Coordenada_X]
      : [40.416775, -3.703790];
  }, [lecturas]);

  // Memoizar el zoom inicial
  const initialZoom: number = useMemo(() => {
    const primeraLecturaConCoordenadas = 
      Array.isArray(lecturas) && lecturas.length > 0
        ? lecturas.find(l => typeof l.Coordenada_Y === 'number' && typeof l.Coordenada_X === 'number' && !isNaN(l.Coordenada_Y) && !isNaN(l.Coordenada_X))
        : null;
    return primeraLecturaConCoordenadas ? 13 : 10;
  }, [lecturas]);

  // Optimizar puntos usando el worker
  useEffect(() => {
    if (!mapControls.optimizePoints || !Array.isArray(lecturas) || lecturas.length === 0) {
      setOptimizedLecturas(lecturas);
      return;
    }

    setIsOptimizing(true);
    worker.postMessage({
      type: 'decimate',
      data: {
        points: lecturas,
        options: {
          minDistance: 0.05,
          maxAngle: 30,
          keepStops: true,
          keepSpeedChanges: true,
          speedThreshold: 10
        }
      }
    });

    worker.onmessage = (e) => {
      if (e.data.type === 'decimate') {
        setOptimizedLecturas(e.data.data);
        setIsOptimizing(false);
      }
    };
  }, [lecturas, mapControls.optimizePoints]);

  // Función para calcular el tiempo entre dos lecturas en minutos
  const calcularTiempoEntreLecturas = (lectura1: GpsLectura, lectura2: GpsLectura): number => {
    const tiempo1 = new Date(lectura1.Fecha_y_Hora).getTime();
    const tiempo2 = new Date(lectura2.Fecha_y_Hora).getTime();
    return Math.abs(tiempo2 - tiempo1) / (1000 * 60); // Convertir a minutos
  };

  // Función para determinar si dos puntos están muy cerca
  const puntosCercanos = (lat1: number, lon1: number, lat2: number, lon2: number, maxDistancia: number = 0.0001): boolean => {
    return haversineDistance(lat1, lon1, lat2, lon2) < maxDistancia;
  };

  // Memoizar los puntos del heatmap
  const heatmapPoints = useMemo(() => {
    if (!mapControls.showHeatmap || !optimizedLecturas.length) return [] as [number, number, number][];
    
    const points = new Map<string, number>();
    const zonasParada = new Map<string, number>();

    // Primera pasada: identificar zonas de parada
    for (let i = 0; i < optimizedLecturas.length - 1; i++) {
      const lectura = optimizedLecturas[i];
      const siguienteLectura = optimizedLecturas[i + 1];
      
      const tiempoEntreLecturas = calcularTiempoEntreLecturas(lectura, siguienteLectura);
      if (tiempoEntreLecturas > 1 && puntosCercanos(
        lectura.Coordenada_Y,
        lectura.Coordenada_X,
        siguienteLectura.Coordenada_Y,
        siguienteLectura.Coordenada_X
      )) {
        const key = `${lectura.Coordenada_Y.toFixed(5)},${lectura.Coordenada_X.toFixed(5)}`;
        zonasParada.set(key, (zonasParada.get(key) || 0) + tiempoEntreLecturas);
      }
    }

    // Segunda pasada: asignar pesos
    optimizedLecturas.forEach((lectura, index) => {
      const key = `${lectura.Coordenada_Y.toFixed(5)},${lectura.Coordenada_X.toFixed(5)}`;
      
      // Peso base para el punto (muy bajo)
      let peso = 0.02;

      // Si es una zona de parada, añadir el tiempo de parada
      if (zonasParada.has(key)) {
        const tiempoParada = zonasParada.get(key)!;
        peso += Math.log(tiempoParada + 1) * 0.7;
      }

      // Si hay duración de parada explícita, usarla
      if (lectura.duracion_parada_min && lectura.duracion_parada_min > 0) {
        peso += Math.log(lectura.duracion_parada_min + 1) * 0.7;
      }

      points.set(key, (points.get(key) || 0) + peso);
    });
    
    return Array.from(points.entries()).map(([key, weight]) => {
      const [lat, lng] = key.split(',').map(Number);
      return [lat, lng, weight * heatmapMultiplier] as [number, number, number];
    });
  }, [optimizedLecturas, mapControls.showHeatmap, heatmapMultiplier]);

  // Debounce para eventos del mapa
  const debouncedZoom = useCallback(
    debounce((zoom: number) => {
      // Actualizar estado o realizar cálculos basados en el zoom
      console.log('Zoom level:', zoom);
    }, 150),
    []
  );

  // Limpiar recursos al desmontar
  useEffect(() => {
    return () => {
      if (internalMapRef.current) {
        internalMapRef.current.eachLayer(layer => {
          if (layer instanceof L.Marker) {
            layer.remove();
          }
        });
      }
    };
  }, []);

  // Exponer funciones del mapa
  useImperativeHandle(ref, () => internalMapRef.current!, [internalMapRef.current]);

  // Obtener todas las lecturas de las capas activas
  const activeLayerLecturas = useMemo(() => {
    if (!Array.isArray(capas)) return [];
    return capas
      .filter(capa => capa.activa)
      .flatMap(capa => {
        if (mapControls.optimizePoints) {
          const decimatedPoints = decimatePoints(capa.lecturas);
          const clusters = clusterPoints(decimatedPoints);
          return clusters.map(getClusterCenter);
        }
        return capa.lecturas;
      }) as GpsLecturaWithCluster[];
  }, [capas, mapControls.optimizePoints]);

  // Combinar lecturas activas con las lecturas actuales
  const allLecturas = useMemo(() => {
    return [...optimizedLecturas, ...activeLayerLecturas] as GpsLecturaWithCluster[];
  }, [optimizedLecturas, activeLayerLecturas]);

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

  // Función para navegar entre puntos
  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!selectedInfo || selectedInfo.isLocalizacion) return;

    const currentIndex = allLecturas.findIndex(
      l => l.ID_Lectura === selectedInfo.info.ID_Lectura
    );

    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : allLecturas.length - 1;
    } else {
      newIndex = currentIndex < allLecturas.length - 1 ? currentIndex + 1 : 0;
    }

    const newPoint = allLecturas[newIndex];
    setSelectedInfo({ 
      info: { 
        ...newPoint, 
        onGuardarLocalizacion: () => onGuardarLocalizacion(newPoint) 
      }, 
      isLocalizacion: false 
    });

    // Centrar el mapa en el nuevo punto
    if (internalMapRef.current) {
      internalMapRef.current.setView(
        [newPoint.Coordenada_Y, newPoint.Coordenada_X],
        internalMapRef.current.getZoom()
      );
    }
  };

  // Efecto para animar la transición del marcador del reproductor
  useEffect(() => {
    if (!playbackLayer || currentPlaybackIndex == null || currentPlaybackIndex < 0) return;
    const current = playbackLayer.lecturas[currentPlaybackIndex];
    if (!current) return;

    // Si es el primer punto, ponerlo directamente
    if (animatedPosition == null) {
      setAnimatedPosition([current.Coordenada_Y, current.Coordenada_X]);
      return;
    }

    const [startLat, startLng] = animatedPosition;
    const endLat = current.Coordenada_Y;
    const endLng = current.Coordenada_X;
    const duration = 500; // ms
    const startTime = performance.now();

    function animate(now) {
      const t = Math.min((now - startTime) / duration, 1);
      const lat = startLat + (endLat - startLat) * t;
      const lng = startLng + (endLng - startLng) * t;
      setAnimatedPosition([lat, lng]);
      if (t < 1) {
        requestAnimationFrame(animate);
      }
    }
    requestAnimationFrame(animate);
  // eslint-disable-next-line
  }, [currentPlaybackIndex, playbackLayer]);

  // Resetear la posición animada si cambia la capa de reproducción o se reinicia
  useEffect(() => {
    if (!playbackLayer || currentPlaybackIndex == null || currentPlaybackIndex < 0) {
      setAnimatedPosition(null);
      return;
    }
    const current = playbackLayer.lecturas[currentPlaybackIndex];
    if (current) {
      setAnimatedPosition([current.Coordenada_Y, current.Coordenada_X]);
    }
  }, [playbackLayer]);

  // Componente interno para el clustering de marcadores
  const ClusteredMarkersInternal = () => {
    const map = useMap();
    
    useEffect(() => {
      if (!map) return;

      const markers = optimizedLecturas.map(lectura => {
        const marker = L.marker([lectura.Coordenada_Y, lectura.Coordenada_X], {
          icon: L.divIcon({
            className: `custom-marker ${selectedInfo && !selectedInfo.isLocalizacion && selectedInfo.info?.ID_Lectura === lectura.ID_Lectura ? 'selected' : ''}`,
            html: `
              <div style="
                background-color: #228be6;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 4px rgba(0,0,0,0.3);
                transform: translate(-50%, -50%);
              "></div>
            `,
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          })
        });

        marker.on('click', () => {
          setSelectedInfo({ 
            info: { 
              ...lectura, 
              onGuardarLocalizacion: () => onGuardarLocalizacion(lectura) 
            }, 
            isLocalizacion: false 
          });
        });

        if (lectura.clusterSize && lectura.clusterSize > 1) {
          marker.bindTooltip(lectura.clusterSize.toString());
        }

        return marker;
      });

      // Si el clustering está desactivado, añadir los marcadores directamente al mapa
      if (!mapControls.enableClustering) {
        markers.forEach(marker => map.addLayer(marker));
        return () => {
          markers.forEach(marker => map.removeLayer(marker));
        };
      }

      // Si el clustering está activado, usar MarkerClusterGroup
      const clusterGroup = (L as any).markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: true,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        animate: true
      });

      clusterGroup.addLayers(markers);
      map.addLayer(clusterGroup);

      return () => {
        if (mapControls.enableClustering) {
          map.removeLayer(clusterGroup);
        } else {
          markers.forEach(marker => map.removeLayer(marker));
        }
      };
    }, [map, optimizedLecturas, selectedInfo, onGuardarLocalizacion, mapControls.enableClustering]);

    return null;
  };

  // Componente interno para renderizar las capas activas
  const ActiveLayersInternal = () => {
    const map = useMap();
    
    useEffect(() => {
      if (!map || !Array.isArray(capas)) return;

      const layers: L.Layer[] = [];

      capas.filter(capa => capa.activa).forEach(capa => {
        // Crear polilínea para la capa
        const points = capa.lecturas
          .filter(l => typeof l.Coordenada_Y === 'number' && typeof l.Coordenada_X === 'number' && !isNaN(l.Coordenada_Y) && !isNaN(l.Coordenada_X))
          .map(l => [l.Coordenada_Y, l.Coordenada_X] as [number, number]);

        if (points.length > 0) {
          const polyline = L.polyline(points, {
            color: capa.color || '#228be6',
            weight: 3,
            opacity: 0.7
          });

          // Añadir marcadores para los puntos
          const markers = capa.lecturas.map(lectura => {
            const marker = L.marker([lectura.Coordenada_Y, lectura.Coordenada_X], {
              icon: L.divIcon({
                className: 'custom-marker',
                html: `
                  <div style="
                    background-color: ${capa.color || '#228be6'};
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    border: 2px solid white;
                    box-shadow: 0 0 4px rgba(0,0,0,0.3);
                    transform: translate(-50%, -50%);
                  "></div>
                `,
                iconSize: [8, 8],
                iconAnchor: [4, 4],
              })
            });

            marker.on('click', () => {
              setSelectedInfo({ 
                info: { 
                  ...lectura, 
                  onGuardarLocalizacion: () => onGuardarLocalizacion(lectura) 
                }, 
                isLocalizacion: false 
              });
            });

            return marker;
          });

          layers.push(polyline);
          layers.push(...markers);
        }
      });

      // Añadir todas las capas al mapa
      layers.forEach(layer => map.addLayer(layer));

      return () => {
        layers.forEach(layer => map.removeLayer(layer));
      };
    }, [map, capas, onGuardarLocalizacion]);

    return null;
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
        ref={internalMapRef as any}
        whenReady={() => {
          if (internalMapRef.current) {
            internalMapRef.current.invalidateSize();
          }
        }}
      >
        <TileLayer
          url={tileLayerUrl}
          attribution={tileLayerAttribution}
        />
        <MapAutoResize />
        {mapControls.showPoints && <ClusteredMarkersInternal />}
        {mapControls.showPoints && <ActiveLayersInternal />}
        {mapControls.showHeatmap && (
          <HeatmapLayer
            points={heatmapPoints}
            options={{ radius: 15, blur: 10, maxZoom: 18 } as any}
          />
        )}
        {playbackLayer && currentPlaybackIndex != null && currentPlaybackIndex >= 0 && animatedPosition && (
          <>
            {/* Polilínea del recorrido hasta el punto actual */}
            <Polyline
              positions={playbackLayer.lecturas.slice(0, currentPlaybackIndex + 1).map(l => [l.Coordenada_Y, l.Coordenada_X])}
              pathOptions={{ color: playbackLayer.color || '#228be6', weight: 4, opacity: 0.85 }}
            />
            {/* Punto activo destacado */}
            <Marker
              position={animatedPosition}
              icon={L.divIcon({
                className: 'playback-marker',
                html: `
                  <div style="
                    background-color: ${playbackLayer.color || '#228be6'};
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    border: 4px solid white;
                    box-shadow: 0 0 12px rgba(0,0,0,0.4);
                    transform: translate(-50%, -50%);
                  "></div>
                `,
                iconSize: [22, 22],
                iconAnchor: [11, 11],
              })}
            />
          </>
        )}
      </MapContainer>
      {selectedInfo && (
        <InfoBanner
          info={selectedInfo.info}
          onClose={() => setSelectedInfo(null)}
          onEditLocalizacion={selectedInfo.isLocalizacion ? () => onGuardarLocalizacion(selectedInfo.info) : undefined}
          isLocalizacion={selectedInfo.isLocalizacion}
          onNavigate={!selectedInfo.isLocalizacion ? handleNavigate : undefined}
        />
      )}
    </div>
  );
}));

export default GpsMapStandalone; 