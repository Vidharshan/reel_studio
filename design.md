# Reeltrix Style Guide

## Brand Essence
Reeltrix is a modern AI reel creation studio.  
It feels sharp, capable, and slightly ahead of the algorithm — never gimmicky.

**Tone:** Confident, precise, lightly clever.  
**Personality:** The quiet expert who already knows what will perform.

Subtle Matrix alignment lives only in atmosphere: dark surfaces, cool green accents, and clean digital precision. Never literal references, red pills, code rain, or “welcome to the real world” language.

---

## Color Palette

### Core
| Token              | Hex       | Usage                          |
|--------------------|-----------|--------------------------------|
| Background         | `#070708` | Page background                |
| Surface            | `#111113` | Cards, sections, modals        |
| Surface Elevated   | `#18181B` | Hover states, raised elements  |
| Border             | `#27272A` | Subtle dividers, card outlines |

### Text
| Token              | Hex       | Usage                          |
|--------------------|-----------|--------------------------------|
| Primary            | `#FAFAFA` | Headlines, key text            |
| Secondary          | `#A1A1AA` | Body text, descriptions        |
| Tertiary           | `#71717A` | Captions, meta info            |

### Accent
| Token              | Hex       | Usage                          |
|--------------------|-----------|--------------------------------|
| Accent             | `#00E676` | Primary CTAs, highlights, focus rings |
| Accent Soft        | `#00E6761A` | Subtle backgrounds, glows     |
| Accent Hover       | `#00C853` | Button hover                   |

### Semantic
| Token              | Hex       | Usage                          |
|--------------------|-----------|--------------------------------|
| Success            | `#00E676` | Positive states                |
| Warning            | `#FBBF24` | Caution                        |
| Error              | `#F87171` | Errors                         |

**Rule:** Green is used sparingly. It should feel like a signal, not decoration.

---

## Typography

### Font Stack
- **Primary:** Inter (or system-ui fallback)
- **Monospace (rare):** JetBrains Mono or SF Mono — only for small technical labels or code-like UI elements

### Scale
| Style          | Size   | Weight | Line Height | Tracking     | Usage                    |
|----------------|--------|--------|-------------|--------------|--------------------------|
| Display        | 48–64px| 600    | 1.1         | -0.02em      | Hero headlines           |
| H1             | 36px   | 600    | 1.2         | -0.01em      | Section titles           |
| H2             | 28px   | 600    | 1.25        | -0.01em      | Subsections              |
| H3             | 20px   | 500    | 1.3         | normal       | Card titles              |
| Body           | 16px   | 400    | 1.6         | normal       | Paragraphs               |
| Body Small     | 14px   | 400    | 1.5         | normal       | Secondary text           |
| Caption        | 12px   | 500    | 1.4         | 0.01em       | Labels, meta             |
| Button         | 14–15px| 500    | 1            | 0.01em       | CTAs                     |

**Rules:**
- Prefer slightly tighter tracking on large headlines.
- Never use pure black text on pure white.
- Keep line lengths comfortable (60–75 characters).

---

## Spacing & Layout

### Spacing Scale (8pt base)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128`

### Layout Principles
- Max content width: `1200px`
- Generous vertical rhythm between sections (`96–128px`)
- Cards and interactive elements use consistent internal padding (`24px` or `32px`)
- Avoid dense clusters — give elements room to breathe

### Grid
- Desktop: 12-column
- Consistent left/right page padding: `24–48px` depending on breakpoint

---

## Components

### Buttons
- **Primary:** Solid accent green, dark text or white text, subtle glow on hover
- **Secondary:** Ghost / outline with light border
- **Tertiary:** Text-only with accent on hover
- Border radius: `8px` or `10px`
- Height: `40–48px`
- No heavy shadows — prefer soft glow or border emphasis

### Cards
- Background: Surface
- Border: 1px solid Border
- Radius: `12–16px`
- Hover: Slight lift + brighter border or soft green glow
- Keep content hierarchy clear and uncluttered

### Inputs
- Dark surface with subtle border
- Focus: Accent border + soft green ring
- Placeholder text in Tertiary color

### Navigation
- Minimal, sticky or fixed
- Logo left, primary CTA right
- Transparent or matching background with subtle bottom border on scroll

---

## Visual Style

### Imagery & Graphics
- Clean product UI screenshots and mockups
- Soft depth, controlled lighting
- Occasional abstract geometric or grid elements (very restrained)
- Avoid heavy cyberpunk, neon overload, or code-rain effects

### Motion
- Fast and purposeful (150–250ms)
- Ease-out for most interactions
- Subtle scale or opacity shifts preferred over dramatic movement
- Green accent can briefly pulse or glow on key interactions

### Iconography
- Simple, geometric, 1.5–2px stroke
- Consistent size and optical alignment
- Accent color only when interactive or highlighting status

---

## Voice & Microcopy

- Direct and useful
- Light confidence, never hype
- Short sentences preferred
- Avoid slang, forced memes, or overt Matrix references

**Examples:**
- “Create reels that actually perform.”
- “Templates built from what’s working right now.”
- “From idea to published in minutes.”

---

## Do’s and Don’ts

**Do**
- Use green as a precise signal
- Maintain high contrast for readability
- Keep layouts calm and structured
- Let the product screenshots do the heavy lifting

**Don’t**
- Overuse green
- Add matrix code rain, red/blue pills, or “the one” language
- Use pure black/white extremes without nuance
- Crowd the page with competing elements

---

## Summary
Reeltrix should feel like a high-signal tool that lives inside the algorithm.  
Dark, precise, quietly powerful — with just enough green to remind you it sees patterns most people miss.