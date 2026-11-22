import { groupOverlap } from './geometry'
import type { Candidate } from './documentRegions'
import type { Side } from './printLayout'

type Entry = { source: { id: string }; region: Candidate; side?: Side; high: boolean; rank: number }

/** Side classification may repeat. It must never discard a distinct crop. */
export function selectCardPair<T extends Entry>(entries: T[]): T[] {
  const sorted = [...entries].sort((a,b) => b.rank-a.rank)
  const chosen: T[] = []
  const available = (entry: T) => !chosen.some(other => other === entry || (
    other.source.id === entry.source.id && groupOverlap(other.region.corners,entry.region.corners) > .27
  ))
  for (const side of ['front','back'] as const) {
    const entry=sorted.find(item => item.side === side && available(item))
    if(entry) chosen.push(entry)
  }
  for(const entry of sorted) {
    if(chosen.length===2) break
    if(!available(entry)) continue
    const duplicate = entry.side && chosen.some(item => item.side === entry.side)
    if(duplicate) for(let i=0;i<chosen.length;i++) if(chosen[i].side===entry.side) chosen[i]={...chosen[i],high:false}
    chosen.push(duplicate ? {...entry,side:undefined,high:false} : entry)
  }
  return chosen
}
