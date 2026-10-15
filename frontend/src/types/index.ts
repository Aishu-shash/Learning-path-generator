export interface Learner {
  name: string
  goal: string
  level: string
  target_date: string
  knowledge: string
  hours_per_day: number
  learning_style: string
}
export interface Task { title: string; description: string; duration_minutes: number; completed?: boolean }
export interface Topic { title: string; description: string }
export interface Phase { title: string; duration: string; objective: string; topics: Topic[]; tasks: Task[]; resources: Resource[] }
export interface Resource { title: string; type: string; url: string; why: string }
export interface Roadmap { title: string; summary: string; target_date: string; phases: Phase[]; weekly_schedule: { week: string; focus: string; study_hours: number; activities: string[] }[]; daily_schedule: { activity: string; duration_minutes: number; description: string }[]; resources: Resource[] }
export interface Workspace { learner: Learner; roadmap: Roadmap; tasks: Task[]; completedIds: string[] }
