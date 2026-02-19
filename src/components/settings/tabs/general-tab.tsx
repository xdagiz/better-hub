"use client";

import { Moon, Sun, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useColorTheme } from "@/components/theme/theme-provider";
import type { UserSettings } from "@/lib/user-settings-store";

interface GeneralTabProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
}

export function GeneralTab({ settings: _settings, onUpdate: _onUpdate }: GeneralTabProps) {
  const { colorTheme, setColorTheme, themes } = useColorTheme();

  return (
    <div className="divide-y divide-border">
      {/* Theme */}
      <div className="px-4 py-4">
        <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          Theme
        </label>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
          Choose a theme for the interface. Each theme sets both colors and mode.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {themes.map((theme) => {
            const isActive = colorTheme === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => setColorTheme(theme.id)}
                className={cn(
                  "group relative flex items-center gap-3 border px-3 py-2.5 text-left transition-colors cursor-pointer",
                  isActive
                    ? "border-foreground/30 bg-muted/50 dark:bg-white/[0.04]"
                    : "border-border hover:border-foreground/10 hover:bg-muted/30"
                )}
              >
                {/* Color preview dots */}
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className="w-4 h-4 rounded-full border border-border/60"
                    style={{ backgroundColor: theme.bgPreview }}
                  />
                  <span
                    className="w-4 h-4 rounded-full border border-border/60"
                    style={{ backgroundColor: theme.accentPreview }}
                  />
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-medium text-foreground">
                      {theme.name}
                    </span>
                    {theme.mode === "dark" ? (
                      <Moon className="size-2.5 text-muted-foreground/50" />
                    ) : (
                      <Sun className="size-2.5 text-muted-foreground/50" />
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground/60">
                    {theme.description}
                  </span>
                </div>

                {/* Check */}
                {isActive && (
                  <Check className="size-3.5 text-success shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
