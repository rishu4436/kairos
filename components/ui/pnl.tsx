import { cn } from "@/lib/cn";

export function Pnl({ value, direction }: { value: string; direction: "up" | "down" | "flat" }) {
  return (
    <span className={cn("num", direction === "up" && "text-gain", direction === "down" && "text-loss")}>
      {value}
    </span>
  );
}
