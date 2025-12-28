import { cn } from "../lib/utils";

interface StatsCardProps {
  label: string;
  sublabel?: string;
  value: string | number;
  className?: string;
}

export function StatsCard({ label, sublabel, value, className }: StatsCardProps) {
  return (
    <div className={cn("text-center", className)}>
      <div className="text-sm text-muted-foreground">{label}</div>
      {sublabel && (
        <div className="text-xs text-muted-foreground/70">({sublabel})</div>
      )}
      <div className="text-xl font-semibold text-foreground mt-1">
        {value}
      </div>
    </div>
  );
}
