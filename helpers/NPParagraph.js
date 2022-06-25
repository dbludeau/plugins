// @flow

import { hyphenatedDate } from './dateTime'
import { toLocaleDateTimeString } from './NPdateTime'
import { log, logError, logWarn } from './dev'
import { findStartOfActivePartOfNote, findEndOfActivePartOfNote, termInMarkdownPath, termInURL } from './paragraph'
import { showMessageYesNo, showMessage } from '@helpers/userInput'

/**
 * Remove all headings (type=='title') from a note matching the given text
 * @param {TNote|TEditor} note
 * @param {string} headingStr - the heading text to look for
 * @param {boolean} search rawText (headingStr above includes the #'s etc) default=false
 * @returns {void}
 */
export function removeHeadingFromNote(note: TNote | TEditor, headingStr: string, rawTextSearch: boolean = false) {
  const prevExists = note.paragraphs.filter((p) =>
    p.type === 'title' && rawTextSearch ? p.rawContent === headingStr : p.content === headingStr,
  )
  if (prevExists.length) {
    note.removeParagraphs(prevExists)
  }
}

/**
 * Given a paragraph object, delete all the content of the block containing this paragraph
 * See getParagraphBlock below for definition of what constitutes a block an definition of useExtendedBlockDefinition
 * Optionally leave the title in place
 * @author @dwertheimer
 * @param {TNote|TEditor} note
 * @param {TParagraph} para
 * @param {boolean} useExtendedBlockDefinition (default: false) // TODO(@dwertheimer): flow shows this isn't used
 * @param {boolean} keepHeading (default: true)
 */
export function deleteEntireBlock(
  note: TNote | TEditor,
  para: TParagraph,
  _useExtendedBlockDefinition: boolean = false,
  keepHeading: boolean = true,
): void {
  const paraBlock: Array<TParagraph> = getParagraphBlock(note, para.lineIndex)
  log(`NPParagraph/deleteEntireBlock`, `Removing ${paraBlock.length} items under ${para.content}`)
  keepHeading ? paraBlock.shift() : null
  if (paraBlock.length > 0) {
    note.removeParagraphs(paraBlock) //seems to not work only if it's a note, not Editor
    // note.updateParagraphs(paraBlock)
  }
}

/**
 * Given a heading (string), delete all the content of the block under this heading (optionally and the heading also)
 * See getParagraphBlock below for definition of what constitutes a block an definition of useExtendedBlockDefinition
 * (Note: if the heading occurs more than once, acts on the first one only)
 * @param {TNote|TEditor} note
 * @param {string} heading
 * @param {boolean} useExtendedBlockDefinition (default: false)
 * @param {boolean} keepHeading - keep the heading after deleting contents (default: true)
 */
export function removeContentUnderHeading(
  note: TNote | TEditor,
  heading: string,
  useExtendedBlockDefinition: boolean = false,
  keepHeading: boolean = true,
) {
  // log(`NPParagraph/removeContentUnderHeading`, `In '${note.title ?? ''}' remove items under title: "${heading}"`)
  const para = note.paragraphs.find((p) => p.type === 'title' && p.content.includes(heading))
  if (para && para.lineIndex != null) {
    deleteEntireBlock(note, para, useExtendedBlockDefinition, keepHeading)
  } else {
    log(`NPParagraph/removeContentUnderHeading`, `did not find heading: "${heading}"`)
  }
}

/**
 * Insert text content under a given title (string)
 * @param {TNote|TEditor} destNote
 * @param {string} headingToFind - without the #
 * @param {string} parasAsText - text to insert (multiple lines, separated by newlines)
 * @param {number} headingLevel of the heading to insert where necessary (1-5, default 2)
 */
export async function insertContentUnderHeading(
  destNote: TNote | TEditor,
  headingToFind: string,
  parasAsText: string,
  headingLevel: number = 2,
) {
  log(
    `NPParagraph/insertContentUnderHeading`,
    `Called for '${headingToFind}' with ${parasAsText.split('\n').length} paras)`,
  )
  const headingMarker = '#'.repeat(headingLevel)
  const startOfNote = findStartOfActivePartOfNote(destNote)
  let insertionIndex = startOfNote // top of note by default
  log(`NPParagraph/insertContentUnderHeading`, `insertionIndex = ${insertionIndex}`)
  for (let i = 0; i < destNote.paragraphs.length; i++) {
    const p = destNote.paragraphs[i]
    if (p.content.trim().includes(headingToFind) && p.type === 'title') {
      insertionIndex = i + 1
      break
    }
  }
  log(`NPParagraph/insertContentUnderHeading`, `insertionIndex = ${insertionIndex}`)
  // If we didn't find the heading, insert at the top of the note
  const paraText =
    insertionIndex === startOfNote && headingToFind !== ''
      ? `${headingMarker} ${headingToFind}\n${parasAsText}\n`
      : parasAsText
  await destNote.insertParagraph(paraText, insertionIndex, 'text')
}

