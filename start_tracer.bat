@echo off
REM Iniciar backend en nueva ventana minimizada
start /min "Backend" cmd /k "uvicorn main:app --reload --port 8000"

REM Iniciar frontend en nueva ventana minimizada
start /min "Frontend" cmd /k "npm run dev"

REM Esperar unos segundos para que el frontend arranque
timeout /t 5

REM Abrir navegador en el frontend
start "" http://localhost:5173

REM Esperar a que el navegador se cierre
:check
timeout /t 2 /nobreak > nul
tasklist /FI "WINDOWTITLE eq Tracer*" 2>NUL | find /I /N "Tracer">NUL
if "%ERRORLEVEL%"=="0" goto check

REM Si el navegador se cerró, cerrar los procesos
taskkill /F /FI "WINDOWTITLE eq Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq Frontend*" >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM uvicorn.exe >nul 2>&1

exit 