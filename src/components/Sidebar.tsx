
import { cn } from "@/lib/utils";
import { BarChart3, Upload, Users, MapPin, DollarSign, FileText } from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "upload", label: "Upload Data", icon: Upload },
    { id: "upload-management", label: "Upload Management", icon: FileText },
    { id: "agents", label: "Agent Management", icon: Users },
    { id: "locations", label: "Locations", icon: MapPin },
    { id: "pl-reports", label: "P&L Reports", icon: DollarSign },
  ];

  return (
    <div className="w-64 bg-card border-r border-border h-full">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-foreground">Merchant Hero</h1>
        <p className="text-sm text-muted-foreground">Revenue Management</p>
      </div>
      <nav className="p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                    activeTab === item.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
