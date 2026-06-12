# iOS 18 → iOS 26 / macOS Tahoe 1:1 Educational Replica — Full Feature Matrix

> **Citations:** Every feature maps to a quote in `docs/IOS_26_SOURCE_MATERIALS.md` (Apple iOS 26 PDF / macOS 26 release notes).

> **Scope:** Educational, reverse-engineered UI/UX replica of Apple’s iOS 18 → 26 and macOS Tahoe updates inside the JARVIS live dashboard (`server/jarvis_live.html`). No public production intent. All Apple trademarks, names, and visual concepts belong to Apple Inc.
> **Sources:** Apple official iOS 26 PDF, Apple macOS 26 release notes, Apple Newsroom press releases, MacRumors/iClarified cross-checks. See `IOS_26_SOURCE_MATERIALS.md`.

---

## Legend
- **Status**
  - `✅` = Implemented in `server/jarvis_live.html`
  - `🔄` = Partial / mock / UI-only (no backend endpoint)
  - `⏳` = Not yet implemented
  - `❌` = Out of scope for web dashboard (e.g., cellular, payment hardware)
- **Source** = Apple official source category.

---

## 1. Design System — Liquid Glass (iOS 26 / macOS Tahoe)

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 1.1 | Liquid Glass translucent/refractive materials | Apple PDF | ✅ | `:root` `--liquid-*` tokens |
| 1.2 | Real-time reflection/refraction of background | Apple PDF | 🔄 | Spatial wallpaper + glass panels tint from background |
| 1.3 | Dynamic specular top-edge sheen | Apple PDF | ✅ | `--sheen` inset shadows |
| 1.4 | Background tinting from wallpaper/content | Apple PDF | ✅ | Dynamic HSL `--tint` + `data-tint` picker |
| 1.5 | Material thickness scale (ultra-thin → chrome) | Apple PDF | ✅ | `--liquid-ultra-thin` to `--liquid-chrome` |
| 1.6 | Heavy backdrop blur + saturation boost | Apple PDF | ✅ | `blur(44px) saturate(1.55)` on Dock/panels |
| 1.7 | Soft inner glow instead of neon borders | Apple PDF | ✅ | `--border-line` low opacity + sheen |
| 1.8 | Caustic / shimmer refraction animation | Apple PDF | ✅ | `#cmd::after`, `#dock::after` caustic keyframes |
| 1.9 | Floating sheets with depth shadows | Apple PDF | ✅ | `--shadow-z3` + tinted glow on `#card`, `#prop` |
| 1.10 | Dynamic tools & navigation that morph | Apple PDF | ⏳ | Toolbar does not yet morph based on context |
| 1.11 | In-place alerts expanding from button | Apple PDF | ✅ | `.inplace-alert` host + JS helper |  |  |
| 1.12 | Expanded vertical context menus | Apple PDF | ✅ | `.ctx-menu` right-click menu |  |  |
| 1.13 | Liquid Glass magnifier loupe | Apple PDF | ✅ | `#loupe` Alt-key magnifier |  |  |
| 1.14 | Dynamic tab bars shrink/expand on scroll | Apple PDF | ✅ | `#dynTabs` bottom bar |  |  |
| 1.15 | Rounded window/sheet corners | Apple PDF | ✅ | `--radius-sheet` 34px |
| 1.16 | Updated controls (buttons, sliders, switches) | Apple PDF | 🔄 | Buttons/switches styled; sliders not used |
| 1.17 | Animated Control Center / Lock Screen transitions | Apple PDF | 🔄 | CC sheet animates; lock screen N/A |

---

## 2. Home Screen / Icons / Widgets

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 2.1 | Redesigned layered glass app icons | Apple PDF | 🔄 | Dock `.gly` glass tiles; not multi-layer |
| 2.2 | Light-tinted icons & widgets | Apple PDF | 🔄 | Tint picker affects UI; not icon glyph backgrounds |
| 2.3 | Dark-tinted icons & widgets | Apple PDF | 🔄 | Tint picker affects UI; not icon glyphs |
| 2.4 | Clear icons & widgets | Apple PDF | 🔄 | Clear tint available |
| 2.5 | Matched tinting to iPhone/case color | Apple PDF | ❌ | No device/case detection in web |
| 2.6 | Widgets on Home Screen | iOS 18 | ❌ | Web dashboard, not home screen |
| 2.7 | Customizable Home Screen icon grid | iOS 18 | ❌ | Not applicable |

