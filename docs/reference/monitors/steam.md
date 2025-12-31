# Steam Monitor

Queries game servers using the Source Engine A2S protocol.

## Basic Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: game-server
  namespace: yuptime
spec:
  type: steam
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 10
  target:
    steam:
      host: "game.example.com"
      port: 27015
```

## Target Configuration

```yaml
target:
  steam:
    host: "game.example.com"           # Required: server host
    port: 27015                         # Required: query port
    minPlayers: 0                       # Optional: minimum player count
    maxPlayers: 32                      # Optional: maximum player count
    expectedMap: "de_dust2"             # Optional: required map name
```

## Examples

### Basic Server Check

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: csgo-server
  namespace: yuptime
  labels:
    game: cs2
spec:
  type: steam
  schedule:
    intervalSeconds: 60
    timeoutSeconds: 15
  target:
    steam:
      host: "cs2.example.com"
      port: 27015
  alerting:
    alertmanagerUrl: "http://alertmanager:9093"
    labels:
      severity: warning
```

### With Player Validation

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: tf2-server
  namespace: yuptime
spec:
  type: steam
  schedule:
    intervalSeconds: 120
    timeoutSeconds: 15
  target:
    steam:
      host: "tf2.example.com"
      port: 27015
      minPlayers: 1
      maxPlayers: 24
```

## Supported Games

- Counter-Strike 2 / CS:GO
- Dota 2
- Team Fortress 2
- Left 4 Dead / Left 4 Dead 2
- Garry's Mod
- Other Source Engine games

## Response Data

The monitor extracts: server name, current map, player count, bot count, and VAC status.
