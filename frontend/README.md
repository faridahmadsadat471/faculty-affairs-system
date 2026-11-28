# Bost University Faculty Affairs Frontend

React and Tailwind CSS, written in JavaScript. This is the separate frontend for the existing Express API.

## Run locally

Start the backend in one terminal:

```powershell
cd E:\faculty-affairs-mern\backend
npm run dev
```

Start the frontend in another terminal:

```powershell
cd E:\faculty-affairs-mern\frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with an existing account. The default `/api` base uses the Vite development proxy to port 5000. `.env.example` contains public configuration only. Never copy backend secrets into `VITE_*` variables. A production deployment needs an `/api` reverse proxy or an explicitly configured public API URL and matching CORS origin; Vite's development proxy is not part of the production build.

## Current step

- University branding, Pashto RTL login, and credentials cleared after login/logout and page restoration.
- Authenticated dashboard with live summary counts, employment distribution, five recent faculty records, and the first five approved contracts expiring within 30 days.
- Faculty list with submitted search, exact department, academic rank, employment status, page-size filters, and pagination.
- Faculty details including education and employment history in an accessible native dialog.
- Account details, server-side logout, and automatic return to login when the API returns 401.
- Create and edit the main faculty fields for administrators and directorate staff, with validation, duplicate-ID feedback, and success notices.
- Restore the current tab's session through `/auth/me` after a page refresh while keeping the current hash route.
- Administrator-only faculty archiving from the list or details, with explicit confirmation, server-verified completion, and refreshed scoped counts.

The backend enforces all role and department scopes. The frontend uses its scoped responses and does not fetch other users' unrestricted records. A department manager needs a linked faculty profile with a configured department. Faculty members see only their linked records. Dashboard counts are actual API responses; loading failures are not shown as zero.

Faculty forms cover name, employee identifier, department, academic rank, employment status, email, and phone. Editing sends only changed fields; education, history, linked accounts, and documents are preserved. Archiving sets the existing backend soft-archive marker: the record remains stored, and its related records are omitted from normal scoped lists/reports. Linked user accounts are not disabled. A restore screen is not implemented. The other module management screens remain separate development steps. The current academic rank values follow the existing backend schema; final university terminology still needs confirmation.

## Files and responsibilities

- `src/App.jsx`: keeps the login form mounted and switches to the authenticated management area.
- `src/context/SessionContext.jsx`: shares the signed-in user and authenticated API requests. A 401 ends the local session.
- `src/hooks/useApiData.js`: fetches data, cancels stale requests, handles loading/errors, and supports retry.
- `src/components/ManagementApp.jsx`: responsive sidebar, hash navigation, logout, and faculty dialog selection.
- `src/pages/DashboardPage.jsx`: reads `/reports/summary`, `/faculty`, and `/reports/contracts/expiring`.
- `src/pages/FacultyPage.jsx`: applies search/filter values through `URLSearchParams`; changing filters starts at page one.
- `src/components/FacultyTable.jsx` and `FacultyDetails.jsx`: reusable record display and detail dialog.
- `src/components/FacultyArchiveDialog.jsx`: confirms the selected name and employee ID before sending DELETE; Cancel/Escape do not send a request. During submission duplicate confirmation and dismissal are blocked. Uncertain failures require refreshing the list before another attempt.
- `src/pages/AccountPage.jsx`: displays the current account's public information.
- `src/services/api.js`: JSON fetch client, including structured validation errors.
- `src/services/session-store.js`: stores only the access token and expiry metadata (`null` for new sessions) in `sessionStorage`; never stores a password or a trusted cached role.
- `src/pages/FacultyEditorPage.jsx` and `src/components/FacultyForm.jsx`: authorized create/edit pages and validated form.
- `src/utils/faculty-form.js`: whitelisted, normalized create payloads and partial edit payloads.
- `src/utils/labels.js`: Pashto labels and number/date formatting.
- `src/styles/index.css` and `management.css`: shared branding and responsive management styles.

The access token is kept in the current tab's `sessionStorage`. New logins return `expiresIn: null`: their signed JWT has no time expiry, and the frontend has no automatic logout timer, so time passing while filling a form does not unmount it. Explicit logout revokes that token in MongoDB without a TTL deletion date. Password changes/resets and account role/activation changes still revoke sessions through the existing token-version checks. Every authenticated request still checks the current account and revocation status. A stolen token can remain usable until revoked, so sign out after using a shared computer. Previously issued 15-minute tokens retain their original expiry; sign out and back in once after this update.

On refresh, the application waits for `/auth/me` before opening any management page and obtains the current identity and role from the server. The existing hash route, including a create/edit page, is retained. This change does not save drafts: unsaved form changes can still be lost by refreshing, navigating away, or closing the tab. A network failure during restoration offers retry and does not discard a still-valid token. If browser policy blocks session storage, login still works in memory and a notice explains the refresh limitation. Tokens in browser storage remain accessible to same-origin JavaScript; production authentication may later move to an HttpOnly cookie design.

## Check the step

```powershell
npm test
npm run build
```

Sign in, compare dashboard values with the API, open **د استادانو سوابق**, submit search and filters, change pages, and open a faculty detail dialog. Escape closes the dialog. Use **زما حساب** to check the role, then logout and confirm both login fields are empty. Check a narrow viewport for the expandable navigation and horizontally scrollable table.

Refresh while viewing `#/faculty` or `#/account`: the current page should reopen after account verification. With an administrator or directorate-staff account, use **نوی استاد**, submit valid details, then use **سمون** to change a field. Duplicate employee IDs must show an error. A manager or faculty member must not see write controls, and direct create/edit routes must show an access error. Verify that logout followed by refresh stays on the login page. Automated frontend tests cover storage recovery/expiration, malformed and blocked storage, payload normalization, preservation of unrelated fields, and write-control roles. Backend form integration tests verify optional-email clearing, duplicate identifiers, role enforcement, and revoked-session restoration.