---

## 3. Top Bar / Menu Bar / Status Area

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 3.1 | Completely transparent menu bar | Apple PDF / macOS RN | ✅ | `#top` gradient fade, no border |
| 3.2 | Floating status pills | Apple PDF | ✅ | `.chip` pill style |
| 3.3 | System tray / menu extras | macOS RN | 🔄 | `#top` right buttons |
| 3.4 | Live Activities in status area | Apple PDF | ✅ | `#liveActivity` floating pill |
| 3.5 | Search/Spotlight centered bar | Apple PDF | ✅ | `#search` Spotlight pill + dropdown |
| 3.6 | Control Center top-right toggle | iOS 18→26 | ✅ | `#ccBtn` opens `#ovControlCenter` |
| 3.7 | Brightness/Volume seamlessly expand in menu bar | macOS RN | ⏳ | No hardware control UI |

---

## 4. Dock

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 4.1 | Glassy floating Dock | Apple PDF | ✅ | `#dock` glass capsule |
| 4.2 | Icons sit inside glass | Apple PDF | ✅ | `.gly` liquid glass tiles |
| 4.3 | Magnify / Genie hover | macOS | ✅ | `wireDockMagnify` |
| 4.4 | Drag-to-reorder + pin | macOS | ✅ | `wireDockDrag`, `pinBodyToDock` |
| 4.5 | Pinned indicator / unpin chip | macOS | ✅ | `.pinned` + `×` chip |
| 4.6 | Folder tint colors + emoji | Apple PDF | 🔄 | Tint picker; dock folders use emoji icons |
| 4.7 | Layered glass icon depth | Apple PDF | ⏳ | Icons flat |

---

## 5. Command / Talk Bar

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 5.1 | Floating glass command sheet | Apple PDF | ✅ | `#cmd` floating bottom sheet |
| 5.2 | Pill-shaped input | Apple PDF | ✅ | `#say` pill |
| 5.3 | Circular glass action buttons | Apple PDF | ✅ | `#mic`, `.send` circular glass |
| 5.4 | Quick-action pills | Apple PDF | ✅ | `.mini` pill buttons |
| 5.5 | Live Translation button | Apple PDF | ✅ | `🌐 Translate` mini + `#ovTranslate` |
| 5.6 | Voice waveform / activity ring | Apple PDF | ✅ | `#mic.live` pulse ring |
| 5.7 | Bottom-placed search access | Apple PDF | ⏳ | Search still in top bar |

---

## 6. Glass Panels (Metrics)

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 6.1 | Floating metric sheets | Apple PDF | ✅ | `.gpanel` 4 panels |
| 6.2 | 3-state resize toggle | Custom | ✅ | `gp-tog` + `setPanelState` |
| 6.3 | Drag-and-drop target | Custom | ✅ | Planet drop → inspect |
| 6.4 | Liquid Glass progress bars | Apple PDF | ✅ | `.gp-bar .f` gradient + glow |
| 6.5 | Per-panel background tint | Messages bg | 🔄 | `--panel-tint-*` classes |
| 6.6 | Liquid Glass sidebars | macOS RN | 🔄 | Panels are sidebar-like |

---

## 7. Spotlight / Search

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 7.1 | Centered floating Spotlight bar | Apple PDF | ✅ | `#search` + dropdown |
| 7.2 | Quick Actions inline | macOS press | ✅ | `#spotlightDropdown` |
| 7.3 | Natural language search | Apple PDF | ⏳ | Search is keyword only |
| 7.4 | Ranked results / filters | macOS press | ⏳ | Static list |
| 7.5 | Third-party service results | macOS press | ⏳ | Not wired |
| 7.6 | Quick Reminders from Spotlight | Apple PDF | ⏳ | No reminder creation in search |

---

