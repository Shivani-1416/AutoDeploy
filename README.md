# AutoDeploy Platform

This is the first local Vite/React version of the AutoDeploy frontend.

## Run

```bash
npm install
npm run dev
```

Then open the URL shown by Vite (normally http://localhost:5173).

## Current state

The original uploaded AutoDeploy HTML prototype is preserved at:

`public/legacy.html`

The current prototype uses React/ReactDOM/HTM/Tailwind through CDNs and contains mock data and simulated deployment behavior.

## Next refactor

The next step is to convert the prototype into real React components:

- `src/pages/Dashboard.jsx`
- `src/pages/Projects.jsx`
- `src/pages/Deployment.jsx`
- `src/pages/Pipeline.jsx`
- `src/pages/Servers.jsx`
- `src/pages/Settings.jsx`
- `src/components/*`
- `src/services/api.js`

Then connect the frontend to the FastAPI backend.
