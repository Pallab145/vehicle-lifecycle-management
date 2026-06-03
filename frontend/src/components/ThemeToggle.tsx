"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="default" size="icon" className="w-9 h-9 rounded-full shadow-md bg-foreground text-background opacity-50">
        <Sun className="h-4 w-4" />
        <span className="sr-only">Theme</span>
      </Button>
    );
  }

  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  return (
    <Button
      variant="default"
      size="icon"
      className="w-9 h-9 rounded-full shadow-md bg-foreground text-background hover:scale-110 hover:bg-foreground/80 hover:shadow-xl transition-all duration-300 cursor-pointer"
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
    >
      {currentTheme === "dark" ? (
        <Sun className="h-4 w-4 text-background transition-all" />
      ) : (
        <Moon className="h-4 w-4 text-background transition-all" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
