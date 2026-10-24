# CareNest — Self-Healing Hospital Management System (EJS version)

A modular Express + EJS + MongoDB college-project scaffold. The site is split into reusable EJS partials (`nav.ejs`, `footer.ejs`, `head.ejs`, `flash.ejs`) and separate page templates (`home.ejs`, `auth.ejs`, `dashboard.ejs`, etc.).

## Features included

1. Responsive, accessible, senior-friendly interface with clear labels and readable layout.
2. Patient registration and sign-in using bcrypt password hashing and server sessions.
3. Five failed sign-in attempts temporarily lock the account for 10 minutes.
4. Doctor directory and demo doctor seeding.
5. Doctor-managed weekly appointment slots, shown to patients with already-booked times removed.
6. Appointment booking for the signed-in patient or a family member.
7. Appointment history, rescheduling with any active doctor's available slot, and cancellation.
8. Waiting-list request and a basic freed-slot offer to the next waiting patient; final confirmation is deliberately left to staff.
9. Basic queue/waiting-list position estimate.
10. In-app notifications for appointment events and an optional email confirmation when a patient books an appointment.
11. Optional browser speech recognition for appointment reason (where supported).
12. Self-healing monitor checks MongoDB connection and host memory every 30 seconds; when enabled, it retries a failed MongoDB connection automatically while the web server remains available.
13. Incident logging with severity, observed issue and recovery action.
14. Admin metrics and incident review.
15. Safe fallback/error pages and health-status page.
16. Contact form stores a message in MongoDB; it does not send email in this starter.
17. Offline appointment requests are saved in browser IndexedDB and submitted to the authenticated booking endpoint when connectivity returns. The server checks availability before confirming and sending email.

## Setup on Windows

1. Install Node.js LTS and MongoDB locally, or create a MongoDB Atlas database.
2. Extract the ZIP and open the `carenest-ejs` folder in VS Code.
3. Copy `.env.example` to `.env`.
4. Edit `MONGODB_URI` in `.env` to your local MongoDB or Atlas connection string. Set a long random `SESSION_SECRET`.
   Set `SELF_HEALING_ADMIN_USERNAME` and `SELF_HEALING_ADMIN_PASSWORD` to private values for the protected self-healing panel. Do not use the example password in a deployed environment.
   To send appointment confirmations and reschedule/cancellation emails, set `EMAIL_USER` to your Gmail address and `EMAIL_APP_PASSWORD` to a Google App Password. Enable 2-Step Verification on the Google account and create an App Password; do not use your normal Gmail password. Keep these credentials only in `.env` and never commit that file.
5. Open the VS Code terminal in this folder and run:
   ```bash
   npm install
   npm run dev
   ```
6. Open `http://localhost:3000`.
7. Register a patient account, then sign in.
8. To enable demo doctors/admin tools: in MongoDB, open the `users` collection and change your own account's `role` field from `patient` to `admin`. Sign out and sign in again. Visit `/admin` and click **Seed demo doctors**.
9. Doctors can register at `/doctor/register`, then sign in at `/doctor/login` to add working days and appointment slots at `/doctor/schedule`, and reschedule or cancel upcoming appointments from `/doctor/dashboard`. Patients receive an in-app notification for doctor-initiated appointment changes.
10. Patients can book an open doctor slot at `/appointments/new`, then review `/appointments` and `/dashboard`. Supported browsers speak a short confirmation after a successful booking or reschedule; use the replay button if browser autoplay is blocked.
11. Use the **Self-healing** tab in the site navigation to open the protected panel. Sign in with the configured self-healing admin credentials to view service status, run each resilience check separately, or run the full suite. The **Self-healing** switch controls whether recovery actions execute; when off, checks stop after diagnosis and are labeled **Disabled**, with no recovery action or test notification sent. Its setting is stored in `data/self-healing-settings.json` and survives a server restart. When enabled, the notification scenario tests in-app delivery using a temporary notice. It does not send email or SMS; appointment confirmation and update emails are separate features.
12. To use offline appointment requests, sign in and open `/appointments/new` at least once while online in a browser that supports service workers and IndexedDB. Wait for the page to finish loading so the service worker can cache the offline form and the doctor list can be saved. Then disconnect and navigate to any page on your site; it will show the offline request form. The request stays on that device until internet returns and the same patient signs in again. The requested date/time is checked against the live doctor schedule only after sync; saving offline is not a reservation or confirmation. Service workers require HTTPS except on `localhost`, so plain HTTP sites opened through a LAN IP will not support this.

