import { omit } from 'lodash-es'

import { ChainError, RunErrorCodes } from '@latitude-data/constants/errors'
import type { Message } from '@latitude-data/constants/legacyCompiler'
import {
  CoreMessage,
  jsonSchema,
  ObjectStreamPart,
  streamText as originalStreamText,
  Output,
  smoothStream,
  StreamTextResult,
  TextStreamPart,
  Tool,
} from 'ai'
import { JSONSchema7 } from 'json-schema'

import { VercelConfig } from '@latitude-data/constants'
import { ProviderApiKey, StreamType } from '../../browser'
import { Result, TypedResult } from '../../lib/Result'
import { TelemetryContext } from '../../telemetry'
import { buildTools } from './buildTools'
import { getLanguageModel } from './getLanguageModel'
import { handleAICallAPIError } from './handleError'
import { createProvider } from './helpers'
import { Providers } from './providers/models'
import { applyAllRules } from './providers/rules'

const DEFAULT_AI_SDK_PROVIDER = {
  streamText: originalStreamText,
}
type AISDKProvider = typeof DEFAULT_AI_SDK_PROVIDER

type PARTIAL_OUTPUT = object

export type AIReturn<T extends StreamType> = Pick<
  StreamTextResult<Record<string, Tool<any, any>>, PARTIAL_OUTPUT>,
  | 'fullStream'
  | 'text'
  | 'usage'
  | 'toolCalls'
  | 'providerMetadata'
  | 'reasoning'
  | 'finishReason'
  | 'response'
> & {
  type: T
  providerName: Providers
  object?: T extends 'object' ? PARTIAL_OUTPUT : undefined
}

export type StreamChunk =
  | TextStreamPart<Record<string, Tool>>
  | ObjectStreamPart<unknown>

export type ObjectOutput = 'object' | 'array' | 'no-schema' | undefined

export type ToolSchema<
  T extends Record<string, { type: string; description: string }> = {},
> = {
  description: string
  parameters: {
    type: 'object'
    properties: T
  }
}

export async function ai({
  context,
  provider,
  prompt,
  messages: originalMessages,
  config: originalConfig,
  schema,
  output,
  aiSdkProvider,
  abortSignal,
}: {
  context: TelemetryContext
  provider: ProviderApiKey
  config: VercelConfig
  messages: Message[]
  prompt?: string
  schema?: JSONSchema7
  output?: ObjectOutput
  aiSdkProvider?: Partial<AISDKProvider>
  abortSignal?: AbortSignal
}): Promise<
  TypedResult<
    AIReturn<StreamType>,
    ChainError<
      | RunErrorCodes.AIProviderConfigError
      | RunErrorCodes.AIRunError
      | RunErrorCodes.Unknown
    >
  >
