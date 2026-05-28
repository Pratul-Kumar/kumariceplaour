import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Moon, Sun, Download, Upload, Trash2, RefreshCw, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Input, Button, Badge, Switch } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/modal";
import { settingsService } from "@/services";
import { useTheme } from "@/hooks/useTheme";

export function Settings() {
  const [shopName, setShopName] = useState("My Shop");
  const [currency, setCurrency] = useState("₹");
  const [clearConfirm, setClearConfirm] = useState(false);
  const [reseedConfirm, setReseedConfirm] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      settingsService.get("shopName"),
      settingsService.get("currency"),
    ]).then(([sn, cu]) => {
      if (sn) setShopName(sn.value);
      if (cu) setCurrency(cu.value);
    });
  }, []);

  const saveSettings = async () => {
    await Promise.all([
      settingsService.set("shopName", shopName),
      settingsService.set("currency", currency),
    ]);
    toast({ type: "success", title: "Settings Saved" });
  };

  const handleExportBackup = async () => {
    toast({ type: "info", title: "Cloud Sync Enabled", description: "Your data is automatically synced to Firebase." });
  };

  const handleImportBackup = () => {
    toast({ type: "info", title: "Cloud Sync Enabled", description: "Your data is automatically synced to Firebase." });
  };

  const handleClearData = async () => {
    toast({ type: "error", title: "Not Allowed", description: "Data clearing is disabled in cloud mode." });
  };

  const handleReseed = async () => {
    toast({ type: "error", title: "Not Allowed", description: "Demo data generation is disabled in cloud mode." });
  };

  return (
    <div className="space-y-5 pb-20 lg:pb-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your app preferences</p>
      </div>

      {/* Shop Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className="text-base">🏪</span> Shop Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Shop Name</label>
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Your shop name" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Currency Symbol</label>
            <Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="₹" className="w-24" />
          </div>
          <Button onClick={saveSettings} className="gap-2">
            <CheckCircle className="h-4 w-4" /> Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            {theme === "dark" ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark theme</p>
            </div>
            <Switch
              id="theme-toggle"
              checked={theme === "dark"}
              onChange={toggleTheme}
              label=""
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Download className="h-4 w-4 text-primary" /> Data Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium text-foreground">Export Backup</p>
              <p className="text-xs text-muted-foreground">Download all data as JSON</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportBackup} className="gap-2">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium text-foreground">Import Backup</p>
              <p className="text-xs text-muted-foreground">Restore data from a JSON backup</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleImportBackup} className="gap-2">
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div>
              <p className="text-sm font-medium text-blue-400">Load Demo Data</p>
              <p className="text-xs text-muted-foreground">Reset and add sample data</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setReseedConfirm(true)} className="gap-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
              <RefreshCw className="h-3.5 w-3.5" /> Reseed
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div>
              <p className="text-sm font-medium text-red-400">Clear All Data</p>
              <p className="text-xs text-muted-foreground">Permanently delete all records</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setClearConfirm(true)}
              className="gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 border-0"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-lg text-2xl">
              🍦
            </div>
            <div>
              <h3 className="font-bold text-foreground">Kumar Ice Parlour</h3>
              <p className="text-xs text-muted-foreground">Business Manager v1.0.0</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ice Creams · Cakes · Shakes · Sweets · Snacks</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <Badge variant="success">✓</Badge>
              <span className="text-xs text-muted-foreground">Works Offline</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <Badge variant="success">✓</Badge>
              <span className="text-xs text-muted-foreground">Installable PWA</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <Badge variant="success">✓</Badge>
              <span className="text-xs text-muted-foreground">Local Storage Only</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
              <Badge variant="success">✓</Badge>
              <span className="text-xs text-muted-foreground">No Account Needed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={clearConfirm}
        onClose={() => setClearConfirm(false)}
        onConfirm={handleClearData}
        title="Clear All Data"
        description="This will permanently delete ALL your business data including staff, expenses, salaries, and leaves. This cannot be undone!"
        confirmText="Yes, Delete All"
      />
      <ConfirmDialog
        open={reseedConfirm}
        onClose={() => setReseedConfirm(false)}
        onConfirm={handleReseed}
        title="Load Demo Data"
        description="This will clear current data and add sample records. Continue?"
        confirmText="Yes, Load Demo"
        variant="default"
      />
    </div>
  );
}
