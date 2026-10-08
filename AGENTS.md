# EFESMS — Working Rules

## HARD RULE: Never mix projects

This project runs in COMPLETE ISOLATION from every other project on this machine,
especially `C:\Users\hp\Documents\New OpenCode Project` (Table Charm, etc.).

- Never run, stop, or touch another project's processes, servers, or files.
- Never start EFESMS commands from another project's directory.
- Never use another project's port. EFESMS owns:
  - Frontend dev server: **port 5173**
  - Backend API: **port 3001**
- If a port is already in use by another project's process, STOP and report it.
  Do NOT kill or assume it is ours. Verify ownership first.
- EFESMS project root: `C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION`
- The SRS/docs live here (separate but related):
  `C:\Users\hp\Documents\New folder\EXTREME DESIGN FOLDER APPLICATION\docs`

Before starting any dev server, verify the port is free and that no other project's
process is the listener. Confirm the served content is EFESMS before reporting success.

## Stack (committed)

- Backend: .NET 8 (C#), PostgreSQL, EF Core — critical systems grade
- Frontend: React 19 + TypeScript + Vite + MUI + PWA (JavaScript only)
- Frontend route map and API shape per the SRS (Sections 34, 36, 37)
