// §4.4 — checkpoint 8, the tasks tab. One door: `App.tsx` mounts `TasksScreen` at
// `#/tasks` and reads `useOpenTasks` a second time for the tab bar's own badge (see that
// hook's own header for why it is called twice rather than once).
export { TasksScreen } from './TasksScreen'
export { useOpenTasks } from './useOpenTasks'
export {
  callParentTasks,
  cashPendingTasks,
  closeSessionTasks,
  healthReviewTasks,
  initialsOf,
  missingHealthFormTasks,
  openTaskCount,
} from './deriveTasks'
export type { TaskBucket, TaskCard, TaskKind, TaskPrimaryAction, TaskTick } from './deriveTasks'
export { makeTasksClient, HEALTH_REVIEW_PENDING_KIND, HEALTH_TRIAL_FLAGGED_KIND } from './tasksClient'
export type { TasksClient } from './tasksClient'
// The birthday section (2026-09-06) — deliberately its own exports, not folded into the
// task ones above: see `deriveBirthdays.ts`'s header for why a birthday is not a task.
export { upcomingBirthdays } from './deriveBirthdays'
export type { BirthdayRow } from './deriveBirthdays'
export { useBirthdays } from './useBirthdays'
