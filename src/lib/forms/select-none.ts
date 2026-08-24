export const SELECT_NONE = 'none'

export function toSelectValue(value: string) {
  return value === '' ? SELECT_NONE : value
}

export function fromSelectValue(value: string) {
  return value === SELECT_NONE ? '' : value
}
