import { Field } from '../../../components/shared'
import { browserTranslationAvailable } from '../models/browserTranslation'
import { languageNames } from '../models/language'
import type { Language, OCRLanguage } from '../types'

export function LanguageSelector({
  source,
  target,
  ocr,
  setSource,
  setTarget,
  setOCR,
}: {
  source: Language | 'auto'
  target: Language
  ocr: OCRLanguage
  setSource: (value: Language | 'auto') => void
  setTarget: (value: Language) => void
  setOCR: (value: OCRLanguage) => void
}) {
  return (
    <div className="form-grid">
      <Field label="Translate from">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as Language | 'auto')}
        >
          <option value="auto">Auto detect after extraction</option>
          {Object.entries(languageNames).map(([id, label]) => (
            <option
              value={id}
              key={id}
              disabled={
                !browserTranslationAvailable() && !['hi', 'en'].includes(id)
              }
            >
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Translate to">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as Language)}
        >
          {Object.entries(languageNames).map(([id, label]) => (
            <option
              value={id}
              key={id}
              disabled={
                !browserTranslationAvailable() && !['hi', 'en'].includes(id)
              }
            >
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="OCR language">
        <select
          value={ocr}
          onChange={(e) => setOCR(e.target.value as OCRLanguage)}
        >
          <option value="hin+eng">Hindi + English</option>
          <option value="eng">English</option>
          <option value="hin">Hindi</option>
          <option value="spa">Spanish</option>
          <option value="fra">French</option>
          <option value="deu">German</option>
        </select>
      </Field>
    </div>
  )
}
