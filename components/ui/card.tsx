import * as React from "react";
import { cn } from "@/lib/utils";
const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<div className={cn("rounded-xl border bg-card text-card-foreground shadow", className)} {...props} />);
const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />);
const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<h3 className={cn("font-semibold leading-none tracking-tight", className)} {...props} />);
const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (<div className={cn("p-6 pt-0", className)} {...props} />);
export { Card, CardHeader, CardTitle, CardContent };
