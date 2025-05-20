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

// Función para agrupar puntos cercanos
const clusterPoints = (points: any[], maxDistance: number = 0.0001) => {
  const clusters: any[][] = [];
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
const getClusterCenter = (cluster: any[]) => {
  const sumLat = cluster.reduce((sum, p) => sum + p.Coordenada_Y, 0);
  const sumLng = cluster.reduce((sum, p) => sum + p.Coordenada_X, 0);
  return {
    ...cluster[0],
    Coordenada_Y: sumLat / cluster.length,
    Coordenada_X: sumLng / cluster.length,
    clusterSize: cluster.length
  };
};

// Función para decimar puntos GPS
const decimatePoints = (points: any[], options = {
  minDistance: 0.05, // km
  maxAngle: 30, // grados
  keepStops: true,
  keepSpeedChanges: true,
  speedThreshold: 10 // km/h
}) => {
  if (points.length <= 2) return points;

  const result: any[] = [points[0]];
  let lastKeptPoint = points[0];
  let isLinearMovement = false;

  for (let i = 1; i < points.length - 1; i++) {
    const currentPoint = points[i];
    const nextPoint = points[i + 1];
    
    const distanceToLast = haversineDistance(
      lastKeptPoint.Coordenada_Y,
      lastKeptPoint.Coordenada_X,
      currentPoint.Coordenada_Y,
      currentPoint.Coordenada_X
    );

    const angle = i > 0 && i < points.length - 1 ? 
      calculateAngle(points[i-1], currentPoint, nextPoint) : 0;

    const isMoving = (currentPoint.Velocidad || 0) > 5;
    const isLinear = angle < options.maxAngle && isMoving;
    
    if (isLinear) {
      isLinearMovement = true;
    } else {
      isLinearMovement = false;
    }

    const isStop = currentPoint.duracion_parada_min && currentPoint.duracion_parada_min > 0;
    const hasSignificantSpeedChange = Math.abs(
      (currentPoint.Velocidad || 0) - (lastKeptPoint.Velocidad || 0)
    ) > options.speedThreshold;

    const effectiveMinDistance = isLinearMovement ? 0.1 : options.minDistance;

    if (
      (options.keepStops && isStop) ||
      (options.keepSpeedChanges && hasSignificantSpeedChange) ||
      distanceToLast > effectiveMinDistance ||
      (i > 0 && i < points.length - 1 && angle > options.maxAngle)
    ) {
      result.push(currentPoint);
      lastKeptPoint = currentPoint;
    }
  }

  if (points.length > 1) {
    result.push(points[points.length - 1]);
  }

  return result;
};

// Función para calcular el ángulo entre tres puntos
const calculateAngle = (p1: any, p2: any, p3: any) => {
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

// Escuchar mensajes del hilo principal
self.addEventListener('message', (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'cluster':
      const clusters = clusterPoints(data.points, data.maxDistance);
      const centers = clusters.map(getClusterCenter);
      self.postMessage({ type: 'cluster', data: centers });
      break;

    case 'decimate':
      const decimated = decimatePoints(data.points, data.options);
      self.postMessage({ type: 'decimate', data: decimated });
      break;

    default:
      console.warn('Unknown message type:', type);
  }
}); 