@echo off
setlocal

set REPO_ROOT=%~dp0..\..
set MAILER_DIR=%REPO_ROOT%\smtp-mailer

if not exist "%MAILER_DIR%\Cargo.toml" (
  echo smtp-mailer repo not found at "%MAILER_DIR%"
  exit /b 1
)

if "%OPENTALK_CTRL_RABBIT_MQ__URL%"=="" set OPENTALK_CTRL_RABBIT_MQ__URL=amqp://guest:guest@localhost:5672
if "%OPENTALK_CTRL_RABBIT_MQ__MAIL_TASK_QUEUE%"=="" set OPENTALK_CTRL_RABBIT_MQ__MAIL_TASK_QUEUE=opentalk_mailer
if "%MAILER_SMTP_SERVER%"=="" set MAILER_SMTP_SERVER=smtp://localhost:1025?disable_starttls=true
if "%MAILER_FROM_NAME%"=="" set MAILER_FROM_NAME=OpenTalk Local
if "%MAILER_FROM_EMAIL%"=="" set MAILER_FROM_EMAIL=no-reply@localhost
if "%OPENTALK_PUBLIC_HOST%"=="" set OPENTALK_PUBLIC_HOST=localhost
if "%MAILER_FRONTEND_BASE_URL%"=="" set MAILER_FRONTEND_BASE_URL=http://%OPENTALK_PUBLIC_HOST%:3000

set MAILER_CONFIG_PATH=%MAILER_DIR%\config.local.toml
(
  echo [rabbit_mq]
  echo url = "%OPENTALK_CTRL_RABBIT_MQ__URL%"
  echo mail_task_queue = "%OPENTALK_CTRL_RABBIT_MQ__MAIL_TASK_QUEUE%"
  echo.
  echo [smtp]
  echo smtp_server = "%MAILER_SMTP_SERVER%"
  echo from_name = "%MAILER_FROM_NAME%"
  echo from_email = "%MAILER_FROM_EMAIL%"
  echo.
  echo [frontend]
  echo base_url = "%MAILER_FRONTEND_BASE_URL%"
  echo data_protection_url = "%MAILER_FRONTEND_BASE_URL%/dataprotection"
  echo.
  echo [monitoring]
  echo addr = "0.0.0.0"
  echo port = 11411
) > "%MAILER_CONFIG_PATH%"

cd /d "%MAILER_DIR%"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
set RUST_LOG=info
"%USERPROFILE%\.cargo\bin\cargo.exe" run -- --config "%MAILER_CONFIG_PATH%"

endlocal
