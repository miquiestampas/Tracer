@echo off
REM Iniciar backend en nueva ventana minimizada
start /min "Backend" cmd /k "uvicorn main:app --reload --port 8000"

REM Iniciar frontend en nueva ventana minimizada
start /min "Frontend" cmd /k "npm run dev"

REM Esperar unos segundos para que el frontend arranque
timeout /t 5

REM Abrir navegador en el frontend
start "" http://localhost:5173 