
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "./components/Dashboard";
import Sidebar from "./components/Sidebar";
import FileUpload from "./components/FileUpload";
import AgentManagement from "./components/AgentManagement";
import UnifiedLocations from "./components/UnifiedLocations";
import PLReports from "./components/PLReports";
import UploadManagement from "./components/UploadManagement";
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
        return <FileUpload />;
      case "upload-management":
        return <UploadManagement />;
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
        <main className="flex-1 p-6 overflow-auto">
          {renderContent()}
        </main>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
