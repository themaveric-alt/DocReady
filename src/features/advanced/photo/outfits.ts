// Original vector template designs for DocReadyApp. Thumbnail and composite use the same paths.
type Cut =
  | 'single'
  | 'double'
  | 'vest'
  | 'tux'
  | 'collar'
  | 'spread'
  | 'band'
  | 'polo'
  | 'henley'
  | 'zip'
  | 'denim'
  | 'crew'
type Texture = 'plain' | 'stripe' | 'check' | 'dash' | 'twill'
type Entry = [
  name: string,
  cut: Cut,
  cloth: string,
  inner: string,
  accent: string,
  texture: Texture,
]
export const groups: { name: string; list: Entry[] }[] = [
  {
    name: 'Formal Suit & Blazer',
    list: [
      ['Navy business', 'single', '#253454', '#f3f6fa', '#7888a6', 'plain'],
      [
        'Graphite double-breasted',
        'double',
        '#3e414b',
        '#e4e7eb',
        '#ab977f',
        'stripe',
      ],
      ['Black shawl tuxedo', 'tux', '#252734', '#f7f8fb', '#0d131d', 'plain'],
      [
        'Mist gray three-piece',
        'vest',
        '#737b86',
        '#edf0f0',
        '#48505b',
        'dash',
      ],
      [
        'Indigo windowpane',
        'double',
        '#263765',
        '#dce8fc',
        '#7a85aa',
        'check',
      ],
      [
        'Brown herringbone',
        'single',
        '#6e5047',
        '#fdeddc',
        '#ae8f73',
        'twill',
      ],
      ['Sand linen blazer', 'vest', '#beab87', '#fff4e3', '#796749', 'plain'],
      ['Slate peak lapel', 'double', '#4d5b67', '#e6eef0', '#bfc3c9', 'dash'],
      [
        'Midnight striped suit',
        'single',
        '#1d222f',
        '#f5f6fa',
        '#757d91',
        'stripe',
      ],
      [
        'Olive soft jacket',
        'single',
        '#47584d',
        '#e5eadc',
        '#9cad95',
        'check',
      ],
    ],
  },
  {
    name: 'Formal Shirt with Tie',
    list: [
      [
        'White with burgundy tie',
        'collar',
        '#f4f3f0',
        '#f8fbfd',
        '#754354',
        'plain',
      ],
      [
        'Blue with regimental tie',
        'spread',
        '#b8ceed',
        '#e2ebfa',
        '#34486a',
        'stripe',
      ],
      [
        'Gray pinstripe and navy tie',
        'collar',
        '#a3abbc',
        '#cdd4e4',
        '#28395e',
        'stripe',
      ],
      [
        'Pale pink and graphite tie',
        'band',
        '#e5ccd2',
        '#f2e2ea',
        '#464757',
        'plain',
      ],
      [
        'Stone Oxford and knit tie',
        'collar',
        '#b7ad9c',
        '#ded4c7',
        '#594657',
        'dash',
      ],
      [
        'Teal check and black tie',
        'spread',
        '#8eb3b2',
        '#b7d0cf',
        '#242e34',
        'check',
      ],
      [
        'Lilac with plum tie',
        'spread',
        '#cdc2e0',
        '#e6deef',
        '#654766',
        'twill',
      ],
      [
        'Ivory with olive tie',
        'collar',
        '#ece1d2',
        '#fff6ec',
        '#59614a',
        'twill',
      ],
      [
        'Steel check and copper tie',
        'band',
        '#8094ab',
        '#c0d1db',
        '#905e45',
        'check',
      ],
      [
        'Sky Oxford and narrow tie',
        'band',
        '#a9c9dc',
        '#d9effa',
        '#465575',
        'dash',
      ],
    ],
  },
  {
    name: 'Formal Shirt without Tie',
    list: [
      [
        'White spread collar',
        'spread',
        '#f4f3f1',
        '#fdfdfb',
        '#bec6d1',
        'plain',
      ],
      [
        'Blue Oxford button-down',
        'collar',
        '#a9c3df',
        '#e1eefb',
        '#536c94',
        'dash',
      ],
      [
        'Charcoal band collar',
        'band',
        '#515660',
        '#818592',
        '#323640',
        'plain',
      ],
      ['Mint windowpane', 'spread', '#abcabe', '#e5f0e8', '#7f9d95', 'check'],
      [
        'Blush pinstripe',
        'collar',
        '#e8c9c7',
        '#f7e2df',
        '#a88088',
        'stripe',
      ],
      ['Navy chambray', 'collar', '#4b637c', '#91a9bf', '#cad4df', 'twill'],
      [
        'Ochre grandad shirt',
        'band',
        '#ceab68',
        '#ecd6b0',
        '#896638',
        'dash',
      ],
      [
        'Lavender easy-care',
        'spread',
        '#c4bad7',
        '#ece5f2',
        '#706489',
        'plain',
      ],
      ['Sage formal linen', 'band', '#a7ae97', '#dddccc', '#75866e', 'twill'],
      ['Coffee gingham', 'collar', '#9e806e', '#d3c1b2', '#745849', 'check'],
    ],
  },
  {
    name: 'Smart Casual',
    list: [
      ['Forest pique polo', 'polo', '#41635a', '#72938b', '#e0dec8', 'dash'],
      ['Navy quarter zip', 'zip', '#35445f', '#626d85', '#bfc9d6', 'plain'],
      [
        'Indigo denim jacket',
        'denim',
        '#4e6584',
        '#e9e7dd',
        '#aa9374',
        'twill',
      ],
      ['Stone henley', 'henley', '#b2a596', '#d4c9b9', '#554e48', 'plain'],
      [
        'Plum striped crew',
        'crew',
        '#68566e',
        '#a790ab',
        '#bb9bb6',
        'stripe',
      ],
      [
        'Sage checked overshirt',
        'denim',
        '#728777',
        '#e5e8dc',
        '#495d50',
        'check',
      ],
      ['Clay tennis polo', 'polo', '#ab796b', '#d5a59b', '#574f4b', 'check'],
      ['Cloud fleece zip', 'zip', '#96a0a9', '#c9d1d8', '#4e5963', 'dash'],
      [
        'Ink ribbed henley',
        'henley',
        '#303949',
        '#656f7f',
        '#b4bbc8',
        'stripe',
      ],
      ['Oat textured crew', 'crew', '#b9a88b', '#eee1c9', '#89795e', 'twill'],
    ],
  },
]
export const outfits = groups.flatMap((group, category) =>
  group.list.map(([name, cut, cloth, inner, accent, texture], index) => ({
    id: category + '-' + index,
    category,
    name,
    cut,
    cloth,
    inner,
    accent,
    texture,
  })),
)
type Outfit = (typeof outfits)[number]
type Path = {
  d: string
  fill: string
  stroke?: string
  weight?: number
  opacity?: number
}
const body =
  'M 12 111 L 19 65 Q 22 48 53 40 L 78 35 Q 84 43 100 45 Q 116 43 122 35 L 147 40 Q 178 48 181 65 L 188 111 L 192 128 L 8 128 Z'
