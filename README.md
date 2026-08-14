# paletixa

Minimal frontend foundation built with Bun, Vite, React, TypeScript, and Tailwind CSS.

## Requirements

- [Bun](https://bun.sh/) 1.3 or later

## Installation

```bash
bun install
```

## Commands

```bash
bun run dev
bun run lint
bun run build
bun run preview
```

The development server listens on `0.0.0.0:5173`. From another computer on the same network, open:

```text
http://<VPS-IP>:5173
```

Ensure that TCP port `5173` is allowed by the VPS firewall and any cloud provider firewall. The Vite development server is intended for development only; use the production build in `dist/` for deployment.