## 8. Control Center

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 8.1 | Pop-over glass panel | iOS 18→26 | ✅ | `#ovControlCenter` |
| 8.2 | Toggle grid cells | Apple PDF | ✅ | `.cc-grid` |
| 8.3 | Archon mode toggle | Custom | ✅ | `#ccArchon` |
| 8.4 | Voice output mute toggle | Custom | ✅ | `#ccVoice` |
| 8.5 | Low Power override | Apple PDF | ✅ | `#ccLowPower` |
| 8.6 | Dense layout toggle | Custom | ✅ | `#ccDense` |
| 8.7 | Spatial wallpaper toggle | Apple PDF | ✅ | `#ccSpatial` |
| 8.8 | Panel tint toggle | Messages bg | ✅ | `#ccPanelTint` |
| 8.9 | Game overlay shortcut | Apple PDF | ✅ | `#ccGame` |
| 8.10 | Call overlay shortcut | Apple PDF | ✅ | `#ccCall` |
| 8.11 | Glass tint picker | Apple PDF | ✅ | `.tint-grid` |
| 8.12 | Pages of controls / resizable | iOS 18 | ⏳ | Single page only |
| 8.13 | Quick Reminders button | Apple PDF | ⏳ | Not in CC |

---

## 9. Live Translation

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 9.1 | Source/target split view | Apple PDF | ✅ | `#ovTranslate` |
| 9.2 | On-device translation demo | Apple PDF | 🔄 | Hardcoded phrase rotation |
| 9.3 | Audio translation in Phone | Apple PDF | 🔄 | Call overlay has translate button |
| 9.4 | Translated captions in FaceTime | Apple PDF | ⏳ | No FaceTime UI |
| 9.5 | AirPods nearby conversation translation | Apple PDF | ❌ | No AirPods hardware |
| 9.6 | Automatic message translation | Apple PDF | ⏳ | Not auto-translated |

---

## 10. Visual Intelligence / Look Up

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 10.1 | Look Up action on object | Apple PDF | ✅ | `🔍 Look Up` on body cards |
| 10.2 | Glass bottom sheet with details | Apple PDF | ✅ | `#ovVisualIntel` |
| 10.3 | Object attributes list | Apple PDF | ✅ | `buildVIBody` |
| 10.4 | Screenshot / screen content lookup | Apple PDF | ⏳ | No screenshot capture |
| 10.5 | Search Google/third-party visually | Apple PDF | ⏳ | Not wired |
| 10.6 | Ask ChatGPT about screen | Apple PDF | ⏳ | No ChatGPT API |
| 10.7 | Identify plants/animals/objects | Apple PDF | ⏳ | No ML model |
| 10.8 | Add event from flyer | Apple PDF | ⏳ | No calendar integration |
| 10.9 | Highlight to search | Apple PDF | ⏳ | No scrub selection |
| 10.10 | Summarize/translate/read text on screen | Apple PDF | ⏳ | Not implemented |

---

## 11. Phone / Calls UI

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 11.1 | Glass call overlay | Apple PDF | ✅ | `#ovCall` |
| 11.2 | Unified Favorites/Recents/Voicemails | Apple PDF | ✅ | `#ovPhone` unified layout |  |  |
| 11.3 | Hold Assist | Apple PDF | ✅ | `#ovPhone` keypad screen |  |  |
| 11.4 | Call Screening | Apple PDF | ✅ | `#ovPhone` unknown-call screening row |  |  |
| 11.5 | Unknown Callers list | Apple PDF | ✅ | `#ovPhone` Unknown Caller row |  |  |
| 11.6 | SharePlay on phone call | Apple PDF | ❌ | No SharePlay backend |
| 11.7 | Voicemail summaries | Apple PDF | ✅ | `#ovPhone` voicemail tab summaries |  |  |
| 11.8 | Live Reply from incoming screen | Apple PDF | ✅ | `#ovPhone` Live Reply action |  |  |
| 11.9 | More button (Recording/Translation/SharePlay) | Apple PDF | ✅ | `#ovPhone` More → open Playground |  |  |
| 11.10 | New Monogram / Contact Poster | Apple PDF | 🔄 | Static avatar in call overlay |  |  |
| 11.11 | High Quality Cellular Calling | Apple PDF | ❌ | No cellular stack |

---