export function outfitPaths(o: Outfit): Path[] {
  const jacket = o.category === 0,
    tied = o.category === 1
  const paths: Path[] = [
    { d: body, fill: o.cloth, stroke: o.accent, weight: 1 },
  ]
  if (o.texture !== 'plain') {
    const spacing = o.texture === 'dash' ? 9 : o.texture === 'check' ? 13 : 14
    paths.push({
      d:
        Array.from({ length: 12 }, (_, i) => {
          const x = 24 + i * spacing
          return x < 179
            ? 'M ' +
                x +
                ' ' +
                (x < 48 || x > 152 ? 64 : 48) +
                ' L ' +
                (x + (o.texture === 'twill' ? 5 : 0)) +
                ' 127'
            : ''
        }).join(' ') +
        (o.texture === 'check'
          ? ' M 18 78 H 183 M 14 99 H 187 M 10 120 H 190'
          : ''),
      fill: 'none',
      stroke: o.accent,
      weight: o.texture === 'dash' ? 0.7 : 1.2,
      opacity: 0.45,
    })
  }
  if (jacket) {
    paths.push(
      { d: 'M 75 38 Q 100 55 125 38 L 136 126 H 64 Z', fill: o.inner },
      {
        d:
          o.cut === 'tux'
            ? 'M 66 39 Q 77 49 99 125 L 55 70 Z M 134 39 Q 123 49 101 125 L 145 70 Z'
            : o.cut === 'double'
              ? 'M 65 39 L 80 44 L 107 127 L 62 76 L 69 67 L 51 63 Z M 135 39 L 120 44 L 93 127 L 138 76 L 131 67 L 149 63 Z'
              : 'M 64 39 L 79 43 L 102 126 L 56 76 L 68 65 L 49 69 Z M 136 39 L 121 43 L 98 126 L 144 76 L 132 65 L 151 69 Z',
        fill: o.accent,
      },
      {
        d: 'M 37 91 L 64 91 M 136 91 L 163 91 M 156 73 L 171 73',
        fill: 'none',
        stroke: o.inner,
        weight: 1.3,
        opacity: 0.5,
      },
    )
    if (o.cut === 'vest')
      paths.push({
        d: 'M 76 66 L 100 100 L 124 66 L 128 128 H 72 Z',
        fill: o.cloth,
      })
    if (o.cut === 'tux')
      paths.push({
        d: 'M 83 46 L 97 50 H 103 L 117 46 V 60 L 103 54 H 97 L 83 60 Z',
        fill: o.accent,
      })
  } else if (o.cut === 'crew') {
    paths.push({
      d: 'M 72 37 Q 100 64 128 37 L 123 49 Q 100 72 77 49 Z',
      fill: o.accent,
    })
  } else {
    const collar =
      o.cut === 'band' || o.cut === 'zip' || o.cut === 'henley'
        ? 'M 72 37 Q 100 55 128 37 L 126 47 Q 100 66 74 47 Z'
        : o.cut === 'spread'
          ? 'M 74 36 L 98 55 L 82 73 L 65 45 Z M 126 36 L 102 55 L 118 73 L 135 45 Z'
          : 'M 77 36 L 97 55 L 83 76 L 70 43 Z M 123 36 L 103 55 L 117 76 L 130 43 Z'
    paths.push({ d: collar, fill: o.inner, stroke: o.accent, weight: 0.65 })
    paths.push({
      d:
        o.cut === 'polo' || o.cut === 'henley'
          ? 'M 100 56 V 82'
          : 'M 100 56 V 128',
      fill: 'none',
      stroke: o.accent,
      weight: o.cut === 'zip' ? 3 : 1.1,
    })
    if (o.cut === 'denim' || o.cut === 'collar')
      paths.push({
        d: 'M 135 77 H 160 V 95 L 147 102 L 135 95 Z',
        fill: 'none',
        stroke: o.accent,
        weight: 1.1,
      })
    if (tied)
      paths.push({
        d:
          o.cut === 'band'
            ? 'M 97 56 H 103 L 105 63 L 103 66 L 107 112 L 100 120 L 93 112 L 97 66 L 95 63 Z'
            : 'M 94 56 H 106 L 108 64 L 104 68 L 111 115 L 100 125 L 89 115 L 96 68 L 92 64 Z',
        fill: o.accent,
      })
  }
  if (!tied && o.cut !== 'crew' && o.cut !== 'zip') {
    const positions = o.cut === 'double' ? [93, 107] : [100]
    const first = jacket ? 100 : 62
    paths.push({
      d: positions
        .flatMap((x) =>
          [first, first + 13].map(
            (y) =>
              'M ' +
              (x - 1.6) +
              ' ' +
              y +
              ' a 1.6 1.6 0 1 0 3.2 0 a 1.6 1.6 0 1 0 -3.2 0',
          ),
        )
        .join(' '),
      fill: o.inner,
      stroke: o.accent,
      weight: 0.55,
    })
  }
  return paths
}
