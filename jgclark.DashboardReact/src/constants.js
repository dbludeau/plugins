// @flow
//-----------------------------------------------------------------------------
// Constants for Dashboard code
// Last updated 20.5.2024 for v2.0.0 by @jgclark
//-----------------------------------------------------------------------------

import type { TSectionDetails, TSectionCode } from "./types"

//TODO: @jgclark, the things in this file that are not sections should be moved out of the "types" file

export const allSectionDetails: Array<TSectionDetails> = [
  { sectionCode: 'DT', sectionName: 'Today', showSettingName: '' }, // always show Today section
  { sectionCode: 'DY', sectionName: 'Yesterday', showSettingName: 'showYesterdaySection' },
  { sectionCode: 'DO', sectionName: 'Tomorrow', showSettingName: 'showTomorrowSection' },
  { sectionCode: 'W', sectionName: 'Week', showSettingName: 'showWeekSection' },
  { sectionCode: 'M', sectionName: 'Month', showSettingName: 'showMonthSection' },
  { sectionCode: 'Q', sectionName: 'Quarter', showSettingName: 'showQuarterSection' },
  // TAG types are treated specially (one for each tag a user wants to see). 
  // Use getTagSectionDetails() to get them
  { sectionCode: 'TAG', sectionName: '', showSettingName: `showTagSection` }, // sectionName set later to reflect the tagToShow setting
  { sectionCode: 'PROJ', sectionName: 'Projects', showSettingName: 'showProjectSection' },
  // overdue last becasue it takes the longest to load
  { sectionCode: 'OVERDUE', sectionName: 'Overdue', showSettingName: 'showOverdueSection' },
  // { sectionCode: 'COUNT', sectionName: 'count', showSettingName: '' },
]

export const sectionDisplayOrder = ['DT', 'DY', 'DO', 'W', 'M', 'Q', 'OVERDUE', 'TAG', 'PROJ']

export const allSectionCodes: Array<TSectionCode> = allSectionDetails.map(s => s.sectionCode)

export const allCalendarSectionCodes = ['DT', 'DY', 'DO', 'W', 'M', 'Q']

export const nonSectionSwitches = [
  { label: 'Filter out lower-priority items?', key: 'filterPriorityItems', default: false },
  { label: 'Hide checklist items?', key: 'ignoreChecklistItems', default: false, refreshAllOnChange: true },
  { label: 'Hide duplicates?', key: 'hideDuplicates', default: false },
]

