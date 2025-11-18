import type { Component, JSX } from "solid-js"
import { sharedConfig, splitProps } from "solid-js"
import { Dynamic } from "solid-js/web"
import { twMerge } from "tailwind-merge"

import type { LogicHandler, ScBaseComponent, StyleDefinition } from "../types"
import applyLogicHandlers from "./applyLogicHandlers"

const toKebabCase = (key: string) => {
  if (key.startsWith("--")) {
    return key
  }
  return key
    .replace(/([A-Z])/g, (_, char: string) => `-${char.toLowerCase()}`)
    .replace(/^-/, "")
    .toLowerCase()
}

const resolveStyleDefinition = <P extends object>(
  styles: StyleDefinition<P> | undefined,
  props: P,
): Record<string, string | number> => {
  if (!styles) {
    return {}
  }

  const normalized: Record<string, string | number> = {}
  const record = styles as Record<string, any>
  for (const rawKey in record) {
    const rawValue = record[rawKey]
    if (rawValue === undefined || rawValue === null) {
      continue
    }
    const resolvedValue = typeof rawValue === "function" ? rawValue(props) : rawValue
    if (resolvedValue === undefined || resolvedValue === null) {
      continue
    }
    normalized[toKebabCase(rawKey)] = resolvedValue
  }

  return normalized
}

const normalizeInlineStyle = (style: Record<string, any> | undefined | null) => {
  if (!style) {
    return {}
  }

  const normalized: Record<string, string | number> = {}
  for (const key in style) {
    const value = style[key]
    if (value === undefined || value === null) {
      continue
    }
    normalized[toKebabCase(key)] = value
  }
  return normalized
}

interface CreateSolidElementParams<T extends object, E extends keyof JSX.IntrinsicElements | Component<any>> {
  tag: E
  computeClassName: (props: T) => string
  displayName: string
  styles?: StyleDefinition<T> | ((props: T) => StyleDefinition<T>)
  propsToFilter?: (keyof T)[]
  logicHandlers?: LogicHandler<T>[]
}

const isProductionEnv = typeof process !== "undefined" ? process.env?.NODE_ENV === "production" : false

const shouldDebugHydration = () => {
  if (typeof document === "undefined") {
    return false
  }
  if (typeof process !== "undefined" && typeof process.env?.SOLID_CLASSMATE_DEBUG === "string") {
    const flags = process.env.SOLID_CLASSMATE_DEBUG.split(",").map((flag) => flag.trim())
    if (flags.includes("hydration")) {
      return !isProductionEnv
    }
  }
  const globalFlag = (() => {
    if (typeof globalThis === "undefined") {
      return false
    }
    const raw = (globalThis as Record<string, any>).__SOLID_CLASSMATE_DEBUG__
    if (!raw) {
      return false
    }
    if (raw === true) {
      return true
    }
    if (typeof raw === "string") {
      return raw.split(",").map((flag) => flag.trim()).includes("hydration")
    }
    if (typeof raw === "object" && raw !== null) {
      return raw.hydration === true
    }
    return false
  })()
  return globalFlag
}

const logLibraryLoaded = () => {
  if (isProductionEnv || typeof console === "undefined") {
    return
  }
  const globalScope = typeof globalThis !== "undefined" ? (globalThis as Record<string, any>) : undefined
  if (globalScope) {
    if (globalScope.__SOLID_CLASSMATE_LOADED__) {
      return
    }
    globalScope.__SOLID_CLASSMATE_LOADED__ = true
  }
  const envFlag = typeof process !== "undefined" ? process.env?.SOLID_CLASSMATE_DEBUG : undefined
  const globalFlag =
    globalScope && "__SOLID_CLASSMATE_DEBUG__" in globalScope ? globalScope.__SOLID_CLASSMATE_DEBUG__ : undefined
  // eslint-disable-next-line no-console
  console.info(
    `[solid-classmate] dev build instrumentation enabled (env: ${envFlag ?? "unset"}, global: ${
      typeof globalFlag === "object" ? JSON.stringify(globalFlag) : String(globalFlag ?? "unset")
    })`,
  )
}