/**
 * Replace content under a given heading (string)
 * See getParagraphBlock below for definition of what constitutes a block an definition of useExtendedBlockDefinition
 * @param {TNote|TEditor} note
 * @param {string} heading
 * @param {string} newContentText - text to insert (multiple lines, separated by newlines)
 * @param {boolean} useExtendedBlockDefinition
 * @param {number} headingLevel of the heading to insert where necessary (1-5, default 2)
 */
export async function replaceContentUnderHeading(
  note: TNote | TEditor,
  heading: string,
  newContentText: string,
  useExtendedBlockDefinition: boolean = false,
  headingLevel: number = 2,
) {
  log(
    `NPParagraph / replaceContentUnderHeading`,
    `In '${note.title ?? 'Untitled Note'}' replace items under heading: "${heading}"`,
  )
  removeContentUnderHeading(note, heading, useExtendedBlockDefinition)
  await insertContentUnderHeading(note, heading, newContentText, headingLevel)
}

/**
 * Get the set of paragraphs that make up this block based on the current paragraph.
 * This is how we identify the block:
 * - current line, plus any children (indented paragraphs) that directly follow it
 * - if this line is a heading, then the current line and its following section
 *   (up until the next empty line, same-level heading or horizontal line).
 *
 * If setting 'useExtendedBlockDefinition' is true, then it can include more lines:
 * - it will work as if the cursor is on the preceding heading line,
 *   and take all its lines up until the next empty line, same-level heading,
 *   or horizontal line
 * NB: setting 'useExtendedBlockDefinition' defaults off (false)
 * @author @jgclark
 *
 * @param {[TParagraph]} allParas - all selectedParas in the note
 * @param {number} selectedParaIndex - the index of the current Paragraph
 * @param {boolean} useExtendedBlockDefinition
 * @return {[TParagraph]} the set of selectedParagraphs in the block
 */
