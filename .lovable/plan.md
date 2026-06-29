
## Scope (this milestone)

Build the **orders + per-delivery billing** foundation. Other items (partner rename, staff roles, Telegram/PWA, CMS landing) come in later milestones.

## What you'll get

1. **Admin → Pricing**
   - Manage **Zones** (name, code, active).
   - Manage **Vehicle types** (bike, car, van… name, code, active).
   - Manage **Price matrix**: per (zone × vehicle) row with a `price_per_delivery` value. Admin edits inline.

2. **Partner → New order**
   - Partner picks pickup zone, dropoff zone, vehicle type, customer name + phone, dropoff address, optional notes.
   - System looks up price from the matrix and shows it before submit.
   - On submit: order created with status `pending`, the matrix price is **snapshotted** onto the order (so later price edits don't change history), and a **billing entry** is created for the partner (status `unpaid`).

3. **Partner → My orders**
   - Table of their orders with status, tracking #, price, created date. Filter by status.
   - Status flow (admin updates): pending → assigned → picked_up → in_transit → delivered → cancelled. Public tracking page already exists.

4. **Admin → Orders**
   - Full list across all partners with filters (status, partner, zone).
   - Update order status. Cancelling an order voids its billing entry.

5. **Admin → Billing**
   - Per-partner outstanding balance + total paid.
   - List of billing entries (order #, amount, status, date).
   - "Record payment" dialog: admin enters amount + note → creates a `payment` row and marks covered billing entries `paid` (oldest first).
   - Partner → "My billing" shows the same data scoped to them, read-only.

## Database changes (single migration)

New tables in `public`, all with RLS + GRANTs:

- `delivery_zones` (name, code unique, is_active)
- `vehicle_types` (name, code unique, is_active)
- `delivery_prices` (zone_id, vehicle_type_id, price_per_delivery, unique(zone,vehicle))
- Extend existing `orders` (add columns): `partner_id` (=vendors.id), `pickup_zone_id`, `dropoff_zone_id`, `vehicle_type_id`, `customer_name`, `customer_phone`, `dropoff_address`, `notes`, `price_amount` (snapshot), `tracking_no` (if missing). Keep current status enum/columns.
- `partner_billing_entries` (order_id unique, partner_id, amount, status `unpaid|paid|void`, paid_at)
- `partner_payments` (partner_id, amount, note, recorded_by, created_at)
- Triggers:
  - On `orders` insert → create matching `partner_billing_entries` row using snapshot price.
  - On `orders` status → `cancelled` → set billing entry `void`.

RLS:
- Zones/vehicles/prices: admins manage; everyone authenticated reads active rows (partners need to see prices).
- Orders: partner sees own; admins see all.
- Billing entries / payments: partner sees own; admins manage all.

## Code changes

- New server functions in `src/lib/orders.functions.ts` and `src/lib/billing.functions.ts` (auth-protected via `requireSupabaseAuth`, admin checks via `has_role`).
- New routes:
  - `_authenticated/admin.pricing.tsx` (zones, vehicles, matrix tabs)
  - `_authenticated/admin.orders.tsx`
  - `_authenticated/admin.billing.tsx`
  - `_authenticated/vendor.orders.new.tsx`
  - `_authenticated/vendor.orders.tsx`
  - `_authenticated/vendor.billing.tsx`
- Link new pages from admin + vendor dashboards.
- Existing `track.$trackingNo.tsx` continues to work; new orders get a tracking_no generated server-side.

## Out of scope (saved for next milestones)

- Renaming "vendor/restaurant" → "partner" in UI/schema.
- Manager/supervisor/officer staff roles + granular permissions.
- Telegram notifications, browser push, PWA install.
- Moving landing-page copy into Supabase.

Reply **go** to start, or tell me which part to drop/add.
