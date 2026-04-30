---
name: Financial Dashboard Design System
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0b1c30'
  on-tertiary-container: '#75859d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#d3e4fe'
  tertiary-fixed-dim: '#b7c8e1'
  on-tertiary-fixed: '#0b1c30'
  on-tertiary-fixed-variant: '#38485d'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 40px
  column-gutter: 24px
---

## Brand & Style
The brand personality of this design system is rooted in precision, transparency, and institutional reliability. It is designed to evoke a sense of "quiet confidence"—where the UI recedes to prioritize data clarity while maintaining a premium, polished feel. 

The design style follows a **Corporate / Modern** approach with a heavy emphasis on **Minimalism**. It utilizes a systematic arrangement of information, significant white space to reduce cognitive load in data-heavy environments, and a disciplined use of color to highlight actionable insights and status changes. The aesthetic is crisp and professional, avoiding decorative elements in favor of functional clarity.

## Colors
This design system employs a "Trustworthy Blue" palette. The primary color is a deep, authoritative navy used for headings and primary actions. The secondary color is a vibrant yet professional azure, utilized for interactive elements and data visualization focal points. 

The background uses a crisp white, while "Neutral" tones of slate and cool gray define the structural boundaries (borders) and secondary text. Status indicators for disclosures use high-chroma greens, ambers, and reds to ensure immediate recognition of financial health or regulatory alerts without overwhelming the interface.

## Typography
The typography strategy balances modern refinement with utilitarian readability. **Manrope** is used for headlines to provide a sophisticated, contemporary character. For all body text and data-intensive summaries, **Inter** is the standard due to its exceptional legibility at small sizes and high x-height, which is critical for reading financial tables.

Specific attention is paid to "Data-Mono" levels, which use Inter with tighter tracking for tabular figures, ensuring that columns of numbers align vertically for easier comparison. Text summaries and disclosures utilize "Body-MD" to maintain a professional document-like feel.

## Layout & Spacing
This design system utilizes a **Fixed Grid** model for high-density dashboards to ensure information density is predictable across desktop resolutions. The layout is centered on a 12-column grid with a 1200px max-width for the main content area.

The spacing rhythm is based on a 4px baseline, which allows for precise alignment of dense data tables and form elements. Internal card padding is strictly set to 24px (LG) to ensure that even complex widgets have enough "breathing room" to be digestible. Margins between disparate dashboard widgets are set to 32px (XL) to clearly delineate different data sets.

## Elevation & Depth
Visual hierarchy is established primarily through **Tonal Layers** and **Low-Contrast Outlines**. Instead of heavy shadows, this design system uses a subtle "Surface-on-Surface" approach:
- The main background is the lightest neutral.
- Content cards use a pure white background with a 1px border in a soft cool gray.
- Interaction states (hovering over a table row or card) are indicated by a subtle shift to a slightly darker neutral tint rather than a shadow.
- Modals and popovers use a very soft, highly diffused ambient shadow (15% opacity) to signify a change in the Z-axis without breaking the clean, flat aesthetic.

## Shapes
The shape language is "Soft," utilizing a 0.25rem (4px) base radius. This creates a professional look that feels modern but retains the structural integrity and "seriousness" required for a financial institution. 

Larger containers like cards use a 0.5rem radius, while input fields and buttons stay at the base 4px level. Status indicators and "pills" for disclosures are the only exception, utilizing a fully rounded (pill-shaped) radius to distinguish them as discrete status markers within data tables.

## Components
- **Data Tables:** These are the core of the design system. They must feature sticky headers, zebra-striping on hover, and monospaced numerical alignment. Borders should be horizontal only to emphasize row continuity.
- **Card-Based Feeds:** Feeds utilize a vertical stack of cards with 16px spacing. Each card features a "Header" area for the source/timestamp and a "Body" for the summary text.
- **Status Indicators:** Used for disclosures and approvals. These are small, pill-shaped chips with a light background tint and dark text of the same hue (e.g., light green background with dark green text for "Active").
- **Form Elements:** Inputs use a 1px border with a 4px border radius. Focused states must use the Secondary Blue for the border and a subtle glow. Labels are always positioned above the input field in "Label-SM" typography.
- **Buttons:** Primary buttons are solid Navy (Primary Color) with white text. Secondary buttons use an outline style with the Secondary Blue.
- **Metric Widgets:** Small cards specifically for "at-a-glance" figures, featuring a Headline-MD for the value and a Label-SM for the metric name.