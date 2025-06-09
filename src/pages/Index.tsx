
import { useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import AgentManagement from "@/components/AgentManagement";
import AccountAssignment from "@/components/AccountAssignment";
import Locations from "@/components/Locations";
import PLReports from "@/components/PLReports";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentTab, setCurrentTab] = useState('dashboard');

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'agents':
        return <AgentManagement />;
      case 'accounts':
        return <AccountAssignment />;
      case 'locations':
        return <Locations />;
      case 'reports':
        return <PLReports />;
      case 'analytics':
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Analytics component coming soon...</p>
          </div>
        );
      case 'settings':
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Settings component coming soon...</p>
          </div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-background w-full">
      <Header onMenuClick={toggleSidebar} />
      <div className="flex w-full">
        <Sidebar 
          activeTab={currentTab} 
          onTabChange={setCurrentTab} 
        />
        <main className="flex-1 p-6 overflow-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default Index;
