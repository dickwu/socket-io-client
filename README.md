# Socket.IO Client

A desktop application for testing Socket.IO connections. Built with Tauri, Next.js, and Ant Design.

## Features

- **Connection Management**: Save and manage multiple Socket.IO server connections
- **Event Listening**: Configure which events to listen for per connection
- **Real-time Event Display**: See incoming and outgoing events in real-time
- **Event Filtering**: Click on event tags to filter by event type
- **Message Sending**: Send custom events with JSON payloads
- **Emit History**: View and re-send previously emitted messages
- **Pinned Messages**: Save frequently used messages for quick re-sending
- **MCP Server**: Model Context Protocol integration for AI assistants (Cursor, Claude Code)
- **Dark Mode**: Toggle between light and dark themes
- **Auto-updater**: Automatic updates via GitHub releases

## MCP Integration

The app includes a built-in MCP (Model Context Protocol) server that enables AI assistants like Cursor and Claude Code to interact with your Socket.IO connections.

### Starting the MCP Server

1. Click the **MCP** button in the toolbar (or Settings icon with MCP label)
2. Configure the port (default: 3333)
3. Click **Start MCP Server**

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_connections` | List all saved Socket.IO connection profiles |
| `get_connection_status` | Get current connection status and active connection ID |
| `connect` | Connect to a Socket.IO server by connection ID |
| `disconnect` | Disconnect from the current Socket.IO server |
| `send_message` | Send an event with JSON payload to the server |
| `get_recent_events` | Get recent Socket.IO events (default: last 50) |
| `list_event_listeners` | List all active event listeners |
| `add_event_listener` | Add a listener for incoming events |
| `remove_event_listener` | Remove an event listener |

### Configuring MCP Clients

#### Cursor

**Quick Install:** Click the "Quick Install in Cursor" button in the MCP modal.

**Manual Configuration:** Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "socket-io-client": {
      "url": "http://localhost:3333/sse"
    }
  }
}
```

#### Claude Code

**Quick Install:** Click "Run for Claude" in the MCP modal (requires Claude CLI installed).

**Manual:** Run in terminal:

```bash
claude mcp add --transport http socket-io-client http://localhost:3333/sse
```

### MCP Endpoints

- `GET /sse` - Server-Sent Events stream for real-time updates
- `POST /sse` - JSON-RPC endpoint (with SSE response)
- `POST /message` - JSON-RPC endpoint (direct HTTP response)

## Tech Stack

- **Frontend**: Next.js 16, React 19, Ant Design 6, TailwindCSS 4
- **State Management**: Zustand
- **Socket**: socket.io-client 4
- **Desktop**: Tauri 2
- **Database**: SQLite (via rusqlite)
- **Package Manager**: Bun

## Development

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- [Rust](https://www.rust-lang.org/) (1.77+)
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
  - **Windows**: Microsoft Visual Studio C++ Build Tools

### Setup

```bash
# Install dependencies
bun install

# Run in development mode
bun tauri dev

# Build for production
bun tauri build
```

### Scripts

- `bun run dev` - Start Next.js development server
- `bun run build` - Build Next.js for production
- `bun tauri dev` - Run Tauri in development mode
- `bun tauri build` - Build Tauri for production
- `bun run format` - Format code with Prettier
- `bun run lint` - Run ESLint

## Project Structure

```
socket-io-client/
├── src/
│   └── app/
│       ├── components/         # React components
│       │   ├── McpModal.tsx    # MCP server management UI
│       │   └── ...
│       ├── hooks/              # Custom hooks
│       ├── stores/             # Zustand stores
│       │   ├── mcpStore.ts     # MCP state management
│       │   └── socketStore.ts  # Socket state management
│       ├── lib/                # Utilities
│       ├── globals.css         # Global styles
│       ├── layout.tsx          # Root layout
│       ├── page.tsx            # Main page
│       └── providers.tsx       # Context providers
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs              # Main Tauri setup
│   │   ├── main.rs             # Entry point
│   │   ├── db.rs               # SQLite operations
│   │   ├── connection.rs       # Connection commands
│   │   ├── emit_log.rs         # Emit log commands
│   │   ├── pinned.rs           # Pinned messages commands
│   │   ├── socket_client.rs    # Socket.IO client management
│   │   └── mcp_server.rs       # MCP HTTP server (JSON-RPC + SSE)
│   ├── capabilities/           # Tauri permissions
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
└── .github/
    └── workflows/
        ├── ci.yml              # CI build workflow
        └── release.yml         # Release workflow
```

## Database Schema

The app uses SQLite to persist data:

- **connections**: Saved connection profiles
- **connection_events**: Event listeners per connection
- **emit_logs**: History of sent messages
- **pinned_messages**: Saved favorite messages
- **app_state**: Application state (current selection)

## License

MIT
