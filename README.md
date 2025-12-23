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
- **Dark Mode**: Toggle between light and dark themes
- **Auto-updater**: Automatic updates via GitHub releases

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
│       ├── hooks/              # Custom hooks
│       ├── stores/             # Zustand stores
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
│   │   └── pinned.rs           # Pinned messages commands
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

## Releases

Releases are created automatically via GitHub Actions when a version tag is pushed:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers a build for:
- macOS (ARM64 + x64)
- Linux (AppImage + DEB)
- Windows (MSI + NSIS)

## License

MIT
