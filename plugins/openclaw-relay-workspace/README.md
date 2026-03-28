# relay-workspace

Compatibility plugin for the transitional OpenClaw runtime path used by Cloffice.

OpenClaw compatibility plugin that exposes the `workspace.*` RPC methods Cloffice currently uses to browse and edit a remote runtime workspace over WebSocket.

## What it does

The OpenClaw gateway protocol does not include file browsing RPCs by default. This plugin registers 6 custom methods that Cloffice calls when connected to a remote compatibility runtime:

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

## Why this still exists

This plugin is a compatibility artifact for Cloffice's current remote workspace path.
It is not the long-term architecture. The target state is a built-in Cloffice engine that owns runtime access directly.

## License

MIT

