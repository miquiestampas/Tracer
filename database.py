from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Define la URL de la base de datos (archivo SQLite en la raíz)
DATABASE_URL = "sqlite:///./tracer.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} # Necesario para SQLite con FastAPI/async
)

# Crea una fábrica de sesiones
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Función para obtener una sesión de base de datos (dependencia de FastAPI)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 