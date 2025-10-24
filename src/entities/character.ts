import { CharacterSummary, ExperiencePoint, UnionOverviewSummary } from '../api/types'

export interface CharacterInfo {
  summary: CharacterSummary
  union?: UnionOverviewSummary | null
  experience?: ExperiencePoint[]
}

export interface CharacterInfoResult extends CharacterInfo {
  ocid: string
}
