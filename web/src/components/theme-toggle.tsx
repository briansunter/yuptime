import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "../contexts/theme-context";
import { cn } from "../lib/utils";
import { useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [showDropdown, setShowDropdown] = useState(false);

  const options = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ];

  const currentOption = options.find((o) => o.value === theme) || options[2];
  const Icon = currentOption.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="p-2 rounded-md hover:bg-accent transition-colors"
        aria-label="Toggle theme"
      >
        <Icon className="h-5 w-5" />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 mt-2 w-36 bg-popover border border-border rounded-md shadow-lg z-50">
            {options.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setTheme(option.value);
                    setShowDropdown(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2",
                    theme === option.value && "bg-accent"
                  )}
                >
                  <OptionIcon className="h-4 w-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