## 12. Messages

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 12.1 | Custom conversation backgrounds | Apple PDF | ✅ | `#msgSheet` background picker |  |  |
| 12.2 | Polls in group chats | Apple PDF | ✅ | `#msgSheet` poll bubble |  |  |
| 12.3 | Partial text selection in bubble | Apple PDF | ✅ | `.msg-bubble.partial` CSS selection |  |  |
| 12.4 | Photo previews (smaller first) | Apple PDF | ❌ | No messaging backend |
| 12.5 | Typing indicators in groups | Apple PDF | ✅ | `.msg-typing` animated dots |  |  |
| 12.6 | Add Contact in groups | Apple PDF | ❌ | No contacts backend |
| 12.7 | Apple Cash in groups | Apple PDF | ❌ | No payment backend |
| 12.8 | Screen Unknown Senders | Apple PDF | ✅ | `#msgSheet` spam/unknown banner |  |  |
| 12.9 | On-device spam protection | Apple PDF | ✅ | `#msgSheet` spam filter banner |  |  |
| 12.10 | Text Filters (Promotions/Transactions) | Apple PDF | ✅ | `#msgSheet` text-filter banner |  |  |
| 12.11 | Allow Notifications by category | Apple PDF | ✅ | `#msgSheet` notification category banner |  |  |
| 12.12 | Redesigned conversation details | Apple PDF | ⏳ | Not implemented |
| 12.13 | Natural language search | Apple PDF | ⏳ | Not implemented |
| 12.14 | Draft filter | Apple PDF | ⏳ | Not implemented |
| 12.15 | Block from Conversation Details | Apple PDF | ⏳ | Not implemented |

---

## 13. Apple Intelligence / Creativity

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 13.1 | Genmoji mixing | Apple PDF | 🔄 | `#ovPlayground` Genmoji prompt output |  |  |
| 13.2 | Genmoji expressions | Apple PDF | ⏳ | Not implemented |
| 13.3 | Genmoji personal attributes | Apple PDF | ⏳ | Not implemented |
| 13.4 | Image Playground with ChatGPT styles | Apple PDF | ✅ | `#ovPlayground` style picker |  |  |
| 13.5 | Image Playground expressions | Apple PDF | ⏳ | Not implemented |
| 13.6 | Image Playground Messages backgrounds | Apple PDF | ✅ | `#ovPlayground` / `#msgSheet` backgrounds |  |  |
| 13.7 | Shortcuts intelligent actions | Apple PDF | 🔄 | Self-dev Shortcut cards |
| 13.8 | Writing Tools summarization | Apple PDF | ⏳ | No writing tools UI |
| 13.9 | Use Model action | Apple PDF | ⏳ | Not implemented |
| 13.10 | Siri product knowledge / context | Apple PDF | ⏳ | Not implemented |
| 13.11 | Create files from ChatGPT | Apple PDF | ⏳ | Not implemented |
| 13.12 | Follow up ChatGPT with actions | Apple PDF | ⏳ | Not implemented |
| 13.13 | Rich formatting copy/paste from ChatGPT | macOS RN | ⏳ | Not implemented |

---

## 14. Camera / Photos

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 14.1 | Photo/Video tabs + pop-out menus | Apple PDF | ⏳ | Not implemented |
| 14.2 | Dirty lens alert | Apple PDF | ✅ | `#lensAlert` camera warning |  |  |
| 14.3 | AirPods camera remote | Apple PDF | ❌ | No camera hardware |
| 14.4 | Photos Library/Collections tabs | Apple PDF | ✅ | `#ovPhotos` Library/Collections/Spatial tabs |  |  |
| 14.5 | Spatial Scene (2D → 3D) | Apple PDF | ✅ | `#ovPhotos` Spatial tab |  |  |
| 14.6 | Relevant video thumbnails in search | Apple PDF | ⏳ | Not implemented |
| 14.7 | Animated album art | Apple PDF | ⏳ | Not implemented |
| 14.8 | Customize Collections view size | Apple PDF | ⏳ | Not implemented |
| 14.9 | Event details in Info panel | Apple PDF | ⏳ | Not implemented |
| 14.10 | Photos Widget options | Apple PDF | ❌ | No home screen widgets |

---

## 15. Safari

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 15.1 | Rounded floating tabs | Apple PDF / macOS RN | ✅ | `#top .safari-tab` rounded floating tabs |  |  |
| 15.2 | Refreshed sidebar (iCloud Tabs/Saved) | macOS RN | ⏳ | No sidebar |
| 15.3 | Advanced fingerprinting protection | Apple PDF | ⏳ | No indicator |

---

## 16. Maps

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 16.1 | Preferred Routes / commute widget | Apple PDF | ✅ | `#ovMaps` route cards |  |  |
| 16.2 | Natural language search | Apple PDF | ⏳ | Not implemented |
| 16.3 | New incident report types | Apple PDF | ⏳ | Not implemented |
| 16.4 | Visited Places library | Apple PDF | ✅ | `#ovMaps` visited places list |  |  |
| 16.5 | Improved maps.apple sharing | Apple PDF | ❌ | No maps backend |

