import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import { APICallError } from 'ai'

import { Result } from '../../lib/Result'

export function handleAICallAPIError(e: unknown) {
  const debugAI = process.env.DEBUG_AI === 'true'
  const isApiError = APICallError.isInstance(e)
  
  if (debugAI && isApiError) {
    console.log('\n=== AI API Error Details ===')
    console.log('Message:', e.message)
    console.log('Response Body:', e.responseBody)
    console.log('URL:', (e as any).url)
    console.log('Request Body:', (e as any).requestBodyValues)
    console.log('Full Error:', e)
  }
  
  return Result.error(
    new ChainError({
      code: RunErrorCodes.AIRunError,
      message: isApiError
        ? `Error: ${e.message} and response body: ${e.responseBody}`
        : e instanceof Error
          ? `Unknown error: ${e.message}`
          : `Unknown error: ${e}`,
    }),
  )
}
