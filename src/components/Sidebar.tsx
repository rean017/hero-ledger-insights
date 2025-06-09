
import { Home, Users, Building2, FileText, TrendingUp, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  currentTab: string;
  onTabChange: (tab: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'agents', label: 'Agent Management', icon: Users },
  { id: 'accounts', label: 'Account Assignment', icon: Building2 },
  { id: 'reports', label: 'P&L Reports', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const Sidebar = ({ isOpen, currentTab, onTabChange }: SidebarProps) => {
  return (
    <aside className={cn(
      "bg-card border-r border-border transition-all duration-300 flex flex-col",
      isOpen ? "w-64" : "w-16"
    )}>
      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            
            return (
              <Button
                key={item.id}
                variant={isActive ? "default" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3 transition-all",
                  !isOpen && "px-2"
                )}
                onClick={() => onTabChange(item.id)}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {isOpen && <span>{item.label}</span>}
              </Button>
            );
          })}
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
