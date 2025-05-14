import React from 'react';
import { Box, Text, Stack } from '@mantine/core';
import { IconPencil, IconEye, IconTrash, IconRefresh, IconBookmark } from '@tabler/icons-react';

const helpTexts = {
  'analisis-lpr': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Lecturas LPR?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          Aquí puedes consultar y filtrar todas las lecturas LPR asociadas al caso. Utiliza los filtros avanzados para acotar por matrícula (con comodines), fechas, horas, lector, carretera, etc.
        </Text>
        <Text size="md" fw={700} mb={2}>Guardar búsquedas y uso cruzado</Text>
        <Text size="sm" mb="xs">
          Puedes guardar cualquier búsqueda que realices (con los filtros aplicados) para consultarla más adelante o cruzarla con otras búsquedas. Esta funcionalidad es especialmente útil para:
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Comparar patrones de movimiento</b> de diferentes vehículos.</li>
            <li><b>Localizar coincidencias</b> entre vehículos en distintos puntos geográficos y temporales.</li>
            <li><b>Investigar vehículos lanzadera</b> que acompañan a un objetivo en diferentes momentos y ubicaciones.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>¿Cómo guardar una búsqueda?</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Aplica los filtros que te interesen (matrícula, fechas, lector, etc.).</li>
            <li>Haz clic en el botón "Guardar búsqueda".</li>
            <li>Asigna un nombre descriptivo para identificarla fácilmente.</li>
            <li>Accede a tus búsquedas guardadas desde el panel correspondiente para consultarlas o cruzarlas con otras.</li>
          </ol>
        </Text>
        <Text size="md" fw={700} mb={2}>Ejemplos de uso avanzado</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Localizar vehículos en varios puntos:</b> Filtra por una matrícula o patrón y guarda la búsqueda. Luego, filtra por otra ubicación o rango temporal y guarda esa búsqueda. Puedes comparar ambas para ver si hay vehículos que aparecen en ambos contextos.</li>
            <li><b>Análisis de acompañamiento:</b> Guarda búsquedas de diferentes eventos (por ejemplo, entradas y salidas de una ciudad) y analiza qué vehículos coinciden en ambos eventos, lo que puede indicar acompañamiento o patrones sospechosos.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Comodines para búsqueda parcial de matrículas</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><code>?</code> coincide con UN carácter cualquiera</li>
            <li><code>*</code> coincide con CERO O MÁS caracteres</li>
          </ul>
          <b>Ejemplos prácticos:</b>
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><code>??98M*</code> → Matrículas con "98M" en posiciones 3-5</li>
            <li><code>98*</code> → Matrículas que empiezan por "98"</li>
            <li><code>?98*</code> → Matrículas con "98" en posición 2-3</li>
            <li><code>*98*</code> → Matrículas que contienen "98" en cualquier posición</li>
            <li><code>98??AB</code> → Matrículas que empiezan por "98", dos caracteres cualquiera, y terminan en "AB"</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Usa nombres descriptivos al guardar búsquedas (ejemplo: "Matrícula 1234ABC en Madrid 01/05/2024").</li>
            <li>Cruza búsquedas para descubrir relaciones ocultas entre vehículos y eventos.</li>
            <li>Aprovecha los filtros avanzados y los comodines para búsquedas flexibles y potentes.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Flujo de trabajo habitual</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Análisis de lecturas:</b> Aplica filtros para explorar el conjunto de lecturas y detectar patrones o eventos relevantes.</li>
            <li><b>Localización de lecturas o vehículos interesantes:</b> Marca como relevantes las lecturas clave o guarda vehículos sospechosos para su seguimiento.</li>
            <li><b>Guardado en paneles correspondientes:</b> Accede a las pestañas de "Lecturas Relevantes" o "Vehículos" para analizar en detalle y documentar los hallazgos.</li>
          </ol>
        </Text>
      </Stack>
    </Box>
  ),
  'lanzadera': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Análisis Avanzado?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          La pestaña de Análisis Avanzado agrupa tres módulos especializados para el análisis de patrones y vehículos de interés:
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Detección de vehículos rápidos:</b> Identifica vehículos que circulan a velocidades superiores a un umbral definido, útil para localizar posibles lanzaderas, huidas o patrones de conducción sospechosos.</li>
            <li><b>Detección de convoyes (Lanzadera):</b> Detecta pares de vehículos que viajan juntos de forma consistente (convoyes), basándose en lecturas LPR cercanas en el tiempo y en múltiples ubicaciones o días distintos. Esto puede indicar un vehículo "lanzadera" que guía a otro.</li>
            <li><b>Detección de matrículas extranjeras:</b> Permite filtrar y localizar lecturas de vehículos con matrículas extranjeras, facilitando la investigación de vehículos no nacionales que puedan estar implicados en actividades relevantes para el caso.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>¿Cómo usar el análisis lanzadera?</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Define Parámetros:</b> Ajusta la "Ventana de Tiempo" (segundos máximos entre lecturas para considerarlas juntas) y las "Mínimas Coincidencias" (cuántas veces deben verse juntos en lectores o días distintos para ser significativo).</li>
            <li><b>Filtros Opcionales:</b> Puedes filtrar por fecha/hora o centrarte en una "Matrícula Objetivo" específica.</li>
            <li><b>Detectar Convoy:</b> Haz clic en "Detectar Convoy".</li>
            <li><b>Resultados:</b>
              <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
                <li><b>Lista de Vehículos:</b> Muestra todas las matrículas involucradas en algún convoy detectado. Puedes seleccionar vehículos para filtrar la tabla de detalles y el mapa.</li>
                <li><b>Tabla de Detalles:</b> Muestra cada instancia donde un par de vehículos seleccionados fueron vistos juntos (lector, hora, etc.).</li>
                <li><b>Mapa:</b> Visualiza geográficamente las ubicaciones de las co-ocurrencias de los vehículos seleccionados.</li>
              </ul>
            </li>
          </ol>
        </Text>
        <Text size="md" fw={700} mb={2}>Detección de vehículos rápidos</Text>
        <Text size="sm" mb="xs">
          Este módulo permite identificar vehículos que han sido detectados circulando a velocidades superiores a un umbral definido. Es útil para localizar posibles vehículos lanzadera, huidas o patrones de conducción sospechosos.
        </Text>
        <Text size="md" fw={700} mb={2}>¿Cómo usar la detección de vehículos rápidos?</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Define el umbral de velocidad a partir del cual se considerará un vehículo como rápido.</li>
            <li>Aplica filtros opcionales por fecha, matrícula o lector.</li>
            <li>Ejecuta la búsqueda para ver la lista de vehículos y lecturas que superan el umbral.</li>
          </ol>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Utiliza este módulo para detectar posibles lanzaderas o vehículos que intentan evitar controles.</li>
            <li>Combina este análisis con el de convoyes para identificar patrones sospechosos.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Detección de matrículas extranjeras</Text>
        <Text size="sm" mb="xs">
          Este módulo permite filtrar y localizar lecturas de vehículos con matrículas extranjeras, facilitando la investigación de vehículos no nacionales que puedan estar implicados en actividades relevantes para el caso.
        </Text>
        <Text size="md" fw={700} mb={2}>¿Cómo usar la detección de matrículas extranjeras?</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Selecciona el país o países de interés, o utiliza el filtro general de matrículas extranjeras.</li>
            <li>Aplica filtros adicionales por fecha, lector o patrón de matrícula si lo necesitas.</li>
            <li>Consulta la lista de lecturas y vehículos extranjeros detectados en el caso.</li>
          </ol>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Presta especial atención a vehículos extranjeros que aparecen repetidamente o en compañía de vehículos nacionales sospechosos.</li>
            <li>Utiliza la información de país para coordinar investigaciones con otras jurisdicciones si es necesario.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'lecturas-relevantes': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Lecturas Relevantes?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          Aquí se recopilan todas las lecturas que has marcado manualmente como importantes (<IconBookmark size="0.8rem"/>) desde la pestaña "Lecturas LPR". Permite centrarse en los eventos clave de la investigación.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Visualización:</b> Muestra la tabla de lecturas marcadas. Puedes ordenar y paginar como en otras tablas.</li>
            <li><b>Notas:</b> Edita (<IconPencil size="0.8rem"/>) o añade notas específicas a cada lectura relevante para recordar por qué es importante.</li>
            <li><b>Desmarcar:</b> Elimina (<IconTrash size="0.8rem"/>) la marca de relevancia si una lectura ya no es crucial. Puedes hacerlo individualmente o para una selección.</li>
            <li><b>Guardar Vehículo:</b> Guarda rápidamente la matrícula de una lectura relevante como un vehículo para seguimiento posterior.</li>
            <li><b>Selección Múltiple:</b> Usa las casillas para seleccionar varias lecturas y desmarcarlas o guardar sus vehículos en bloque.</li>
            <li><b>Actualizar:</b> Actualiza (<IconRefresh size="0.8rem"/>) la lista si has hecho cambios en otra pestaña.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Usa las notas para documentar por qué una lectura es relevante para el caso.</li>
            <li>Marca como relevantes solo las lecturas que aporten valor a la investigación.</li>
            <li>Revisa periódicamente las lecturas relevantes para mantener el foco en lo importante.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'vehiculos': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Vehículos?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es este panel?</Text>
        <Text size="sm" mb="xs">
          Aquí puedes gestionar la lista de vehículos relevantes asociados a este caso que hayas guardado desde los paneles de Lecturas y Análisis Avanzado. Podrás indicar si el mismo ya ha sido comprobado y si efectivamente se trata de un vehículo sospechoso. Si se importan archivos con lecturas concretas de un vehículo, éste debe estar incluido en esta lista para poder ser analizado en detalle en el mapa LPR.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Listado:</b> Muestra todos los vehículos de interés para la investigación, con detalles como marca, modelo, color, etc. (si se han añadido).</li>
            <li><b>Lecturas LPR:</b> Indica cuántas lecturas LPR tiene cada vehículo <i>dentro de este caso</i>.</li>
            <li><b>Editar Detalles:</b> Modifica la información asociada a un vehículo (marca, modelo, propietario, observaciones, estado de comprobado/sospechoso).</li>
            <li><b>Ver Lecturas:</b> Accede a una vista filtrada de todas las lecturas (LPR y GPS) de un vehículo específico dentro de este caso.</li>
            <li><b>Eliminar Vehículo:</b> Borra un vehículo de la lista del caso (Nota: Esto <i>no</i> elimina sus lecturas asociadas, solo el registro del vehículo).</li>
            <li><b>Actualizar:</b> Actualiza la lista si se han hecho cambios (como guardar un vehículo desde otra pestaña).</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Mantén actualizada la información de los vehículos para facilitar su identificación.</li>
            <li>Usa el estado de comprobado/sospechoso para marcar vehículos que ya han sido investigados.</li>
            <li>Revisa periódicamente las lecturas asociadas a cada vehículo para detectar patrones de movimiento.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'mapa': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Mapa?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          En esta pestaña puedes visualizar sobre el mapa todas las lecturas LPR y GPS asociadas al caso, así como la ubicación de los lectores y vehículos de interés. Utiliza las herramientas de zoom, filtro y selección para analizar los movimientos y patrones geográficos de los vehículos.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Visualización geográfica:</b> Muestra en el mapa los puntos de lectura y los trayectos de los vehículos.</li>
            <li><b>Filtrado:</b> Puedes filtrar por matrícula, fecha, tipo de lectura (LPR/GPS) y otros parámetros.</li>
            <li><b>Selección de vehículos:</b> Haz clic en un vehículo o lector para ver detalles y lecturas asociadas.</li>
            <li><b>Herramientas de análisis:</b> Utiliza las herramientas de medición, selección múltiple y exportación de datos.</li>
            <li><b>Actualizar:</b> Refresca el mapa para mostrar los datos más recientes.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Utiliza el zoom y los filtros para centrarte en áreas o vehículos específicos.</li>
            <li>Combina la visualización de lecturas LPR y GPS para obtener un análisis más completo.</li>
            <li>Guarda capturas del mapa para documentar hallazgos relevantes.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'archivos': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Archivos Importados?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          Aquí puedes importar archivos Excel con lecturas LPR o GPS y gestionarlos para su análisis en el caso.
        </Text>
        <Text size="md" fw={700} mb={2}>¿Cómo importar?</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Selecciona el caso al que quieres asociar los archivos.</li>
            <li>Elige el tipo de archivo (LPR o GPS).</li>
            <li>Sube el archivo Excel y mapea las columnas a los campos requeridos.</li>
            <li>Confirma la importación y revisa los archivos ya cargados.</li>
          </ol>
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Listado de archivos:</b> Visualiza todos los archivos importados asociados al caso.</li>
            <li><b>Eliminación:</b> Puedes eliminar archivos importados si te has equivocado.</li>
            <li><b>Mapeo automático:</b> El sistema intentará mapear automáticamente las columnas, pero revisa siempre el mapeo antes de confirmar.</li>
            <li><b>Actualización:</b> Refresca la lista para ver los archivos más recientes.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Asegúrate de que tu archivo tenga cabeceras claras y todos los campos obligatorios.</li>
            <li>Revisa el mapeo de columnas antes de confirmar la importación.</li>
            <li>Elimina archivos incorrectos para mantener la base de datos limpia.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'gestion-lectores': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la gestión de lectores?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es un lector?</Text>
        <Text size="sm" mb="xs">
          Un <b>lector</b> es un dispositivo físico instalado en una ubicación concreta (p.ej. carretera, acceso, frontera) que captura lecturas de matrículas (LPR) o posiciones GPS de vehículos. Cada lector tiene un identificador único y puede estar asociado a una localización geográfica.
        </Text>
        <Text size="md" fw={700} mb={2}>¿Para qué sirve la gestión de lectores?</Text>
        <Text size="sm" mb="xs">
          Permite consultar, añadir, editar o eliminar lectores en la base de datos. Es fundamental mantener actualizada esta información para que las lecturas se asignen correctamente a cada punto de control y para facilitar el análisis geográfico y temporal.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades principales</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Listado de lectores:</b> Consulta todos los lectores registrados, su ubicación, tipo y estado.</li>
            <li><b>Añadir lector:</b> Registra un nuevo lector indicando su identificador, tipo (LPR/GPS), ubicación y observaciones.</li>
            <li><b>Editar lector:</b> Modifica los datos de un lector existente (por ejemplo, si cambia de ubicación o se corrige un error).</li>
            <li><b>Eliminar lector:</b> Borra un lector de la base de datos (solo si ya no se utiliza).</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Verifica siempre la ubicación y el identificador antes de añadir o modificar un lector.</li>
            <li>Elimina solo lectores que estén seguros de que no tienen lecturas asociadas relevantes.</li>
            <li>Utiliza descripciones claras para facilitar la identificación en los análisis y mapas.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'busqueda-multicaso': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la Búsqueda Multi-Caso?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es la búsqueda multi-caso?</Text>
        <Text size="sm" mb="xs">
          Permite buscar y analizar vehículos y lecturas a través de todos los casos de la base de datos, sin limitarse a un solo expediente. Es útil para detectar patrones, coincidencias y relaciones entre investigaciones distintas.
        </Text>
        <Text size="md" fw={700} mb={2}>¿Para qué sirve?</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Detectar vehículos recurrentes:</b> Encuentra matrículas que aparecen en varios casos o investigaciones.</li>
            <li><b>Analizar patrones globales:</b> Descubre rutas, horarios o comportamientos que se repiten en diferentes contextos.</li>
            <li><b>Apoyar investigaciones cruzadas:</b> Facilita la colaboración entre equipos al compartir información relevante.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>¿Cómo se utiliza?</Text>
        <Text size="sm" mb="xs">
          <ol style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Introduce la matrícula, patrón o filtro de interés.</li>
            <li>Consulta los resultados agrupados por caso, fecha, lector, etc.</li>
            <li>Accede a los detalles de cada coincidencia y navega rápidamente al caso correspondiente.</li>
          </ol>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Utiliza comodines para búsquedas flexibles (por ejemplo, <code>*123*</code> para matrículas que contienen 123).</li>
            <li>Revisa los casos relacionados para obtener una visión más completa de la actividad del vehículo.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'investigaciones': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Qué es el panel de Investigaciones?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Para qué sirve esta sección?</Text>
        <Text size="sm" mb="xs">
          El panel de <b>Investigaciones</b> es el punto de entrada principal para gestionar todos los casos de la plataforma. Desde aquí puedes crear, consultar, editar y organizar expedientes, así como acceder a todas las herramientas de análisis y seguimiento.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades principales</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Listado de casos:</b> Visualiza todos los casos activos y cerrados, con filtros y ordenación.</li>
            <li><b>Creación y edición:</b> Crea nuevos casos o edita los existentes, añadiendo información relevante (nombre, año, descripción, grupo, etc.).</li>
            <li><b>Gestión de estados:</b> Cambia el estado de un caso (nuevo, en análisis, cerrado, etc.) según el avance de la investigación.</li>
            <li><b>Acceso rápido:</b> Entra directamente a los detalles de cada caso para trabajar con lecturas, vehículos, archivos y análisis avanzados.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Utiliza descripciones claras y completas para cada caso.</li>
            <li>Actualiza el estado de los casos para reflejar el progreso real de la investigación.</li>
            <li>Revisa periódicamente los casos cerrados para identificar patrones o relaciones con nuevas investigaciones.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'datos-gps': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Datos GPS?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          En la pestaña <b>Datos GPS</b> puedes consultar en formato tabla todos los registros GPS importados para los vehículos del caso. Permite analizar, filtrar y exportar los datos de localización de manera detallada.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades principales</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Tabla de registros:</b> Visualiza todos los puntos GPS con información de matrícula, fecha, hora, coordenadas, velocidad, etc.</li>
            <li><b>Filtrado y búsqueda:</b> Filtra por matrícula, fechas, velocidad, o cualquier campo disponible para encontrar los datos relevantes.</li>
            <li><b>Ordenación:</b> Ordena los registros por cualquier columna para facilitar el análisis.</li>
            <li><b>Exportación:</b> Descarga los datos filtrados en formato Excel o CSV para su análisis externo.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Utiliza los filtros para centrarte en periodos, vehículos o eventos concretos.</li>
            <li>Combina la información de la tabla con la visualización en el mapa para un análisis más completo.</li>
            <li>Exporta los datos para compartirlos o analizarlos con otras herramientas.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
  'mapa-gps': (
    <Box maw={900}>
      <Text fw={700} mb="sm" size="lg" c="blue.8">¿Cómo funciona la pestaña Mapa GPS?</Text>
      <Stack gap="xs">
        <Text size="md" fw={700} mb={2}>¿Qué es esta pestaña?</Text>
        <Text size="sm" mb="xs">
          En la pestaña <b>Mapa GPS</b> puedes visualizar sobre un mapa todas las posiciones GPS registradas para los vehículos del caso. Permite analizar rutas, trayectorias y patrones de movimiento de forma geográfica y temporal.
        </Text>
        <Text size="md" fw={700} mb={2}>Funcionalidades principales</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li><b>Visualización de rutas:</b> Muestra los trayectos de los vehículos sobre el mapa, diferenciando por colores o vehículos.</li>
            <li><b>Filtrado avanzado:</b> Filtra por matrícula, fechas, horas o zonas para centrarte en los movimientos de interés.</li>
            <li><b>Detalle de puntos:</b> Haz clic en un punto del mapa para ver la información detallada (fecha, hora, velocidad, etc.).</li>
            <li><b>Animación de trayectorias:</b> Reproduce el movimiento de los vehículos a lo largo del tiempo para analizar secuencias.</li>
            <li><b>Exportación:</b> Descarga los datos GPS visualizados para su análisis externo.</li>
          </ul>
        </Text>
        <Text size="md" fw={700} mb={2}>Consejos</Text>
        <Text size="sm" mb="xs">
          <ul style={{ paddingLeft: '20px', margin: '4px 0' }}>
            <li>Utiliza los filtros para reducir el ruido y centrarte en los trayectos relevantes.</li>
            <li>Combina la visualización GPS con las lecturas LPR para obtener un análisis más completo.</li>
            <li>Guarda capturas del mapa para documentar rutas sospechosas o patrones inusuales.</li>
          </ul>
        </Text>
      </Stack>
    </Box>
  ),
};

export default helpTexts; 