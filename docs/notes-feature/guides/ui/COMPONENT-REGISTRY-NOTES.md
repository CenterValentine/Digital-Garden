# Component Registry Investigation Notes

**Last Updated:** January 12, 2026  
**Status:** In Progress

## Overview

This document tracks the investigation of Glass-UI and DiceUI component registries for use in the `/notes/**` feature.

---

## Registry Status

### Glass-UI

**Website:** https://glass-ui.crenspire.com/  
**Status:** 🔄 To be verified in M4

**Installation Command:**

```bash
pnpm dlx shadcn@latest add @glass-ui/button
```

**Notes:**

- Documentation suggests shadcn-compatible installation
- Components not yet tested in this project
- Will verify in M4 when button/card components are needed

**Action Items:**

- [ ] Verify Glass-UI registry URL and component availability
- [ ] Test installation of button component
- [ ] Test installation of card component
- [ ] Document any issues or alternative installation methods

---

### DiceUI

**Website:** https://www.diceui.com/  
**Status:** ⚠️ Registry URL Issue

**Installation Command (Not Working):**

```bash
npx shadcn@latest add "@diceui/command"
```

**Error:**

```
Something went wrong. Please check the error below for more details.
If the problem persists, please open an issue on GitHub.

Message:
The item at https://diceui.com/r/command.json was not found.
It may not exist at the registry.

Suggestion:
Check if the item name is correct and the registry URL is accessible.
```

**Possible Causes:**

1. Component name is incorrect (e.g., should be `@diceui/cmd` not `@diceui/command`)
2. Registry URL structure is different than expected
3. Component not published to registry yet
4. Registry requires authentication or configuration

**Action Items:**

- [ ] Check DiceUI documentation for correct component names
- [ ] Verify registry URL structure
- [ ] Test alternative component names
- [ ] Contact DiceUI maintainers if issue persists
- [ ] Identify alternative command palette components

---

## Alternative Approaches

### Option 1: Standard shadcn Components

**Pros:**

- Reliable, well-documented
- Large component library
- Active maintenance

**Cons:**

- Requires custom styling to match liquid glass aesthetic
- More manual work to achieve glass effects

**Usage:**

```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add command
```

Then apply our design tokens:

```tsx
import { Button } from "@/components/ui/button";
import { getSurfaceStyles } from "@/lib/design-system";

const glass1 = getSurfaceStyles("glass-1");

<Button
  style={{
    background: glass1.background,
    backdropFilter: glass1.backdropFilter,
  }}
>
  Click me
</Button>;
```

### Option 2: Build Custom Components

**Pros:**

- Full control over implementation
- No external dependencies
- Optimized for our use case

**Cons:**

- More initial development time
- Requires maintenance

**Status:** This is what we've done for M3, works well

### Option 3: cmdk for Command Palette

**Pros:**

- Dedicated command palette library
- Already in dependencies
- Works with shadcn styling

**Cons:**

- Need to add glass surface styling manually

**Usage:**

```bash
npm install cmdk
```

Already installed in package.json. Can use this for command palette in M7.

---

## Recommendations

### For M4 (File Tree)

- Use standard shadcn components
- Apply our design token styling
- Don't block on Glass-UI/DiceUI verification

### For M5 (Editors & Viewers)

- TipTap for editor (already in dependencies)
- Standard shadcn for viewer chrome
- Apply glass surfaces via design tokens

### For M7 (Command Palette)

- Use `cmdk` (already installed)
- Wrap with glass surface styling
- Don't depend on DiceUI registry

---

## Investigation Timeline

**M3 (Current):**

- ✅ Identified Glass-UI and DiceUI as potential component sources
- ✅ Documented installation methods
- ⚠️ Discovered DiceUI registry issue
- ✅ Built M3 with basic React components + design tokens (works well)

**M4 (File Tree):**

- [ ] Verify Glass-UI button/card components
- [ ] Test installation and styling
- [ ] Document any issues
- [ ] Decide on final component strategy

**M7 (Command Palette):**

- [ ] Verify DiceUI command component availability
- [ ] If unavailable, use cmdk + custom styling
- [ ] Document final implementation

---

## Conclusion

**Current Strategy:**

1. Build components with React + our design tokens (proven in M3)
2. Optionally enhance with Glass-UI when verified (M4+)
3. Use cmdk for command palette (M7), not DiceUI
4. Always have shadcn as fallback

**Why This Works:**

- Not blocked on external registries
- Full control over glass aesthetic
- Consistent with design system
- Can integrate Glass-UI later if beneficial

**Next Steps:**

- Continue M4 implementation with current approach
- Verify Glass-UI in parallel (non-blocking)
- Skip DiceUI, use cmdk + custom styling

---

## Resources

- **Glass-UI Docs:** https://glass-ui.crenspire.com/docs/getting-started
- **DiceUI Docs:** https://www.diceui.com/docs/introduction
- **shadcn/ui:** https://ui.shadcn.com
- **cmdk:** https://cmdk.paco.me
- **Our Design Tokens:** `lib/design-system/`
