# Tracer LPR - Aplicación de Análisis Vehicular

Aplicación web para la gestión y análisis de datos de lecturas de matrículas (LPR) y datos GPS asociados a casos de investigación.

## Características Implementadas

*   **Gestión de Casos:**
    *   Crear nuevos casos de investigación (Nombre, Año, NIV, Descripción, Estado).
    *   Listar casos existentes.
    *   Ver detalles de un caso específico.
    *   Actualizar estado de un caso.
    *   Eliminar casos (con eliminación en cascada de archivos y lecturas asociados).
*   **Importación de Datos:**
    *   Subir archivos Excel (`.xlsx`) de tipos LPR o GPS asociados a un caso.
    *   Mapeo flexible de columnas desde el archivo Excel a los campos internos de la base de datos.
    *   Validación de columnas obligatorias según el tipo de archivo.
    *   Procesamiento de datos y almacenamiento estructurado de lecturas.
    *   Creación automática de registros de `Lector` si se encuentran IDs nuevos en archivos LPR.
    *   Almacenamiento seguro del archivo original subido.
*   **Gestión de Lectores:**
    *   Visualización de lectores en tabla paginada.
    *   Edición de detalles del lector (Nombre, Carretera, Provincia, etc.).
    *   Entrada/Actualización de coordenadas geoespaciales mediante:
        *   Formato de texto `latitud, longitud` (con coma o espacio como separador).
        *   Enlaces de Google Maps (`google.com/maps/...@lat,lon...`).
    *   Visualización de lectores en una **vista de mapa** interactiva.
    *   Filtrado dinámico de lectores en el mapa por Provincia y Carretera.
*   **Gestión de Vehículos:**
    *   CRUD (Crear, Leer, Actualizar, Eliminar) básico para vehículos asociados a matrículas.
*   **Análisis de Lecturas (en Detalle de Caso):**
    *   Visualización separada de lecturas LPR y GPS.
    *   Paginación y filtrado de lecturas por:
        *   Matrícula (búsqueda parcial).
        *   Rango de Fecha y Hora.
        *   ID de Lector (para LPR).
        *   Lecturas marcadas como relevantes.
    *   **Marcado de Relevancia:**
        *   Marcar/Desmarcar lecturas individuales como relevantes.
        *   Añadir/Editar notas de texto a las lecturas relevantes.
    *   Visualización de lecturas LPR y GPS en **mapas interactivos** separados dentro de la vista de detalle del caso.
*   **Tecnología:**
    *   **Backend:** Python, FastAPI, SQLAlchemy (con SQLite), Pydantic, Pandas.
    *   **Frontend:** TypeScript, React, Mantine UI, React Router, React Leaflet, Axios.

## Configuración y Ejecución

### Prerrequisitos

*   Python 3.8+
*   Node.js y npm (o yarn)

### Instalación

1.  **Clonar el repositorio:**
    ```bash
    git clone <URL_DEL_REPOSITORIO>
    cd <NOMBRE_CARPETA_PROYECTO>
    ```
2.  **Configurar Backend (Python):**
    *   (Opcional pero recomendado) Crear y activar un entorno virtual:
        ```bash
        python -m venv venv
        # Windows
        .\venv\Scripts\activate
        # macOS/Linux
        source venv/bin/activate
        ```
    *   Instalar dependencias Python:
        ```bash
        pip install -r requirements.txt
        ```
3.  **Configurar Frontend (Node.js):**
    *   Navegar a la carpeta `src` (o la raíz si `package.json` está ahí):
        ```bash
        # cd src # Ajustar si es necesario
        ```
    *   Instalar dependencias Node.js:
        ```bash
        npm install
        # o si usas yarn:
        # yarn install
        ```

### Ejecución

1.  **Iniciar Backend:**
    *   Desde la carpeta raíz del proyecto (donde está `main.py`), ejecuta:
        ```bash
        uvicorn main:app --reload --port 8000
        ```
    *   La API estará disponible en `http://localhost:8000`.
2.  **Iniciar Frontend:**
    *   Desde la carpeta donde está `package.json` (probablemente la raíz o `src`), ejecuta:
        ```bash
        npm run dev
        # o si usas yarn:
        # yarn dev
        ```
    *   Abre tu navegador y ve a la dirección indicada (normalmente `http://localhost:5173` o similar).

## Estructura del Proyecto (Simplificada)
