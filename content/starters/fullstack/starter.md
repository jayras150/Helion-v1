# HELION fullstack starter

Use this baseline when the request needs a backend, persistence, or API.

Required shape:
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`
- `server.ts`
- `package.json`

Design language:
- Keep frontend and API types aligned.
- Include `/health` and focused REST endpoints.
- Use an in-memory store only when the user did not request a database.
- Handle loading, errors, empty data, and optimistic feedback in the UI.
- Keep dependencies minimal and ensure `npm start` works.
