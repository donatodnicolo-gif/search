@echo off
REM Applica le migrazioni e deploya le Edge Functions di Deluxy Scout.
REM Si lancia con un DOPPIO CLIC: chiede il token, fa tutto, resta aperto a
REM mostrare l'esito.
REM
REM Esiste perche' il comando da terminale (`$env:SUPABASE_PAT = "..."` piu' la
REM riga di node) va copiato in due pezzi e in PowerShell, e ogni volta che non
REM viene lanciato restano funzioni pubblicate ma spente nell'app.
REM
REM Il token NON viene salvato da nessuna parte: vive solo dentro questa
REM finestra e sparisce quando si chiude.

setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo   Deluxy Scout - allineamento del database
echo ============================================================
echo.
echo Serve il token Supabase (comincia per sbp_).
echo Se non ce l'hai, si crea in mezzo minuto qui:
echo    https://supabase.com/dashboard/account/tokens
echo    Generate new token  ^-^>  copia il valore
echo.

set /p SUPABASE_PAT=Incolla il token e premi Invio:

if "%SUPABASE_PAT%"=="" (
  echo.
  echo Nessun token inserito: non e' stato fatto niente.
  echo.
  pause
  exit /b 1
)

echo.
echo Vado. Ci vuole un minuto o due...
echo.

node scripts/allinea-supabase.mjs

echo.
echo ============================================================
echo   Finito. Leggi sopra se qualche passo e' fallito.
echo ============================================================
echo.
pause
