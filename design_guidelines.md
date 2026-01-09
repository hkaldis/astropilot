# AstroPilot - Design Guidelines

## Design Approach

**Reference-Based Approach**: Drawing from Linear (clean data interfaces), Notion (flexible layouts), and professional astronomy software aesthetics. This utility-focused application prioritizes clarity, data density, and field usability while maintaining visual sophistication.

**Core Principle**: "Night-vision friendly precision" - optimize for low-light field use with clear information hierarchy and efficient data entry.

---

## Typography System

**Font Families** (via Google Fonts CDN):
- Primary: `Inter` - all UI elements, body text, data tables
- Monospace: `JetBrains Mono` - numerical values, coordinates, technical specifications

**Type Scale**:
- Hero/Section Headers: `text-4xl font-bold` (36px)
- Page Titles: `text-2xl font-semibold` (24px)
- Card Headers: `text-lg font-semibold` (18px)
- Body Text: `text-base` (16px)
- Metadata/Labels: `text-sm font-medium` (14px)
- Technical Data: `text-sm font-mono` (14px monospace)
- Captions: `text-xs` (12px)

**Typography Hierarchy**:
- Use semibold/bold weights for headers and important metrics
- Regular weight for body content
- Monospace for all numerical data (magnification, scores, coordinates)
- Uppercase `tracking-wider` for section labels and categories

---

## Layout System

**Spacing Scale**: Use Tailwind units of **2, 4, 6, 8, 12, 16** (e.g., `p-4`, `gap-6`, `mt-8`, `mb-12`)

**Grid System**:
- Container: `max-w-7xl mx-auto px-4 md:px-6`
- Card spacing: `gap-4 md:gap-6`
- Section padding: `py-8 md:py-12`
- Form field spacing: `space-y-4`

**Responsive Breakpoints**:
- Mobile-first approach
- Two-column layouts at `md:` (768px)
- Three-column at `lg:` (1024px)
- Four-column data grids at `xl:` (1280px)

---

## Component Library

### Navigation & Layout

**Top Navigation Bar**:
- Fixed header with `h-16` height
- Logo left, primary nav center, user menu right
- Navigation items: `text-sm font-medium tracking-wide`
- Active state: underline indicator

**Sidebar (Dashboard Pages)**:
- `w-64` fixed sidebar on desktop
- Collapsible on tablet/mobile
- Grouped navigation with icon + label
- Equipment/Location quick-access widgets

**Dashboard Layout**:
- Grid-based card system: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Score cards: `col-span-1`, full-width charts: `md:col-span-2 lg:col-span-3`

### Core UI Elements

**Buttons**:
- Primary: `px-6 py-3 text-sm font-semibold rounded-lg`
- Secondary: `px-4 py-2 text-sm font-medium rounded-md border`
- Icon buttons: `p-2 rounded-lg`
- Button groups: `inline-flex gap-2`

**Cards**:
- Standard: `rounded-xl p-6 shadow-sm border`
- Equipment cards: `p-4 rounded-lg border hover:shadow-md transition-shadow`
- Observation logs: `p-5 rounded-lg border-l-4` (left accent border)

**Score Displays**:
- Large numerical score: `text-5xl font-bold font-mono`
- Score labels: `text-xs uppercase tracking-wider font-medium`
- Score breakdown: Horizontal bar indicators with segmented fills
- Color-coding via classes (implementation handles colors)

**Data Tables**:
- Striped rows for readability
- Sticky header: `sticky top-0`
- Compact row height: `py-3`
- Monospace for numerical columns
- Sort indicators on headers

### Forms & Input

**Form Structure**:
- Two-column layout on desktop: `grid md:grid-cols-2 gap-6`
- Full-width for long fields (location name, notes)
- Logical grouping with `space-y-6` between sections

**Input Fields**:
- Label: `text-sm font-medium mb-2 block`
- Input: `w-full px-4 py-2.5 rounded-lg border`
- Helper text: `text-xs mt-1`
- Error state: border emphasis + error message below

**Select Dropdowns**:
- Custom styled with chevron icon (Heroicons)
- Multi-select with tags/chips display
- Search functionality for object catalog

**Sliders & Range Inputs**:
- Bortle scale: Horizontal slider with tick marks 1-9
- Condition inputs: Stepped sliders with visual markers
- Current value display: Large monospace text

**Toggle Switches**:
- `w-11 h-6 rounded-full` track
- For binary settings (filter enabled, imaging mode)

### Data Visualization

**Score Meters**:
- Circular progress indicators for TotalScore, PlanetScore, DSOScore
- Size: `w-32 h-32` on desktop, `w-24 h-24` on mobile
- Percentage fill with centered numerical value