export function getParagraphBlock(
  note: TNote,
  selectedParaIndex: number,
  useExtendedBlockDefinition: boolean = false,
): Array<TParagraph> {
  const parasInBlock: Array<TParagraph> = [] // to hold set of paragraphs in block to return
  const endOfActiveSection = findEndOfActivePartOfNote(note)
  const startOfActiveSection = findStartOfActivePartOfNote(note)
  const allParas = note.paragraphs
  let startLine = selectedParaIndex
  let selectedPara = allParas[startLine]
  // log(
  //   `NPParagraph / getParagraphBlock`,
  //   `  getParaBlock: starting line ${selectedParaIndex}: '${selectedPara.content}'`,
  // )

  if (useExtendedBlockDefinition) {
    // First look earlier to find earlier lines up to a blank line or horizontal rule;
    // include line unless we hit a new heading, an empty line, or a less-indented line.
    for (let i = selectedParaIndex - 1; i >= startOfActiveSection - 1; i--) {
      const p = allParas[i]
      // log(`NPParagraph / getParagraphBlock`, `  ${ i } / ${p.type} / ${ p.content }`)
      if (p.type === 'separator') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found separator line`)
        startLine = i + 1
        break
      } else if (p.content === '') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found blank line`)
        startLine = i + 1
        break
      } else if (p.type === 'title') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found heading`)
        startLine = i
        break
      }
    }
    log(`NPParagraph / getParagraphBlock`, `For extended block worked back and will now start at line ${startLine}`)
  }
  selectedPara = allParas[startLine]

  // if the first line is a heading, find the rest of its section
  if (selectedPara.type === 'title') {
    // includes all heading levels
    const thisHeadingLevel = selectedPara.headingLevel
    // log(`NPParagraph / getParagraphBlock`, `    Found heading level ${thisHeadingLevel}`)
    parasInBlock.push(selectedPara) // make this the first line to move
    // Work out how far this section extends. (NB: headingRange doesn't help us here.)
    for (let i = startLine + 1; i < endOfActiveSection; i++) {
      const p = allParas[i]
      if (p.type === 'title' && p.headingLevel <= thisHeadingLevel) {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: ${i}: Found new heading of same or higher level`)
        break
      } else if (p.type === 'separator') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found HR`)
        break
      } else if (p.content === '') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found blank line`)
        break
      }
      parasInBlock.push(p)
    }
    // log(`NPParagraph / getParagraphBlock`, `  Found ${ parasInBlock.length } heading section lines`)
  } else {
    // This isn't a heading
    const startingIndentLevel = selectedPara.indents
    log(`NPParagraph / getParagraphBlock`, `  Found single line with indent level ${startingIndentLevel}`)
    parasInBlock.push(selectedPara)

    // See if there are following indented lines to move as well
    for (let i = startLine + 1; i < endOfActiveSection; i++) {
      const p = allParas[i]
      // log(`NPParagraph / getParagraphBlock`, `  ${i} / indent ${p.indents} / ${p.content}`)
      // stop if horizontal line
      if (p.type === 'separator') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found HR`)
        break
      } else if (p.type === 'title') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found heading`)
        break
      } else if (p.content === '') {
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Found blank line`)
        break
      } else if (p.indents <= startingIndentLevel && !useExtendedBlockDefinition) {
        // if we aren't using the Extended Block Definition, then
        // stop as this selectedPara is same or less indented than the starting line
        // log(`NPParagraph / getParagraphBlock`, `      ${i}: Stopping as found same or lower indent`)
        break
      }
      parasInBlock.push(p) // add onto end of array
    }
  }

  log(
    `NPParagraph / getParagraphBlock`,
    `  Found ${parasInBlock.length} paras in block starting with: "${allParas[selectedParaIndex].content}"`,
  )
  // for (const pib of parasInBlock) {
  //   log(`NPParagraph / getParagraphBlock`, `    ${ pib.content }`)
  // }
  return parasInBlock
}

/**
 * Return list of lines matching the specified string in the specified project or daily notes.
 * NB: If starting now, I would try to use a different return type, probably tuples not 2 distinct arrays.
 * @author @jgclark
 *
 * @param {array} notes - array of Notes to look over
 * @param {string} stringToLookFor - string to look for
 * @param {boolean} highlightOccurrences - whether to enclose found string in ==highlight marks==
 * @param {string} dateStyle - where the context for an occurrence is a date, does it get appended as a 'date' using your locale, or as a NP date 'link' (`> date`) or 'none'
 * @param {boolean} matchCase - whether to search case insensitively (default: false)
 * @return [Array, Array] - array of lines with matching term, and array of contexts for those lines (dates for daily notes; title for project notes).
 */
export function gatherMatchingLines(
  notes: Array<TNote>,
  stringToLookFor: string,
  highlightOccurrences: boolean = true,
  dateStyle: string = 'link',
  matchCase: boolean = false,
): [Array<string>, Array<string>] {
  log('NPParagraph/gatherMatchingLines', `Looking for '${stringToLookFor}' in ${notes.length} notes`)
  // Don't know why this loading indicator stopped working
  // CommandBar.showLoading(true, `Searching in ${notes.length} notes ...`)
  // await CommandBar.onAsyncThread()

  const matches: Array<string> = []
  const noteContexts: Array<string> = []
  let i = 0
  for (const n of notes) {
    i += 1
    const noteContext =
      n.date == null
        ? `[[${n.title ?? ''}]]`
        : dateStyle.startsWith('link') // to deal with earlier typo where default was set to 'links'
        ? // $FlowIgnore(incompatible-call)
          ` > ${hyphenatedDate(n.date)} `
        : dateStyle === 'date'
        ? // $FlowIgnore(incompatible-call)
          ` (${toLocaleDateTimeString(n.date)})`
        : dateStyle === 'at'
        ? // $FlowIgnore(incompatible-call)
          ` @${hyphenatedDate(n.date)} `
        : ''

    // set up regex for searching, now with word boundaries on either side
    // find any matches
    const stringToLookForWithDelimiters = `\\b${stringToLookFor}\\b`
    const re = matchCase ? new RegExp(stringToLookForWithDelimiters) : new RegExp(stringToLookForWithDelimiters, 'i')
    const matchingParas = n.paragraphs.filter((q) => re.test(q.content))
    for (const p of matchingParas) {
      let matchLine = p.content
      // If the test is within a URL or the path of a [!][link](path) skip this result
      if (termInURL(stringToLookFor, matchLine)) {
        log(
          'NPParagraph/gatherMatchingLines',
          `- Info: Match '${stringToLookFor}' ignored in '${matchLine} because it's in a URL`,
        )
        continue
      }
      if (termInMarkdownPath(stringToLookFor, matchLine)) {
        log(
          'NPParagraph/gatherMatchingLines',
          `- Info: Match '${stringToLookFor}' ignored in '${matchLine} because it's in a [...](path)`,
        )
        continue
      }
      // If the stringToLookFor is in the form of an 'attribute::' and found at the start of a line,
      // then remove it from the output line
      if (stringToLookFor.endsWith('::') && matchLine.startsWith(stringToLookFor)) {
        matchLine = matchLine.replace(stringToLookFor, '') // NB: only removes first instance
      }
      // Highlight matches if requested ... but we need to be smart about this:
      // don't do so if we're in the middle of a URL or the path of a [!][link](path)
      if (
        highlightOccurrences &&
        !termInURL(stringToLookFor, matchLine) &&
        !termInMarkdownPath(stringToLookFor, matchLine)
      ) {
        matchLine = matchLine.replace(stringToLookFor, `==${stringToLookFor}== `)
      }
      matches.push(matchLine.trim())
      // log('NPParagraph/gatherMatchingLines', `${n.title ?? ''}: ${matchLine}`)
      noteContexts.push(noteContext)
    }
    if (i % 100 === 0) {
      // Don't know why this loading indicator stopped working
      // CommandBar.showLoading(true, `Searching in ${notes.length} notes ...`, i / notes.length)
    }
  }
  // Don't know why this loading indicator stopped working
  // await CommandBar.onMainThread()
  // CommandBar.showLoading(false)
  return [matches, noteContexts]
}

/**
 * Get the paragraph index of the current selection, or 0 if no selection is active.
 * @author @jgclark
 * @returns {number}
 */
export function getSelectedParaIndex(): number {
  const { paragraphs, selection } = Editor
  // Get current selection, and its range
  if (selection == null) {
    logWarn('NPParagraph/getSelectedParaIndex', `No selection found, so returning 0.`)
    return 0
  }
  const range = Editor.paragraphRangeAtCharacterIndex(selection.start)
  // log('NPParagraph/getSelectedParaIndex', `  Cursor/Selection.start: ${rangeToString(range)}`)

  // Work out what selectedPara number(index) this selected selectedPara is
  let firstSelParaIndex = 0
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    if (p.contentRange?.start === range.start) {
      firstSelParaIndex = i
      break
    }
  }
  // log('NPParagraph/getSelectedParaIndex', `  firstSelParaIndex = ${firstSelParaIndex}`)
  return firstSelParaIndex
}

/**
 * Remove all previously written blocks under a given heading in all notes (e.g. for deleting previous "TimeBlocks" or "SyncedCopoes")
 * This is DANGEROUS. Could delete a lot of content. You have been warned!
 * @param {Array<string>} noteTypes - the types of notes to look in -- e.g. ['calendar','notes']
 * @param {string} heading - the heading too look for in the notes
 * @param {boolean} keepHeading - whether to leave the heading in place afer all the content underneath is
 * @param {boolean} runSilently - whether to show CommandBar popups confirming how many notes will be affected - you should set it to 'yes' when running from a template
 */
export async function removeContentUnderHeadingInAllNotes(
  noteTypes: Array<string>,
  heading: string,
  keepHeading: boolean = false,
  runSilently: string = 'no',
): Promise<void> {
  try {
    log(`NPParagraph`, `removeContentUnderHeadingInAllNotes running`)
    // For speed, let's first multi-core search the notes to find the notes that contain this string
    const prevCopies = await DataStore.search(heading, noteTypes)
    if (prevCopies.length) {
      let res = 'Yes'
      if (!(runSilently === 'yes')) {
        res = await showMessageYesNo(`Remove "${heading}"+content in ${prevCopies.length} notes?`)
      }
      if (res === 'Yes') {
        prevCopies.forEach(
          async (paragraph) => await removeContentUnderHeading(paragraph.note, heading, false, keepHeading),
        )
      }
    } else {
      if (!(runSilently === 'yes')) showMessage(`Found no previous notes with "${heading}"`)
    }
    log(
      `NPParagraph`,
      `removeContentUnderHeadingInAllNotes found ${prevCopies.length} previous ${String(
        noteTypes,
      )} notes with heading: "${heading}"`,
    )
  } catch (error) {
    logError(`NPParagraph`, `removeContentUnderHeadingInAllNotes error: ${JSP(error)}`)
  }
}
