# Tracer LPR - Frontend

Este es el repositorio del frontend para la aplicación Tracer LPR, una herramienta de análisis de datos vehiculares.

## Descripción

El frontend está construido con React y TypeScript, utilizando la librería de componentes Mantine UI para la interfaz de usuario. Se conecta a un backend API (construido con Python/FastAPI) para obtener y manipular los datos relacionados con casos, lectores OCR, lecturas de vehículos, etc.

## Tecnologías Utilizadas

*   **React:** Biblioteca principal para construir la interfaz de usuario.
*   **TypeScript:** Superset de JavaScript para tipado estático.
*   **Mantine UI:** Librería de componentes React para una UI moderna y funcional.
*   **Vite:** Herramienta de construcción y servidor de desarrollo rápido.
*   **React Router:** Para el manejo de rutas en la aplicación.
*   **Tabler Icons:** Para los iconos utilizados en la interfaz.

## Configuración y Ejecución

### Prerrequisitos

*   Node.js (v18 o superior recomendado)
*   npm (o yarn)

### Instalación

1.  Clona este repositorio (si aplica):
    ```bash
    git clone <tu-url-del-repositorio>
    cd <directorio-del-frontend>
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```

### Ejecutar en Modo Desarrollo

Para iniciar el servidor de desarrollo (generalmente en `http://localhost:5173`):

```bash
npm run dev
```

La aplicación se recargará automáticamente si realizas cambios en el código.

### Construir para Producción

Para crear una versión optimizada de la aplicación para despliegue:

```bash
npm run build
```

Esto generará los archivos estáticos en la carpeta `dist`.

### Previsualizar la Build de Producción

Puedes previsualizar la build de producción localmente con:

```bash
npm run preview
```

## Estructura de Carpetas (Simplificada)

```
tracer-frontend/
├── public/         # Archivos estáticos públicos
├── src/
│   ├── assets/     # Imágenes, fuentes, etc.
│   ├── components/ # Componentes reutilizables (layout, common, map, etc.)
│   ├── contexts/   # Contextos de React (o store/ si usas Redux)
│   ├── hooks/      # Hooks personalizados
│   ├── pages/      # Componentes que representan páginas/vistas
│   ├── services/   # Lógica para interactuar con la API backend
│   ├── types/      # Definiciones de tipos e interfaces TypeScript
│   ├── App.tsx     # Componente raíz y enrutador
│   ├── index.tsx   # Punto de entrada de React
│   └── theme.ts    # Configuración del tema de Mantine
├── index.html      # Punto de entrada HTML para Vite
├── package.json    # Dependencias y scripts del proyecto
├── tsconfig.json   # Configuración de TypeScript
├── vite.config.ts  # Configuración de Vite
└── README.md       # Este archivo
``` 