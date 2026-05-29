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
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-glass-border">
          <CardTitle className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
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
          <div className="pt-2">
            <Button variant="glow" onClick={saveSettings} className="gap-2">
              <CheckCircle className="h-4 w-4" /> Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
            {theme === "dark" ? <Moon className="h-4 w-4 text-indigo-400" /> : <Sun className="h-4 w-4 text-indigo-400" />}
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-foreground">Dark Mode</p>
              <p className="text-xs font-medium text-muted-foreground">Switch between light and dark theme</p>
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
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest">
            <Download className="h-4 w-4 text-indigo-400" /> Data Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-glass-bg border border-glass-border hover:bg-glass-bg transition-colors">
            <div>
              <p className="text-sm font-bold text-foreground">Export Backup</p>
              <p className="text-xs font-medium text-muted-foreground">Download all data as JSON</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportBackup} className="gap-2 bg-transparent border-glass-border text-foreground hover:text-foreground hover:bg-glass-bg">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-glass-bg border border-glass-border hover:bg-glass-bg transition-colors">
            <div>
              <p className="text-sm font-bold text-foreground">Import Backup</p>
              <p className="text-xs font-medium text-muted-foreground">Restore data from a JSON backup</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleImportBackup} className="gap-2 bg-transparent border-glass-border text-muted-foreground hover:text-foreground hover:bg-glass-bg">
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors">
            <div>
              <p className="text-sm font-bold text-destructive">Wipe Database</p>
              <p className="text-xs font-medium text-muted-foreground">Delete all data permanently</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setReseedConfirm(true)} className="gap-2 border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 hover:text-blue-300">
              <RefreshCw className="h-3.5 w-3.5" /> Reseed
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors">
            <div>
              <p className="text-sm font-bold text-red-400">Clear All Data</p>
              <p className="text-xs font-medium text-red-400/70">Permanently delete all records</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setClearConfirm(true)}
              className="gap-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 border-0"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About */}
      <Card className="glass-card">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-glass-bg border border-glass-border flex items-center justify-center shadow-lg p-2">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground">Kumar Ice Parlour</h3>
              <p className="text-xs font-medium text-indigo-400 uppercase tracking-widest mt-0.5">Business Manager v1.0.0</p>
              <p className="text-xs font-medium text-muted-foreground mt-1">Ice Creams · Cakes · Shakes · Sweets · Snacks</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-glass-bg border border-glass-border">
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✓</Badge>
              <span className="text-xs font-bold text-foreground">Works Offline</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-glass-bg border border-glass-border">
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✓</Badge>
              <span className="text-xs font-bold text-foreground">Installable PWA</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-glass-bg border border-glass-border">
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✓</Badge>
              <span className="text-xs font-bold text-foreground">Local Storage Only</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-glass-bg border border-glass-border">
              <Badge variant="success" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">✓</Badge>
              <span className="text-xs font-bold text-foreground">No Account Needed</span>
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
