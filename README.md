# TKN

TKN is an online pattern-mining project that exposes a powerful algorithm over a TCP interface. It leverages a real-time data processing pipeline to analyze and extract patterns from incoming data streams, and then persists the relationships between patterns in a Neo4j database. This project is designed to be robust, scalable, and easy to integrate into your existing infrastructure.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
  - [Server](#server)
  - [Observer (Core Algorithm)](#observer-core-algorithm)
  - [Pusher (Database Syncing)](#pusher-database-syncing)
- [Installation](#installation)
- [Usage](#usage)
  - [Starting the Server](#starting-the-server)
  - [Authentication](#authentication)
- [Configuration](#configuration)
- [Graceful Shutdown](#graceful-shutdown)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Online Pattern Mining:** Processes streaming data to extract and update patterns in real time.
- **TCP Interface:** Exposes a simple TCP server for easy integration.
- **Modular Design:** Uses a dedicated Observer for pattern mining and a Pusher for syncing tokens to a Neo4j database.
- **Real-Time Authentication:** Ensures secure connections with token-based authentication.
- **Graceful Shutdown:** Handles system signals to close connections and shutdown the server cleanly.
- **Logging:** Provides detailed logging for each step in the data pipeline for easier debugging and monitoring.

## Architecture

### Server

The TCP server is the entry point for client connections. It:

- Listens on a configurable port (default: 5000).
- Requires the first message from each client to be an authentication token.
- On successful authentication, it creates a dedicated processing pipeline for that connection using the Observer and Pusher components.
- Tracks active client connections and supports graceful shutdown.

### Observer (Core Algorithm)

The Observer is a custom stream transformer that:

- Reads incoming data as a series of bytes.
- Maintains a sliding window to build tokens.
- Computes pattern tokens and tracks them using a simple lifespan-based mechanism.
- Emits tokens downstream for further processing.
- Provides methods to inspect the current window and token bank, which are useful for debugging and testing.

### Pusher (Database Syncing)

The Pusher is a writable stream that:

- Buffers tokens received from the Observer.
- Processes tokens in batches.
- Creates or merges token nodes in a Neo4j database.
- Establishes relationships between token pairs to reflect the discovered pattern sequences.
- Uses a dedicated Neo4j session and transaction handling to ensure consistency and handle errors gracefully.

## Installation

1. **Clone the repository:**

```bash
git clone https://github.com/yourusername/tkn.git
cd tkn
```

2. **Install dependencies:**

Ensure you have Bun.js installed, then run:

```bash
bun install
```

3. **Set up Neo4j:**
   - Install and run a Neo4j instance.
   - Configure the connection in your project (typically via environment variables or a configuration file).

## Usage

### Starting the Server

Run the following command to start the TCP server:

```bash
bun start
```

By default, the server will listen on port 5000. You can change the port by modifying the startServer function parameters or by setting an environment variable if you implement that in your configuration.

### Authentication

The first message sent by a client must be an authentication token. In the current implementation, the token is validated against a hardcoded value ("valid_token"). Make sure to update this logic with your actual token validation mechanism for production use.

Example client connection using netcat:

```bash
echo "valid_token" | nc localhost 5000
```

### Configuration

- Port: Change the server port in the startServer function (default: 5000).
- Authentication: Replace the token validation logic with your custom implementation.
- Neo4j Connection: Update the Neo4j driver configuration in ../lib/clients to match your database credentials and connection details.

### Graceful Shutdown

The server listens for SIGINT and SIGTERM signals. Upon receiving a shutdown signal, it:

- Stops accepting new connections.
- Closes the Neo4j driver.
- Gracefully ends active client connections.
- Forces any lingering connections to close after a 5-second timeout.

## Contributing

Contributions are welcome! If you have any suggestions, bug reports, or improvements, please open an issue or submit a pull request on GitHub.

## License

This project is licensed under the MIT License.

TKN provides a robust framework for pattern mining in a streaming environment, making it an excellent choice for real-time data analysis applications. Enjoy exploring and extending its functionality!
