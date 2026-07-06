import { Link } from "wouter";
import { Ship, Gauge, Wrench, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 p-1.5 rounded text-primary">
              <Ship size={20} />
            </div>
            <span className="font-bold text-sm tracking-tight">
              ME Components <span className="text-primary">RH Records</span>
            </span>
          </div>
          <Link href="/login">
            <Button>Sign In</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-5xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-xl text-primary">
              <Ship size={32} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">
              Running hours tracking for your fleet's main engines
            </h1>
            <p className="text-muted-foreground text-lg">
              Track piston, fuel valve, and exhaust valve running hours across every vessel in
              your fleet — with automatic overhaul alerts and a single source of truth shared
              between vessel officers and the technical office.
            </p>
            <Link href="/login">
              <Button size="lg">Sign In to Continue</Button>
            </Link>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-card border rounded-lg p-4 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Gauge size={18} />
              </div>
              <div>
                <p className="font-semibold text-foreground">Live running hours</p>
                <p className="text-sm text-muted-foreground">
                  Computed automatically from monthly ME readings — no manual recalculation.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-card border rounded-lg p-4 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Wrench size={18} />
              </div>
              <div>
                <p className="font-semibold text-foreground">Overhaul &amp; life alerts</p>
                <p className="text-sm text-muted-foreground">
                  Configurable thresholds per component type flag what's due before it's overdue.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-card border rounded-lg p-4 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <ArrowRightLeft size={18} />
              </div>
              <div>
                <p className="font-semibold text-foreground">Full movement history</p>
                <p className="text-sm text-muted-foreground">
                  Every fit, removal, and rotation logged and auditable across the fleet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t bg-card py-4">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-muted-foreground">
          ME Components RH Records
        </div>
      </footer>
    </div>
  );
}
