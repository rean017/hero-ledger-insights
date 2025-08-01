
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "./components/Dashboard";
import Sidebar from "./components/Sidebar";
import { SimpleUpload } from "./components/SimpleUpload";
import AgentManagement from "./components/AgentManagement";
import UnifiedLocations from "./components/UnifiedLocations";
import PLReports from "./components/PLReports";
import LocationCommissionReport from "./components/LocationCommissionReport";
import Settings from "./components/Settings";

const queryClient = new QueryClient();

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "upload":
        return <SimpleUpload />;
      case "agents":
        return <AgentManagement />;
      case "locations":
        return <UnifiedLocations />;
      case "commissions":
        return <LocationCommissionReport />;
      case "pl-reports":
        return <PLReports />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };


  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen bg-background">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 flex flex-col">
          {/* Header */}
          <header className="flex items-center justify-between p-4 border-b bg-card">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">CT</span>
              </div>
              <span className="font-medium">Commission Tracker - Internal Tool</span>
            </div>
          </header>
          <div className="flex-1 p-6 overflow-auto">
            {renderContent()}
          </div>
        </main>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
