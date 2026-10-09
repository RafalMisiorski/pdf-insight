import { describe, expect, it } from 'vitest'
import {
  amountsJsonSchema,
  coreJsonSchema,
  datesJsonSchema,
  modelOutputJsonSchema,
} from '../../src/lib/schema'
import { SYSTEM_PROMPT, retryMessage, wrapDocument, wrapDocumentFor } from './prompt'

// The company test document is run once against this exact model input (2026-10-08): system prompt,
// document wrapper, retry message and output schema. Any change makes this test fail on purpose:
// a change after the test run must be a conscious decision, recorded in AI_LOG.md as a deviation,
// and only then is the expected hash updated.
const FROZEN_SHA256 = 'c182b7a255304b6c999cb4fe36e4eadef132b48fd5792d8206a65352be6408fc'

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

describe('frozen model input for the text path', () => {
  it('prompt, wrapper, retry message and schema are unchanged since the test-set run', async () => {
    const modelInput = [
      SYSTEM_PROMPT,
      wrapDocument('przykładowy tekst'),
      retryMessage(['przykładowy problem']),
      JSON.stringify(modelOutputJsonSchema),
    ].join('\n')
    expect(await sha256(modelInput)).toBe(FROZEN_SHA256)
  })
})

// The parallel path for dense documents (docs/adr/0011) was added after the test-set run, so its own
// model input is frozen separately: the three group messages and the three group schemas.
const FROZEN_PARALLEL_SHA256 = '72a99114946bcb5dbf2c644612ecca6ebadc2904e47661bf55d5e00abb6edba7'

describe('frozen model input for the parallel path', () => {
  it('group messages and group schemas are unchanged since ADR-0011', async () => {
    const modelInput = [
      wrapDocumentFor('core', 'przykładowy tekst'),
      wrapDocumentFor('amounts', 'przykładowy tekst'),
      wrapDocumentFor('dates', 'przykładowy tekst'),
      JSON.stringify(coreJsonSchema),
      JSON.stringify(amountsJsonSchema),
      JSON.stringify(datesJsonSchema),
    ].join('\n')
    expect(await sha256(modelInput)).toBe(FROZEN_PARALLEL_SHA256)
  })
})
