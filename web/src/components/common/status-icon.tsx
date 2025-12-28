import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  PauseCircle,
  HelpCircle,
  Wrench,
  Activity,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Status = "up" | "down" | "warning" | "pending" | "paused" | "flapping" | "maintenance" | "unknown";

interface StatusIconProps {
  status: Status;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showTooltip?: boolean;
  pulse?: boolean;
  className?: string;
}

const statusConfig: Record<
  Status,
  {
    icon: typeof CheckCircle2;
    label: string;
    colorClass: string;
    bgClass: string;
    description: string;
  }
> = {
  up: {
    icon: CheckCircle2,
    label: "Up",
    colorClass: "text-[hsl(var(--status-up))]",
    bgClass: "bg-[hsl(var(--status-up))]/10",
    description: "Service is operational",
  },
  down: {
    icon: XCircle,
    label: "Down",
    colorClass: "text-[hsl(var(--status-down))]",
    bgClass: "bg-[hsl(var(--status-down))]/10",
    description: "Service is offline",
  },
  warning: {
    icon: AlertTriangle,
    label: "Warning",
    colorClass: "text-[hsl(var(--status-warning))]",
    bgClass: "bg-[hsl(var(--status-warning))]/10",
    description: "Service is degraded",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    colorClass: "text-[hsl(var(--status-pending))]",
    bgClass: "bg-[hsl(var(--status-pending))]/10",
    description: "Awaiting first check",
  },
  paused: {
    icon: PauseCircle,
    label: "Paused",
    colorClass: "text-[hsl(var(--status-paused))]",
    bgClass: "bg-[hsl(var(--status-paused))]/10",
    description: "Monitoring paused",
  },
  flapping: {
    icon: Activity,
    label: "Flapping",
    colorClass: "text-[hsl(var(--status-flapping))]",
    bgClass: "bg-[hsl(var(--status-flapping))]/10",
    description: "Status changing frequently",
  },
  maintenance: {
    icon: Wrench,
    label: "Maintenance",
    colorClass: "text-[hsl(var(--status-maintenance))]",
    bgClass: "bg-[hsl(var(--status-maintenance))]/10",
    description: "Under maintenance",
  },
  unknown: {
    icon: HelpCircle,
    label: "Unknown",
    colorClass: "text-[hsl(var(--status-unknown))]",
    bgClass: "bg-[hsl(var(--status-unknown))]/10",
    description: "Status unknown",
  },
};

const sizeConfig = {
  sm: {
    iconSize: "h-3.5 w-3.5",
    textSize: "text-xs",
    gap: "gap-1",
  },
  md: {
    iconSize: "h-4 w-4",
    textSize: "text-sm",
    gap: "gap-1.5",
  },
  lg: {
    iconSize: "h-5 w-5",
    textSize: "text-base",
    gap: "gap-2",
  },
};

export function StatusIcon({
  status,
  size = "md",
  showLabel = false,
  showTooltip = true,
  pulse = false,
  className,
}: StatusIconProps) {
  const config = statusConfig[status] || statusConfig.unknown;
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const iconElement = (
    <div
      className={cn(
        "inline-flex items-center",
        sizeStyles.gap,
        className
      )}
    >
      <Icon
        className={cn(
          sizeStyles.iconSize,
          config.colorClass,
          pulse && status === "down" && "animate-pulse"
        )}
      />
      {showLabel && (
        <span className={cn(sizeStyles.textSize, config.colorClass, "font-medium")}>
          {config.label}
        </span>
      )}
    </div>
  );

  if (!showTooltip) {
    return iconElement;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{iconElement}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="font-medium">{config.label}</div>
          <div className="text-muted-foreground">{config.description}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Status badge variant - pill-shaped with background
export function StatusBadge({
  status,
  size = "md",
  className,
}: {
  status: Status;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const config = statusConfig[status] || statusConfig.unknown;
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const paddingClass = {
    sm: "px-1.5 py-0.5",
    md: "px-2 py-1",
    lg: "px-3 py-1.5",
  }[size];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        sizeStyles.gap,
        paddingClass,
        config.bgClass,
        config.colorClass,
        className
      )}
    >
      <Icon className={sizeStyles.iconSize} />
      <span className={sizeStyles.textSize}>{config.label}</span>
    </div>
  );
}

// Dot indicator - simple colored dot
export function StatusDot({
  status,
  size = "md",
  pulse = false,
  className,
}: {
  status: Status;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}) {
  const config = statusConfig[status] || statusConfig.unknown;

  const dotSize = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3 w-3",
  }[size];

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-block rounded-full",
              dotSize,
              config.colorClass.replace("text-", "bg-"),
              pulse && "animate-pulse",
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default StatusIcon;
