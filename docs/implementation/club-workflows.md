# Club workflow implementation

The requested outcome is a usable rowing-club workflow for administrators,
coaches, trainers and athletes, retaining MySQL, clean club registration and
the existing responsive React/FastAPI application. Docker and production
builds remain user-operated.

## Implementation sequence

1. Add persistent attendance, crew, reservation, damage, outing, audit,
   account-action token and email-outbox records. Version schema changes and
   retain existing records.
2. Add club-scoped session RSVP/register endpoints and reasoned lifecycle
   actions. Staff manage registers; athletes manage only their own RSVP.
   Cancellation releases reservations. Rescheduling rechecks participants and
   equipment conflicts before committing.
3. Add saved crews with valid seats and unique athletes, equipment reservations
   protected against concurrent double booking, damage/repair records and
   outing launch/return actions. Grounded equipment cannot be booked/launched.
4. Add a searchable Members workspace with profile/role/status edits, preserving
   administrator-only account controls and last-administrator protection.
5. Add profile settings, current-password checks, verified email changes,
   expiring single-use password reset links and authentication-token invalidation.
6. Add transactional notification/email outbox delivery, configurable SMTP,
   bounded retries, reminders, invitation/decision/cancellation messages and
   administrator-visible delivery state. Never claim email was sent without
   a successful SMTP handoff. No real messages are sent during development checks.
7. Add role-aware Operations and Account views and surface attendance/lifecycle
   controls from existing schedule/session UI.
8. Replace seeded-data integration assumptions with explicit test fixtures in
   an isolated MySQL test database, add CI, readiness and documented backup/
   restore procedures. Run focused unit tests, navigation tests and non-emitting
   TypeScript checks; leave Docker/builds and MySQL integration execution to user.

## Boundaries

This adds the eight requested workflows, not membership billing, guardian
portals or a replacement authentication provider. SMTP credentials and the
public application URL are deployment configuration. No fabricated club
records or measurements are introduced. Existing local changes are retained.
