export const SELECT_ALL_LABEL = '(Select All)'

export type SelectAllCheckboxState = {
  checked: boolean
  indeterminate: boolean
}

type ValidValue = { label: string; value: string }

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

/** Comma-separated labels for the closed multi-value dropdown face. */
export function selectedLabelsSummary(
  validValues: readonly ValidValue[],
  selected: readonly string[],
): string {
  if (selected.length === 0) {
    return ''
  }
  const byValue = new Map(validValues.map((option) => [option.value, option.label]))
  return selected
    .map((value) => byValue.get(value) ?? value)
    .join(', ')
}
