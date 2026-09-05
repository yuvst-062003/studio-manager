// A render harness for the design-review loop, NOT a shipped entry. Each wizard step is
// screenshotted here against the prototype before it is wired into JoinFlow. Delete once
// the wizard is mounted for real.
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
// Mirrors main.tsx: the app gets fonts.css and tokens.css through @studio/ui's barrel.
// Without this the preview renders in the browser's default serif and Tailwind's theme
// tokens stand unopposed — which is exactly what the first two checkpoints screenshotted.
import { ThemeProvider } from '@studio/ui'
import { Step1Agreements } from './features/onboarding/wizard/Step1Agreements'
import { Step2Trainees } from './features/onboarding/wizard/Step2Trainees'
import { Step3Payment } from './features/onboarding/wizard/Step3Payment'
import { PaymentFrame } from './features/onboarding/wizard/PaymentFrame'
import { Step4Done } from './features/onboarding/wizard/Step4Done'
import type { PaymentFrameRequest } from './features/onboarding/wizard/PaymentFrame'
import { WizardHeader } from './features/onboarding/wizard/WizardHeader'
import type { WizardStep } from './features/onboarding/wizard/WizardHeader'
import type { PaymentMethod, StudentDraft } from './features/onboarding/wizard/types'
import { GROUPS, PLANS, HEALTH_SCHEMA } from './wizard-preview-fixtures'
import './tailwind.css'

const EMBLEM =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDgNoYT3Pv-I0TDnaRaYLhD6g-_wrOGNrZzGw3H0ZZsGcj7GdsJ_8exVf_pXK74BB0zj2EAq5DCZaO67L2_J_S9sIwNfoau1_vnCh3NyMqkBZdMRwP5BBjlfgNOjwK753M2OTj8mnjKQYNZQxCbwZey0rXeZw6Ud_yXWSssdIBJsj0Jb9Ho8Wgg64H5BY9IhxulJToFh11fKXbOnWnIOmkSq2XfQeHSjdaxtxrz7OmEJxfNhwWHWqG-vg-WIicVHLVkiQ'
const LOGO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCqbRe2zQ7aiEf-Ll70KXf1FWJ1KKewh--R5m4r1zRgUEZwj1MsVOCtAqb4kMgrOCtjzHzYjZ1hnX4cWrByUATpDAFgvtpYd0DwUNndvOAfcvw-tMgv80i5m08kUFZkNS_6eWplDDMeDMaBqo75aM6voyQcJDF3c0KECOYBWAQ2FETLygSXu00vYvqWYuN6YONe-fjXBRgUcWreRygYzzThMSQl63UxpK8Y3Zoc2A1KTQhmlNUvWsdZ4pjhrwqBCUV6Jg'

//: Seeded so step 2's list has something to show. `?empty` renders the true first-run
//: state instead.
const SEED: StudentDraft[] = [
  {
    id: 'seed-1',
    firstName: 'איתי',
    lastName: 'לוי',
    nationalId: '328491022',
    birthDate: '2014-04-12',
    address: 'הרצל 12',
    city: 'נתניה',
    email: '',
    grade: 'grade_4',
    beltId: 'white_yellow',
    guardianFirstName: 'יוסף',
    guardianLastName: 'לוי',
    guardianNationalId: '028194850',
    guardianPhone: '052-1234567',
    guardianEmail: 'yosef@example.com',
    pickup: { parentOnly: true, extraName: '', extraPhone: '' },
    groupId: 'group4',
    planId: 'warrior',
    emergencyPhone: '050-9876543',
    healthFund: 'clalit',
    healthyPreset: true,
    healthAnswers: { med_chronic: false, med_asthma: false, med_allergy: false, med_meds: false, med_epilepsy: false, med_diabetes: false, med_heart: false, med_chest: false, med_faint: false, med_sudden_death: false, med_ortho: false, med_surgery: false, med_other: false },
    medicalNotes: '',
    attested: true,
    signatureDataUrl: '',
  },
  {
    id: 'seed-2',
    firstName: 'מאיה',
    lastName: 'לוי',
    nationalId: '345129878',
    birthDate: '2017-06-20',
    address: 'הרצל 12',
    city: 'נתניה',
    email: '',
    grade: 'grade_2',
    beltId: 'white',
    guardianFirstName: 'יוסף',
    guardianLastName: 'לוי',
    guardianNationalId: '028194850',
    guardianPhone: '052-1234567',
    guardianEmail: 'yosef@example.com',
    pickup: { parentOnly: true, extraName: '', extraPhone: '' },
    groupId: 'group2',
    planId: 'basic',
    emergencyPhone: '050-9876543',
    healthFund: 'clalit',
    healthyPreset: false,
    healthAnswers: { med_chronic: false, med_asthma: true, med_allergy: false, med_meds: false, med_epilepsy: false, med_diabetes: false, med_heart: false, med_chest: false, med_faint: false, med_sudden_death: false, med_ortho: false, med_surgery: false, med_other: false },
    medicalNotes: '',
    attested: true,
    signatureDataUrl: 'data:,',
  },
]

