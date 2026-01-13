# Settings Architecture Planning

**Version:** 1.0  
**Last Updated:** January 12, 2026

## Question

Should command palette settings and account system settings be unified or separate? What's best practice?

## Current State

### Two Potential Approaches

#### Approach 1: Unified Settings System (Recommended ✅)

**Single source of truth with multiple access points:**

```typescript
// Single settings store
interface UnifiedSettings {
  // User preferences (command palette accessible)
  editor: EditorSettings;
  ui: UISettings;
  keyboard: KeyboardSettings;
  
  // Account settings (settings page accessible)
  profile: ProfileSettings;
  security: SecuritySettings;
  billing: BillingSettings;
  
  // System settings (both accessible)
  notifications: NotificationSettings;
  privacy: PrivacySettings;
}
```

**Access Points:**
- **Command Palette (⌘K)**: Quick access to frequently changed settings
  - Toggle dark mode
  - Change font size
  - Toggle word wrap
  - Change autosave interval
  
- **Settings Page (/settings)**: Comprehensive settings management
  - Account information
  - Security settings
  - Billing/subscription
  - Advanced editor preferences
  - Data export/import

**Advantages:**
- Single API endpoint (`/api/settings`)
- Consistent data model
- No sync issues between systems
- Better for users (one place to manage everything)

#### Approach 2: Separate Systems (Not Recommended ❌)

**Two independent systems:**
- Command palette settings → localStorage
- Account settings → Database

**Disadvantages:**
- Data duplication
- Sync complexity
- Inconsistent UX
- More API endpoints

## Recommended Architecture

### Unified Settings API

```typescript
// app/api/settings/route.ts
export async function GET(req: Request) {
  const session = await requireAuth();
  
  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });
  
  return Response.json({
    success: true,
    data: settings?.settings || DEFAULT_SETTINGS,
  });
}

export async function PATCH(req: Request) {
  const session = await requireAuth();
  const { path, value } = await req.json();
  
  // Update specific setting path
  // e.g., path: "editor.fontSize", value: 16
  
  await prisma.userSettings.update({
    where: { userId: session.user.id },
    data: {
      settings: {
        ...existingSettings,
        [path.split('.')[0]]: {
          ...existingSettings[path.split('.')[0]],
          [path.split('.')[1]]: value,
        },
      },
    },
  });
  
  return Response.json({ success: true });
}
```

### Settings Categories

```typescript
interface SettingsSchema {
  // Quick Settings (Command Palette + Settings Page)
  quick: {
    theme: 'light' | 'dark' | 'system';
    fontSize: number;
    autoSave: boolean;
    notifications: boolean;
  };
  
  // Editor Settings (Command Palette + Settings Page)
  editor: {
    fontSize: number;
    fontFamily: string;
    lineHeight: number;
    wordWrap: boolean;
    minimap: boolean;
    lineNumbers: boolean;
    autoSave: boolean;
    autoSaveInterval: number;
    spellCheck: boolean;
  };
  
  // Account Settings (Settings Page Only)
  account: {
    name: string;
    email: string;
    username: string;
    avatar: string;
    bio: string;
  };
  
  // Security Settings (Settings Page Only)
  security: {
    twoFactorEnabled: boolean;
    sessionTimeout: number;
    allowedIPs: string[];
  };
  
  // Storage Settings (Both)
  storage: {
    defaultProvider: 'r2' | 's3' | 'vercel';
    autoBackup: boolean;
    maxFileSize: number;
  };
  
  // Privacy Settings (Settings Page Only)
  privacy: {
    profileVisibility: 'public' | 'private';
    activityTracking: boolean;
    dataSharing: boolean;
  };
  
  // Keyboard Shortcuts (Command Palette + Settings Page)
  keyboard: {
    shortcuts: Record<string, string>;
    customShortcuts: Record<string, string>;
  };
}
```

### Command Palette Integration

```typescript
// Register settings commands
export const SETTINGS_COMMANDS: Command[] = [
  // Quick toggles
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    action: () => toggleTheme(),
    icon: Palette,
    shortcut: 'Cmd+Shift+T',
    category: 'Settings',
  },
  {
    id: 'toggle-autosave',
    label: 'Toggle Auto Save',
    action: () => toggleSetting('editor.autoSave'),
    icon: Save,
    shortcut: 'Cmd+Shift+S',
    category: 'Settings',
  },
  
  // Open full settings
  {
    id: 'open-settings',
    label: 'Open Settings',
    action: () => router.push('/settings'),
    icon: Settings,
    shortcut: 'Cmd+,',
    category: 'Navigation',
  },
  
  // Quick actions
  {
    id: 'increase-font-size',
    label: 'Increase Font Size',
    action: () => adjustFontSize(1),
    icon: Plus,
    shortcut: 'Cmd+Plus',
    category: 'Settings',
  },
  {
    id: 'decrease-font-size',
    label: 'Decrease Font Size',
    action: () => adjustFontSize(-1),
    icon: Minus,
    shortcut: 'Cmd+Minus',
    category: 'Settings',
  },
];
```

