import { useState, type FormEvent } from 'react'
import {
  Briefcase,
  FolderOpen,
  GraduationCap,
  HeartPulse,
  IdCard,
  Receipt,
} from 'lucide-react'
import { Button, ErrorState, Field, Modal } from '../../components/shared'
import { errorText } from '../../lib/files'
import {
  folderColors,
  folderMap,
  folderSymbols,
  folderTrail,
  folders,
  type CustomFolder,
  type Folder,
} from './crypto'
import { deleteFolder, saveFolder, useVault } from './session'

export const folderIcons = {
  'Govt IDs': IdCard,
  Education: GraduationCap,
  'Finance & Bills': Receipt,
  Medical: HeartPulse,
  Personal: FolderOpen,
  'Scanned Docs': FolderOpen,
  'ID Cards': IdCard,
}
export const customIcons = {
  folder: FolderOpen,
  card: IdCard,
  education: GraduationCap,
  receipt: Receipt,
  heart: HeartPulse,
  briefcase: Briefcase,
}
const iconNames = {
  folder: 'Folder',
  card: 'Card',
  education: 'Education',
  receipt: 'Receipt',
  heart: 'Health',
  briefcase: 'Briefcase',
}

export function FolderDialog({
  item,
  parent,
  close,
  remove,
}: {
  item?: CustomFolder
  parent?: Folder
  close: () => void
  remove?: boolean
}) {
  const custom = useVault((state) => state.customFolders)
  const [fields, setFields] = useState<Omit<CustomFolder, 'id'>>(
    item ?? {
      name: '',
      color: 'violet',
      icon: 'folder',
      parent: parent ?? null,
    },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const map = folderMap(custom)
  const available = custom.filter((folder) => {
    let current: Folder | null = folder.id
    while (current) {
      if (current === item?.id) return false
      current = map.get(current)?.parent ?? null
    }
    return true
  })
  const destination = item?.parent
    ? folderTrail(item.parent, map).join(' / ')
    : 'Personal'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (remove && item) await deleteFolder(item)
      else await saveFolder(fields, item?.id)
      close()
    } catch (failure) {
      setError(errorText(failure))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={
        remove
          ? 'Delete custom folder?'
          : item
            ? 'Edit custom folder'
            : 'Create new folder'
      }
      onClose={close}
    >
      <form
        className="vault-auth-form"
        onSubmit={(event) => void submit(event)}
      >
        {remove ? (
          <p className="muted">
            <strong>{item?.name}</strong> will be removed. Its files and
            subfolders will move to <strong>{destination}</strong>.
          </p>
        ) : (
          <fieldset className="vault-fields" disabled={busy}>
            <Field label="Folder name">
              <input
                required
                maxLength={100}
                value={fields.name}
                onChange={(event) =>
                  setFields({ ...fields, name: event.target.value })
                }
              />
            </Field>
            <Field label="Parent folder">
              <select
                value={fields.parent ?? ''}
                onChange={(event) =>
                  setFields({
                    ...fields,
                    parent: (event.target.value || null) as Folder | null,
                  })
                }
              >
                <option value="">Top level</option>
                {folders.map((name) => (
                  <option key={name}>{name}</option>
                ))}
                {available.map((folder) => (
                  <option value={folder.id} key={folder.id}>
                    {folderTrail(folder.id, map).join(' / ')}
                  </option>
                ))}
              </select>
            </Field>
            <div className="vault-folder-fields">
              <Field label="Folder color">
                <select
                  value={fields.color}
                  onChange={(event) =>
                    setFields({
                      ...fields,
                      color: event.target.value as CustomFolder['color'],
                    })
                  }
                >
                  {folderColors.map((color) => (
                    <option key={color} value={color}>
                      {color[0].toUpperCase() + color.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Folder icon">
                <select
                  value={fields.icon}
                  onChange={(event) =>
                    setFields({
                      ...fields,
                      icon: event.target.value as CustomFolder['icon'],
                    })
                  }
                >
                  {folderSymbols.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {iconNames[symbol]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>
        )}
        <ErrorState error={error} />
        <div className="action-row">
          <Button type="submit" disabled={busy}>
            {remove ? 'Delete folder' : item ? 'Save folder' : 'Create folder'}
          </Button>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
