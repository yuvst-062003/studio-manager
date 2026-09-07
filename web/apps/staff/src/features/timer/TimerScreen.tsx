// The training timer tab — §4.5 of docs/superpowers/specs/2026-09-06-staff-app-redesign.md.
// Ported from `~/Downloads/staff-app/src/components/TimerView.tsx` inside the `.tw-scope`
// wrapper `StaffShell` already provides, same discipline as `AccountScreen.tsx`: class
// vocabulary matched, not approximated.
//
// **The one screen in this port with no backend at all** — no model, no endpoint, no
// migration, no dashboard screen (decision 2). A coach's own presets live on their phone,
// in IndexedDB via `presetsStore.ts` rather than the prototype's `localStorage` — the one
// deliberate storage departure §4.5 calls for.
//
// **The dark ground follows the THEME now (owner, 2026-09-07).** It used to be
// unconditional — the prototype's root div is dark, so this screen painted `#090d16` over
// `StaffShell`'s light ground in every theme, and a coach who had chosen light got one
// black screen out of five. Every surface, border and text colour here now carries a light
// value with the old one behind `dark:`, which the app drives from `data-theme` (see
// `tailwind.css`'s `@custom-variant dark`). `StaffTabBar` follows the same rule — see its
// own header.
// The one deliberate exception is `text-white` on a saturated button (the play/pause
// transport, a selected preset chip): white on blue is correct in both themes, and giving
// it a light variant would have made those labels invisible.
//
// **Three pieces of the prototype are deliberately NOT built — §9:**
//   1. The music player card (Spotify/Apple, the now-playing bar, the equaliser, the
//      auto-play-on-rest switch). Entirely simulated in the source: no integration, no
//      audio, no authorisation. Building it means a partnership, not a port.
//   2. The header's settings button. An `alert()`; everything it would hold — work/rest/
//      rounds via the +/- tiles below — is already on the screen.
//   3. A second sound switch on the account tab. The prototype's `autoMusicOnRest` and
//      this screen's `soundEnabled` are two unrelated booleans that happen to share a
//      drawer; duplicating the timer's own toggle elsewhere is not a feature, it is the
//      bug decision 2's sibling rule warns against.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bookmark,
  BookmarkCheck,
  Check,
  Layers,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Sliders,
  Sparkles,
  SkipForward,
  Timer as TimerIcon,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { BUILT_IN_TIMER_PRESETS } from './builtInPresets'
import { interpolate } from './i18nInterpolate'
import { deleteCustomPreset, loadCustomPresets, saveCustomPreset } from './presetsStore'
import type { TimerEngine } from './useTimerEngine'
import { useTimerEngine } from './useTimerEngine'
import { isCustomPreset } from './types'
import type { CustomTimerPreset, TimerPhase, TimerPreset } from './types'

/** MM:SS. Digits only — nothing here is locale text, so it does not go through `t()`. */
function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const PHASE_COLOR: Record<TimerPhase, string> = {
  prep: '#f59e0b',
  work: '#ef4444',
  rest: '#10b981',
  setRest: '#6366f1',
  finished: '#3b82f6',
}

const PHASE_GLOW: Record<TimerPhase, string> = {
  prep: 'timer-glow-prep',
  work: 'timer-glow-work',
  rest: 'timer-glow-rest',
  setRest: 'timer-glow-rest',
  finished: '',
}

const PHASE_TITLE_KEY: Record<TimerPhase, string> = {
  prep: 'timer.phase.prep',
  work: 'timer.phase.work',
  rest: 'timer.phase.rest',
  setRest: 'timer.phase.setRest',
  finished: 'timer.phase.finished',
}

/** The circle's radius in the prototype's own 240x240 viewBox. */
const RING_RADIUS = 100
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const QUICK_SUGGESTION_KEYS = [
  'timer.modal.suggestion.randoriSquad',
  'timer.modal.suggestion.warmupStretch',
  'timer.modal.suggestion.groundwork',
  'timer.modal.suggestion.uchikomiEntries',
  'timer.modal.suggestion.fitnessEndurance',
] as const

