import { z } from "zod"

const runtimeConfigSchema = z.object({
  auth: z
    .object({
      enabled: z.boolean().default(false),
      region: z.string().trim().optional(),
      userPoolId: z.string().trim().optional(),
      userPoolClientId: z.string().trim().optional(),
      cognitoDomain: z.string().trim().optional(),
      redirectSignIn: z.string().trim().optional(),
      redirectSignOut: z.string().trim().optional(),
      callbackPath: z.string().trim().optional(),
      requiredGroup: z.string().trim().optional(),
      scopes: z.array(z.string().trim()).optional(),
    })
    .default({ enabled: false }),
  api: z
    .object({
      baseUrl: z.string().trim().optional(),
    })
    .default({}),
})

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>

const defaultConfig: RuntimeConfig = {
  auth: {
    enabled: false,
    callbackPath: "/auth/callback",
    scopes: ["openid", "email", "profile"],
  },
  api: {
    baseUrl: "",
  },
}

let runtimeConfig = defaultConfig

function normalizeBaseUrl(value: string | undefined) {
  return value ? value.replace(/\/+$/, "") : ""
}

function mergeRuntimeConfig(
  source: Partial<RuntimeConfig> | undefined
): RuntimeConfig {
  const parsed = runtimeConfigSchema.safeParse(source)

  if (!parsed.success) {
    return defaultConfig
  }

  return {
    auth: {
      ...defaultConfig.auth,
      ...parsed.data.auth,
      cognitoDomain: normalizeBaseUrl(parsed.data.auth.cognitoDomain),
      redirectSignIn:
        parsed.data.auth.redirectSignIn ??
        `${window.location.origin}${defaultConfig.auth.callbackPath}`,
      redirectSignOut:
        parsed.data.auth.redirectSignOut ?? `${window.location.origin}/`,
    },
    api: {
      ...defaultConfig.api,
      ...parsed.data.api,
      baseUrl: normalizeBaseUrl(parsed.data.api.baseUrl),
    },
  }
}

export async function loadRuntimeConfig() {
  try {
    const response = await fetch("/runtime-config.json", { cache: "no-store" })

    if (!response.ok) {
      runtimeConfig = defaultConfig
      return runtimeConfig
    }

    runtimeConfig = mergeRuntimeConfig(
      (await response.json()) as Partial<RuntimeConfig>
    )
    return runtimeConfig
  } catch {
    runtimeConfig = defaultConfig
    return runtimeConfig
  }
}

export function getRuntimeConfig() {
  return runtimeConfig
}
