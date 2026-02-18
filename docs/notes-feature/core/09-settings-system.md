# Settings System

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Settings Architecture

### Data Model

```typescript
interface NotesSettings {
  // Editor Settings
  editor: {
    defaultFormat: 'markdown' | 'plain';
    autoSave: boolean;
    autoSaveInterval: number; // seconds
    spellCheck: boolean;
    wordWrap: boolean;
    fontSize: number;
    theme: 'light' | 'dark' | 'system';
  };
  
  // Storage Settings
  storage: {
    defaultProvider: 'r2' | 's3' | 'vercel';
    autoBackup: boolean;
    maxFileSize: number; // bytes
  };
  
  // UI Settings
  ui: {
    leftSidebarWidth: number;
    rightSidebarWidth: number;
    showLineNumbers: boolean;
    showMinimap: boolean;
    compactMode: boolean;
  };
  
  // Privacy Settings
  privacy: {
    defaultVisibility: 'private' | 'public';
    allowIndexing: boolean;
  };
}
```

### Storage Location

```typescript
// Stored in database per user
model UserSettings {
  id        String @id @default(uuid())
  userId    String @unique
  settings  Json   @db.JsonB
  updatedAt DateTime @updatedAt
  
  user      User   @relation(fields: [userId], references: [id])
}
```

### Default Settings

```typescript
export const DEFAULT_SETTINGS: NotesSettings = {
  editor: {
    defaultFormat: 'markdown',
    autoSave: true,
    autoSaveInterval: 2,
    spellCheck: true,
    wordWrap: true,
    fontSize: 14,
    theme: 'system',
  },
  storage: {
    defaultProvider: 'r2',
    autoBackup: true,
    maxFileSize: 100 * 1024 * 1024, // 100MB
  },
  ui: {
    leftSidebarWidth: 300,
    rightSidebarWidth: 250,
    showLineNumbers: true,
    showMinimap: false,
    compactMode: false,
  },
  privacy: {
    defaultVisibility: 'private',
    allowIndexing: false,
  },
};
```

## Settings UI

### Settings Panel Component

```typescript
export function SettingsPanel() {
  const { settings, updateSettings } = useSettings();
  
  return (
    <Dialog>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="storage">Storage</TabsTrigger>
            <TabsTrigger value="ui">UI</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
          </TabsList>
          
          <TabsContent value="editor">
            <EditorSettings settings={settings.editor} onChange={updateSettings} />
          </TabsContent>
          
          {/* Other tabs */}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

## Command Palette Integration

```typescript
// Register settings commands
export const SETTINGS_COMMANDS: Command[] = [
  {
    id: 'toggle-auto-save',
    label: 'Toggle Auto Save',
    action: () => toggleAutoSave(),
    icon: Save,
    shortcut: 'Cmd+Shift+S',
  },
  {
    id: 'change-theme',
    label: 'Change Theme',
    action: () => openThemePicker(),
    icon: Palette,
  },
  {
    id: 'open-settings',
    label: 'Open Settings',
    action: () => openSettingsPanel(),
    icon: Settings,
    shortcut: 'Cmd+,',
  },
];
```

## Admin Settings (Role: owner/admin)

### Admin-Only Settings

```typescript
interface AdminSettings {
  // User Management
  users: {
    allowRegistration: boolean;
    defaultRole: 'guest' | 'member';
    requireEmailVerification: boolean;
  };
  
  // Storage Limits
  storage: {
    quotaPerUser: number; // bytes
    quotaPerFile: number; // bytes
    allowedMimeTypes: string[];
  };
  
  // Content Moderation
  moderation: {
    requireApproval: boolean;
    enableAutoModeration: boolean;
  };
}
```

## Settings API

### GET /api/content/settings
```typescript
export async function GET(req: Request) {
  const session = await requireAuth();
  
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
  });
  
  return Response.json({
    settings: userSettings?.settings || DEFAULT_SETTINGS,
  });
}
```

### PATCH /api/content/settings
```typescript
export async function PATCH(req: Request) {
  const session = await requireAuth();
  const { settings } = await req.json();
  
  await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    update: { settings },
    create: { userId: session.user.id, settings },
  });
  
  return Response.json({ success: true });
}
```

## Next Steps

1. Review [UI Components](./06-ui-components.md) for settings panel
2. See [API Specification](./04-api-specification.md) for settings endpoints
3. Check [Security Model](./05-security-model.md) for permission handling

