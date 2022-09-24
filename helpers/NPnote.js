// @flow
//-------------------------------------------------------------------------------
// Note-level Functions that require NP API calls

import { log, logError, logDebug, timer, clo, copyObject } from './dev'
import { displayTitle } from './general'
import { showMessage } from './userInput'
import { findStartOfActivePartOfNote } from './paragraph'
import { getTodaysDateHyphenated } from '@helpers/dateTime'
import { getNPWeekData } from './NPdateTime'
import moment from 'moment'
import { WEEK_NOTE_LINK } from './dateTime'

// A read-write expansion of Paragraph
export interface ExtendedParagraph extends Paragraph {
  title?: string;
}

const pluginJson = 'NPnote.js'

/**
 * Convert the note to using frontmatter Syntax
 * If optional default text is given, this is added to the frontmatter.
 * @author @jgclark
 * @param {TNote} note
 * @param {string} defaultText (optional) to add after title in the frontmatter
 */
export async function convertNoteToFrontmatter(note: TNote, defaultText?: string = ''): Promise<void> {
  if (note == null) {
    logError('note/convertToFrontmatter', `No note found. Stopping conversion.`)
    await showMessage(`No note found to convert.`)
    return
  }
  if (note.paragraphs.length < 1) {
    logError('note/convertToFrontmatter', `'${displayTitle(note)}' is empty. Stopping conversion.`)
    await showMessage(`Cannot convert '${displayTitle(note)}' note as it is empty.`)
    return
  }

  // Get title
  const firstLine = note.paragraphs[0]
  if (firstLine.content === '---') {
    logError('note/convertToFrontmatter', `'${displayTitle(note)}' appears to already use frontmatter. Stopping conversion.`)
    await showMessage(`Cannot convert '${displayTitle(note)}' as it already appears to use frontmatter.`)
    return
  }
  const title = firstLine.content ?? '(error)' // gets heading without markdown

  // Working backwards through the frontmatter (to make index addressing easier)
  // Change the current first line to be ---
  firstLine.content = '---'
  firstLine.type = 'separator'
  note.updateParagraph(firstLine)
  if (defaultText) {
    note.insertParagraph(defaultText, 0, 'text')
  }
  note.insertParagraph(`title: ${title}`, 0, 'text')
  note.insertParagraph('---', 0, 'separator')
  logDebug('note/convertToFrontmatter', `Note '${displayTitle(note)}' converted to use frontmatter.`)
}

/**
 * Select the first non-title line in Editor
 * NotePlan will always show you the ## before a title if your cursor is on a title line, but
 * this is ugly. And so in this function we find and select the first non-title line
 * @author @dwertheimer
 * @returns
 */
export function selectFirstNonTitleLineInEditor(): void {
  if (Editor.content && Editor.note) {
    for (let i = findStartOfActivePartOfNote(Editor.note); i < Editor.paragraphs.length; i++) {
      const line = Editor.paragraphs[i]
      if (line.type !== 'title' && line?.contentRange && line.contentRange.start >= 0) {
        Editor.select(line.contentRange.start, 0)
        return
      }
    }
  }
}

/**
 * Find paragraphs in note which are open and tagged for today (either >today or hyphenated date)
 * @param {*} note
 * @param {*} config
 * @returns {Array<TParagraph>} of paragraphs which are open and tagged for today
 */
export function findTodosInNote(note: TNote): Array<TParagraph> {
  const hyphDate = getTodaysDateHyphenated()
  // const toDate = getDateObjFromDateTimeString(hyphDate)
  const isTodayItem = (text) => [`>${hyphDate}`, '>today'].filter((a) => text.indexOf(a) > -1).length > 0
  // const todos:Array<TParagraph>  = []
  if (note.paragraphs) {
    return note.paragraphs.filter((p) => p.type === 'open' && isTodayItem(p.content))
    // note.paragraphs.forEach((p) => {
    //   if (isTodayItem(p.content) && p.type === 'open') {
    //     // Disabling .title changes for now, because this was killing the plugin
    //     // const newP = copyObject(p)
    //     // newP.type = 'open' // Pretend it's a todo even if it's text or a listitem
    //     // newP.title = (p.filename ?? '').replace('.md', '').replace('.txt', '')
    //     // todos.push(newP)
    //     todos.push(p)
    //   }
    // })
  }
  // console.log(`findTodosInNote found ${todos.length} todos - adding to list`)
  return []
}

/**
 * Get linked items from the references section (.backlinks)
 * @param { note | null} pNote
 * @returns
 * Backlinks format: {"type":"note","content":"_Testing scheduled sweeping","rawContent":"_Testing scheduled sweeping","prefix":"","lineIndex":0,"heading":"","headingLevel":0,"isRecurring":0,"indents":0,"filename":"zDELETEME/Test scheduled.md","noteType":"Notes","linkedNoteTitles":[],"subItems":[{},{},{},{}]}
 * backlinks[0].subItems[0] =JSLog: {"type":"open","content":"scheduled for 10/4 using app >today","rawContent":"* scheduled for 10/4 using app
 * ","prefix":"* ","contentRange":{},"lineIndex":2,"date":"2021-11-07T07:00:00.000Z","heading":"_Testing scheduled sweeping","headingRange":{},"headingLevel":1,"isRecurring":0,"indents":0,"filename":"zDELETEME/Test scheduled.md","noteType":"Notes","linkedNoteTitles":[],"subItems":[]}
 */
export function getTodaysReferences(pNote: TNote | null = null): $ReadOnlyArray<TParagraph> {
  logDebug(pluginJson, `getTodaysReferences starting`)
  const note = pNote || Editor.note
  if (note == null) {
    logDebug(pluginJson, `timeblocking could not open Note`)
    return []
  }
  const backlinks: Array<TParagraph> = [...note.backlinks] // an array of notes which link to this note
  logDebug(pluginJson, `backlinks.length:${backlinks.length}`)
  const todayParas = []
  backlinks.forEach((link) => {
    // $FlowIgnore Flow(prop-missing) -- subItems is not in Flow defs but is real
    const subItems = link.subItems
    subItems.forEach((subItem) => {
      subItem.title = link.content.replace('.md', '').replace('.txt', '')
      todayParas.push(subItem)
    })
  })
  return todayParas
}

/**
 * Determines whether a line is overdue or not. A line with multiple dates is only overdue if all dates are overdue.
 * Finds >weekDates in a string and returns an array of the dates found if all dates are overdue (or an empty array)
 * NOTE: this function calls getNPWeekData which requires a Calendar mock to Jest test it
 * @param {string} line
 * @returns foundDates - array of dates found
 * @author @dwertheimer
 * @testsExist yes
 */
export function findOverdueWeeksInString(line: string) {
  const weekData = getNPWeekData(moment().toDate())
  const dates = line.match(new RegExp(WEEK_NOTE_LINK, 'g'))
  if (dates && weekData) {
    const overdue = dates.filter((d) => d.slice(1) < weekData.weekString)
    return overdue.length === dates.length ? overdue.sort() : [] // if all dates are overdue, return them sorted
  }
  return []
}
