@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
set PATH=%USERPROFILE%\.cargo\bin;C:\Program Files\PostgreSQL\18\bin;%PATH%
set LIB=C:\Program Files\PostgreSQL\18\lib;%LIB%
set OPENTALK_CTRL_DATABASE__URL=postgres://postgres:anne@localhost:5432/opentalk
cargo run -- -c example/controller.toml migrate-db
