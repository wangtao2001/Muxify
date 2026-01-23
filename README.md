# Muxify

**Muxify** is a VSCode extension that allows you to visually manage tmux sessions, windows, and panes directly from the sidebar - no need to memorize complex tmux commands.

### Features

#### Session Management
- **Create Session**: Create new tmux sessions with custom names
- **Delete Session**: Remove sessions you no longer need
- **Rename Session**: Give sessions meaningful names
- **Attach to Terminal**: Open a VSCode terminal attached to the session

#### Window Management
- **Create Window**: Add new windows to a session
- **Delete Window**: Remove windows from a session
- **Rename Window**: Give windows descriptive names
- **Switch Window**: Quickly switch between windows (right-click on inactive windows)

#### Pane Management
- **Split Horizontal**: Split the current pane horizontally
- **Split Vertical**: Split the current pane vertically
- **Switch Pane**: Double-click on inactive panes to switch
- **Close Pane**: Close panes you no longer need

#### SSH Remote Support
- **Add SSH Connection**: Connect to tmux on remote servers
- **Password Authentication**: Support password-based SSH login
- **Private Key Authentication**: Support SSH key-based authentication
- **Edit/Remove Connection**: Manage your SSH connections

### Installation

1. Install from VSCode Marketplace or download the `.vsix` file
2. Make sure `tmux` is installed on your local machine or remote server
3. Click the Muxify icon in the activity bar to get started

### Usage

#### Basic Operations

| Action | How to |
|--------|--------|
| View sessions | Expand the "Local" node in the sidebar |
| Create session | Click the `+` button in the title bar |
| Attach to session | Right-click session → "Attach to Terminal" |
| Create window | Right-click session → "New Window" |
| Split pane | Right-click window/pane → "Split Horizontal/Vertical" |
| Switch pane | Double-click on inactive pane |
| Add SSH connection | Click the `+` button in the title bar |

#### Context Menu Options

**Session:**
- Attach to Terminal
- Rename Session
- New Window
- Delete Session

**Window (inactive):**
- Switch to Window
- Rename Window
- Split Horizontal/Vertical
- Delete Window

**Pane:**
- Switch to Pane (inactive only)
- Split Horizontal/Vertical
- Close Pane

### Requirements

- VSCode 1.85.0 or higher
- `tmux` installed on local machine or remote server
- For SSH: Remote server must have `tmux` installed

### Known Issues

- SSH password is not persisted (for security reasons)
- SSH connection may timeout after long periods of inactivity

### License

[MIT](LICENSE)