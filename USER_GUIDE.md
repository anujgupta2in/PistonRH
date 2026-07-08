# PistonRH User Guide

**PistonRH** ("ME Components RH Records") tracks running hours (RH) for the
key wearing parts of your main engine — pistons, fuel valves, and exhaust
valves — across your whole fleet, and flags what's due for overhaul before
it's overdue.

This guide is written for the people who actually use the tool day to day:
vessel officers logging data for their ship, and Technical Office staff
managing the fleet. No technical background needed.

---

## Contents

1. [Who uses this tool](#1-who-uses-this-tool)
2. [Signing in for the first time](#2-signing-in-for-the-first-time)
3. [Setting up your vessel](#3-setting-up-your-vessel)
4. [Key concepts, in plain terms](#4-key-concepts-in-plain-terms)
5. [The Dashboard](#5-the-dashboard)
6. [Logging Monthly RH](#6-logging-monthly-rh)
7. [Managing Components](#7-managing-components)
8. [Recording Movements](#8-recording-movements)
9. [Cylinder Configuration](#9-cylinder-configuration)
10. [Alerts](#10-alerts)
11. [Reports](#11-reports)
12. [Settings](#12-settings)
13. [Bulk import from Excel](#13-bulk-import-from-excel)
14. [Managing users (Technical Office)](#14-managing-users-technical-office)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Who uses this tool

There are two kinds of accounts:

| Role | Can do |
|---|---|
| **Vessel Officer** | See and manage data only for the vessel(s) they've been given access to. Can also set up their *own* new vessel if they don't have one yet. |
| **Technical Office** | See and manage **every** vessel in the fleet. Only Technical Office can create user accounts and grant vessel access to Vessel Officers. |

If you're not sure which one you are, look at the bottom-left corner of the
sidebar once you're logged in — it shows your name and role.

---

## 2. Signing in for the first time

1. Open the app's web address in your browser (given to you by your
   Technical Office).
2. You'll land on a public welcome page with a **Sign In** button. Click it.
3. Enter the email and password given to you by your administrator.
4. Click **Sign In**.

> **First time ever using the app, no account created yet?** Someone with a
> Technical Office account needs to create your account first — see
> [Managing users](#14-managing-users-technical-office). There's no
> self-signup; every account is set up on purpose so the right people see
> the right vessels.

---

## 3. Setting up your vessel

The first time you log in, if you don't yet have an active vessel, you'll
see a **Setup First Vessel** screen instead of the Dashboard.

- **If you're Technical Office**, you can either:
  - Click **Load Demo Vessel** to explore the app with realistic sample
    data, or
  - Fill in the **Create new vessel** form (vessel name, engine make,
    number of cylinders) and click **Create Vessel**.
- **If you're a Vessel Officer**, you'll only see the **Create new vessel**
  form (the demo option is a Technical Office-only feature). Fill it in and
  submit — you'll automatically get access to the vessel you just created.

Once a vessel exists and you have access to it, you'll land straight on the
**Dashboard** every time you log in.

If you manage more than one vessel, use the **vessel switcher** dropdown at
the top of the sidebar (under the logo) to jump between them.

---

## 4. Key concepts, in plain terms

**"Unit"** is just marine shorthand for a cylinder number — Unit 1, Unit 2,
etc. Each unit has one piston, one or more fuel valves, and one exhaust
valve.

**Overhaul Interval vs. Expected Life** — the app uses two different labels
depending on what kind of part you're looking at:

- **Overhaul Interval** — the threshold for a *main* component: a piston
  Unit, a Fuel Valve, or an Exhaust Valve. When one of these passes its
  overhaul interval, it shows **Overhaul Due** (or **Overhaul Approaching**
  as it gets close).
- **Expected Life** — the threshold for a *sub-component* nested under a
  main one (piston rings, fuel nozzles/springs, exhaust seats/spindles).
  These show **Life Exceeded** (or **Life Approaching**) instead.

**Parent/child components** — a Fuel Valve or Exhaust Valve is the "parent."
Its nozzle, spring, seat, or spindle can be linked to it as a "child." A
child automatically inherits its parent's location, in-service status, and
running-hours clock — you don't track those separately for the child, only
its own Expected Life threshold if it differs from the parent's part type.
On any list, a child is shown indented underneath its parent with an
"Inherited from ..." note.

**Live RH** — running hours shown throughout the app are calculated
automatically from your latest **Monthly RH** entry; you don't need to
manually recalculate anything after logging a new reading.

---

## 5. The Dashboard

Your home screen after logging in. Three tabs: **Pistons**, **Fuel
Valves**, **Exhaust Valves**.

- **Current ME RH** (top right) — the main engine's latest logged running
  hours reading.
- **Cylinder Matrix** — one card per Unit, showing:
  - The Unit's overall **Overhaul Due/OK** badge (based on the piston
    crown's overhaul cycle — this stays the same across all three tabs for
    a given Unit).
  - Each fitted component in that Unit (piston parts, or fuel/exhaust
    valves with their nested children), with a progress bar toward its
    threshold.
- **Spares Overview** (fuel/exhaust tabs) — onboard spare components not
  currently fitted anywhere.

---

## 6. Logging Monthly RH

Go to **Monthly RH** in the sidebar. This is where you log the main
engine's running-hour reading each month — the single most important
regular task, since every other RH calculation in the app is derived from
it.

1. Click **Add Entry** (or similar button at the top).
2. Enter the date and the ME's total running hours reading at that date.
3. Save.

Every component's live RH across every page updates automatically the next
time you view it — no manual recalculation needed.

---

## 7. Managing Components

Go to **Components**. Three tabs: **Pistons**, **Fuel Valves**, **Exhaust
Valves**. This is your master list/inventory — add new parts, edit
existing ones, or retire them.

### Adding a piston component
1. Pistons tab → **Add Component**.
2. Fill in Component ID, Type (Crown, Skirt, Rod, Ring...), Condition,
   Status, and location if it's currently fitted.
3. Save.

### Adding a fuel valve or exhaust valve component
1. Fuel Valves (or Exhaust Valves) tab → **Add Fuel Valve** / **Add
   Exhaust Valve**.
2. Fill in the same basic details.
3. **If this is a nozzle, spring, seat, or spindle** — not the valve body
   itself — use the **Parent Component** dropdown to pick which existing
   Fuel Valve/Exhaust Valve it belongs to. Leave it on "None — top-level
   component" for the valve body itself.
4. Save. A linked child appears indented under its parent in the list,
   labelled "Inherited from [parent ID]."

### Editing or retiring a component
Click the pencil icon on any row to edit it (including changing its Parent
Component link later), or the trash icon to delete it permanently.

---

## 8. Recording Movements

Go to **Movements**. This is your audit trail — every time a component is
fitted, removed, rotated between cylinders, landed ashore, or scrapped,
record it here so the history and RH accounting stay accurate.

1. Click **Add Movement**.
2. Pick the **Action**:
   - **Fit** — moving a spare into service in a cylinder.
   - **Remove** — taking a fitted component out to spare.
   - **Rotate** — swapping a component from one cylinder to another.
   - **Land Ashore** — sending it ashore (e.g. for reconditioning).
   - **Receive Onboard** — bringing a part back onboard as a spare.
   - **Scrap** — permanently retiring it.
3. Pick the **Component**, confirm **From/To location**, and the **ME RH**
   at the time of the movement (must be at or after your latest logged
   Monthly RH).
4. Save.

The full history is visible here and also in **Reports → History**.

---

## 9. Cylinder Configuration

Go to **Cylinders**. This is where you manage which component is physically
fitted in each cylinder slot, and set overhaul/dismantling baselines per
cylinder.

- Each cylinder card shows what's currently fitted (Pistons tab), or the
  Fuel Valve/Exhaust Valve currently in each slot (Fuel/Exhaust tabs).
- **Fit Component to Cyl X** lets you either register a brand-new component
  directly into that slot, or assign an existing spare/component already in
  your inventory.
- This page always shows the *parent* valve body in a slot — a nozzle or
  spring is never shown or assignable here directly, since it belongs to
  its parent (manage those from the **Components** page instead).
- **Baselines** (pencil/gear icon on each cylinder) lets you record the last
  overhaul and last dismantling running hours for that cylinder.

---

## 10. Alerts

Go to **Alerts** for a single combined list of every component across the
vessel that's currently at **Warning**, **Due/Approaching**, or
**Overdue/Exceeded** status — useful as a quick "what needs attention"
check without digging through each tab.

---

## 11. Reports

Go to **Reports**. Four tabs:

- **Cylinder Status** — current running hours for every fitted piston, fuel
  valve, and exhaust valve component (with nested children), Unit by Unit.
- **Monthly RH** — the full history of logged ME readings.
- **Spares** — everything currently sitting onboard as a spare, by
  category.
- **History** — the full movement log (fit/remove/rotate/etc.) for
  pistons, fuel valves, and exhaust valves.

Use **Print View** to get a clean printable layout, or **Export CSV** to
download the data for use in Excel or elsewhere.

---

## 12. Settings

Go to **Settings**.

- **Vessel Profile** — name, IMO number, engine details, number of
  cylinders, and the vessel-wide default **Overhaul Interval** /
  **Warning** thresholds for Units, Fuel Valves, and Exhaust Valves (plus
  how many fuel valve slots each cylinder has).
- **Component Type Thresholds** — override the vessel default for a
  specific component type (e.g. give "Fuel Nozzle" its own Expected Life
  figure different from the vessel default). Any component type you've
  already registered but haven't set a threshold for is flagged here
  automatically so you don't forget it.
- **Maintenance Actions** — force a manual recalculation of every
  component's live RH, if you ever want to double-check the numbers.
- **Danger Zone** — reset all operational data (clears RH logs, movements,
  cylinder assignments but keeps the vessel record), or delete the vessel
  entirely. Both are irreversible — use with care.
- **User Management** *(Technical Office only)* — see
  [section 14](#14-managing-users-technical-office).

---

## 13. Bulk import from Excel

If you're setting up a vessel from scratch with a lot of existing
components, it's much faster to import them from a spreadsheet than to
type each one in by hand.

1. Go to **Import Setup**.
2. Click **Download sample template** to get a ready-made `.xlsx` file,
   pre-filled with example data for a full vessel (including nozzles,
   springs, seats, and spindles correctly linked to their parent valves —
   copy this format for your own data).
3. Open it and replace the example rows with your vessel's real data:
   - **Vessel Info** tab — vessel name, engine details, thresholds, current
     ME running hours.
   - **Piston Components**, **Fuel Valves**, **Exhaust Valves** tabs — one
     row per component.
   - **To link a nozzle, spring, seat, or spindle to its parent valve**,
     fill in the **Parent Component ID** column with the parent's
     Component ID (e.g. `FV1-1`), and leave that child row's own "Fitted
     In Cylinder" column blank — its location is inherited from the parent
     automatically.
   - Delete the yellow example rows before importing, don't change the
     column headers, and leave optional columns blank rather than typing
     "N/A".
4. Back in the app, drag your completed file into the upload area (or
   click to browse) and click **Preview File**.
5. Review the preview — any Component ID that already exists on the vessel
   is flagged as a conflict; tick **Overwrite** on any you want to replace,
   leave unticked to skip them.
6. Click **Import** to confirm.

> **Always grab a fresh copy of the sample template if it's been a while**
> — if the app has been updated since you last downloaded it, an old saved
> copy on your computer won't have the latest columns.

---

## 14. Managing users (Technical Office)

Only Technical Office accounts can do this. Go to **Settings** and scroll
to **User Management**.

### Creating a new account
1. Click **Add User**.
2. Fill in full name, email, a password (8+ characters), and pick the role
   — **Vessel Officer** or **Technical Office**.
3. Click **Create User**.

### Giving a Vessel Officer access to a vessel
1. Find their row in the table — it shows how many vessels they currently
   have access to.
2. Click **Manage** next to their row.
3. Pick a vessel from the dropdown and click the **+** button to grant
   access. Click the trash icon next to a listed vessel to revoke it.

> A Vessel Officer with **no** vessel access yet will see the "Setup First
> Vessel" screen when they log in, and can create their own vessel there if
> you'd rather they self-serve than wait for you to grant access.

### Resetting someone's password or changing their role
1. Click the pencil icon on their row.
2. Update their name, role, and/or enter a new password (leave the
   password field blank to keep their current one unchanged).
3. Click **Save Changes**.

There's no self-service "forgot password" — if someone's locked out, this
is how you get them back in.

### Deactivating or deleting a user
- Flip the **Active** toggle off to temporarily block their login without
  deleting their account or history.
- Click the trash icon to delete their account permanently. (You can't
  deactivate or delete your own account while logged in as it.)

---

## 15. Troubleshooting

**"I forgot my password."** — Contact your Technical Office administrator;
they can reset it for you in Settings → User Management (see above).

**"A form won't submit and nothing seems to happen."** — Check for a small
red message under one of the fields — this usually means a validation
rule wasn't met (e.g. a password shorter than 8 characters). Fix that field
and try again.

**"I just changed something but the page still shows the old data."** —
Try a hard refresh: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac).
The app caches data in your browser for speed, and a hard refresh forces
it to fetch everything fresh.

**"A component's status looks wrong."** — Check Settings → Component Type
Thresholds and Vessel Profile first; a component's alert status depends on
whichever threshold applies to it (its own override → its component type's
override → the vessel default, in that priority order).

**"I imported a spreadsheet but children (nozzles/springs/seats/spindles)
aren't nesting under their parent valve."** — This means the sheet didn't
have the Parent Component ID column filled in for those rows (or you used
an old copy of the template). Re-download the current sample template,
confirm your child rows reference the correct parent's Component ID in
that column, and re-import with **Overwrite** ticked for the affected rows.

**Still stuck?** Contact your Technical Office administrator or whoever
manages this deployment for you.
