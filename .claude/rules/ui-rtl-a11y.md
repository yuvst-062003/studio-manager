---
paths:
  - "web/apps/**"
  - "web/packages/**"
---
- The app is RTL. Use logical CSS properties (margin-inline-start, not margin-left).
- No hardcoded Hebrew or English strings in components — use the i18n module.
- Target WCAG 2.0 AA (IS 5568): every interactive element has an accessible name,
  visible focus state, and 4.5:1 contrast minimum.
- Forms: every input has an associated <label>; errors are linked via aria-describedby.
- Do not add a new UI dependency without asking first.
