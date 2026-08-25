import { HelloProof, ThemeProvider } from '@studio/ui'
import { DevBar } from '@studio/ui/dev-bar'

export default function App() {
  return (
    <ThemeProvider>
      {/* §19.4 — rendered only for an identity carrying is_developer. M1 resolves the
          real one from the verified JWT; until then there is no developer signed in
          and the bar correctly renders nothing. In a production build this import
          resolves to a component that returns null and whose module is not in the
          bundle at all (web/tools/__tests__/dev-bar-bundle.test.ts). */}
      <DevBar identity={null} />
      <HelloProof appNameKey="common.appName.staff" />
    </ThemeProvider>
  )
}
