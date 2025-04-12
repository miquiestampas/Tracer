import { MantineThemeOverride, createTheme } from '@mantine/core';

// Definir la paleta de colores personalizada con #0b0d70 como tono 8
const tracerBluePalette = [
  '#eef2ff', // 0 (más claro)
  '#dce2f7',
  '#b9c3f0',
  '#94a3e8',
  '#6f85e0',
  '#4b69d9',
  '#2b4fcf', // 6
  '#1a37b8', // 7 (un tono oscuro bueno para texto)
  '#0b0d70', // 8 (el color para el sidebar)
  '#03042d'  // 9 (más oscuro)
] as const; // 'as const' es importante para que TypeScript infiera los tipos literales

// Crear el tema personalizado
export const theme: MantineThemeOverride = createTheme({
  // Definir el color primario y la paleta personalizada
  primaryColor: 'tracerBlue',
  colors: {
    tracerBlue: tracerBluePalette,
  },

  // Puedes añadir otras personalizaciones del tema aquí
  // Ejemplo: Cambiar la fuente por defecto
  // fontFamily: 'Roboto, sans-serif',

  // Ejemplo: Cambiar el radio de borde por defecto
  // radius: { sm: '4px', md: '8px', lg: '12px' },
}); 