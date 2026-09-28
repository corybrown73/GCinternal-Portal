import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Cloud,
  FileText,
  Flag,
  GraduationCap,
  Handshake,
  HardHat,
  PhoneCall,
  Rocket,
  Search,
  Smartphone,
  Table2,
  Target,
  Users,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { PlanIconName } from "@/lib/plan-icons";
import { cn } from "@/lib/utils";

/** The plan's icons, by the names the plan stores. The deck draws the same names. */
const ICONS: Record<PlanIconName, LucideIcon> = {
  Flag,
  PhoneCall,
  ClipboardCheck,
  Wrench,
  HardHat,
  Target,
  Rocket,
  Workflow,
  Users,
  FileText,
  Table2,
  Cloud,
  Smartphone,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Search,
  Handshake,
};

/** A step's icon, the same picture the customer sees on the welcome page and the deck. */
export function PlanIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = (ICONS as Record<string, LucideIcon>)[name] ?? ClipboardCheck;
  return <Cmp className={cn("h-3.5 w-3.5", className)} aria-hidden />;
}
