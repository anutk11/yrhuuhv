import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme, type Theme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LABELS: Record<Theme, string> = {
  dark: "כהה",
  dim: "ביניים",
  light: "בהיר",
};

const ICONS: Record<Theme, React.ElementType> = {
  dark: Moon,
  dim: SunMoon,
  light: Sun,
};

const ThemeToggle = ({ className }: { className?: string }) => {
  const { theme, setTheme } = useTheme();
  const Icon = ICONS[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={`ערכת נושא: ${LABELS[theme]}`}
          title={`ערכת נושא: ${LABELS[theme]}`}
        >
          <Icon className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        {(Object.keys(LABELS) as Theme[]).map((t) => {
          const ItemIcon = ICONS[t];
          return (
            <DropdownMenuItem
              key={t}
              onClick={() => setTheme(t)}
              className={theme === t ? "text-primary" : undefined}
            >
              <ItemIcon className="w-4 h-4 mr-2" />
              {LABELS[t]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
