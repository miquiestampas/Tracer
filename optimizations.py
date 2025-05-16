import logging
from sqlalchemy import Index, Column, text, inspect
import models
from database import engine, Base
from sqlalchemy.orm import Session

logger = logging.getLogger("tracer.optimizations")

def create_optimized_indices():
    """
    Crea índices adicionales para optimizar las consultas más comunes.
    Estos índices están separados del modelo base para mayor claridad.
    """
    logger.info("Creando índices optimizados para consultas frecuentes...")
    
    # Índices para la tabla Lectura (la más consultada)
    logger.info("Creando índices para tabla Lectura...")
    # Índice compuesto para búsquedas por matrícula y fecha
    _create_index_if_not_exists('ix_lectura_matricula_fecha', 'lectura', ['Matricula', 'Fecha_y_Hora'])
    # Índice para búsquedas por ID de lector (muy usado)
    _create_index_if_not_exists('ix_lectura_id_lector', 'lectura', ['ID_Lector'])
    # Índice para consultas que filtran por tipo de fuente
    _create_index_if_not_exists('ix_lectura_tipo_fuente', 'lectura', ['Tipo_Fuente'])
    
    # Índices para la tabla ArchivoExcel
    logger.info("Creando índices para tabla ArchivoExcel...")
    # Índice para búsquedas por caso (muy usado)
    _create_index_if_not_exists('ix_archivosexcel_id_caso', 'ArchivosExcel', ['ID_Caso'])
    # Índice para ordenamiento por fecha de importación (usado en listados)
    _create_index_if_not_exists('ix_archivosexcel_fecha_importacion', 'ArchivosExcel', ['Fecha_de_Importacion'])
    
    # Índices para la tabla LecturasRelevantes
    logger.info("Creando índices para tabla LecturasRelevantes...")
    _create_index_if_not_exists('ix_lecturasrelevantes_id_lectura', 'LecturasRelevantes', ['ID_Lectura'])
    
    # Índices para la tabla Lector
    logger.info("Creando índices para tabla Lector...")
    _create_index_if_not_exists('ix_lector_provincia', 'lector', ['Provincia'])
    _create_index_if_not_exists('ix_lector_localidad', 'lector', ['Localidad'])
    _create_index_if_not_exists('ix_lector_coordenadas', 'lector', ['Coordenada_X', 'Coordenada_Y'])

    logger.info("Índices optimizados creados correctamente.")

def _create_index_if_not_exists(index_name, table_name, columns):
    """
    Crea un índice solo si no existe ya en la base de datos.
    
    Args:
        index_name (str): Nombre del índice a crear
        table_name (str): Nombre de la tabla donde crear el índice
        columns (list): Lista de nombres de columnas para el índice
    """
    inspector = inspect(engine)
    existing_indices = inspector.get_indexes(table_name)
    exists = any(idx['name'] == index_name for idx in existing_indices)
    
    if not exists:
        # Convertir los nombres de columnas a string para SQL
        columns_str = ', '.join(f'"{col}"' for col in columns)
        # Crear el índice dinámicamente
        index_sql = f'CREATE INDEX IF NOT EXISTS "{index_name}" ON "{table_name}" ({columns_str})'
        
        with engine.connect() as connection:
            connection.execute(text(index_sql))
            connection.commit()
        
        logger.info(f"Índice '{index_name}' creado en la tabla '{table_name}'")
    else:
        logger.debug(f"Índice '{index_name}' ya existe en la tabla '{table_name}'")

def optimize_common_queries(db: Session):
    """
    Prepara la base de datos para consultas comunes mediante vistas materializadas.
    (Esta funcionalidad es limitada en SQLite, pero podemos simular algunas optimizaciones).
    
    Args:
        db (Session): Sesión de base de datos activa
    """
    logger.info("Optimizando consultas comunes...")
    
    # Crear una vista para agilizar consultas de vehículos únicos por caso
    _create_view_if_not_exists(
        db, 
        "vehiculos_por_caso", 
        """
        SELECT DISTINCT 
            a.ID_Caso, 
            l.Matricula, 
            COUNT(l.ID_Lectura) as total_lecturas 
        FROM 
            lectura l
        JOIN 
            ArchivosExcel a ON l.ID_Archivo = a.ID_Archivo 
        GROUP BY 
            a.ID_Caso, l.Matricula
        """
    )
    
    # Vista para estadísticas básicas de casos
    _create_view_if_not_exists(
        db,
        "estadisticas_casos",
        """
        SELECT 
            c.ID_Caso,
            c.Nombre_del_Caso,
            COUNT(DISTINCT a.ID_Archivo) as total_archivos,
            COUNT(l.ID_Lectura) as total_lecturas,
            COUNT(DISTINCT l.Matricula) as total_matriculas_unicas,
            COUNT(DISTINCT l.ID_Lector) as total_lectores_unicos,
            MIN(l.Fecha_y_Hora) as fecha_primera_lectura,
            MAX(l.Fecha_y_Hora) as fecha_ultima_lectura
        FROM 
            Casos c
        LEFT JOIN 
            ArchivosExcel a ON c.ID_Caso = a.ID_Caso
        LEFT JOIN 
            lectura l ON a.ID_Archivo = l.ID_Archivo
        GROUP BY 
            c.ID_Caso
        """
    )
    
    logger.info("Optimizaciones de consultas comunes completadas.")

def _create_view_if_not_exists(db: Session, view_name, query):
    """
    Crea una vista SQL si no existe.
    
    Args:
        db (Session): Sesión de base de datos activa
        view_name (str): Nombre de la vista
        query (str): Consulta SQL para definir la vista
    """
    # Verificar si la vista existe
    inspector = inspect(engine)
    view_exists = False
    
    try:
        # Intentar verificar si la vista existe
        result = db.execute(text(f"SELECT name FROM sqlite_master WHERE type='view' AND name='{view_name}'"))
        view_exists = result.scalar() is not None
    except Exception as e:
        logger.warning(f"Error al verificar si la vista {view_name} existe: {e}")
    
    if not view_exists:
        try:
            # Crear la vista
            create_view_sql = f"CREATE VIEW IF NOT EXISTS {view_name} AS {query}"
            db.execute(text(create_view_sql))
            db.commit()
            logger.info(f"Vista '{view_name}' creada correctamente")
        except Exception as e:
            db.rollback()
            logger.error(f"Error al crear vista '{view_name}': {e}")
    else:
        logger.debug(f"Vista '{view_name}' ya existe")

def vacuum_database():
    """
    Ejecuta VACUUM para optimizar el almacenamiento físico de la base de datos.
    """
    logger.info("Ejecutando VACUUM para optimizar almacenamiento...")
    with engine.connect() as connection:
        connection.execute(text("VACUUM"))
        logger.info("VACUUM completado correctamente") 