## Folder structure

```text
carenest-ejs/
├── server.js
├── models/                 # Mongoose models
├── services/selfHealing.js # Health monitor and incident logger
├── services/selfHealingScenarios.js # Isolated resilience checks and execution log
├── views/
│   ├── partials/
│   │   ├── head.ejs
│   │   ├── nav.ejs
│   │   ├── flash.ejs
│   │   └── footer.ejs
│   ├── home.ejs
│   ├── auth.ejs
│   ├── dashboard.ejs
│   ├── doctors.ejs
│   ├── appointment-form.ejs
│   ├── appointments.ejs
│   ├── queue.ejs
│   ├── self-healing.ejs
│   ├── admin.ejs
│   ├── about.ejs
│   ├── contact.ejs
│   ├── 404.ejs
│   └── 500.ejs
└── public/
    ├── css/style.css
    └── js/main.js
```

## Important demo limitations

- This is a learning scaffold, not a production hospital system. Do not store real patient/medical data.
- Offline requests and the saved patient name are stored in that browser's local IndexedDB until synced. Device storage is not encrypted by this app; use only on a trusted, private device and do not use this feature for real patient data without an appropriate privacy/security design.
- Doctors manage weekly working days, clinic hours and optional specific appointment start times; patients can only book open times in that schedule.
- Doctor profile photos are optional local JPG, PNG or WebP uploads, limited to 5 MB.
- Appointment availability is checked again when the booking is submitted, but this starter does not integrate with a real hospital system.
- Email confirmations and appointment update emails are sent only while self-healing is enabled. While it is off, emails are durably queued in `data/pending-appointment-emails.json` and sent when the switch is turned on; reminders are not implemented. SMS remains a dry-run, and payment, medical records, and real AI inference are not implemented. Notifications are also stored in-app; “AI-like” behaviour is not claimed.
- The health monitor detects database disconnection and high memory usage; recovery relies on Mongoose's connection retry and safe UI fallbacks. It does not auto-restart the process or repair arbitrary application bugs.
- The basic account lockout should be supplemented with IP-based rate limiting, CSRF protection, HTTPS, stronger admin access controls and security review before any public deployment.
- To create an admin, manually update your own user document's `role` to `admin` in MongoDB. Never add public admin registration.

## Self-healing demo suggestion

1. Start the app with MongoDB available and open `/self-healing/login`.
2. After signing in, the protected monitor session remains available across server restarts until its session expires; it is stored locally in the ignored `data/self-healing-sessions.json` file. The dashboard shows live MongoDB state and the latest result for the doctor directory, notification adapter and data integrity checks. If MongoDB is unreachable, the panel remains available and displays a database-unavailable warning.
3. Use the self-healing switch to turn automatic MongoDB reconnect retries on or off. Database-backed pages return an unavailable response instead of showing collection data while MongoDB is disconnected. With recovery off, scenarios are diagnosed and logged without executing their recovery actions.
4. Run individual checks: isolated MongoDB reconnect, live doctor directory response, browser/server network connectivity, isolated duplicate request rejection, SMS adapter dry-run, and isolated appointment/slot reconciliation.
5. Each standard scenario stays visible for at least 10 seconds. Live Detect, Diagnose, Recover, and Verify steps and a timer are shown when recovery is enabled. Use **Run all 7 scenarios** to execute the checks sequentially (about 70 seconds or longer if an external service is slow).
6. The live database is never disconnected. Fault/recovery operations use isolated test data; network is checked rather than intentionally interrupted, and no real SMS is sent.
7. Use **Inject chaos (disable app)** on any scenario card to simulate an app-wide outage. App routes return HTTP 503 while the protected self-healing panel remains available. With self-healing off, the simulated outage stays active until you turn it on; with it on, recovery is automatic. This demo does not physically disconnect MongoDB or stop external services.