For isolated local browser testing, `backend/test-support/frontend-preview.js` can run a temporary test API on port 5002. Start a second Vite server with `API_PROXY_TARGET=http://127.0.0.1:5002` and `npm run dev -- --port 5174`. These local helpers remain excluded from GitHub as requested. Never create browser-test fixtures in the project's normal database.

Archive verification: sign in as an administrator, open **آرشیف**, check the displayed identity, and cancel first; the record must remain. Confirm a disposable record, then verify it disappears and counts refresh. Staff/managers/faculty members must not see the archive control. When the last record on a filtered last page is archived, the list returns to a valid page while retaining filters and page size. For isolated browser verification, set `FRONTEND_ARCHIVE_FIXTURES=1` before starting the fixture API to add 11 disposable profiles in the `Archive QA` department. This makes the second page contain one result at a page size of 10.

Latest archive verification: all 12 frontend unit tests, 9 targeted backend archive/report tests, and the production build passed. In Chrome against the isolated API, Cancel preserved the selected record; explicit confirmation archived it, reduced the filtered count from 11 to 10, and returned page 2 to page 1 of 1 while retaining the department filter. The normal application was restored, and both owned QA servers were stopped; the isolated API ran its database cleanup handler. Earlier verification covered faculty creation/editing, optional-email clearing, session restoration and logout, and all 190 backend tests.

Latest session-policy verification: all 193 backend tests, 13 frontend tests, and the production build passed. Coverage includes authentication with a persistent session issued two days earlier, storage recovery after a year of simulated elapsed time, immediate logout revocation and persistence after database reconnection, password/account invalidation, legacy expiration, malformed session claims, and retained TTL cleanup for legacy revocations.

## Brand assets

The logo was supplied by the project owner. The campus photograph and navy `#00205F`, gold `#F8CA4D`, and coral `#FC6441` reference colors come from https://bost.edu.af/. Noto Sans Arabic is hosted locally under the SIL Open Font License; see `public/fonts/OFL.txt`.