function Preview() {
  const params = new URLSearchParams(window.location.search)
  const [step, setStep] = useState<WizardStep>(Number(params.get('step') ?? 1) as WizardStep)
  const [agreed, setAgreed] = useState(params.has('agreed'))
  const [students, setStudents] = useState<StudentDraft[]>(params.has('empty') ? [] : SEED)
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>({})
  const [frame, setFrame] = useState<PaymentFrameRequest | null>(null)

  //: `?real=1` loads the form the staging API actually builds -- the live uPay endpoint
  //: with real merchant fields. Served from a local helper OUTSIDE the repository, so the
  //: merchant credential never lands in the tree. Everything else posts to the stand-in.
  const openReal = async () => {
    const response = await fetch('http://localhost:5400/form.json')
    const form = (await response.json()) as { action: string; fields: Record<string, string> }
    setFrame({ kind: 'checkout', form })
  }

  //: The exact nine fields `app/integrations/upay/form.py::upay_form_fields` builds, with
  //: the ACTION pointed at a local stand-in. There is no uPay sandbox: `livesystem` is the
  //: constant LIVE and every real form charges a real card on a live merchant account, so
  //: a preview must never post to app.upay.co.il.
  const stubForm = {
    action: 'http://localhost:5400/',
    fields: {
      email: 'club@gladiator.example',
      amount: '400.00',
      returnurl: `${window.location.origin}/payment-complete`,
      ipnurl: 'https://api.example/api/v1/upay/ipn',
      paymentdetails: '9f1c2d64-4a7e-4c5b-9f2a-1b6d0e8c3a11',
      maxpayments: '12',
      livesystem: '1',
      createinvoiceandreceipt: '1',
      refername: 'UPAY',
      lang: 'HE',
      currency: 'NIS',
    },
  }

  return (
    <div className="tw-scope min-h-screen bg-[#faf8ff] text-[#161b28] flex flex-col">
      {step === 4 ? (
        <Step4Done
          students={students}
          groups={GROUPS}
          registrationRef="GLD-2026-8841"
          clubLogoUrl={EMBLEM}
          whatsappUrl="https://chat.whatsapp.com"
          onEnterApp={() => setStep(1)}
        />
      ) : (
        <>
      <WizardHeader
        currentStep={step}
        studioName="מועדון גלדיאטור"
        logoUrl={LOGO}
        onNavigate={setStep}
        onBack={() => setStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current))}
      />
      <main className="flex-1 flex flex-col w-full mx-auto pt-32 px-4 max-w-[480px]">
        {step === 1 ? (
          <Step1Agreements
            emblemUrl={EMBLEM}
            agreed={agreed}
            onAgreedChange={setAgreed}
            onContinue={() => setStep(2)}
          />
        ) : null}
        {step === 3 ? (
          <Step3Payment
            students={students}
            plans={PLANS}
            methods={methods}
            onMethodChange={(id, method) => setMethods((prev) => ({ ...prev, [id]: method }))}
            onBack={() => setStep(2)}
            onSubmit={() =>
              params.has('real')
                ? void openReal()
                : setFrame(
                params.get('frame') === 'link'
                  ? // The standing-order mandate: uPay hosts it and it loads by `src`,
                    // not by a POST. Same frame, different entry.
                    { kind: 'link', url: 'http://localhost:5400/mandate' }
                  : { kind: 'checkout', form: stubForm },
                  )
            }
          />
        ) : null}
        {step === 2 ? (
          <Step2Trainees
            students={students}
            onStudentsChange={setStudents}
            groups={GROUPS}
            plans={PLANS}
            healthSchema={HEALTH_SCHEMA}
            onBack={() => setStep(1)}
            onContinue={() => setStep(3)}
          />
        ) : null}
      </main>
        </>
      )}
      {frame ? (
        <PaymentFrame
          request={frame}
          onComplete={() => {
            setFrame(null)
            setStep(4)
          }}
          onClose={() => setFrame(null)}
        />
      ) : null}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Preview />
    </ThemeProvider>
  </StrictMode>,
)
