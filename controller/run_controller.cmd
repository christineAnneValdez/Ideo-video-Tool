@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
set PATH=%USERPROFILE%\.cargo\bin;C:\Program Files\PostgreSQL\18\bin;%PATH%
set LIB=C:\Program Files\PostgreSQL\18\lib;%LIB%
set OPENTALK_CTRL_DATABASE__URL=postgres://postgres:anne@localhost:5432/opentalk
set OPENTALK_CTRL_OIDC__AUTHORITY=https://accounts.google.com
set OPENTALK_CTRL_OIDC__FRONTEND__CLIENT_ID=local-dev-frontend
set OPENTALK_CTRL_OIDC__CONTROLLER__CLIENT_ID=local-dev-controller
set OPENTALK_CTRL_OIDC__CONTROLLER__CLIENT_SECRET=local-dev-secret
set OPENTALK_CTRL_USER_SEARCH__USERS_FIND_BEHAVIOR=from_database
cargo run -- -c example/controller.toml