### Settings Page Structure

```typescript
// app/settings/page.tsx
export default function SettingsPage() {
  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="keyboard">Keyboard</TabsTrigger>
        </TabsList>
        
        <TabsContent value="account">
          <AccountSettings />
        </TabsContent>
        
        <TabsContent value="editor">
          <EditorSettings />
          {/* Shows ALL editor settings, not just quick ones */}
        </TabsContent>
        
        {/* Other tabs */}
      </Tabs>
    </div>
  );
}
```

### React Hook for Settings

```typescript
// hooks/useSettings.ts
export function useSettings() {
  const { data, mutate } = useSWR('/api/settings', fetcher);
  
  const updateSetting = async (path: string, value: any) => {
    // Optimistic update
    mutate((current) => ({
      ...current,
      [path]: value,
    }), false);
    
    // Actual update
    await fetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ path, value }),
    });
    
    // Revalidate
    mutate();
  };
  
  return {
    settings: data?.settings || DEFAULT_SETTINGS,
    updateSetting,
    isLoading: !data,
  };
}

// Usage in command palette
const { updateSetting } = useSettings();
updateSetting('editor.fontSize', 16);

// Usage in settings page
const { settings, updateSetting } = useSettings();
<Input 
  value={settings.editor.fontSize}
  onChange={(e) => updateSetting('editor.fontSize', Number(e.target.value))}
/>
```

## Best Practices

### 1. Settings Hierarchy

**Command Palette:**
- Quick toggles (< 5 most common settings)
- Should complete in one action
- Visual feedback immediate
- Examples: theme, font size, autosave

**Settings Page:**
- Comprehensive configuration
- Multiple related settings grouped
- May require form submission
- Examples: profile info, security settings, advanced preferences

### 2. Settings Sync

```typescript
// Settings should sync across:
// 1. Command palette changes
// 2. Settings page changes
// 3. Multiple browser tabs
// 4. Multiple devices (via database)

// Use broadcast channel for cross-tab sync
const channel = new BroadcastChannel('settings-sync');

channel.addEventListener('message', (event) => {
  if (event.data.type === 'settings-updated') {
    mutate('/api/settings'); // Refresh settings
  }
});

// Broadcast when settings change
const updateSetting = async (path: string, value: any) => {
  await fetch('/api/settings', { /* ... */ });
  channel.postMessage({ type: 'settings-updated', path, value });
};
```

### 3. Settings Validation

```typescript
// Zod schema for settings validation
const SettingsSchema = z.object({
  editor: z.object({
    fontSize: z.number().min(8).max(32),
    autoSaveInterval: z.number().min(1).max(60),
  }),
  storage: z.object({
    maxFileSize: z.number().max(500 * 1024 * 1024), // 500MB max
  }),
  // ...
});

// Validate before saving
const validated = SettingsSchema.parse(newSettings);
```

### 4. Settings Migration

```typescript
// Handle settings schema changes
function migrateSettings(oldSettings: any, version: number): Settings {
  if (version < 2) {
    // v2: Renamed 'theme' to 'appearance.theme'
    return {
      ...oldSettings,
      appearance: {
        theme: oldSettings.theme || 'system',
      },
    };
  }
  return oldSettings;
}
```

## Visual Design

### Command Palette Settings
```
⌘K → Type "theme" → Select "Toggle Theme"
⌘K → Type "font" → Adjust with slider inline
⌘K → Type "settings" → Opens full settings page
```

### Settings Page
```
Navigation:
┌─────────────────────────────┐
│ [Account] [Editor] [Storage]│
│ [Privacy] [Security]        │
└─────────────────────────────┘

Content:
┌─────────────────────────────┐
│ Section Title               │
│                             │
│ [Setting 1]  [Value]        │
│ [Setting 2]  [Value]        │
│                             │
│ [Save Changes]              │
└─────────────────────────────┘
```

## Implementation Priority

### Phase 1: Basic Settings (Week 1)
- Create unified settings API
- Implement settings hook
- Add 5 command palette quick settings

### Phase 2: Settings Page (Week 2)
- Build full settings page
- All categories implemented
- Form validation

### Phase 3: Sync & Polish (Week 3)
- Cross-tab sync
- Settings migration
- Export/import settings

## Conclusion

**Recommendation:** Unified settings system with a single API endpoint and multiple access points (command palette + settings page).

**Benefits:**
- Simpler architecture
- Better UX
- Easier to maintain
- No data inconsistencies

**Trade-offs:**
- More planning upfront
- Need clear categorization of which settings appear where

## Next Steps

1. Review with team
2. Finalize settings schema
3. Implement unified API
4. Build command palette integration
5. Build settings page

