
import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Dashboard from "./components/Dashboard";
import Sidebar from "./components/Sidebar";
import SmartFileUpload from "./components/SmartFileUpload";
import AgentManagement from "./components/AgentManagement";
import UnifiedLocations from "./components/UnifiedLocations";
import PLReports from "./components/PLReports";
import UploadManagement from "./components/UploadManagement";
import LocationCommissionReport from "./components/LocationCommissionReport";
import Settings from "./components/Settings";
import AuthPage from "./components/AuthPage";
import { useAuth } from "./hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";

const queryClient = new QueryClient();

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { user, profile, loading, signOut, isAuthenticated } = useAuth();

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "upload":
        return <SmartFileUpload />;
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

  // Show loading screen while checking auth
  if (loading) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="flex h-screen bg-background items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
        <Toaster />
      </QueryClientProvider>
    );
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthPage />
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex h-screen bg-background">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 flex flex-col">
          {/* Header with user info and logout */}
          <header className="flex items-center justify-between p-4 border-b bg-card">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-medium">
                Welcome, {profile?.full_name || user?.email}
              </span>
              {profile?.role === 'admin' && (
                <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                  Admin
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
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