logLibraryLoaded()

const logHydrationDebug = (componentName: string, props: Record<string, any>) => {
  if (!shouldDebugHydration()) {
    return
  }
  const context = sharedConfig.context
  if (!context) {
    // eslint-disable-next-line no-console
    console.warn(
      `[solid-classmate] hydration debug: context missing for <${componentName}>. Props keys: ${Object.keys(props).join(", ")}`,
    )
    return
  }
  const descriptor = Object.getOwnPropertyDescriptor(props, "children")
  const descriptorInfo = descriptor
    ? {
        hasGetter: typeof descriptor.get === "function",
        hasSetter: typeof descriptor.set === "function",
        isValue: "value" in descriptor,
      }
    : { missing: true }

  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[solid-classmate] hydrating <${componentName}> (context: ${context.id}, depth: ${context.count})`,
  )
  // eslint-disable-next-line no-console
  console.log("children descriptor", descriptorInfo)
  // eslint-disable-next-line no-console
  console.log("prop keys", Object.keys(props))
  // eslint-disable-next-line no-console
  console.trace()
  // eslint-disable-next-line no-console
  console.groupEnd()
}

const createSolidElement = <T extends object, E extends keyof JSX.IntrinsicElements | Component<any>>({
  tag,
  computeClassName,
  displayName,
  styles = {},
  propsToFilter = [],
  logicHandlers = [],
}: CreateSolidElementParams<T, E>): ScBaseComponent<T> => {
  const element = ((incomingProps: T) => {
    const enhancedProps =
      logicHandlers.length > 0 ? applyLogicHandlers(incomingProps, logicHandlers) : incomingProps
    const normalizedProps = enhancedProps as T & Record<string, any>
    const computedClassName = computeClassName(normalizedProps)

    const normalizedRecord = normalizedProps as Record<string, any>
    const reservedKeys = [
      ...propsToFilter.filter((key): key is keyof T & string => typeof key === "string"),
      "children",
      "class",
      "className",
      "style",
    ] as readonly string[]
    const [local, forwardedSource] = splitProps(normalizedRecord, reservedKeys)

    const filteredProps: Record<string, any> = {}
    const forwarded = forwardedSource as Record<string, any>
    for (const key in forwarded) {
      if (!key.startsWith("$")) {
        filteredProps[key] = forwarded[key]
      }
    }

    const initialClass = typeof local.class === "string" ? local.class : ""
    const incomingClasses = [
      initialClass,
      typeof local.className === "string" ? local.className : "",
    ]
      .filter(Boolean)
      .join(" ")
      .trim()

    const dynamicStylesSource = typeof styles === "function" ? styles(normalizedProps) : styles
    const dynamicStyles = resolveStyleDefinition(dynamicStylesSource, normalizedProps)
    const localStyleSource =
      typeof local.style === "object" && local.style !== null ? local.style : undefined
    const localStyles = normalizeInlineStyle(localStyleSource)
    const mergedStyles = { ...dynamicStyles, ...localStyles }

    const mergedClassName = twMerge(computedClassName, incomingClasses)

    if (!isProductionEnv) {
      logHydrationDebug(displayName, normalizedRecord)
    }

    return (
      <Dynamic component={tag as any} {...filteredProps} class={mergedClassName} style={mergedStyles}>
        {local.children}
      </Dynamic>
    )
  }) as ScBaseComponent<T>

  element.displayName = displayName || "Sc Component"
  element.__scComputeClassName = (props: T) =>
    computeClassName(logicHandlers.length > 0 ? applyLogicHandlers(props, logicHandlers) : props)
  element.__scStyles = styles
  element.__scTag = tag
  element.__scLogic = logicHandlers

  return element
}

export default createSolidElement
