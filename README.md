# Tracer LPR - Aplicación de Investigación sobre datos LPR y GPS de vehículos

Aplicación web para la gestión y análisis de datos de lecturas de matrículas (LPR), datos GPS y rutas GPX/KML asociadas a casos de investigación.

---

## Características Principales

### Gestión de Casos
- Crear, listar, editar y eliminar casos de investigación.
- Visualizar detalles completos de cada caso.
- Cambiar el estado del caso y gestionar su ciclo de vida.

### Importación de Datos
- Subida de archivos Excel (`.xlsx`, `.xls`) para lecturas LPR y GPS.
- **Importación de archivos GPX/KML**: permite importar rutas GPS de dispositivos o plataformas externas, asociando la ruta a una matrícula.
- Mapeo flexible y automático de columnas para todos los tipos de archivo.
- Validación de campos obligatorios y advertencias de duplicados.
- Visualización y gestión de archivos importados (descarga, eliminación, advertencias).

### Gestión de Lectores
- Visualización, edición y filtrado de lectores en tabla y en mapa.
- Edición de coordenadas y detalles de cada lector.
- Importación masiva de lectores desde Excel.

### Gestión de Vehículos
- CRUD completo de vehículos asociados a matrículas.
- Visualización de lecturas y rutas asociadas a cada vehículo.

### Análisis y Visualización
- Visualización de lecturas LPR y GPS en tablas y mapas interactivos.
- Filtros avanzados por matrícula, fecha, lector, etc.
- Marcado de lecturas relevantes, notas y gestión de vehículos sospechosos.
- Análisis avanzado: detección de convoyes, lanzaderas, vehículos rápidos y matrículas extranjeras.
- Visualización de rutas GPX/KML importadas en el mapa GPS.

### Seguridad y Sesión
- Sistema de autenticación y control de sesión.
- Aviso de expiración de sesión con botón "Seguir conectado" para renovar la sesión sin perder el trabajo.

### Centro de Ayuda Integrado
- Ayuda contextual y detallada para cada módulo, incluyendo instrucciones para importar archivos GPX/KML.

### Otras Funcionalidades
- Eliminación segura de archivos y casos con confirmación modal.
- Notificaciones visuales para todas las acciones importantes.
- Soporte para multi-caso y búsqueda cruzada de vehículos.

---

## Instalación y Ejecución

### Prerrequisitos
- Python 3.8+
- Node.js 18.x o 20.x LTS (no usar 22.x)
- npm

### Instalación rápida

```bash
git clone <URL_DEL_REPOSITORIO>
cd <NOMBRE_CARPETA_PROYECTO>
# Backend
python -m venv venv
source venv/bin/activate  # o .\venv\Scripts\activate en Windows
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# Frontend
npm install
npm run dev
```

Accede a la app en `http://localhost:5173`

---

## Scripts Disponibles

- `npm run dev` - Servidor de desarrollo
- `npm run build` - Build de producción
- `npm run preview` - Previsualización local

---

## Estructura del Proyecto

- `/src` - Código fuente frontend (React, Mantine, Leaflet)
- `/backend` o raíz - Código fuente backend (FastAPI, SQLAlchemy)
- `/help` - Textos de ayuda y documentación contextual

---

## Notas Importantes

- Usa Node.js 18.x o 20.x LTS para evitar problemas de compatibilidad.
- El sistema soporta importación de archivos Excel, GPX y KML.
- El centro de ayuda explica cómo importar cada tipo de archivo y cómo aprovechar las funcionalidades avanzadas.
