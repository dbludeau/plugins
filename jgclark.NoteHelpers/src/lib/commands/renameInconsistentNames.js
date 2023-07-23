// @flow
//-----------------------------------------------------------------------------
// Functions to identify and fix where note names and their filenames are inconsistent.
// Leo Melo, readied for the plugin by Jonathan Clark
// Last updated 16.7.2023 for v0.18.0 by @jgclark
//-----------------------------------------------------------------------------
// TODO:
// - add a 'foldersToIgnore' option.
import { chooseFolder, showMessage, showMessageYesNoCancel } from '../../../../helpers/userInput'
import pluginJson from '../../../plugin.json'
import { findInconsistentNames } from '../../helpers/findInconsistentNames'
import { renameNote } from '../../helpers/renameNote'
import { logDebug, logError, logInfo, logWarn } from '@helpers/dev'

/**
 * Renames all project notes with inconsistent names (i.e. where the note title and filename are different).
 * Optionally prompts the user before renaming each note.
 *
 * @returns void
 */
export async function renameInconsistentNames(): Promise<void> {
  const directory = await chooseFolder('Choose a folder to rename notes in')

  if (!directory) {
    logWarn(pluginJson, 'renameInconsistentNames(): No folder chosen. Stopping.')
    return
  }

  logDebug(pluginJson, `renameInconsistentNames(): Chosen folder: ${directory}`)

  try {
    const inconsistentNames = findInconsistentNames(directory)
    if (!Array.isArray(inconsistentNames) || inconsistentNames.length < 1) {
      logDebug(pluginJson, 'renameInconsistentNames(): No inconsistent names found. Stopping.')
      showMessage('No inconsistent names found. Well done!')
      return
    }

    await showMessage(`Found ${inconsistentNames.length} inconsistent names.
      ${inconsistentNames.map((note) => note.filename).join('\n')}
    `)

    const response = await showMessageYesNoCancel(
      `Would you like to be prompted before renaming each of these notes?
      (If you choose 'No', the notes will be renamed automatically. 'Cancel' will stop the process.)`,
    )

    if (response === 'Cancel') {
      logDebug(pluginJson, 'renameInconsistentNames(): User chose to cancel.')
      return
    }

    const shouldPromptBeforeRenaming = response === 'Yes'

    inconsistentNames.forEach((note) => {
      renameNote(note, shouldPromptBeforeRenaming)
    })
  } catch (error) {
    logError(pluginJson, `renameInconsistentNames() error: ${error.message}`)
  }
}
