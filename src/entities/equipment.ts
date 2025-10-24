import { EquipmentItemSummary } from '../api/types'

export interface CharacterEquipment {
  ocid: string
  items: EquipmentItemSummary[]
  title?: {
    name: string
    icon?: string | null
    description?: string | null
  } | null
}
