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
10. In-app notifications for appointment events (not external SMS/email).
11. Optional browser speech recognition for appointment reason (where supported).
12. Self-healing monitor checks MongoDB connection and host memory every 30 seconds.
13. Incident logging with severity, observed issue and recovery action.
14. Admin metrics and incident review.
15. Safe fallback/error pages and health-status page.
16. Contact form stores a message in MongoDB; it does not send email in this starter.

## Setup on Windows

1. Install Node.js LTS and MongoDB locally, or create a MongoDB Atlas database.
2. Extract the ZIP and open the `carenest-ejs` folder in VS Code.
3. Copy `.env.example` to `.env`.
4. Edit `MONGODB_URI` in `.env` to your local MongoDB or Atlas connection string. Set a long random `SESSION_SECRET`.
   Set `SELF_HEALING_ADMIN_USERNAME` and `SELF_HEALING_ADMIN_PASSWORD` to private values for the protected self-healing panel. Do not use the example password in a deployed environment.
5. Open the VS Code terminal in this folder and run:
   ```bash
   npm install
   npm run dev
   ```
6. Open `http://localhost:3000`.
7. Register a patient account, then sign in.
8. To enable demo doctors/admin tools: in MongoDB, open the `users` collection and change your own account's `role` field from `patient` to `admin`. Sign out and sign in again. Visit `/admin` and click **Seed demo doctors**.
9. Doctors can register at `/doctor/register`, then sign in at `/doctor/login` to add working days and appointment slots at `/doctor/schedule`.
10. Patients can book an open doctor slot at `/appointments/new`, then review `/appointments` and `/dashboard`.
11. Open `/self-healing/login` and sign in with the configured self-healing admin credentials to view service status, run each of the six resilience checks separately, or run the full suite.

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
- Doctors manage weekly working days, clinic hours and optional specific appointment start times; patients can only book open times in that schedule.
- Doctor profile photos are optional local JPG, PNG or WebP uploads, limited to 5 MB.
- Appointment availability is checked again when the booking is submitted, but this starter does not integrate with a real hospital system.
- SMS/email reminders, payment, medical records, and real AI inference are not implemented. Notifications are in-app database records; “AI-like” behaviour is not claimed.
- The health monitor detects database disconnection and high memory usage; recovery relies on Mongoose's connection retry and safe UI fallbacks. It does not auto-restart the process or repair arbitrary application bugs.
- The basic account lockout should be supplemented with IP-based rate limiting, CSRF protection, HTTPS, stronger admin access controls and security review before any public deployment.
- To create an admin, manually update your own user document's `role` to `admin` in MongoDB. Never add public admin registration.

## Self-healing demo suggestion

1. Start the app with MongoDB available and open `/self-healing/login`.
2. The dashboard shows live MongoDB state and the latest result for the doctor directory, notification adapter and data integrity checks.
3. Run individual checks: isolated MongoDB reconnect, live doctor directory response, browser/server network connectivity, isolated duplicate request rejection, SMS adapter dry-run, and isolated appointment/slot reconciliation.
4. Each scenario stays visible for at least 10 seconds, with live Detect, Diagnose, Recover, and Verify log steps and a timer. Use **Run all 6 scenarios** to execute the same checks sequentially (about one minute or longer if an external service is slow).
5. The live database is never disconnected. Fault/recovery operations use isolated test data; network is checked rather than intentionally interrupted, and no real SMS is sent.