function presetName(locale: Locale, preset: TimerPreset): string {
  return isCustomPreset(preset) ? preset.name : t(locale, preset.nameKey)
}

export function TimerScreen({ locale }: { locale: Locale }) {
  const engine = useTimerEngine()
  const [customPresets, setCustomPresets] = useState<CustomTimerPreset[]>([])
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false)
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    void loadCustomPresets().then((presets) => {
      if (alive) setCustomPresets(presets)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    },
    [],
  )

  const showToast = useCallback((message: string, durationMs: number) => {
    setFeedbackToast(message)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setFeedbackToast(null), durationMs)
  }, [])

  const presets: TimerPreset[] = [...BUILT_IN_TIMER_PRESETS, ...customPresets]

  function handleApplyPreset(preset: TimerPreset): void {
    engine.applyPreset(preset)
    showToast(
      interpolate(t(locale, 'timer.toast.presetLoaded'), { name: presetName(locale, preset) }),
      2500,
    )
  }

  async function handleDeletePreset(preset: CustomTimerPreset, event: MouseEvent): Promise<void> {
    event.stopPropagation()
    await deleteCustomPreset(preset.id)
    setCustomPresets((prev) => prev.filter((candidate) => candidate.id !== preset.id))
    if (engine.activePresetId === preset.id) {
      engine.applyPreset(BUILT_IN_TIMER_PRESETS[0]!)
    }
    showToast(t(locale, 'timer.toast.presetDeleted'), 2000)
  }

  async function handleSaveTemplate(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    const saved = await saveCustomPreset({
      name: trimmed,
      prepTime: engine.settings.prepTime,
      workTime: engine.settings.workTime,
      restTime: engine.settings.restTime,
      rounds: engine.settings.rounds,
      sets: engine.settings.sets,
      breakBetweenSets: engine.settings.breakBetweenSets,
    })
    setCustomPresets((prev) => [...prev, saved])
    engine.markActivePreset(saved.id)
    setIsSaveModalOpen(false)
    setTemplateNameInput('')
    showToast(interpolate(t(locale, 'timer.toast.presetSaved'), { name: saved.name }), 3000)
  }

  const phaseColor = PHASE_COLOR[engine.phase]
  const progressRatio = engine.secondsLeft / Math.max(1, engine.phaseTotalSeconds)
  const strokeOffset = RING_CIRCUMFERENCE - progressRatio * RING_CIRCUMFERENCE

  const nextLabel =
    engine.phase === 'prep'
      ? interpolate(t(locale, 'timer.next.work'), { time: formatTime(engine.settings.workTime) })
      : engine.phase === 'work'
        ? interpolate(t(locale, 'timer.next.rest'), { time: formatTime(engine.settings.restTime) })
        : engine.phase === 'rest' || engine.phase === 'setRest'
          ? interpolate(t(locale, 'timer.next.round'), {
              round: engine.phase === 'rest' ? engine.round + 1 : 1,
              time: formatTime(engine.settings.workTime),
            })
          : null

  const isFirstStart =
    !engine.isRunning &&
    engine.phase === 'prep' &&
    engine.round === 1 &&
    engine.set === 1 &&
    engine.secondsLeft === engine.phaseTotalSeconds

  return (
    <section
      aria-label={t(locale, 'timer.title')}
      data-testid="timer-screen"
      className="w-full flex-1 flex flex-col bg-[#f3f6fb] dark:bg-[#090d16] text-slate-800 dark:text-slate-100 select-none"
    >
      <header className="w-full px-4 py-2.5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 bg-[#f3f6fb] dark:bg-[#090d16] sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <TimerIcon className="w-4 h-4 text-amber-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              {t(locale, 'timer.title')}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <span>{t(locale, 'timer.total.label')}</span>
              <span className="font-bold text-blue-400">{formatTime(engine.totalRemainingSeconds)}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => engine.setSoundEnabled(!engine.soundEnabled)}
          aria-pressed={engine.soundEnabled}
          aria-label={t(locale, 'timer.sound.toggleAria')}
          className="px-2.5 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 active:scale-95 transition-all shadow-xs"
        >
          <span
            aria-hidden="true"
            className={`w-2 h-2 rounded-full ${engine.soundEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}
          />
          {engine.soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          )}
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            {t(locale, engine.soundEnabled ? 'timer.sound.enabledLabel' : 'timer.sound.mutedLabel')}
          </span>
        </button>
      </header>

      <div className="px-4 py-3 flex flex-col gap-3">
        {feedbackToast ? (
          <div
            role="status"
            aria-live="polite"
            className="fixed top-14 start-1/2 -translate-x-1/2 z-50 bg-white/95 dark:bg-slate-900/95 border border-amber-500/80 text-slate-900 dark:text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" aria-hidden="true" />
            <span>{feedbackToast}</span>
          </div>
        ) : null}

        {/* Preset strip. */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => {
              setTemplateNameInput('')
              setIsSaveModalOpen(true)
            }}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 shrink-0 active:scale-95 transition-all flex items-center gap-1 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400 stroke-[3]" aria-hidden="true" />
            <span>{t(locale, 'timer.presets.save')}</span>
          </button>

          {presets.map((preset) => {
            const isActive = engine.activePresetId === preset.id
            const custom = isCustomPreset(preset)
            const name = presetName(locale, preset)
            return (
              <div
                key={preset.id}
                className={`relative shrink-0 flex items-center rounded-full text-xs font-medium border transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-400/60 shadow-md shadow-blue-600/25 font-bold'
                    : custom
                      ? 'bg-amber-50 dark:bg-slate-800/90 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-500/30 hover:border-amber-400/50'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-750'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  aria-pressed={isActive}
                  className={`py-1.5 flex items-center gap-1.5 active:scale-95 transition-transform ${
                    custom ? 'ps-3 pe-2' : 'px-3'
                  }`}
                >
                  {custom ? (
                    <Bookmark
                      aria-hidden="true"
                      className={`w-3 h-3 ${isActive ? 'text-amber-300 fill-amber-300' : 'text-amber-400'}`}
                    />
                  ) : null}
                  <span>{name}</span>
                </button>

                {isCustomPreset(preset) ? (
                  <button
                    type="button"
                    onClick={(event) => void handleDeletePreset(preset, event)}
                    aria-label={interpolate(t(locale, 'timer.presets.deleteAria'), { name })}
                    className="ps-1 pe-2 text-slate-500 dark:text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Live timer hero card. */}
        <section
          className={`relative rounded-3xl p-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex flex-col items-center justify-center transition-all duration-300 shadow-xl ${PHASE_GLOW[engine.phase]}`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span
              className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border flex items-center gap-1.5 shadow-xs"
              style={{
                backgroundColor: `${phaseColor}20`,
                borderColor: `${phaseColor}50`,
                color: phaseColor,
              }}
            >
              <span aria-hidden="true" className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: phaseColor }} />
              <span>{t(locale, PHASE_TITLE_KEY[engine.phase])}</span>
            </span>

            <div className="text-end font-mono">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block leading-tight">
                {t(locale, 'timer.total.remainingLabel')}
              </span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{formatTime(engine.totalRemainingSeconds)}</span>
            </div>
          </div>

          {/* 3-2-1 countdown pips. */}
          <div className="flex items-center justify-center gap-3 w-full my-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 shadow-inner">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold me-1 tracking-wider uppercase flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" aria-hidden="true" />
                <span>{t(locale, 'timer.pips.label')}</span>
              </span>

              {[3, 2, 1].map((pip) => (
                <div
                  key={pip}
                  aria-hidden="true"
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    engine.isRunning && engine.secondsLeft === pip
                      ? pip === 1
                        ? 'border border-rose-400 bg-rose-500 text-white font-black scale-110 pip-active shadow-md shadow-rose-500/50'
                        : 'border border-amber-400 bg-amber-500 text-slate-950 font-black scale-110 pip-active shadow-md shadow-amber-500/50'
                      : engine.isRunning && engine.secondsLeft < pip && engine.secondsLeft >= 1
                        ? 'border border-amber-400/60 bg-amber-600/40 text-amber-300'
                        : 'border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {pip}
                </div>
              ))}

              <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 ms-1">
                {t(locale, engine.soundEnabled ? 'timer.pips.audioOn' : 'timer.pips.audioOff')}
              </span>
            </div>
          </div>

          {/* Circular progress ring + digital readout. */}
          <div className="relative w-56 h-56 flex items-center justify-center my-1">
            <svg className="w-full h-full timer-ring" viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r={RING_RADIUS} fill="transparent" stroke="#1f293d" strokeWidth="12" />
              <circle
                cx="120"
                cy="120"
                r={RING_RADIUS}
                fill="transparent"
                stroke={phaseColor}
                strokeWidth="12"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={strokeOffset}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <div
                data-testid="timer-clock"
                className="text-6xl font-black font-mono tracking-tight text-slate-900 dark:text-white select-none drop-shadow-md"
              >
                {formatTime(engine.secondsLeft)}
              </div>
              {nextLabel ? (
                <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>{nextLabel}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Round / set counters. */}
          <div className="grid grid-cols-2 gap-2.5 w-full mt-1 pt-3 border-t border-slate-200 dark:border-slate-800/80">
            <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-2xl p-2 text-center border border-slate-200 dark:border-slate-700/50">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">{t(locale, 'timer.roundLabel')}</span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5 font-mono">
                <span data-testid="timer-round" className="text-2xl font-black text-slate-900 dark:text-white">
                  {engine.round}
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-bold">/</span>
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{engine.settings.rounds}</span>
              </div>
            </div>

            <div className="bg-slate-100/60 dark:bg-slate-800/60 rounded-2xl p-2 text-center border border-slate-200 dark:border-slate-700/50">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">{t(locale, 'timer.setLabel')}</span>
              <div className="flex items-baseline justify-center gap-1 mt-0.5 font-mono">
                <span data-testid="timer-set" className="text-2xl font-black text-amber-400">
                  {engine.set}
                </span>
                <span className="text-slate-500 dark:text-slate-400 font-bold">/</span>
                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{engine.settings.sets}</span>
              </div>
            </div>
          </div>

          {/* Transport. */}
          <div className="flex items-center gap-2.5 w-full mt-3.5">
            <button
              type="button"
              onClick={engine.reset}
              aria-label={t(locale, 'timer.actions.reset')}
              className="w-13 h-13 min-w-[50px] p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all border border-slate-200 dark:border-slate-700 shadow-md"
            >
              <RotateCcw className="w-6 h-6" aria-hidden="true" />
            </button>

            <button
              type="button"
              data-testid="timer-play"
              onClick={engine.togglePlay}
              className={`flex-1 h-13 py-3 rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] ${
                engine.isRunning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/35'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/35'
              }`}
            >
              {engine.isRunning ? (
                <>
                  <Pause className="w-6 h-6 fill-current" aria-hidden="true" />
                  <span>{t(locale, 'timer.actions.pause')}</span>
                </>
              ) : (
                <>
                  <Play className="w-6 h-6 fill-current" aria-hidden="true" />
                  <span>{t(locale, isFirstStart ? 'timer.actions.start' : 'timer.actions.resume')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={engine.skip}
              aria-label={t(locale, 'timer.actions.skip')}
              className="w-13 h-13 min-w-[50px] p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all border border-slate-200 dark:border-slate-700 shadow-md"
            >
              <SkipForward className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </section>

        {/* Fast touch adjusters. */}
        <section className="bg-white dark:bg-[#111827] rounded-3xl p-3.5 border border-slate-200 dark:border-slate-800 flex flex-col gap-2.5 shadow-lg">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-800/80">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-blue-400" aria-hidden="true" />
              <span>{t(locale, 'timer.adjust.heading')}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setTemplateNameInput('')
                setIsSaveModalOpen(true)
              }}
              className="text-[11px] font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 flex items-center gap-1 active:scale-95 transition-all"
            >
              <Bookmark className="w-3 h-3 text-amber-400" aria-hidden="true" />
              <span>{t(locale, 'timer.presets.save')}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <AdjustTile
              testId="adjust-work"
              accent="rose"
              label={t(locale, 'timer.adjust.workLabel')}
              unit={t(locale, 'timer.adjust.secondsUnit')}
              value={`${engine.settings.workTime}s`}
              onDecrease={() => engine.adjustSetting('work', -5)}
              onIncrease={() => engine.adjustSetting('work', 5)}
              decreaseAria={interpolate(t(locale, 'timer.adjust.decreaseAria'), { label: t(locale, 'timer.adjust.workLabel') })}
              increaseAria={interpolate(t(locale, 'timer.adjust.increaseAria'), { label: t(locale, 'timer.adjust.workLabel') })}
            />
            <AdjustTile
              testId="adjust-rest"
              accent="emerald"
              label={t(locale, 'timer.adjust.restLabel')}
              unit={t(locale, 'timer.adjust.secondsUnit')}
              value={`${engine.settings.restTime}s`}
              onDecrease={() => engine.adjustSetting('rest', -5)}
              onIncrease={() => engine.adjustSetting('rest', 5)}
              decreaseAria={interpolate(t(locale, 'timer.adjust.decreaseAria'), { label: t(locale, 'timer.adjust.restLabel') })}
              increaseAria={interpolate(t(locale, 'timer.adjust.increaseAria'), { label: t(locale, 'timer.adjust.restLabel') })}
            />
            <AdjustTile
              testId="adjust-rounds"
              accent="blue"
              icon={Repeat}
              label={t(locale, 'timer.adjust.roundsLabel')}
              unit={t(locale, 'timer.adjust.roundsUnit')}
              value={String(engine.settings.rounds)}
              onDecrease={() => engine.adjustSetting('rounds', -1)}
              onIncrease={() => engine.adjustSetting('rounds', 1)}
              decreaseAria={interpolate(t(locale, 'timer.adjust.decreaseAria'), { label: t(locale, 'timer.adjust.roundsLabel') })}
              increaseAria={interpolate(t(locale, 'timer.adjust.increaseAria'), { label: t(locale, 'timer.adjust.roundsLabel') })}
            />
            <AdjustTile
              testId="adjust-sets"
              accent="amber"
              icon={Layers}
              label={t(locale, 'timer.adjust.setsLabel')}
              unit={t(locale, 'timer.adjust.setsUnit')}
              value={String(engine.settings.sets)}
              onDecrease={() => engine.adjustSetting('sets', -1)}
              onIncrease={() => engine.adjustSetting('sets', 1)}
              decreaseAria={interpolate(t(locale, 'timer.adjust.decreaseAria'), { label: t(locale, 'timer.adjust.setsLabel') })}
              increaseAria={interpolate(t(locale, 'timer.adjust.increaseAria'), { label: t(locale, 'timer.adjust.setsLabel') })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <SmallAdjustTile
              testId="adjust-prep"
              label={t(locale, 'timer.adjust.prepLabel')}
              hint={t(locale, 'timer.adjust.prepHint')}
              value={`${engine.settings.prepTime}s`}
              onDecrease={() => engine.adjustSetting('prep', -1)}
              onIncrease={() => engine.adjustSetting('prep', 1)}
              decreaseAria={interpolate(t(locale, 'timer.adjust.decreaseAria'), { label: t(locale, 'timer.adjust.prepLabel') })}
              increaseAria={interpolate(t(locale, 'timer.adjust.increaseAria'), { label: t(locale, 'timer.adjust.prepLabel') })}
            />
            <SmallAdjustTile
              testId="adjust-setRest"
              label={t(locale, 'timer.adjust.setRestLabel')}
              hint={t(locale, 'timer.adjust.setRestHint')}
              value={`${engine.settings.breakBetweenSets}s`}
              onDecrease={() => engine.adjustSetting('setRest', -5)}
              onIncrease={() => engine.adjustSetting('setRest', 5)}
              decreaseAria={interpolate(t(locale, 'timer.adjust.decreaseAria'), { label: t(locale, 'timer.adjust.setRestLabel') })}
              increaseAria={interpolate(t(locale, 'timer.adjust.increaseAria'), { label: t(locale, 'timer.adjust.setRestLabel') })}
            />
          </div>
        </section>

        <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 p-3 flex items-start gap-2 text-xs text-blue-900 dark:text-blue-200">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="leading-relaxed">
            <span className="text-slate-900 dark:text-white font-bold block mb-0.5">{t(locale, 'timer.tip.heading')}</span>
            {t(locale, 'timer.tip.body')}
          </div>
        </div>
      </div>

      {isSaveModalOpen ? (
        <SaveTemplateModal
          locale={locale}
          settings={engine.settings}
          totalRemainingSeconds={engine.totalRemainingSeconds}
          nameInput={templateNameInput}
          onChangeName={setTemplateNameInput}
          onClose={() => setIsSaveModalOpen(false)}
          onConfirm={() => void handleSaveTemplate(templateNameInput)}
        />
      ) : null}
    </section>
  )
}

const ACCENT: Record<'rose' | 'emerald' | 'blue' | 'amber', string> = {
  rose: 'border-rose-500/25',
  emerald: 'border-emerald-500/25',
  blue: 'border-blue-500/25',
  amber: 'border-amber-500/25',
}

const ACCENT_TEXT: Record<'rose' | 'emerald' | 'blue' | 'amber', string> = {
  rose: 'text-rose-400',
  emerald: 'text-emerald-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
}

const ACCENT_DOT: Record<'rose' | 'emerald' | 'blue' | 'amber', string> = {
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  blue: '',
  amber: '',
}

function AdjustTile({
  testId,
  accent,
  icon: Icon,
  label,
  unit,
  value,
  onDecrease,
  onIncrease,
  decreaseAria,
  increaseAria,
}: {
  testId: string
  accent: 'rose' | 'emerald' | 'blue' | 'amber'
  icon?: LucideIcon
  label: string
  unit: string
  value: string
  onDecrease: () => void
  onIncrease: () => void
  decreaseAria: string
  increaseAria: string
}) {
  return (
    <div className={`bg-slate-50 dark:bg-[#182232] p-2.5 rounded-2xl border flex flex-col justify-between ${ACCENT[accent]}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-bold flex items-center gap-1 ${ACCENT_TEXT[accent]}`}>
          {Icon ? (
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${ACCENT_DOT[accent]}`} />
          )}
          <span>{label}</span>
        </span>
        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{unit}</span>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <button
          type="button"
          onClick={onDecrease}
          aria-label={decreaseAria}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg border border-slate-200 dark:border-slate-700/60 active:scale-90"
        >
          -
        </button>
        <span data-testid={`${testId}-value`} className="text-lg font-black font-mono text-slate-900 dark:text-white">
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          aria-label={increaseAria}
          className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-lg border border-slate-200 dark:border-slate-700/60 active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  )
}

function SmallAdjustTile({
  testId,
  label,
  hint,
  value,
  onDecrease,
  onIncrease,
  decreaseAria,
  increaseAria,
}: {
  testId: string
  label: string
  hint: string
  value: string
  onDecrease: () => void
  onIncrease: () => void
  decreaseAria: string
  increaseAria: string
}) {
  return (
    <div className="bg-slate-800/40 p-2 rounded-xl flex items-center justify-between border border-slate-200 dark:border-slate-700/50">
      <div>
        <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 block">{label}</span>
        <span className="text-[9px] text-slate-500 dark:text-slate-400">{hint}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDecrease}
          aria-label={decreaseAria}
          className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-90"
        >
          -
        </button>
        <span data-testid={`${testId}-value`} className="text-xs font-black font-mono w-7 text-center">
          {value}
        </span>
        <button
          type="button"
          onClick={onIncrease}
          aria-label={increaseAria}
          className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold active:scale-90"
        >
          +
        </button>
      </div>
    </div>
  )
}

function SaveTemplateModal({
  locale,
  settings,
  totalRemainingSeconds,
  nameInput,
  onChangeName,
  onClose,
  onConfirm,
}: {
  locale: Locale
  settings: TimerEngine['settings']
  totalRemainingSeconds: number
  nameInput: string
  onChangeName: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'timer.modal.heading')}
        className="bg-white dark:bg-[#131b2b] border border-slate-200 dark:border-slate-700 rounded-3xl p-5 w-full max-w-sm text-slate-800 dark:text-slate-100 shadow-2xl relative space-y-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <BookmarkCheck className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{t(locale, 'timer.modal.heading')}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t(locale, 'timer.modal.subheading')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'timer.modal.close')}
            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="bg-white/90 dark:bg-slate-900/90 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 space-y-2">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
            {t(locale, 'timer.modal.summaryHeading')}
          </span>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-xl border border-rose-500/20">
              <span className="text-[9px] text-rose-300 block">{t(locale, 'timer.modal.workShort')}</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatTime(settings.workTime)}</span>
            </div>
            <div className="bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-xl border border-emerald-500/20">
              <span className="text-[9px] text-emerald-300 block">{t(locale, 'timer.modal.restShort')}</span>
              <span className="font-bold text-slate-900 dark:text-white">{formatTime(settings.restTime)}</span>
            </div>
            <div className="bg-slate-100/80 dark:bg-slate-800/80 p-1.5 rounded-xl border border-blue-500/20">
              <span className="text-[9px] text-blue-300 block">{t(locale, 'timer.modal.roundsShort')}</span>
              <span className="font-bold text-slate-900 dark:text-white">{settings.rounds}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800/80">
            <span>
              {t(locale, 'timer.modal.setsLabel')}{' '}
              <strong className="text-slate-900 dark:text-white font-mono">{settings.sets}</strong>
            </span>
            <span>
              {t(locale, 'timer.total.label')}{' '}
              <strong className="text-blue-400 font-mono">{formatTime(totalRemainingSeconds)}</strong>
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="timer-preset-name" className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
            {t(locale, 'timer.modal.nameLabel')}
          </label>
          <input
            id="timer-preset-name"
            type="text"
            value={nameInput}
            onChange={(event) => onChangeName(event.target.value)}
            placeholder={t(locale, 'timer.modal.namePlaceholder')}
            autoFocus
            className="w-full h-11 px-3.5 bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && nameInput.trim()) onConfirm()
            }}
          />
        </div>

        <div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mb-1.5">
            {t(locale, 'timer.modal.suggestionsLabel')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SUGGESTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => onChangeName(t(locale, key))}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all"
              >
                {t(locale, key)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs active:scale-95 transition-all"
          >
            {t(locale, 'timer.modal.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!nameInput.trim()}
            className="h-10 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
            <span>{t(locale, 'timer.modal.confirm')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
