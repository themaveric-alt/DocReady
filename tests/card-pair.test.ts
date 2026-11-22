import { expect,test } from 'vitest'
import { selectCardPair } from '../src/features/e-card-studio/cardPair'
import { boxQuad } from '../src/features/e-card-studio/geometry'

test('two front guesses keep both distinct crops and make the second side reviewable',()=>{
  const entries=[
    {source:{id:'page1'},region:{corners:boxQuad(.08,.4,.48,.58),score:.9},side:'front' as const,high:true,rank:1.2},
    {source:{id:'page1'},region:{corners:boxQuad(.08,.7,.48,.88),score:.89},side:'front' as const,high:true,rank:1.1},
  ]
  const pair=selectCardPair(entries)
  expect(pair).toHaveLength(2)
  expect(pair[0].side).toBe('front');expect(pair[0].high).toBe(false);expect(pair[1].side).toBeUndefined();expect(pair[1].high).toBe(false)
  expect(entries[1].side).toBe('front')
})
test('overlapping duplicate boundaries cannot fill a missing reverse',()=>{
  const region={corners:boxQuad(.08,.7,.48,.88),score:.9}
  expect(selectCardPair([
    {source:{id:'p'},region,side:'front',high:true,rank:1},
    {source:{id:'p'},region:{...region,corners:boxQuad(.081,.701,.479,.879)},side:'back',high:true,rank:.99},
  ])).toHaveLength(1)
})
