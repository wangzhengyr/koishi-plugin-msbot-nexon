import type {
  CharacterBasicDto,
  CharacterItemEquipmentAddOptionDto,
  CharacterItemEquipmentBaseOptionDto,
  CharacterItemEquipmentInfoDto,
  CharacterItemEquipmentStarforceOptionDto,
  UnionDto,
} from "maplestory-openapi"
import type { OverallRankingResponseDto } from "maplestory-openapi/kms"

type CharacterBasicWithRegion = CharacterBasicDto & {
  liberationQuestClear?: string | null
  liberationQuestClearFlag?: "true" | "false"
}

export type CharacterSummary = CharacterBasicWithRegion & {
  name: CharacterBasicWithRegion["characterName"]
  world: CharacterBasicWithRegion["worldName"]
  job: CharacterBasicWithRegion["characterClass"]
  jobDetail?: CharacterBasicWithRegion["characterClassLevel"] | null
  level: CharacterBasicWithRegion["characterLevel"]
  exp: CharacterBasicWithRegion["characterExp"]
  expRate?: CharacterBasicWithRegion["characterExpRate"] | null
  guild?: CharacterBasicWithRegion["characterGuildName"]
  image?: CharacterBasicWithRegion["characterImage"] | null
  gender?: CharacterBasicWithRegion["characterGender"] | null
  createDate?: string | null
  accessFlag?: CharacterBasicWithRegion["accessFlag"] | null
}

type UnionLike = UnionDto

export interface UnionOverviewSummary {
  level?: UnionLike["unionLevel"]
  grade?: UnionLike["unionGrade"]
  artifactLevel?: UnionLike["unionArtifactLevel"]
  artifactPoint?: UnionLike["unionArtifactPoint"]
}

type RankingEntry = OverallRankingResponseDto["ranking"][number]

export interface RankingRecord {
  date: string
  ranking: RankingEntry["ranking"]
  characterName: RankingEntry["characterName"]
  characterLevel: RankingEntry["characterLevel"]
  expRate?: string | null
  worldName: RankingEntry["worldName"]
  className: RankingEntry["className"]
}

export interface ExperiencePoint {
  date: string
  level: number
  exp: number
  gain: number
}

type EquipmentOption =
  | CharacterItemEquipmentBaseOptionDto
  | CharacterItemEquipmentAddOptionDto
  | CharacterItemEquipmentStarforceOptionDto

export type EquipmentStatBlock = Partial<Record<keyof EquipmentOption, string>>

type EquipmentInfo = CharacterItemEquipmentInfoDto

export interface EquipmentItemSummary {
  itemName: EquipmentInfo["itemName"]
  icon: EquipmentInfo["itemIcon"] | null
  slot: EquipmentInfo["itemEquipmentSlot"]
  base: EquipmentStatBlock
  additional?: EquipmentStatBlock
  starforce?: EquipmentStatBlock
  potential?: Array<NonNullable<EquipmentInfo["potentialOption1"]>>
  additionalPotential?: Array<NonNullable<EquipmentInfo["additionalPotentialOption1"]>>
  isUniqueEquip?: boolean
  scrollCount?: EquipmentInfo["scrollUpgrade"]
}
