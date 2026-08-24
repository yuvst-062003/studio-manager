import { HelloProof, ThemeProvider } from '@studio/ui'

export default function App() {
  return (
    <ThemeProvider>
      <HelloProof appNameKey="common.appName.parent" />
    </ThemeProvider>
  )
}
