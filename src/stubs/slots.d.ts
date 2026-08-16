export type PropsRuntime<K extends string = string> = {
  wide?: boolean
  sessionId?: string
  [key: string]: any
}

export interface LocaleNamespaceMap {}

export type Translate<K extends string = string> = (key: K, params?: Record<string, unknown>) => string

export type TranslateNS<N extends keyof LocaleNamespaceMap & string> = Translate<LocaleNamespaceMap[N] & string>

export type PropsLocale<N extends keyof LocaleNamespaceMap & string> = {
  t: TranslateNS<N>
}
