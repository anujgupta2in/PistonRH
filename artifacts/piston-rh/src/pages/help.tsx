import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Download, LifeBuoy, Ship, Gauge, Wrench } from "lucide-react";

function Note({ kind = "tip", children }: { kind?: "tip" | "important"; children: React.ReactNode }) {
  const isTip = kind === "tip";
  return (
    <div
      className={`text-sm rounded-md border px-3 py-2 ${
        isTip
          ? "bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-200"
          : "bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200"
      }`}
    >
      <span className="font-semibold">{isTip ? "Tip: " : "Important: "}</span>
      {children}
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm list-disc pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function Help() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LifeBuoy className="h-7 w-7 text-primary" />
            Help &amp; User Guide
          </h1>
          <p className="text-muted-foreground">
            Step-by-step guidance for using PistonRH, for vessel officers and technical office staff.
          </p>
        </div>
        <Button asChild>
          <a href="/PistonRH_User_Guide.pdf" download>
            <Download className="mr-2 h-4 w-4" />
            Download PDF Guide
          </a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" />
            Who Uses This Tool
          </CardTitle>
          <CardDescription>
            Every account is set up by an administrator on purpose, so the right people see the right vessels.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="border rounded-lg p-3">
            <Badge variant="secondary" className="mb-2">Vessel Officer</Badge>
            <p className="text-sm text-muted-foreground">
              Sees and manages data only for the vessel(s) they've been given access to. Can also set up
              their own new vessel if they don't have one yet.
            </p>
          </div>
          <div className="border rounded-lg p-3">
            <Badge className="mb-2">Technical Office</Badge>
            <p className="text-sm text-muted-foreground">
              Sees and manages every vessel in the fleet. Only Technical Office can create user accounts
              and grant vessel access to Vessel Officers.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            Key Concepts, in Plain Terms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="font-semibold mb-1">"Unit"</p>
            <p className="text-muted-foreground">
              Just marine shorthand for a cylinder number - Unit 1, Unit 2, etc. Each unit has one piston,
              one or more fuel valves, and one exhaust valve.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">Overhaul Interval vs. Expected Life</p>
            <Bullets
              items={[
                "Overhaul Interval - the threshold for a main component: a piston Unit, a Fuel Valve, or an Exhaust Valve. Shows Overhaul Due (or Approaching).",
                "Expected Life - the threshold for a sub-component nested under a main one (rings, nozzles/springs, seats/spindles). Shows Life Exceeded (or Approaching).",
              ]}
            />
          </div>
          <div>
            <p className="font-semibold mb-1">Parent / Child Components</p>
            <p className="text-muted-foreground">
              A Fuel Valve or Exhaust Valve is the "parent." Its nozzle, spring, seat, or spindle can be
              linked to it as a "child." A child automatically inherits its parent's location, in-service
              status, and running-hours clock. On any list, a child is shown indented underneath its
              parent with an "Inherited from ..." note.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">Live RH</p>
            <p className="text-muted-foreground">
              Running hours shown throughout the app are calculated automatically from your latest Monthly
              RH entry - no manual recalculation needed after logging a new reading.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Walkthrough, Page by Page
          </CardTitle>
          <CardDescription>Click a section to expand it.</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="signin">
              <AccordionTrigger>Signing In for the First Time</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <Steps
                  items={[
                    "Open the app's web address in your browser (given to you by your Technical Office).",
                    'You\'ll land on a public welcome page with a "Sign In" button. Click it.',
                    "Enter the email and password given to you by your administrator.",
                    'Click "Sign In".',
                  ]}
                />
                <Note kind="important">
                  No account yet? Someone with a Technical Office account needs to create it first (see
                  "Managing Users" below) - there's no self-signup.
                </Note>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="setup">
              <AccordionTrigger>Setting Up Your Vessel</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The first time you log in with no active vessel, you'll see a "Setup First Vessel"
                  screen instead of the Dashboard.
                </p>
                <Bullets
                  items={[
                    'Technical Office sees a "Load Demo Vessel" option plus a create-vessel form.',
                    "Vessel Officer only sees the create-vessel form, and automatically gets access to whatever vessel they create.",
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  If you manage more than one vessel, use the vessel switcher dropdown at the top of the
                  sidebar to jump between them.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dashboard">
              <AccordionTrigger>The Dashboard</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Your home screen. Three tabs: Pistons, Fuel Valves, Exhaust Valves.
                </p>
                <Bullets
                  items={[
                    "Current ME RH (top right) - the main engine's latest logged running hours reading.",
                    "Cylinder Matrix - one card per Unit, showing its overall status badge and each fitted component with a progress bar toward its threshold.",
                    "Spares Overview (fuel/exhaust tabs) - onboard spare components not currently fitted anywhere.",
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="monthlyrh">
              <AccordionTrigger>Logging Monthly RH</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The single most important regular task - every RH calculation in the app is derived from
                  this.
                </p>
                <Steps
                  items={[
                    'Go to Monthly RH → click "Add Entry".',
                    "Enter the date and the ME's total running hours reading at that date.",
                    "Save.",
                  ]}
                />
                <Note>Every component's live RH updates automatically - no manual recalculation needed.</Note>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="components">
              <AccordionTrigger>Managing Components</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Go to Components. Three tabs: Pistons, Fuel Valves, Exhaust Valves - your master
                  inventory.
                </p>
                <p className="text-sm font-semibold">Adding a fuel valve or exhaust valve component</p>
                <Steps
                  items={[
                    'Fuel Valves (or Exhaust Valves) tab → "Add Fuel Valve" / "Add Exhaust Valve".',
                    "Fill in Component ID, Type, Condition, Status.",
                    'If this is a nozzle, spring, seat, or spindle - not the valve body itself - use the "Parent Component" dropdown to pick which existing valve it belongs to.',
                    'Save. A linked child appears indented under its parent, labelled "Inherited from [parent ID]".',
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="movements">
              <AccordionTrigger>Recording Movements</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Your audit trail - record every Fit, Remove, Rotate, Land Ashore, Receive Onboard, or
                  Scrap so history and RH accounting stay accurate.
                </p>
                <Bullets
                  items={[
                    "Fit - moving a spare into service in a cylinder.",
                    "Remove - taking a fitted component out to spare.",
                    "Rotate - swapping a component from one cylinder to another.",
                    "Land Ashore / Receive Onboard - sending ashore or bringing back onboard.",
                    "Scrap - permanently retiring it.",
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="cylinders">
              <AccordionTrigger>Cylinder Configuration</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <Bullets
                  items={[
                    "Manage which component is physically fitted in each cylinder slot, and set overhaul/dismantling baselines.",
                    'This page always shows the parent valve body in a slot - a nozzle or spring is never assignable here directly (manage those from Components instead).',
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="alerts">
              <AccordionTrigger>Alerts</AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">
                  A single combined list of every component currently at Warning, Due/Approaching, or
                  Overdue/Exceeded status - a quick "what needs attention" check.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="reports">
              <AccordionTrigger>Reports</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <Bullets
                  items={[
                    "Cylinder Status - current running hours for every fitted component, Unit by Unit.",
                    "Monthly RH - the full history of logged ME readings.",
                    "Spares - everything currently sitting onboard as a spare.",
                    "History - the full movement log.",
                  ]}
                />
                <p className="text-sm text-muted-foreground">
                  Use "Print View" for a clean printable layout, or "Export CSV" to download the data.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="settings">
              <AccordionTrigger>Settings</AccordionTrigger>
              <AccordionContent className="space-y-2">
                <Bullets
                  items={[
                    "Vessel Profile - engine details and vessel-wide default thresholds.",
                    "Component Type Thresholds - override the default for a specific component type.",
                    "Maintenance Actions - force a manual recalculation of every component's live RH.",
                    "Danger Zone - reset operational data or delete the vessel entirely (irreversible).",
                    "User Management (Technical Office only) - see below.",
                  ]}
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="import">
              <AccordionTrigger>Bulk Import From Excel</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <Steps
                  items={[
                    'Go to Import Setup → click "Download sample template" for a ready-made .xlsx pre-filled with example data.',
                    "Replace the example rows with your vessel's real data.",
                    'To link a nozzle/spring/seat/spindle to its parent valve, fill in the "Parent Component ID" column with the parent\'s Component ID, and leave that row\'s own "Fitted In Cylinder" column blank.',
                    "Delete the yellow example rows, don't change column headers.",
                    'Upload your file → "Preview File" → tick "Overwrite" on any conflicts you want to replace → "Import".',
                  ]}
                />
                <Note kind="important">
                  Always grab a fresh copy of the sample template if it's been a while - an old saved copy
                  won't have the latest columns if the app has been updated since.
                </Note>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="users">
              <AccordionTrigger>Managing Users (Technical Office)</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Go to Settings → User Management.
                </p>
                <Bullets
                  items={[
                    'Add User - full name, email, password (8+ characters), and role.',
                    'Grant vessel access - click "Manage" on a Vessel Officer\'s row, pick a vessel, click "+".',
                    "Reset a password or change a role - click the pencil icon, update fields, save (leave password blank to keep it unchanged).",
                    "Deactivate/delete - toggle Active off, or use the trash icon to delete permanently.",
                  ]}
                />
                <Note>
                  There's no self-service "forgot password" - if someone's locked out, this is how you get
                  them back in.
                </Note>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="troubleshooting">
              <AccordionTrigger>Troubleshooting</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold">"I forgot my password."</p>
                  <p className="text-muted-foreground">Contact your Technical Office administrator to reset it in Settings → User Management.</p>
                </div>
                <div>
                  <p className="font-semibold">"A form won't submit and nothing seems to happen."</p>
                  <p className="text-muted-foreground">Check for a small red message under a field - usually a validation rule wasn't met (e.g. password under 8 characters).</p>
                </div>
                <div>
                  <p className="font-semibold">"I just changed something but the page still shows old data."</p>
                  <p className="text-muted-foreground">Try a hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac).</p>
                </div>
                <div>
                  <p className="font-semibold">"A component's status looks wrong."</p>
                  <p className="text-muted-foreground">Check Settings → Component Type Thresholds and Vessel Profile - status depends on component override → type override → vessel default, in that order.</p>
                </div>
                <div>
                  <p className="font-semibold">"Imported children aren't nesting under their parent valve."</p>
                  <p className="text-muted-foreground">The sheet's Parent Component ID column wasn't filled in (or an old template was used). Re-download the current sample template and re-import with Overwrite ticked.</p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