> {
  const { streamText } = {
    ...DEFAULT_AI_SDK_PROVIDER,
    ...(aiSdkProvider || {}),
  }
  
  // Debug logging for AI requests
  const debugAI = process.env.DEBUG_AI === 'true'
  
  try {
    if (debugAI) {
      console.log('\n=== AI Request Debug Info ===')
      console.log('Provider:', provider.provider)
      console.log('Model:', originalConfig.model)
      console.log('Messages count:', originalMessages.length)
      console.log('Messages:', JSON.stringify(originalMessages.map(msg => ({
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content.map(c => {
          const content: any = { type: c.type }
          
          if (c.type === 'text') {
            content.text = (c as any).text?.substring(0, 100) + (((c as any).text?.length > 100) ? '...' : '')
          } else if (c.type === 'image') {
            const imageData = (c as any).image
            content.imageInfo = {
              present: !!imageData,
              dataType: typeof imageData,
              isURL: typeof imageData === 'string' && (imageData.startsWith('http') || imageData.startsWith('data:')),
              isBuffer: imageData instanceof Buffer,
              isUint8Array: imageData instanceof Uint8Array,
              size: imageData?.length || imageData?.byteLength || (typeof imageData === 'string' ? imageData.length : 0),
              preview: typeof imageData === 'string' ? 
                (imageData.startsWith('http') || imageData.startsWith('data:')) ? 
                  imageData : // Show full URL or data URI
                  imageData.substring(0, 100) + '...' : // Only truncate non-URLs
                'Binary data'
            }
          } else if (c.type === 'file') {
            const fileData = (c as any).file
            content.fileInfo = {
              present: !!fileData,
              mimeType: (c as any).mimeType,
              dataType: typeof fileData,
              size: fileData?.length || fileData?.byteLength || (typeof fileData === 'string' ? fileData.length : 0)
            }
          }
          
          return content
        }) : typeof msg.content === 'string' ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '') : msg.content
      })), null, 2))
      console.log('Config:', JSON.stringify(originalConfig, null, 2))
    }

    const rule = applyAllRules({
      providerType: provider.provider,
      messages: originalMessages,
      config: originalConfig,
    })

    if (rule.rules.length > 0) {
      return Result.error(
        new ChainError({
          code: RunErrorCodes.AIRunError,
          message:
            'There are rule violations:\n' +
            rule.rules.map((rule) => `- ${rule.ruleMessage}`).join('\n'),
        }),
      )
    }

    const { provider: providerType, token: apiKey, url } = provider
    const config = rule.config
    const messages = rule.messages
    const model = config.model
    const tools = config.tools
    const providerAdapterResult = createProvider({
      context,
      messages,
      provider: provider,
      apiKey,
      url: url ?? undefined,
      config,
    })

    if (providerAdapterResult.error) return providerAdapterResult

    const languageModel = getLanguageModel({
      llmProvider: providerAdapterResult.value,
      provider,
      config,
      model,
    })

    const toolsResult = buildTools(tools)
    if (toolsResult.error) return toolsResult

    const useSchema = schema && !!output && output !== 'no-schema'
    const resultType: StreamType = useSchema ? 'object' : 'text'

    if (debugAI) {
      console.log('\n=== Converted Messages for Provider ===')
      console.log('Messages after rules:', JSON.stringify(messages.map((msg: any) => ({
        role: msg.role,
        content: Array.isArray(msg.content) ? msg.content.map((c: any) => {
          const content: any = { type: c.type }
          
          if (c.type === 'text') {
            content.text = c.text?.substring(0, 100) + ((c.text?.length > 100) ? '...' : '')
          } else if (c.type === 'image') {
            const imageData = c.image
            content.imageInfo = {
              present: !!imageData,
              dataType: typeof imageData,
              isURL: typeof imageData === 'string' && (imageData.startsWith('http') || imageData.startsWith('data:')),
              isBuffer: imageData instanceof Buffer,
              isUint8Array: imageData instanceof Uint8Array,
              size: imageData?.length || imageData?.byteLength || (typeof imageData === 'string' ? imageData.length : 0),
              preview: typeof imageData === 'string' ? 
                (imageData.startsWith('http') || imageData.startsWith('data:')) ? 
                  imageData : // Show full URL or data URI
                  imageData.substring(0, 100) + '...' : // Only truncate non-URLs
                'Binary data'
            }
          } else if (c.type === 'file') {
            const fileData = c.data || c.file  // After conversion, it might be 'data' instead of 'file'
            content.fileInfo = {
              present: !!fileData,
              mimeType: c.mimeType,
              dataType: typeof fileData,
              size: fileData?.length || fileData?.byteLength || (typeof fileData === 'string' ? fileData.length : 0)
            }
          }
          
          return content
        }) : typeof msg.content === 'string' ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '') : msg.content
      })), null, 2))
      console.log('\n=== Sending to Provider:', provider.provider, 'Model:', config.model, '===')
    }

    const result = streamText({
      ...omit(config, ['schema']),
      model: languageModel,
      prompt,
      messages: messages as CoreMessage[],
      tools: toolsResult.value,
      abortSignal,
      providerOptions: config.providerOptions,
      experimental_telemetry: { isEnabled: false }, // Note: avoid conflicts with our own telemetry
      experimental_transform: smoothStream(),
      experimental_output: useSchema
        ? Output.object({ schema: jsonSchema(schema) })
        : undefined,
    })

    if (debugAI) {
      // Log response metadata when available
      result.providerMetadata.then(metadata => {
        console.log('\n=== Provider Response Metadata ===')
        console.log(JSON.stringify(metadata, null, 2))
      }).catch(() => {})
      
      result.finishReason.then(reason => {
        console.log('\n=== Finish Reason ===')
        console.log(reason)
      }).catch(() => {})
    }

    return Result.ok({
      type: resultType,
      providerName: providerType,
      fullStream: result.fullStream,
      text: result.text,
      reasoning: result.reasoning,
      usage: result.usage,
      toolCalls: result.toolCalls,
      providerMetadata: result.providerMetadata,
      sources: result.sources,
      finishReason: result.finishReason,
      response: result.response,
    })
  } catch (e) {
    if (debugAI) {
      console.log('\n=== AI Request Error ===')
      console.log('Error:', e)
    }
    return handleAICallAPIError(e)
  }
}

export { estimateCost, getCostPer1M } from './estimateCost'
export type { PartialConfig } from './helpers'
export {
  amazonBedrockConfigurationSchema,
  type AmazonBedrockConfiguration,
} from './providers/helpers/amazonBedrock'
export {
  vertexConfigurationSchema,
  type VertexConfiguration,
} from './providers/helpers/vertex'
