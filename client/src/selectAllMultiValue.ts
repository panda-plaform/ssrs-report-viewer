export const SELECT_ALL_LABEL = '(Select All)'

export type SelectAllCheckboxState = {
  checked: boolean
  indeterminate: boolean
}

type ValidValue = { value: string }

/** Checkbox state for Select All chrome over a multi-value Valid Value list. */
export function selectAllCheckboxState(
  validValues: readonly ValidValue[],
  selected: readonly string[],
): SelectAllCheckboxState {
  if (validValues.length === 0 || selected.length === 0) {
    return { checked: false, indeterminate: false }
  }

  const selectedSet = new Set(selected)
  const allSelected = validValues.every((option) => selectedSet.has(option.value))
  if (allSelected) {
    return { checked: true, indeterminate: false }
  }

  const anySelected = validValues.some((option) => selectedSet.has(option.value))
  return { checked: false, indeterminate: anySelected }
}

/** Values after toggling Select All; never includes the chrome label. */
export function applySelectAll(
  validValues: readonly ValidValue[],
  checked: boolean,
): string[] {
  if (!checked) {
    return []
  }
  return validValues.map((v) => v.value)
}