---

## 17. Music / CarPlay

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 17.1 | AutoMix DJ transitions | Apple PDF | ✅ | `#autoMixRing` visual transition |  |  |
| 17.2 | Music Pins | Apple PDF | ⏳ | Not implemented |
| 17.3 | Lyrics translation / pronunciation | Apple PDF | ⏳ | Not implemented |
| 17.4 | Enhanced Replay Insights | Apple PDF | ⏳ | Not implemented |
| 17.5 | CarPlay widgets / Live Activities | Apple PDF | ❌ | No CarPlay |
| 17.6 | CarPlay tapback / pinned conversations | Apple PDF | ❌ | No CarPlay |

---

## 18. Wallet / Payments

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 18.1 | Digital ID with passport | Apple PDF | ❌ | No identity hardware |
| 18.2 | Pay with installments in-store | Apple PDF | ❌ | No payment backend |
| 18.3 | Order tracking | Apple PDF | ❌ | No Wallet backend |
| 18.4 | Updated boarding passes | Apple PDF | ❌ | No Wallet backend |
| 18.5 | Pay with rewards in-store | Apple PDF | ❌ | No payment backend |

---

## 19. Gaming

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 19.1 | Game Overlay | Apple PDF | ✅ | `#ovGame` |
| 19.2 | Apple Games app / Game Library | Apple PDF | 🔄 | GPU overlay only |
| 19.3 | Gaming Hub | Apple PDF | ⏳ | Not implemented |
| 19.4 | Challenges / friend scores | Apple PDF | ⏳ | Not implemented |
| 19.5 | Apple Arcade integration | Apple PDF | ❌ | No Arcade backend |
| 19.6 | DualSense pairing / multi-device | macOS RN | ❌ | No controller hardware |
| 19.7 | MetalFX Frame Interpolation / Denoising | Apple PDF | ❌ | No Metal 4 in browser |
| 19.8 | Personalized recommendations | Apple PDF | ⏳ | Not implemented |
| 19.9 | Controller navigation | Apple PDF | ❌ | No controller hardware |

---

## 20. Accessibility

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 20.1 | Accessibility Reader | Apple PDF | ✅ | `#accReader` simplified reader overlay |  |  |
| 20.2 | Braille Access | Apple PDF | ❌ | No braille display |
| 20.3 | Faster Personal Voice creation | Apple PDF | ❌ | No voice training |
| 20.4 | Vehicle Motion Cues customization | Apple PDF | ❌ | No motion cue hardware |
| 20.5 | Name Recognition | Apple PDF | ❌ | No Sound Recognition ML |
| 20.6 | Eye Tracking / Switch Control / QuickPath | Apple PDF | ❌ | No eye-tracking hardware |
| 20.7 | Live Captions for Live Listen | Apple PDF | ❌ | No Live Listen backend |
| 20.8 | Share Accessibility Settings | Apple PDF | ❌ | No device-to-device sharing |
| 20.9 | More Background Sounds options | Apple PDF | ⏳ | Not implemented |
| 20.10 | Head Tracking | Apple PDF | ❌ | No camera tracking |
| 20.11 | TV app Assistive Access player | Apple PDF | ❌ | No TV app |
| 20.12 | Accessibility Nutrition Labels | macOS RN | ⏳ | Not implemented |
| 20.13 | Reduced motion support | iOS a11y | ✅ | `@media(prefers-reduced-motion:reduce)` |
| 20.14 | 44 px touch targets | iOS HIG | ✅ | All buttons min 44×44 |
| 20.15 | ARIA labels / roles | WCAG | ✅ | Preserved |

---

## 21. Productivity Apps

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 21.1 | Notes Markdown import/export | Apple PDF / macOS RN | ⏳ | Not implemented |
| 21.2 | Phone call recordings + transcripts in Notes | Apple PDF | ⏳ | Not implemented |
| 21.3 | Reminders suggested tasks | Apple PDF | ⏳ | Not implemented |
| 21.4 | Reminders auto-categorize | Apple PDF | ⏳ | Not implemented |
| 21.5 | Reminders quick reminders | Apple PDF | ✅ | `#ovReminders` quick capture |  |  |
| 21.6 | Reminders time zone support | Apple PDF | ⏳ | Not implemented |
| 21.7 | Passwords password history | macOS RN | ⏳ | Not implemented |
| 21.8 | Calendar + Reminders integration | iOS 18 | ⏳ | Not implemented |
| 21.9 | Reed pen calligraphy | Apple PDF | ⏳ | Not implemented |

