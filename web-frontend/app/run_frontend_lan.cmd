@echo off
setlocal
echo Starting frontend for LAN access on port 3000...
echo Open from phone: http://<your-pc-ip>:3000
call pnpm start --host 0.0.0.0 --port 3000
endlocal
