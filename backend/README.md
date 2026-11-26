# Faculty Affairs System

A Faculty Affairs Management System designed for university administration.

## About
This project aims to provide a digital system for managing university faculty affairs.

## Technologies
- Node.js
- Express.js
- MongoDB
- JavaScript

## Project Structure
```text
faculty-affairs-mern/
└── backend/
```

## Developer
**Farid Ahmad Sadat**

GitHub: https://github.com/faridahmadsadat471

## Status
Under Development 🚀

## Backend API and verification

The backend includes faculty archive/search, promotion review, contract approval/renewal, research publication, awards, scoped reports, and authenticated PDF documents.

- Run the API from `backend`: `npm run dev` (port 5000).
- Run the full local integration suite: `npm test` (requires local MongoDB; uses isolated databases).
- For local Postman verification, start `npm run postman:server` (port 5001) and import `postman/faculty-affairs.postman_collection.json`.
- Read [the Pashto backend guide](docs/backend-guide.ps.md) for endpoints, request bodies, permissions, architecture, and current limits.

The `postman/` and `test-support/` folders are intentionally kept locally and excluded from GitHub. A fresh clone needs these local folders to run the full integration suite and Postman commands. This does not affect running the API with `npm start` or `npm run dev`.

Account administration, password changes/recovery, central audit logging, and encrypted offline backup/restore are also implemented. The updated collection contains 13 requests.

Verification: 185 automated tests passed. The original Postman suite passed 79 assertions; the added account, password, and audit workflow passed 22 assertions in Postman. Backup/restore was tested against isolated MongoDB databases, including BSON types, indexes, PDF bytes, invalid keys, corruption, and occupied targets.

Backup commands: `npm run backup:init-key`, then stop all writers and run `npm run backup -- --offline`. Read the Pashto guide before restoring. University policy decisions and frontend work remain.
