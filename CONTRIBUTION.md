# Contributing to Mooz

First off — thanks for taking the time to contribute. Seriously. Whether you're fixing a bug, suggesting an idea, or cleaning up a typo in the docs, every bit helps and is genuinely appreciated.

This document is a guide to making that process smooth for everyone. Read through it before opening a PR, it'll save you (and the maintainers) time. 

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Before You Start](#before-you-start)
- [Claiming an Issue](#claiming-an-issue)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Submitting a Pull Request](#submitting-a-pull-request)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Guidelines](#coding-guidelines)
- [Commit Messages](#commit-messages)
- [Branching Strategy](#branching-strategy)

---

## Code of Conduct

Be kind. Be constructive. This is a project built in the open, and everyone — regardless of experience level — should feel welcome to participate. Criticism of code is fine; criticism of people is not.

In short: treat others the way you'd want to be treated in a code review.

---

## Before You Start

- **Check open issues first.** Someone might already be working on the same thing. If you find an existing issue you want to work on, comment `.take` to get assigned — see [Claiming an Issue](#claiming-an-issue) below.
- **For anything non-trivial,** open an issue and describe what you want to build or fix *before* writing the code. It prevents situations where a PR gets declined because the direction doesn't fit.
- **For small fixes** (typos, docs, minor bugs) — just open the PR directly. No need to over-process it.

---

## Claiming an Issue

We use a bot to handle issue assignments. If you find an open issue you want to work on, all you need to do is comment:

```
.take
```

The bot will assign you to the issue and reply with a confirmation. Simple as that.

**A few things to know:**

- **The comment must be exactly `.take`** — nothing before or after it, no punctuation. Just `.take` on its own line.
- **If the issue is already assigned,** the bot will let you know and won't override the existing assignment. If the assignee has maybe gone quiet for a while, leave a comment tagging a maintainer and ask for it to be reassigned.
- **Once assigned,** fork the repo, create your own branch from `dev`, and open a PR when you're ready. There's no deadline, but please give a heads-up if life happens and you need to drop it — it frees it up for someone else.

> [!NOTE]
> The `.take` bot only works on issues, nothing else.

---

## How to Contribute

### Reporting Bugs

If something is broken, we want to know. Open an issue and include:

- **A clear, concise title** — e.g. *"Camera freezes after screen share ends"* not *"bug with video"*
- **Steps to reproduce** — numbered steps that consistently cause the problem
- **Expected behaviour** — what should have happened
- **Actual behaviour** — what actually happened
- **Environment** — browser (and version), OS, any relevant network setup (e.g. behind NAT/VPN)
- **Screenshots or console logs** if they're helpful

The more specific you are, the easier it is to understand and the faster it gets fixed.

---

### Suggesting Features

Mooz is intentionally kept lean, so not every idea will be a fit — but that doesn't mean you shouldn't share them. Open an issue and tell us:

- **The problem you're trying to solve** — "as a user I want to..." is more useful than "add feature X"
- **Your proposed solution** — even a rough sketch is fine
- **Any alternatives you considered**

---

### Submitting a Pull Request

1. **Fork the repo** and clone your fork locally
2. **Create a branch** off `dev` (not `main`) — see [Branching Strategy](#branching-strategy)
3. **Make your changes**
4. **Run the linter** — `npm run lint` — and make sure it passes
5. **Test manually** — spin up the dev environment and verify your changes work end-to-end
6. **Push to your fork** and open a PR against the `dev` branch
7. **Fill in the PR description** — explain what changed and why. If it fixes an issue, reference it: `Closes #123`

A maintainer will review your PR. There might be feedback — that's normal and expected. Please don't take it personally; it's how good software gets made.

---

## Development Setup

### Prerequisites

- **Node.js** v18+ and **npm** v9+

### Steps

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/Mooz.git
cd Mooz

# 2. Install all workspace dependencies
npm install

# 3. Start the dev servers
npm run dev
```

- **Client** runs at `http://localhost:3000`
- **Signaling server** runs at `http://localhost:8080`

Open two browser tabs (or use two different browsers) to test a real peer-to-peer connection locally(Make sure they are unique browser instances so they dont interfere with each other or use incognito mode for one of them).

---

## Project Structure

```
Mooz/
├── client/                  # Frontend — HTML, CSS, plain JS
│   ├── index.html           # Landing / room creation page
│   ├── connect.html         # In-meeting page
│   ├── index.js             # WebRTC + signaling client logic
│   └── style.css
│
├── services/
│   └── signaling/           # Node.js WebSocket signaling server
│       └── server.js        # Room management, SDP/ICE relay
│
├── scripts/                 # Dev utility scripts
├── tests/                   # Test suite
└── docs/                    # Additional documentation
```

The client and signaling service are separate npm workspaces managed by Turborepo. If you're adding a new service or package, follow the same workspace convention.

---

## Coding Guidelines

**General**
- Keep things simple. If something can be done without adding a dependency, do it without the dependency.
- The client is plain JavaScript — no build step, no bundler, no framework. Keep it that way unless there's a very strong reason not to.
- The signaling server is intentionally thin. Its only job is to relay messages between peers — don't add business logic to it.

**Formatting**
- Code is formatted with [Prettier](https://prettier.io/). The config lives in [`.prettierrc`](./.prettierrc).
- Formatting is enforced automatically via a Husky pre-commit hook — you don't have to think about it, just let it run.
- If you want to manually format: `npm run lint:fix`

**Naming**
- Variables and functions: `camelCase`
- HTML element IDs: `camelCase` (e.g. `debugPanel`, `localVideo`)
- CSS classes: `kebab-case`
- Files: `camelCase` or `kebab-case` — just be consistent with whatever's already in that directory

**WebRTC specifics**
- Every `RTCPeerConnection` must be cleaned up on disconnect — close it and remove the associated UI.
- ICE candidates should always be trickled, not batched.
- Don't assume a stable network. Handle ICE failures and renegotiation gracefully.

---

## Commit Messages

We use a loose version of [Conventional Commits](https://www.conventionalcommits.org/). Your commit messages don't have to be perfect, but they should be descriptive enough that someone can understand the change without reading the diff.

**Format:**
```
<type>: <short description>
```

**Types:**
| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace — no logic change |
| `refactor` | Code change that isn't a fix or feature |
| `test` | Adding or updating tests |
| `chore` | Tooling, deps, build config |

**Examples:**
```
feat: add mute toggle for local audio track
fix: prevent duplicate peer_joined events on reconnect
docs: document ICE candidate flow in CONTRIBUTION.md
refactor: extract avatar color logic into helper function
```

Avoid vague messages like `fix stuff`, `update`, or `WIP`. They make the git history useless.

---

## Branching Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, production-ready code — do not push directly |
| `dev` | Active development — PRs merge here |
| `feat/<name>` | New features |
| `fix/<name>` | Bug fixes |
| `docs/<name>` | Documentation changes |

**Always branch off `dev`.** PRs targeting `main` directly will be asked to retarget.

---

## Questions?

If you're stuck or unsure about something, just open an issue and ask. There are no dumb questions — especially when it comes to systems such as this one, which has more than enough sharp edges to confuse anyone.

Thanks again for contributing. Break a leg!!! 
