import React, { createContext, useContext, useState } from 'react';

// Tipo genérico para una lectura mínima (puedes ajustarlo según tu modelo real)
export interface HighlightLectura {
  Matricula: string;
  Fecha_y_Hora: string;
  ID_Lector?: string;
  Coordenada_X?: number;
  Coordenada_Y?: number;
  [key: string]: any;
}

interface MapHighlightContextType {
  highlightedLecturas: HighlightLectura[];
  setHighlightedLecturas: (lecturas: HighlightLectura[]) => void;
}

const MapHighlightContext = createContext<MapHighlightContextType | undefined>(undefined);

export const useMapHighlight = () => {
  const ctx = useContext(MapHighlightContext);
  if (!ctx) throw new Error('useMapHighlight debe usarse dentro de MapHighlightProvider');
  return ctx;
};

export const MapHighlightProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [highlightedLecturas, setHighlightedLecturas] = useState<HighlightLectura[]>([]);
  return (
    <MapHighlightContext.Provider value={{ highlightedLecturas, setHighlightedLecturas }}>
      {children}
    </MapHighlightContext.Provider>
  );
}; 