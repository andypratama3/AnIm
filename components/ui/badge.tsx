import * as React from "react"; import { cn } from "@/lib/utils";
const Badge = ({ children, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) => (
  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors", className)} {...props}>{children}</span>
);
export { Badge };
