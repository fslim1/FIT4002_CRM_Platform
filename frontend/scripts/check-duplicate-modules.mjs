// Fails when two source files under src/ share a name and differ only by
// extension, such as ui/select.jsx next to ui/select.tsx.
//
// Imports in this project leave the extension off, so Vite picks one of the
// pair by its own resolution order (.js and .jsx before .ts and .tsx) and the
// other never renders. Edits made to the wrong twin appear to have no effect,
// and the difference between the two is invisible at the import site.

import {readdirSync, statSync} from 'node:fs'
import {join, relative, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const SOURCE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const MODULE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.mts']

const walk = (directory) =>
    readdirSync(directory).flatMap((entry) => {
        const full = join(directory, entry)
        return statSync(full).isDirectory() ? walk(full) : [full]
    })

const byModulePath = new Map()

for (const file of walk(SOURCE_ROOT)) {
    const extension = MODULE_EXTENSIONS.find((candidate) => file.endsWith(candidate))
    if (!extension) continue
    const modulePath = file.slice(0, -extension.length)
    byModulePath.set(modulePath, [...(byModulePath.get(modulePath) || []), file])
}

const clashes = [...byModulePath.values()].filter((files) => files.length > 1)

if (clashes.length > 0) {
    console.error('\nTwo files claim the same import path:\n')
    for (const files of clashes) {
        for (const file of files) console.error(`  ${relative(SOURCE_ROOT, file)}`)
        console.error('')
    }
    console.error('Keep one of each and delete the rest, so an import cannot resolve')
    console.error('to a file you are not editing.\n')
    process.exit(1)
}

console.log(`No duplicate module paths under src/ (${byModulePath.size} modules checked).`)
