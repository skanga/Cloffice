# relay-workspace

OpenClaw plugin that exposes `workspace.*` Gateway RPC methods so the [Relay](https://github.com/seventeenlabs/relay) desktop app can browse and edit the agent's workspace remotely over WebSocket.

## What it does

The OpenClaw gateway protocol does not include file browsing RPCs by default. This plugin registers 6 custom gateway methods that Relay's file explorer calls when connected to a remote gateway:

| Method | Description |
|--------|-------------|
| `workspace.list` | List directory contents (filtered, capped) |
| `workspace.read` | Read file content (size-limited) |
| `workspace.write` | Create or overwrite a file |
| `workspace.stat` | Get file/directory metadata |
| `workspace.rename` | Rename or move a file/directory |
| `workspace.delete` | Delete a file or directory (recursive) |

## Installation

```bash
openclaw plugins install @seventeenlabs/openclaw-relay-workspace
```

Or install from a local path during development:

```bash
openclaw plugins install ./plugins/openclaw-relay-workspace
```

## Configuration

Add plugin config in your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "relay-workspace": {
        "config": {
          "maxListItems": 200,
          "maxReadBytes": 262144
        }
      }
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxListItems` | `200` | Maximum entries returned by `workspace.list` |
| `maxReadBytes` | `262144` (256 KB) | Maximum file size allowed by `workspace.read` |

## Security

- **Path traversal prevention**: All paths are resolved against the workspace root. Any path that resolves outside the boundary (e.g. `../../etc/passwd`) is rejected.
- **Hidden file filtering**: Dotfiles and OS metadata (`desktop.ini`, `thumbs.db`, `.DS_Store`) are excluded from listings and blocked from direct access.
- **Root deletion guard**: `workspace.delete` refuses to delete the workspace root directory.
- **Size limits**: `workspace.read` rejects files exceeding the configured byte limit.

## How it connects to Relay

```
┌─────────┐   WebSocket JSON-RPC   ┌──────────────────┐   Node.js fs   ┌───────────┐
│  Relay   │ ─── workspace.list ──→ │  relay-workspace │ ────────────→  │ Workspace │
│  (app)   │ ←── { items: [...] } ─ │    (plugin)      │ ←────────────  │   (disk)  │
└─────────┘                         └──────────────────┘                └───────────┘
```

1. Relay detects a non-localhost gateway URL → uses `RemoteFileService`
2. `RemoteFileService` calls `workspace.*` RPCs via the gateway client
3. This plugin handles those RPCs on the server and operates on the agent workspace directory
4. If the plugin is not installed, Relay shows a fallback UI with agent tool capabilities

## Development

The plugin source lives at `plugins/openclaw-relay-workspace/index.ts`. It uses:

- `definePluginEntry` from the OpenClaw Plugin SDK
- `api.registerGatewayMethod()` to add custom RPC methods
- `api.runtime.agent.resolveAgentWorkspaceDir()` to locate the workspace
- Standard Node.js `fs/promises` for all file operations

## License

MIT
