"use client";

import { CircleAlertIcon, RefreshCcwIcon } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

function ErrorFallback(
  _props: { children?: ReactNode },
  { retry }: ErrorInfo,
) {
  return (
    <div className="flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <CircleAlertIcon className="size-6 text-destructive" />
      <div>
        <p className="font-medium">Couldn&apos;t load this chat</p>
        <p className="text-sm text-muted-foreground">
          Check your connection and try again.
        </p>
      </div>
      <Button variant="outline" onClick={retry}>
        <RefreshCcwIcon />
        Try again
      </Button>
    </div>
  );
}

export default catchError(ErrorFallback);
