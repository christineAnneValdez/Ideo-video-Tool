@echo off
setlocal

set REPO_ROOT=%~dp0
set CONTROLLER_DIR=%REPO_ROOT%controller
set FRONTEND_DIR=%REPO_ROOT%web-frontend\app
set KEYCLOAK_DIR=%CONTROLLER_DIR%\tools\keycloak-24.0.5
set RABBITMQ_SBIN=C:\Program Files\RabbitMQ Server\rabbitmq_server-3.13.7\sbin
set JAVA_HOME=C:\Program Files\Java\jdk-17.0.4.1

echo === OpenTalk Local Full Stack Launcher ===
echo Repo: %REPO_ROOT%
echo.

if not exist "%CONTROLLER_DIR%\run_local_windows.cmd" (
  echo ERROR: controller launcher not found: "%CONTROLLER_DIR%\run_local_windows.cmd"
  exit /b 1
)

if not exist "%FRONTEND_DIR%\run_frontend_lan.cmd" (
  echo ERROR: frontend launcher not found: "%FRONTEND_DIR%\run_frontend_lan.cmd"
  exit /b 1
)

if not exist "%KEYCLOAK_DIR%\bin\kc.bat" (
  echo ERROR: Keycloak launcher not found: "%KEYCLOAK_DIR%\bin\kc.bat"
  exit /b 1
)

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo ERROR: JAVA_HOME is invalid: "%JAVA_HOME%"
  echo Please update JAVA_HOME in this script.
  exit /b 1
)

echo [1/4] Ensuring RabbitMQ is running on port 5672...
powershell -NoProfile -Command ^
  "$c=New-Object System.Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',5672); $open=$true}catch{$open=$false} finally{$c.Close()};" ^
  "if(-not $open){" ^
  "  if(Test-Path '%RABBITMQ_SBIN%\rabbitmq-server.bat'){" ^
  "    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k cd /d \"\"%RABBITMQ_SBIN%\"\" && rabbitmq-server.bat' -WindowStyle Minimized | Out-Null;" ^
  "    Start-Sleep -Seconds 12;" ^
  "  }" ^
  "}" ^
  "$c=New-Object System.Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',5672); $open=$true}catch{$open=$false} finally{$c.Close()};" ^
  "if(-not $open){ Write-Host 'WARNING: RabbitMQ is still not reachable on 5672. SMTP invitations will fail.' } else { Write-Host 'RabbitMQ is up.' }"

echo [2/4] Starting Keycloak on http://localhost:8080 ...
set KEYCLOAK_ADMIN=admin
set KEYCLOAK_ADMIN_PASSWORD=admin
start "keycloak-local" /B "%KEYCLOAK_DIR%\bin\kc.bat" start-dev --http-port=8080 --import-realm

echo Waiting for Keycloak to become reachable on port 8080...
powershell -NoProfile -Command ^
  "$deadline=(Get-Date).AddMinutes(3); $ok=$false; " ^
  "while((Get-Date)-lt $deadline){" ^
  "  $c=New-Object System.Net.Sockets.TcpClient; " ^
  "  try{$c.Connect('127.0.0.1',8080); $ok=$true; break} catch{} finally{$c.Close()}; " ^
  "  Start-Sleep -Seconds 3" ^
  "}; " ^
  "if($ok){ Write-Host 'Keycloak is up.' } else { Write-Host 'ERROR: Keycloak did not become reachable on 8080 in time.'; exit 1 }"
if errorlevel 1 exit /b 1

echo [3/4] Starting frontend on http://localhost:3000 ...
start "frontend-local" cmd /k "cd /d ""%FRONTEND_DIR%"" && run_frontend_lan.cmd"

echo [4/4] Starting controller stack (controller + minio + livekit + smtp-mailer) ...
start "controller-local" cmd /k "cd /d ""%CONTROLLER_DIR%"" && set ""OPENTALK_PUBLIC_HOST=localhost"" && set ""OPENTALK_FAST_START=1"" && set ""OPENTALK_ENABLE_LOCAL_RECORDER=0"" && set ""OPENTALK_ENABLE_SMTP_MAILER=1"" && set ""OPENTALK_CTRL_ENDPOINTS__EVENT_INVITE_EXTERNAL_EMAIL_ADDRESS=true"" && run_local_windows.cmd"

echo.
echo All services launched in separate windows.
echo - Keycloak:   http://localhost:8080
echo - Frontend:   http://localhost:3000
echo - Controller: http://localhost:11311
echo.
echo Keep those windows open while testing.

endlocal
