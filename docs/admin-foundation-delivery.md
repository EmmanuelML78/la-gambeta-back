# Admin Foundation Delivery Chain

This draft-only feature branch prepares the admin-foundation work as a reviewable chain on current `origin/master` (`c8a087e`). The tracker contains delivery guidance only; implementation remains in the child branches.

## Review order

Each child PR targets its immediate predecessor. Review in this order:

`delivery` → `01-common` → `02-data` → `03-payments` → `04-payment-review` → `05-contact` → `06-contact-admin` → `07-contact-pagination` → `08-payment-query` → `09-payment-list` → `10-payment-summary` → `11-refund-policy` → `12-payment-evidence` → `13-payment-detail` → `14-detail-reason` → `15-legacy-summary` → `16-booking-page` → `17-booking-http-test`

The tracker is intentionally no-merge until all child work is reviewed and integrated. Do not merge the tracker independently.

## Review notes

- The historical feature branches were replayed in chronological order on top of the five newer authentication commits in `origin/master`; the original worktrees and branches remain untouched.
- `02-data` and `03-payments` retain their previously documented bounded `size:exception` rationale. Their migration/data and payment diffs must be reviewed without code-golfing; `02-data` also includes generated migration snapshots.
- Each child is a focused review unit. Confirm its own behavior and tests, then proceed to its child; `17-booking-http-test` is the final HTTP-level bookings verification slice.

## Dependency map

`delivery` → `01-common` → `02-data` → `03-payments` → `04-payment-review` → `05-contact` → `06-contact-admin` → `07-contact-pagination` → `08-payment-query` → `09-payment-list` → `10-payment-summary` → `11-refund-policy` → `12-payment-evidence` → `13-payment-detail` → `14-detail-reason` → `15-legacy-summary` → `16-booking-page` → 📍 `17-booking-http-test`
