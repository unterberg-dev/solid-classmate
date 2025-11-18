import { mergeProps } from "solid-js"

import type { LogicHandler } from "../types"

const applyLogicHandlers = <T extends object>(props: T, logicHandlers: LogicHandler<T>[] = []): T => {
  if (!logicHandlers.length) {
    return props
  }

  let accumulated = props

  for (const handler of logicHandlers) {
    const result = handler(accumulated)
    if (result && typeof result === "object" && Object.keys(result).length > 0) {
      accumulated = mergeProps(accumulated, result) as T
    }
  }

  return accumulated
}

export default applyLogicHandlers
