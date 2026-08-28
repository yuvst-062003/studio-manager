# a2 — settings save-on-blur, verified via public API after reload

Filled headline / about / trial steps in the דף הנחיתה panel; each field saves on blur
(PATCH /api/v1/studio → 200 observed in the network log on blur).
Server state after the edits (public payload):

```
headline: בית לג'ודו — מגיל 5 ועד הנבחרת
about: מועדון גלדיאטור מאמן ג'ודוקא מכל הגילאים באווירה משפחתית ומקצועית. הצוות מלווה כל חניך מהצעד הראשון על המזרן ועד לתחרויות.
trial_steps: ['נרשמים לשיעור ניסיון דרך הטופס', 'מגיעים עם בגדים נוחים ובקבוק מים', 'עולים למזרן ומצטרפים לאימון', 'בסוף האימון מדברים עם המאמן על ההמשך']
phone: 0549577552
address: שרת 28 ב
```

Note (tooling, not product): synthetic JS value-set without real keystrokes does not
trigger the auto-save; real typing + blur saves reliably. Screenshots: a2-settings-top-phone-address.jpg, a2-landing-panel-after-reload.jpg.
