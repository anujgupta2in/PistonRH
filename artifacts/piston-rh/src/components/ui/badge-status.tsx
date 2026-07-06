import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  let badgeClass = "bg-muted text-muted-foreground";

  if (status === "OK") {
    badgeClass = "badge-ok";
  } else if (status === "Warning") {
    badgeClass = "badge-warning";
  } else if (status === "Due") {
    badgeClass = "badge-due";
  } else if (status === "Overdue") {
    badgeClass = "badge-overdue";
  }

  return (
    <Badge variant="outline" className={cn("font-medium", badgeClass, className)}>
      {label ?? status}
    </Badge>
  );
}
