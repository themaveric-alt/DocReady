import { useState } from 'react'
import {
  Camera,
  CreditCard,
  Layers,
  ScanFace,
  Settings2,
  Target,
} from 'lucide-react'
import { Button, Check, ErrorState, Panel } from '../../components/shared'
import ECardStudio from '../e-card-studio/ECardStudio'
import {
  BatchPrint,
  QualityInspector,
  SheetOptions,
} from './PhotoPrintPanels'
import PhotoStudio from './PhotoStudio'
import {
  defaultPhotoSheet,
  photoPlan,
  type PhotoSheetSettings,
} from './printPhotos'
import { readLocal, writeLocal } from '../../lib/prefs'
import { errorText } from '../../lib/files'
import './advanced.css'

const tabs = [
  ['Smart AI Photo Studio', Camera],
  ['Passport Photo Maker', ScanFace],
  ['PVC / E-Card Printing', CreditCard],
  ['Batch Print Layout', Layers],
  ['Print Quality Inspector', Target],
  ['Print Settings & Presets', Settings2],
] as const

export default function PrintDesk() {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>(
    'Smart AI Photo Studio',
  )
  const [file, setFile] = useState<File>(),
    [advanced, setAdvanced] = useState(false)
  const [modeError, setModeError] = useState('')
  const [defaults, setDefaults] = useState(() =>
    readLocal<PhotoSheetSettings>(
      'printdesk-sheet-settings',
      defaultPhotoSheet,
    ),
  )
  const [draft, setDraft] = useState(defaults),
    [settingsNotice, setSettingsNotice] = useState('')
  function toggle(value: boolean) {
    if (
      value &&
      (typeof Worker === 'undefined' ||
        typeof OffscreenCanvas === 'undefined' ||
        typeof WebAssembly === 'undefined')
    ) {
      setModeError(
        'This browser lacks worker canvas or WebAssembly support. Lite tools remain available.',
      )
      return
    }
    setModeError('')
    setAdvanced(value)
  }
  const photo =
    tab === 'Smart AI Photo Studio' || tab === 'Passport Photo Maker'
  return (
    <div className="advanced-space" data-lite={!advanced}>
      <div
        className="advanced-tool-tabs"
        aria-label="PrintDesk workspaces"
        role="group"
      >
        {tabs.map(([name, Icon]) => (
          <button
            type="button"
            key={name}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            <Icon size={18} aria-hidden="true" />
            {name}
          </button>
        ))}
      </div>
      {photo && (
        <>
          <div className="advanced-mode">
            <Check
              label="Advanced Local AI"
              checked={advanced}
              onChange={toggle}
            />
            <span className="muted">
              {advanced
                ? 'Models load only when a local AI operation is requested.'
                : 'Lite mode · manual editing, outfits, and print tools'}
            </span>
          </div>
          <ErrorState error={modeError} />
          <PhotoStudio
            initial={file}
            passport={tab === 'Passport Photo Maker'}
            onSource={setFile}
            advanced={advanced}
            defaults={defaults}
          />
        </>
      )}
      {tab === 'PVC / E-Card Printing' && <ECardStudio />}
      {tab === 'Batch Print Layout' && <BatchPrint defaults={defaults} />}
      {tab === 'Print Quality Inspector' && (
        <QualityInspector initial={file} />
      )}
      {tab === 'Print Settings & Presets' && (
        <Panel title="Print settings and presets">
          <p>
            Use Actual Size / 100% in your printer driver. Match the selected
            paper and run a small test before printing a full batch.
          </p>
          <dl className="advanced-metrics">
            <div>
              <dt>Photo workspace default</dt>
              <dd>
                {defaultPhotoSheet.photo.width} ×{' '}
                {defaultPhotoSheet.photo.height} mm on A4
              </dd>
            </div>
            <div>
              <dt>PVC / ID-1</dt>
              <dd>85.60 × 53.98 mm · one page per side</dd>
            </div>
            <div>
              <dt>Photo paper</dt>
              <dd>4 × 6 inches, A4, A5, Letter, custom</dd>
            </div>
          </dl>
          <SheetOptions
            settings={draft}
            change={(value) => {
              setDraft(value)
              setSettingsNotice('')
            }}
            passport
          />
          <div className="action-row">
            <Button
              onClick={() => {
                try {
                  photoPlan(1, draft)
                  writeLocal('printdesk-sheet-settings', draft)
                  setDefaults(draft)
                  setSettingsNotice(
                    'Print defaults saved for the next photo or batch session.',
                  )
                  setModeError('')
                } catch (error) {
                  setModeError(errorText(error))
                }
              }}
            >
              Save print defaults
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(defaultPhotoSheet)
                setSettingsNotice('')
              }}
            >
              Restore standard dimensions
            </Button>
          </div>
          {settingsNotice && <p role="status">{settingsNotice}</p>}
          <Check
            label="Advanced Local AI"
            checked={advanced}
            onChange={toggle}
          />
          <ErrorState error={modeError} />
        </Panel>
      )}
    </div>
  )
}
