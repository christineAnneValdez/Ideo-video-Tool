@echo off
setlocal

set REPO_ROOT=%~dp0
set OBELISK_DIR=%REPO_ROOT%obelisk
set CONFIG_FILE=%OBELISK_DIR%\config.local.toml

if not exist "%OBELISK_DIR%\Cargo.toml" (
  echo obelisk project not found at "%OBELISK_DIR%"
  exit /b 1
)

if not exist "%CONFIG_FILE%" (
  echo Missing "%CONFIG_FILE%"
  exit /b 1
)

set PATH=%USERPROFILE%\.cargo\bin;%PATH%
set RUST_LOG=info

cd /d "%OBELISK_DIR%"
cargo run --release -- --config "%CONFIG_FILE%"

endlocal
