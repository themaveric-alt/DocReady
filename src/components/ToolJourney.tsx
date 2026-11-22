import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'

type Journey = { sources: (id: string, count: number) => void; outputs: (id: string, count: number) => void }
const Context = createContext<Journey | null>(null)
export const useToolJourney = () => useContext(Context)

export function useJourneySources(count: number) {
  const journey = useToolJourney()
  const id = useId()
  useEffect(() => { journey?.sources(id, count); return () => journey?.sources(id, 0) }, [count, journey, id])
}
export function useJourneyOutputs(count: number) {
  const journey = useToolJourney()
  const id = useId()
  useEffect(() => { journey?.outputs(id, count); return () => journey?.outputs(id, 0) }, [count, journey, id])
}

export default function ToolJourney({ children, startOver, entry = true }: {
  children: ReactNode; startOver: () => void; entry?: boolean
}) {
  const [sources, setSources] = useState<Record<string, number>>({})
  const [outputs, setOutputs] = useState<Record<string, number>>({})
  const outputCount = Object.values(outputs).reduce((sum, count) => sum + count, 0)
  const [review, setReview] = useState(false)
  const [context] = useState<Journey>(() => ({ sources: (id, count) => setSources(old => ({ ...old, [id]: count })), outputs: (id, count) => setOutputs(old => ({ ...old, [id]: count })) }))
  useEffect(() => { setReview(false) }, [outputCount])
  const stage = outputCount && !review ? 3 : Object.values(sources).some(Boolean) || !entry ? 2 : 1
  return <Context.Provider value={context}>
    <section className="tool-journey" data-stage={stage}>
      <ol className="journey-steps" aria-label="Tool progress">
        {['Choose files', 'Prepare & preview', 'Download & continue'].map((label, index) => <li key={label} aria-current={stage === index + 1 ? 'step' : undefined}><span>{index + 1}</span>{label}</li>)}
      </ol>
      <p className="journey-privacy"><ShieldCheck size={15} /> On your device · zero document uploads <small>Offline after required assets are cached</small></p>
      {stage === 3 && <div className="journey-complete" role="status"><strong>Your output is ready</strong><span>Review the result, then download or save it to your encrypted vault.</span></div>}
      {children}
      {stage > 1 && <div className="journey-next">
        <button type="button" className="btn btn-secondary" onClick={startOver}>Start over</button>
        {stage === 3 && <button type="button" className="btn btn-quiet" onClick={() => setReview(true)}>Back to workspace</button>}
      </div>}
    </section>
  </Context.Provider>
}
