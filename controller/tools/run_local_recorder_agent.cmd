@echo off
setlocal
set AGENT_DIR=%~dp0local-recorder-agent
if not exist "%AGENT_DIR%\node_modules" (
  echo Installing recorder agent dependencies...
  pushd "%AGENT_DIR%"
  call npm install
  popd
)
set LIVEKIT_URL=http://127.0.0.1:7880
set LIVEKIT_API_KEY=devkey
set LIVEKIT_API_SECRET=secret
set RECORDER_OUTPUT_DIR=%~dp0recordings
set RECORDER_LOG_DIR=%~dp0logs
if not exist "%RECORDER_LOG_DIR%" mkdir "%RECORDER_LOG_DIR%"
set RECORDER_LOG_FILE=%RECORDER_LOG_DIR%\local-recorder-agent.log
if /I "%RECORDER_DEBUG%"=="1" set LIVEKIT_DEBUG_LOG_ROOM_EVENTS=1
echo Recorder log: %RECORDER_LOG_FILE%
pushd "%AGENT_DIR%"
call npm start 1>> "%RECORDER_LOG_FILE%" 2>&1
popd
endlocal
