# Free Local SIP Lab (Asterisk + Obelisk)

This gives you a no-cost SIP test setup on your machine.

## What you get

- Local Asterisk SIP registrar on `127.0.0.1:5060`
- Test softphone account:
  - username: `1001`
  - password: `1001pass`
- Obelisk SIP account:
  - username: `obelisk`
  - password: `obeliskpass`
- Test dialplan:
  - Dial `700` from softphone account `1001` to call Obelisk

## Prerequisite

Install Docker Desktop (Windows) and make sure `docker compose` works.

## Start Asterisk

From repo root:

```powershell
cd "c:\personal works\Ideo-video-Tool\sip-lab"
docker compose up -d
```

## Verify Obelisk config

`obelisk/config.local.toml` is already wired for this lab:

- `sip.port = 5070` (avoids conflict with Asterisk 5060)
- `username = "obelisk"`
- `password = "obeliskpass"`
- `realm = "asterisk.local"`
- `registrar = "sip:127.0.0.1:5060"`

## Start Obelisk

From repo root:

```powershell
.\run_obelisk_local.cmd
```

## Softphone setup (free)

Use any free SIP softphone (MicroSIP/Linphone/Zoiper free).

Account values:

- SIP server/domain: `127.0.0.1`
- Transport: `UDP`
- Username: `1001`
- Password: `1001pass`
- Port: `5060`

Then dial `700`.

## Stop lab

```powershell
cd "c:\personal works\Ideo-video-Tool\sip-lab"
docker compose down
```
