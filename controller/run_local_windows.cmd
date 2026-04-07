@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
set PATH=%USERPROFILE%\.cargo\bin;C:\Program Files\PostgreSQL\18\bin;%PATH%
set LIB=C:\Program Files\PostgreSQL\18\lib;%LIB%
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "opentalk-controller.exe"') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "cargo.exe"') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "minio.exe"') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "livekit-server.exe"') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "opentalk-smtp-mailer.exe"') do taskkill /PID %%p /F >nul 2>nul
set MINIO_ROOT_USER=minioadmin
set MINIO_ROOT_PASSWORD=minioadmin
set MINIO_DATA_DIR=%TEMP%\opentalk-minio-data
if not exist "%MINIO_DATA_DIR%" mkdir "%MINIO_DATA_DIR%"
start "minio-local" /B "%CD%\tools\minio.exe" server "%MINIO_DATA_DIR%" --address :9555 --console-address :9556 > minio.log 2> minio.err
for /L %%i in (1,1,10) do (
  curl.exe -sSf http://127.0.0.1:9555/minio/health/live >nul 2>nul && goto minio_up
  timeout /t 1 /nobreak >nul
)
echo MinIO did not become healthy
if exist minio.log type minio.log
if exist minio.err type minio.err
goto cleanup
:minio_up
"%CD%\tools\mc.exe" alias set local http://127.0.0.1:9555 minioadmin minioadmin >nul 2>nul
"%CD%\tools\mc.exe" mb --ignore-existing local/controller >nul 2>nul
if "%OPENTALK_PUBLIC_HOST%"=="" set OPENTALK_PUBLIC_HOST=localhost
set OPENTALK_PUBLIC_HOST=%OPENTALK_PUBLIC_HOST: =%
start "livekit-local" /B "%CD%\tools\livekit\livekit-server.exe" --dev --bind 0.0.0.0 --node-ip %OPENTALK_PUBLIC_HOST% > livekit.log 2> livekit.err
for /L %%i in (1,1,10) do (
  curl.exe -sS http://127.0.0.1:7880/ >nul 2>nul && goto livekit_up
  timeout /t 1 /nobreak >nul
)
echo LiveKit did not become healthy
if exist livekit.log type livekit.log
if exist livekit.err type livekit.err
goto cleanup
:livekit_up
if "%OPENTALK_ENABLE_LOCAL_RECORDER%"=="" set OPENTALK_ENABLE_LOCAL_RECORDER=1
if /I "%OPENTALK_ENABLE_LOCAL_RECORDER%"=="1" (
  start "recorder-agent" "%CD%\tools\run_local_recorder_agent.cmd"
)
echo OpenTalk public host: %OPENTALK_PUBLIC_HOST%
set OPENTALK_CTRL_DATABASE__URL=postgres://postgres:anne@localhost:5432/opentalk
set OPENTALK_CTRL_FRONTEND__BASE_URL=http://%OPENTALK_PUBLIC_HOST%:3000
set OPENTALK_CTRL_OIDC__AUTHORITY=http://%OPENTALK_PUBLIC_HOST%:8080/realms/OPENTALK
set OPENTALK_CTRL_OIDC__FRONTEND__CLIENT_ID=Frontend
set OPENTALK_CTRL_OIDC__CONTROLLER__CLIENT_ID=Controller
set OPENTALK_CTRL_OIDC__CONTROLLER__CLIENT_SECRET=local-dev-secret
set OPENTALK_CTRL_HTTP__ADDR=0.0.0.0
set OPENTALK_CTRL_LIVEKIT__PUBLIC_URL=ws://%OPENTALK_PUBLIC_HOST%:7880
set OPENTALK_CTRL_LIVEKIT__SERVICE_URL=http://127.0.0.1:7880
set OPENTALK_CTRL_LIVEKIT__API_KEY=devkey
set OPENTALK_CTRL_LIVEKIT__API_SECRET=secret
set OPENTALK_CTRL_USER_SEARCH__USERS_FIND_BEHAVIOR=from_database
if /I "%OPENTALK_ENABLE_SMTP_MAILER%"=="1" (
  if "%OPENTALK_CTRL_RABBIT_MQ__URL%"=="" set OPENTALK_CTRL_RABBIT_MQ__URL=amqp://guest:guest@localhost:5672
  if "%OPENTALK_CTRL_RABBIT_MQ__MAIL_TASK_QUEUE%"=="" set OPENTALK_CTRL_RABBIT_MQ__MAIL_TASK_QUEUE=opentalk_mailer
  start "smtp-mailer-local" /B "%CD%\tools\run_smtp_mailer.cmd" > smtp-mailer.log 2> smtp-mailer.err
)
if /I "%OPENTALK_FAST_START%"=="1" (
  set RUSTFLAGS=-Cdebug-assertions=off
  cargo run -- -c example/controller.toml
) else (
  cargo run --release -- -c example/controller.toml
)
:cleanup
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "minio.exe"') do taskkill /PID %%p /F >nul 2>nul
for /f "tokens=2" %%p in ('tasklist ^| findstr /i "livekit-server.exe"') do taskkill /PID %%p /F >nul 2>nul
endlocal