---

## 22. Settings / System

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 22.1 | Centralized Blocked List | Apple PDF | ⏳ | Not implemented |
| 22.2 | Adaptive Power | Apple PDF | ⏳ | Not implemented |
| 22.3 | Estimated Time to Charge | Apple PDF | ⏳ | Not implemented |
| 22.4 | New Battery UI | Apple PDF | ⏳ | Not implemented |
| 22.5 | SIM Based Focus Mode | Apple PDF | ❌ | No SIM |
| 22.6 | Custom Snooze (1–15 min) | Apple PDF | ⏳ | Not implemented |
| 22.7 | Larger snooze button | Apple PDF | ⏳ | Not implemented |
| 22.8 | Dictation spell-with-voice | Apple PDF | ⏳ | Not implemented |
| 22.9 | Files Open With / default app | Apple PDF | ❌ | No file system |
| 22.10 | Files collapsible list view | Apple PDF | ❌ | No file system |

---

## 23. Safety / Parental Controls

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 23.1 | Communication Requests | Apple PDF | ❌ | No child accounts |
| 23.2 | Safety settings for teens | Apple PDF | ❌ | No child accounts |
| 23.3 | Age-appropriate experiences in apps | Apple PDF | ❌ | No child accounts |
| 23.4 | Moving kids to Child Accounts | Apple PDF | ❌ | No child accounts |
| 23.5 | Communication Safety blur | Apple PDF | ❌ | No content scanning |
| 23.6 | App Store age ratings | Apple PDF | ⏳ | Not implemented |
| 23.7 | Safety Check while Blocking | Apple PDF | ❌ | No Safety Check backend |

---

## 24. Siri

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 24.1 | Siri product knowledge / context awareness | Apple PDF | ⏳ | Not implemented |
| 24.2 | AirPlay Enhancements with Siri | Apple PDF | ❌ | No HomePod/AirPlay control |
| 24.3 | Copy/paste ChatGPT rich formatting | macOS RN | ⏳ | Not implemented |

---

## 25. Sports / TV / Weather

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 25.1 | Apple Sports widget | Apple PDF | ⏳ | Not implemented |
| 25.2 | TV app Assistive Access player | Apple PDF | ❌ | No TV app |
| 25.3 | Weather tips fixes | macOS RN | ❌ | No Weather app |

---

## 26. Developer / Framework (macOS RN)

| # | Feature | Source | Status | JARVIS Map |
|---|---------|--------|--------|------------|
| 26.1 | Foundation Models framework | macOS RN | ❌ | Browser cannot run on-device LLM |
| 26.2 | Metal 4 | macOS RN | ❌ | Browser WebGL only |
| 26.3 | Swift Charts 3D | macOS RN | ❌ | Browser only |
| 26.4 | SwiftUI button sizing / bordered tint | macOS RN | ⏳ | Could adopt for buttons |
| 26.5 | WebKit WebPage navigations async | macOS RN | ❌ | Not applicable |
| 26.6 | Apple Sparse Image Format | macOS RN | ❌ | Not applicable |

---

## Implementation Priority for Wave 3
Given the matrix, the highest-value, dashboard-compatible items still missing are:
1. **Phone full UI:** Call Screening, Hold Assist, Unknown Callers, Voicemail summaries, Live Reply, More button menu.
2. **Messages:** Backgrounds, polls, spam/unknown filters, typing indicators, partial text selection.
3. **Design refinements:** In-place alerts, vertical context menu, magnifier loupe, dynamic tab bars, rounded Safari-style tabs.
4. **Camera/Photos:** Dirty lens alert, spatial scene toggle, Photos library/collections UI.
5. **Maps:** Preferred routes / visited places cards.
6. **Music:** AutoMix-style transition animation.
7. **Reminders/Notes:** Quick reminder, markdown export.
8. **Accessibility:** Accessibility Reader toggle.
9. **Apple Intelligence:** Genmoji mixer, Image Playground style picker (visual mock).

---

## Validation
- `scripts/check_ui_theme_lock.py` must PASS after every overlay addition.
- `npm run lint`, `npm run build`, `npm test` must PASS.
- Cache bust `__jv` must be bumped for every UI shipment.