import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-draw/dist/leaflet.draw.css'; // Importar CSS de leaflet-draw
import 'leaflet-draw'; // Importar JS de leaflet-draw

// Definir interfaz para las props, incluyendo callbacks para eventos
interface DrawControlProps {
  onShapeDrawn: (layer: L.Layer) => void;
  onShapeDeleted: () => void;
}

const DrawControl: React.FC<DrawControlProps> = ({ onShapeDrawn, onShapeDeleted }) => {
  const map = useMap();

  useEffect(() => {
    // Crear una FeatureGroup para almacenar las capas dibujadas (solo permitiremos una a la vez)
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    // Configuración de los controles de dibujo
    const drawControl = new L.Control.Draw({
      position: 'topleft', // Posición de los controles (debajo del zoom)
      draw: {
        polygon: {
          allowIntersection: false, // No permitir que el polígono se cruce a sí mismo
          drawError: {
            color: '#e1e100', // Color del mensaje de error
            message: '<strong>¡Error!<strong> No puedes cruzar los lados del polígono.',
          },
          shapeOptions: {
            color: '#007bff', // Color del borde del polígono (azul)
            fillColor: '#007bff', // Color de relleno
            fillOpacity: 0.3 // Opacidad del relleno
          },
        },
        rectangle: {}, // Habilitar pasando un objeto vacío (o con opciones)
        polyline: false,
        circle: false, 
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems, // Qué capas se pueden editar/eliminar
        remove: true, // Permitir eliminar
        edit: false // Deshabilitar edición por ahora para simplificar
      },
    });

    map.addControl(drawControl);

    // --- Manejadores de Eventos de Dibujo ---

    // Evento cuando se CREA una nueva forma
    const handleDrawCreated = (event: any) => {
      const layer = event.layer;
      
      // Limpiar capas anteriores antes de añadir la nueva
      drawnItems.clearLayers(); 
      drawnItems.addLayer(layer);

      // Llamar al callback pasado como prop con la nueva capa
      onShapeDrawn(layer); 
    };

    // Evento cuando se ELIMINAN formas
    const handleDrawDeleted = (event: any) => {
        // Como solo permitimos una, si se borra, llamamos al callback
        // para indicar que no hay forma activa
        onShapeDeleted();
    };

    map.on(L.Draw.Event.CREATED, handleDrawCreated);
    map.on(L.Draw.Event.DELETED, handleDrawDeleted);

    // --- Limpieza al desmontar el componente ---
    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
      // Eliminar listeners
      map.off(L.Draw.Event.CREATED, handleDrawCreated);
      map.off(L.Draw.Event.DELETED, handleDrawDeleted);
    };
  }, [map, onShapeDrawn, onShapeDeleted]); // Dependencias del useEffect

  // Este componente no renderiza nada visible directamente
  return null; 
};

export default DrawControl; 