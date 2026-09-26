# Deploy Paletixa to Dokploy

This project is deployed as two separate Dokploy Dockerfile applications: `lapaletixatest` for validation and `lapaletixa` for production. Each app must build with the InsForge URL and anon key for its own backend.

## Quick path

1. Create one Dokploy application named `lapaletixatest` and point it at the test branch/source.
2. Create one Dokploy application named `lapaletixa` and point it at the production branch/source.
3. Configure each app as a Dockerfile deployment with context `.` and Dockerfile path `./Dockerfile`.
4. Add the required Vite values in Dokploy **Build Time Arguments** for each app.
5. Deploy and verify `lapaletixatest` before deploying `lapaletixa`.

## Dokploy app settings

| Setting | `lapaletixatest` | `lapaletixa` |
|---|---|---|
| Build type | Dockerfile | Dockerfile |
| Docker context path | `.` | `.` |
| Dockerfile path | `./Dockerfile` | `./Dockerfile` |
| Published container port | `80` | `80` |
| Build stage | default/final image | default/final image |
| InsForge backend | Test backend URL + anon key | Production backend URL + anon key |
| Source branch | Test branch | Production branch |

## Build-time arguments

Set these in Dokploy's **Build Time Arguments** for each application:

```text
VITE_INSFORGE_URL=https://<insforge-project>.us-east.insforge.app
VITE_INSFORGE_ANON_KEY=<anon-key>
```

These are Vite compile-time values and become part of the browser bundle. That is expected for the InsForge anon key, which is browser-public and protected by backend auth/RLS rules.

Do **not** use privileged InsForge keys here. Admin, API, service-role, or other full-access keys must never be placed in Vite variables, Docker build args, Docker runtime env, source code, or Dokploy frontend app settings.

## Deployment checklist

- [ ] `lapaletixatest` uses the test branch/source and test InsForge backend.
- [ ] `lapaletixa` uses the production branch/source and production InsForge backend.
- [ ] Both apps expose container port `80`.
- [ ] Both apps define `VITE_INSFORGE_URL` and `VITE_INSFORGE_ANON_KEY` as Build Time Arguments.
- [ ] No `.env*` files are sent in the Docker build context.
- [ ] Test deployment passes login, catalog, sales, and offline/PWA smoke checks before production deploy.

## Local image smoke check

Use the same build-time arguments locally when you want to verify the image before pushing a deployment change:

```bash
docker build \
  --build-arg VITE_INSFORGE_URL=https://<insforge-project>.us-east.insforge.app \
  --build-arg VITE_INSFORGE_ANON_KEY=<anon-key> \
  -t paletixa:local .

docker run --rm -p 8080:80 paletixa:local
```

Open `http://localhost:8080` and confirm direct routes refresh correctly. The Nginx config serves the SPA fallback through `index.html`, keeps generated static assets cacheable, and avoids immutable caching for the PWA service worker files so users can receive updates.

## Notes

- The Dockerfile uses Bun for dependency install/build because this repository has `bun.lock` and `bun run build` executes the existing `build` script.
- Runtime serving uses Nginx on port `80`; InsForge remains an external backend configured at build time.
- Dokploy build secrets are not needed for the browser-public anon key. Use secrets only for values that should not end up in a final image or browser bundle.
