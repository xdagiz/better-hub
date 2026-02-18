import {
  CheckCircle2,
  XCircle,
  Loader2,
  StopCircle,
  SkipForward,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusIcon({
  status,
  conclusion,
  className,
}: {
  status: string;
  conclusion: string | null;
  className?: string;
}) {
  const size = cn("w-3.5 h-3.5 shrink-0", className);

  if (status === "in_progress" || status === "queued" || status === "waiting" || status === "pending") {
    return <Loader2 className={cn(size, "text-amber-500 animate-spin")} />;
  }

  if (status === "completed" || status === "action_required") {
    switch (conclusion) {
      case "success":
        return <CheckCircle2 className={cn(size, "text-emerald-500")} />;
      case "failure":
        return <XCircle className={cn(size, "text-red-500")} />;
      case "cancelled":
        return <StopCircle className={cn(size, "text-zinc-400")} />;
      case "skipped":
        return <SkipForward className={cn(size, "text-zinc-400")} />;
      case "action_required":
        return <Clock className={cn(size, "text-amber-500")} />;
      default:
        return <CheckCircle2 className={cn(size, "text-zinc-400")} />;
    }
  }

  return <Clock className={cn(size, "text-zinc-400")} />;
}
