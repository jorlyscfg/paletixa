# paletixa

Frontend built with Bun, Vite, React, TypeScript, Tailwind CSS, and a prompt-based PWA.

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

## PWA deployment

`bun run build` generates the installable manifest and Workbox service worker in `dist/`. The service worker is intentionally disabled in development and uses a prompt before applying updates so POS and wholesale drafts are not reloaded unexpectedly.

Production hosting must use HTTPS (except for `localhost`) and route SPA deep links such as `/app`, `/mayoristas`, and `/reservas` to `index.html`. For an Nginx-style static host, the fallback is typically `try_files $uri $uri/ /index.html;`; keep backend/API proxy paths excluded from that fallback when the host also serves them.
