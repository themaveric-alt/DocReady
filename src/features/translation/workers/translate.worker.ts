import {
  env,
  AutoModelForSeq2SeqLM,
  MarianTokenizer,
  Tensor,
} from '@huggingface/transformers'
import {
  MODEL_ROOT,
  RUNTIME,
  modelBytes,
  models,
} from '../models/modelRegistry'
import { modelFetch, runtimeBinary } from '../models/modelLoader'
import { translateParagraph } from '../models/segments'
import type { Pair } from '../types'

self.onmessage = async ({
  data,
}: MessageEvent<{
  pair: Pair
  text: string[]
  glossary: [string, string][]
}>) => {
  const signal = new AbortController().signal
  const { pair, text, glossary } = data
  const report = (
    stage: string,
    done?: number,
    total?: number,
    unit?: string,
  ) => self.postMessage({ type: 'progress', stage, done, total, unit })
  let translator: Awaited<ReturnType<typeof makeTranslator>> | undefined
  async function makeTranslator() {
    env.allowRemoteModels = false
    env.allowLocalModels = true
    env.localModelPath = location.origin + MODEL_ROOT
    env.useBrowserCache = false
    env.useWasmCache = false
    const wasm = env.backends.onnx.wasm!
    wasm.numThreads = 1
    wasm.proxy = false
    wasm.wasmPaths = {
      mjs: location.origin + RUNTIME + '.mjs',
      wasm: location.origin + RUNTIME + '.wasm',
    }
    report('Loading the local WASM runtime')
    wasm.wasmBinary = await runtimeBinary(signal)
    const progress = new Map<string, number>()
    env.fetch = (request) =>
      modelFetch(pair, request, signal, (path, bytes) => {
        progress.set(path, bytes)
        report(
          'Reading translation model assets',
          [...progress.values()].reduce((sum, item) => sum + item, 0),
          modelBytes(pair),
          'bytes',
        )
      })
    const modelId = models[pair].revision
    const [tokenizerJSON, tokenizerConfig] = await Promise.all(
      ['tokenizer.json', 'tokenizer_config.json'].map(async (file) =>
        (await env.fetch(env.localModelPath + modelId + '/' + file)).json(),
      ),
    )
    const tokenizer = new MarianTokenizer(tokenizerJSON, tokenizerConfig)
    report('Initializing the local translation model')
    const model = await AutoModelForSeq2SeqLM.from_pretrained(modelId, {
      local_files_only: true,
      device: 'wasm',
      dtype: 'int8',
    })
    return {
      async infer(text: string) {
        const input = tokenizer(text, { truncation: false })
        if (input.input_ids.size > 500)
          throw Error(
            'A text segment exceeds this model’s token limit. Break the paragraph into shorter sentences.',
          )
        const output = await model.generate({
          ...input,
          max_new_tokens: 300,
          num_beams: 2,
          do_sample: false,
        })
        return tokenizer.batch_decode(output as Tensor, {
          skip_special_tokens: true,
        })[0]
      },
      dispose: () => model.dispose(),
    }
  }
  try {
    translator = await makeTranslator()
    for (const [i, source] of text.entries()) {
      report('Translating on your device', i, text.length, 'blocks')
      const translated = await translateParagraph(
        source,
        pair.slice(0, 2),
        glossary,
        async (part) => {
          const result = await translator!.infer(part)
          if (!result?.trim())
            throw Error(
              'The local model returned no translated text for a block.',
            )
          return result
        },
      )
      self.postMessage({ type: 'block', index: i, translated })
    }
    self.postMessage({ type: 'done' })
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    await translator?.dispose().catch(() => {})
  }
}
