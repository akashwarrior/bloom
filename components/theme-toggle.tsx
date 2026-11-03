"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle({
  variant = "ghost",
}: {
  variant?: "ghost" | "outline";
}) {
  const { resolvedTheme: currentTheme, setTheme } = useTheme();

  const handleChangeTheme = (theme: string) => {
    if (theme === currentTheme) return;

    if (!document.startViewTransition) return setTheme(theme);
    document.startViewTransition(() => setTheme(theme));
  };

  return (
    <Button
      size="icon"
      variant={variant}
      onClick={() =>
        handleChangeTheme(currentTheme === "light" ? "dark" : "light")
      }
    >
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
