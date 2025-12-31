# Steam Monitor

The Steam monitor queries game servers using the Source Engine A2S protocol.

## Example

```yaml
apiVersion: monitoring.yuptime.io/v1
kind: Monitor
metadata:
  name: steam-server-check
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
    host: "game.example.com"           # Game server host
    port: 27015                         # Game server query port
    minPlayers: 0                       # Minimum player count (optional)
    maxPlayers: 32                      # Maximum player count (optional)
    expectedMap: "de_dust2"             # Required map name (optional)
```

## Success Criteria

The monitor validates:

| Field | Description |
|-------|-------------|
| `minPlayers` | Fail if player count is below minimum |
| `maxPlayers` | Fail if player count exceeds maximum |
| `expectedMap` | Fail if server is running a different map |

## Supported Games

Works with Source Engine and Source 2 games including:

- Counter-Strike 2 / CS:GO
- Dota 2
- Team Fortress 2
- Left 4 Dead / Left 4 Dead 2
- Garry's Mod
- Other Source-based games

## Response Data

The monitor extracts:
- Server name
- Current map
- Player count / max players
- Bot count
- VAC status
