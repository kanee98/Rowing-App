# Club operations guide

Open **Club operations** from the profile menu or the dashboard/mobile navigation.
All records are restricted to the current club. Athletes see their assigned
sessions, their own RSVP/register, and their crews/bookings. Trainers manage
assigned session registers; coaches and administrators manage session lifecycle
and saved crews. All members can report damage; staff record repairs and outings.

## Everyday workflows

- **Members:** Administrators can search/filter members, edit profiles, change
  roles, suspend or reactivate accounts. Coaches can edit athlete profiles only.
  The last active administrator cannot be suspended/demoted. Access changes
  invalidate existing authentication tokens. Suspension preserves history.
- **Attendance:** Select a session in Operations. Athletes choose Going, Maybe or
  Cannot attend, with an optional note. Staff separately record Present, Absent,
  Excused or No show. An unrecorded attendance value is never counted as a no-show.
  Workout results and attendance are separate records.
- **Crews:** Save a crew against an actual club boat, then fill its exact seat
  positions (including the cox where applicable). Search boats and athletes;
  duplicate seats/inactive/foreign-club athletes are rejected. Cancel active
  reservations before changing a crew's boat or seats.
  Reservations retain a snapshot of the crew name and seat assignments so later
  edits do not rewrite outing history or transfer it to different athletes.
  The coach's graphical lineup builder also has a Save crew action; temporary
  previews are explicitly separate from saved crews and boat reservations.
- **Reservations:** Reserve a saved crew against a session or a separate time
  interval. Linked bookings follow session times. Grounded boats, overlapping
  boat/athlete bookings and unavailable participants block booking. Every crew
  member must be assigned to a linked session.
- **Damage/repairs:** Anyone can report an advisory or ground equipment. Grounded
  equipment cannot be booked or launched, even if someone changes its display
  status. Staff resolve each report with repair notes; all grounding reports must
  be resolved before returning equipment to service.
- **Outings:** During a reservation, staff record launch and return. A missing
  return remains visible as on-water/overdue and prevents another launch. A return
  completes the reservation; it does not invent attendance or performance results.
- **Lifecycle:** Coaches/admins can cancel, restore, reschedule or mark a started
  session completed, always with a reason. Cancellation releases reservations.
  Rescheduling checks people/boats, moves linked bookings, resets old RSVPs, and
  notifies assigned people. Restoring does not silently restore boat reservations.
- **Account settings:** Every role can edit their own profile, change a password
  using the current password, or request a verified email change. Password reset
  is available from Sign in. Links expire in one hour and are single-use. Password
  changes invalidate other tokens; recovery/email confirmation requires signing
  in again. The old email stays active until confirmation.

## Email configuration

Set these server environment variables, then restart the backend:

```dotenv
PUBLIC_APP_URL=https://your-actual-app.example
SMTP_HOST=your-smtp-server
SMTP_PORT=587
SMTP_FROM=club@your-domain.example
SMTP_USERNAME=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_STARTTLS=true
SMTP_SSL=false
EMAIL_WORKER_ENABLED=true
REMINDER_HOURS=24
```

For implicit TLS use port 465, SMTP_SSL=true and SMTP_STARTTLS=false. Use a
verified sender/domain with your mail provider. Do not commit credentials.
PUBLIC_APP_URL must be the address members actually open, not a container URL.

Invitations, join decisions, session changes and reminders use a database outbox.
The worker checks once a minute and retries failed SMTP handoffs up to five times.
Administrators see queued/sent/failed/configuration-required states and can retry
failed messages under Operations → Email delivery. 'Sent' means SMTP handoff,
not proof of inbox delivery. Delivery is at-least-once; an interrupted handoff can
produce a duplicate. Messages waiting for SMTP are encrypted using SECRET_KEY;
keep that secret stable and back it up separately. Account links are erased from
the outbox after successful handoff. Copy invitation links manually when email
is not configured; password recovery/verified email changes require SMTP.

Reminder deduplication is per session/person/time. Cancelled or inactive plans do
not generate reminders. Rescheduling invalidates queued reminders for the old
time. Session email links open the exact Operations register.

## Release and database procedures

Startup runs recorded MySQL migrations under a database advisory lock. Versions
are recorded in schema_migrations only after success. MySQL DDL is not fully
transactional: upgrades inspect columns first so an interrupted version can
resume. Existing data is retained; there is no automatic destructive downgrade.
Back up before updating and test the upgrade against a restored copy first.
The database user needs CREATE/ALTER/INDEX permissions during migration.
GET /health/ready returns 503 when the database cannot be reached.

### Tests (no SQLite)

From backend, run python -m pytest -q for DB-free checks. Integration tests skip
unless TEST_DATABASE_URL is set. Create an isolated empty MySQL 8.4 database and
a user that can access only that database. The name must end in _test. Do not
reuse the application database or production credentials.

```powershell
$env:TEST_DATABASE_URL='mysql+pymysql://TEST_USER:TEST_PASSWORD@127.0.0.1:3308/sports_management_test'
cd backend
python -m pytest -q
```

Test migrations run in that isolated database. Each test creates explicit members
and records inside a rolled-back outer transaction. The email worker is disabled;
no messages are sent. CI provisions its own MySQL service and runs this suite,
plus TypeScript and frontend navigation checks. CI must pass before deploying.

### Backup/restore

Install the MySQL 8.4 client locally or use your managed database's backup service.
The helper below does not run Docker and reads DATABASE_URL from the process
environment (it does not read .env). Use a host-reachable database address and
URL-encode password characters. Credentials are passed through the child process
environment, not command-line flags. For TLS/custom connection options, use your
database provider's backup tools; the helper rejects unsupported URL options.

From backend:

```powershell
python -m scripts.database_backup backup --directory backups
# Restore into a NEW isolated database first and test the release there.
# Stop application writers and back up the target before any real restore.
python -m scripts.database_backup restore --file backups/YOUR_BACKUP.sql --confirm-database EXACT_DATABASE_NAME
```

Exports contain private client data. Keep them encrypted/off-machine with restricted
access and a retention policy. Local exports are ignored by Git. A database restore
can overwrite data and is not automatically reversible. Verify restoring the backup
on a separate instance regularly; after restoration, restart the backend, check
health/readiness, sign in, inspect club records and verify pending email behavior
before allowing users back in. Keep a matching application release and SECRET_KEY
alongside the database recovery plan. Migrations do not remove demo records created
by earlier releases: review legacy records before a real-client launch.
