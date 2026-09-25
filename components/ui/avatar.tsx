import * as React from "react"; import { cn } from "@/lib/utils";
const Avatar = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<div className={cn("relative h-10 w-10 overflow-hidden rounded-full", className)} {...props} />);
const AvatarFallback = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<div className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted text-xs font-medium", className)} {...props} />);
export { Avatar, AvatarFallback };
