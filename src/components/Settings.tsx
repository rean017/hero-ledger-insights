
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SettingsState {
  defaultTimeFrame: string;
  autoAssignMerchantHero: boolean;
  overwriteExistingData: boolean;
  currencyFormat: string;
  nightMode: boolean;
  partyMode: boolean;
}

const Settings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsState>({
    defaultTimeFrame: "current-month",
    autoAssignMerchantHero: false,
    overwriteExistingData: false,
    currencyFormat: "usd",
    nightMode: false,
    partyMode: false,
  });

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedSettings = localStorage.getItem("merchantHeroSettings");
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setSettings(parsed);
      
      // Apply theme settings
      if (parsed.nightMode) {
        document.documentElement.classList.add("dark");
      }
      if (parsed.partyMode) {
        document.documentElement.classList.add("party-mode");
      }
    }
  }, []);

  // Save settings to localStorage whenever settings change
  useEffect(() => {
    localStorage.setItem("merchantHeroSettings", JSON.stringify(settings));
  }, [settings]);

  const handleSettingChange = (key: keyof SettingsState, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));

    // Apply theme changes immediately
    if (key === "nightMode") {
      if (value) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    if (key === "partyMode") {
      if (value) {
        document.documentElement.classList.add("party-mode");
        // Add party mode styles
        const style = document.createElement("style");
        style.id = "party-mode-styles";
        style.textContent = `
          .party-mode {
            --primary: 330 81% 60%;
            --primary-foreground: 0 0% 100%;
            --secondary: 84 81% 60%;
            --secondary-foreground: 0 0% 0%;
            --accent: 330 81% 60%;
            --accent-foreground: 0 0% 100%;
            --card: 84 81% 95%;
            --card-foreground: 0 0% 0%;
            --background: linear-gradient(45deg, hsl(330 81% 90%), hsl(84 81% 90%));
          }
          .party-mode .bg-background {
            background: linear-gradient(45deg, hsl(330 81% 90%), hsl(84 81% 90%));
          }
          .party-mode .bg-card {
            background: hsl(0 0% 100%);
            border: 2px solid hsl(330 81% 60%);
          }
        `;
        document.head.appendChild(style);
      } else {
        document.documentElement.classList.remove("party-mode");
        const existingStyle = document.getElementById("party-mode-styles");
        if (existingStyle) {
          existingStyle.remove();
        }
      }
    }

    toast({
      title: "Settings Updated",
      description: "Your preferences have been saved.",
    });
  };

  const downloadCommissionData = () => {
    // Mock CSV data - in a real app this would fetch from your data source
    const csvData = `Date,Location,Agent,Commission Amount,Currency
2024-04-01,Location A,John Doe,250.00,USD
2024-04-02,Location B,Jane Smith,180.50,USD
2024-04-03,Location C,Mike Johnson,320.75,USD`;

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "commission-data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Download Started",
      description: "Commission data CSV is being downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your application preferences and defaults.</p>
      </div>

      {/* Dashboard Defaults Section */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Defaults</CardTitle>
          <CardDescription>Configure default settings for your dashboard and data uploads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="default-timeframe">Default Time Frame</Label>
            <Select
              value={settings.defaultTimeFrame}
              onValueChange={(value) => handleSettingChange("defaultTimeFrame", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select default time frame" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current-month">Current Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="all-time">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-assign">Auto-assign 'Merchant Hero' as agent on upload</Label>
              <div className="text-sm text-muted-foreground">
                Automatically assign Merchant Hero as the agent for new uploads
              </div>
            </div>
            <Switch
              id="auto-assign"
              checked={settings.autoAssignMerchantHero}
              onCheckedChange={(checked) => handleSettingChange("autoAssignMerchantHero", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="overwrite-data">Overwrite existing data on re-upload</Label>
              <div className="text-sm text-muted-foreground">
                Replace existing data when uploading files with duplicate records
              </div>
            </div>
            <Switch
              id="overwrite-data"
              checked={settings.overwriteExistingData}
              onCheckedChange={(checked) => handleSettingChange("overwriteExistingData", checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currency-format">Currency Format</Label>
            <Select
              value={settings.currencyFormat}
              onValueChange={(value) => handleSettingChange("currencyFormat", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select currency format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">$ USD</SelectItem>
                <SelectItem value="eur">€ EUR</SelectItem>
                <SelectItem value="gbp">£ GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Button onClick={downloadCommissionData} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              Download All Commission Data as CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings Section */}
      <Card>
        <CardHeader>
          <CardTitle>Display Settings</CardTitle>
          <CardDescription>Customize the appearance and theme of your application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="night-mode">Night Mode</Label>
              <div className="text-sm text-muted-foreground">
                Switch to dark theme with light text
              </div>
            </div>
            <Switch
              id="night-mode"
              checked={settings.nightMode}
              onCheckedChange={(checked) => handleSettingChange("nightMode", checked)}
            />
          </div>

          <div className="space-y-2">
            <Label>Party Mode</Label>
            <div className="text-sm text-muted-foreground mb-2">
              Transform the UI with vibrant pink and lime green colors
            </div>
            <Button
              variant={settings.partyMode ? "default" : "outline"}
              onClick={() => handleSettingChange("partyMode", !settings.partyMode)}
              className="w-full sm:w-auto"
            >
              {settings.partyMode ? "Disable Party Mode" : "Enable Party Mode"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
