import { useEffect, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

interface HeatmapLayerProps {
  points: Array<[number, number, number?]>; // [lat, lng, intensity?]
  options?: L.LayerOptions;
}

const HeatmapLayer: React.FC<HeatmapLayerProps> = ({ points, options }) => {
  const map = useMap();
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    if (!map) return;

    const checkMapReady = () => {
      const container = map.getContainer();
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        setIsMapReady(true);
        map.off('resize', checkMapReady);
      }
    };

    checkMapReady();
    map.on('resize', checkMapReady);

    return () => {
      map.off('resize', checkMapReady);
    };
  }, [map]);

  useEffect(() => {
    if (!isMapReady || !map) return;

    try {
      // @ts-ignore
      const heatLayer = L.heatLayer(points, options).addTo(map);
      return () => {
        map.removeLayer(heatLayer);
      };
    } catch (error) {
      console.error('Error creating heatmap layer:', error);
    }
  }, [map, points, options, isMapReady]);

  return null;
};

export default HeatmapLayer; 