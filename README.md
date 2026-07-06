# Mooz

A lightweight, peer-to-peer video conferencing platform built on WebRTC with a mesh architecture. No accounts, no downloads — just share a link and talk.

---

## Features

- **Real-time video & audio** — direct peer-to-peer streams using WebRTC
- **In-room chat** — text messages broadcast to everyone in the room instantly
- **Screen sharing** — present your screen to all participants
- **Live metrics panel for debugging** — monitor average bitrate, FPS, RTT, and packet loss per peer
- **Room-based sessions** — join or create named rooms with shareable links
- **Mesh topology** — every peer connects directly to every other peer (no SFU)
- **Zero install for users** — runs entirely in the browser

---

## Architecture Overview

Mooz uses a **full-mesh WebRTC architecture**. The signaling server is only involved in the handshake — once peers exchange SDP offers/answers and ICE candidates, media flows directly between browsers with no server in the middle.

```
Client ─────────────────── Client
  │    \               /    │
  │     \             /     │
  │      Signaling Server   │
  │     /             \     │
  │    /               \    │
Client ─────────────────── Client
```

**Signaling flow:**
1. User opens a room link → connects to the WebSocket signaling server
2. Server registers the peer and broadcasts `peer_joined` to the room
3. New peer exchanges SDP `offer` / `answer` with each existing peer
4. Both sides exchange ICE candidates
5. WebRTC `RTCPeerConnection` is established — media flows directly between peers whenever possible; if a direct connection cannot be established, it is relayed through a TURN server.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Client | HTML, CSS, JavaScript |
| Signaling | Node.js, Express, `express-ws` (WebSockets) |
| Build tooling | Turborepo, npm workspaces |
| Code quality | Prettier, Husky, lint-staged |
| Containerization | Docker, Docker Compose |

---

## Getting Started

### Prerequisites

- **Node.js** v18+ and **npm** v9+
- (Optional) **Docker** & **Docker Compose** for containerized runs

### Local Development

```bash
# Clone the repo
git clone https://github.com/Lawrenceku/Mooz.git
cd Mooz

# Install all workspace dependencies
npm install

# Start everything (client + signaling server)
npm run dev
```

The client is served at **http://localhost:3000** and the signaling server runs on **http://localhost:8080**.

### Docker

```bash
# Build and start with Docker Compose
docker compose up --build
```

Exposes the same ports: client on `3000`, signaling on `8080`.

---

## Project Structure

```
Mooz/
├── client/                  # Frontend (HTML, CSS, JS)
│   ├── index.html           # Landing / room creation page
│   ├── connect.html         # In-meeting page
│   ├── index.js             # Core WebRTC + signaling client logic
│   └── style.css            # Styles
│
├── services/
│   └── signaling/           # WebSocket signaling server
│       └── server.js        # Room management, SDP/ICE relay
│
├── scripts/                 # Dev utilities
├── docs/                    # Additional documentation
├── tests/                   # Test suite
├── .github/workflows/       # CI workflows
├── compose.yaml             # Docker Compose config
├── Dockerfile               # Container build
├── turbo.json               # Turborepo pipeline
└── package.json             # Root workspace config
```

---

## How It Works

1. **User opens a room** — a unique room ID is generated and stored in the URL
2. **Signaling registers the peer** — the client sends a `register` message over WebSocket
3. **`client_ready` handshake** — the server replies with a snapshot of existing peers (`room_state`)
4. **Offer/Answer exchange** — the joining peer creates an RTCPeerConnection for every existing peer, sends an SDP `offer`, and waits for an `answer`
5. **ICE trickle** — both sides relay ICE candidates through the signaling server until a path is found
6. **Media flows** — once connected, audio/video streams directly between peers; the server is out of the loop
7. **Screen sharing** — any peer can request to present; the server enforces one presenter at a time via `present_request` / `present_ack`

---

## Current Limitations

> Mooz is intentionally lean and built for small groups. Here's what it doesn't do yet:

- **Mesh doesn't scale well** — each new participant adds N new peer connections. Works great up to ~6–8 people; beyond that, performance degrades.
- **No recording** — sessions are not captured server-side.
- **No authentication** — anyone with a room link can join.
- **No SFU / SVC** — there's no Selective Forwarding Unit to reduce bandwidth for large calls.
- **No persistent chat** — chat history is lost when you leave the room.


---

## Roadmap

- [ ] SFU integration for larger rooms
- [ ] End-to-end encrypted signaling
- [ ] Persistent chat / message history
- [ ] In-call reactions and hand raise
- [ ] Recording support
- [ ]  UI polish for better user experience
- [ ] Authentication / Authorization = protected rooms

---

## Contributing

Contributions are welcome! Whether it's a bug fix, a new feature, or a docs improvement — all PRs are appreciated!!

Please read [CONTRIBUTION.md](./CONTRIBUTION.md) before opening a pull request.

- [Report a bug](https://github.com/Lawrenceku/Mooz/issues)
- [Request a feature](https://github.com/Lawrenceku/Mooz/issues)

---

## Development Workflow

**Branches**
- `main` — stable, production-ready code
- `dev` — integration branch for ongoing work
- Feature branches follow the pattern `feat/<short-description>`
- Bug fixes use `fix/<short-description>`

**Pull Requests**
- Branch off `dev`, not `main`
- Keep PRs focused — one concern per PR
- All code is auto-formatted with Prettier via Husky pre-commit hooks

**CI**
- Prettier lint check runs on every push via GitHub Actions

---

## License

This project is licensed under the **MIT License**. See the [`LICENSE`](./LICENSE) file for details.