**Condition Bars**:
- Horizontal stacked bars showing score components
- CloudScore, SeeingScore, JetScore, MoonDsoScore segments
- Labels at segment boundaries

**Object Visibility Rating**:
- Five-star visual rating system with filled/unfilled stars
- Text label: "Excellent" to "Not Recommended"
- Reason displayed below in `text-sm`

**Equipment Specs Display**:
- Two-column key-value layout
- Left: Label (`text-sm font-medium`)
- Right: Value (`text-sm font-mono`)
- `divide-y` separator between rows

### Wizard & Multi-Step Flows

**Smart Observation Wizard**:
- Step indicator: Horizontal progress bar with step numbers
- Card-based step container: `max-w-3xl mx-auto`
- Navigation: Back/Next buttons `flex justify-between mt-8`
- Step 1 (Location): Large select with Bortle preview
- Step 2 (Conditions): Slider grid `grid md:grid-cols-2 gap-6`
- Step 3 (Object): Search + filterable grid
- Step 4 (Recommendations): Two-column layout (visual + equipment)
- Step 5 (Review/Override): Editable summary table

**Recommendation Display**:
- Hero card: `p-8 rounded-xl border-2`
- Top section: Visibility rating + reason
- Equipment grid: `grid md:grid-cols-2 gap-4`
- Each recommendation: Icon + label + value + reason
- Override toggle for each recommendation

### Lists & Catalogs

**Object Browser**:
- Filter sidebar: `w-64` with category checkboxes
- Grid view: `grid md:grid-cols-2 lg:grid-cols-3 gap-4`
- Card: Thumbnail placeholder + name + category + difficulty badge
- List view: Table with sortable columns

**Observation History**:
- Timeline layout with date headers
- Session cards: `border-l-4` accent with session details
- Nested observation items: Indented `ml-6` with connection line visual
- Expandable details on click

**Equipment Lists**:
- Category tabs (Telescopes, Eyepieces, etc.)
- Card grid: `grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`
- Quick-add button always visible
- Edit/delete icons on hover

### Badges & Pills

**Category Badges**: `px-2.5 py-1 rounded-full text-xs font-medium`
**Difficulty Indicators**: `px-2 py-0.5 rounded text-xs font-semibold`
**Status Indicators**: `inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs`

---

## Icons

**Icon Library**: Heroicons (via CDN)
- Navigation: outline variants at `w-5 h-5`
- Buttons: outline variants at `w-4 h-4`
- Large feature icons: solid variants at `w-12 h-12`
- Status indicators: mini variants at `w-3 h-3`

**Icon Usage**:
- Telescope, eyepiece, camera icons for equipment types
- Star icon for favorites/ratings
- Cloud, moon, eye icons for conditions
- Check/X icons for recommendations

---

## Responsive Behavior

**Mobile Optimization** (field use critical):
- Stack all multi-column layouts to single column
- Larger touch targets: minimum `h-12` for buttons
- Bottom navigation bar for primary actions
- Swipe gestures for wizard navigation
- Collapsible sections to reduce scrolling

**Tablet/Desktop**:
- Side-by-side comparisons enabled
- Hover states for interactive elements
- Keyboard shortcuts for power users
- Multi-panel layouts (sidebar + main + detail)

---

## Animations

**Minimal Motion Approach**:
- Page transitions: None (instant)
- Card hover: `transition-shadow duration-200`
- Form validation: Shake animation on error (150ms)
- Score updates: Counting animation (500ms ease-out)
- Wizard steps: Fade transition (200ms)

Avoid: Loading spinners (use skeleton screens), carousel auto-play, parallax effects

---

## Images

**No Hero Images**: This is a utility application - launch directly into dashboard or onboarding.

**Imagery Strategy**:
- Equipment thumbnails: User-uploaded or default placeholder icons
- Object images: Celestial object previews in browser (use astronomy image databases/APIs)
- Empty states: Illustrated SVG graphics (telescope, stars, night sky motifs)
- Onboarding: Step illustrations showing equipment setup

**Image Specifications**:
- Equipment cards: `w-full aspect-square object-cover rounded-lg`
- Object previews: `w-full aspect-video rounded-t-lg`
- Profile images: `w-10 h-10 rounded-full`

---

## Special Features

**Night Mode Optimization**:
- Default theme suitable for dark conditions
- Red-light mode option (preserves night vision)
- Reduced brightness controls

**Quick Entry Shortcuts**:
- Recent locations dropdown
- Last-used equipment auto-selected
- Quick-log button from dashboard

**Data Density Controls**:
- Compact/Comfortable view toggles for tables
- Expandable detail sections
- Collapsible sidebar for more screen space