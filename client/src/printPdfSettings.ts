/** Allowed PDF Print page sizes — keep aligned with API PdfPrintSettings.PageSizes keys. */
export const PRINT_PAGE_SIZES = ['A4', 'A3', 'Letter', 'Legal'] as const

/** Allowed PDF Print orientations — keep aligned with API PdfPrintSettings. */
export const PRINT_ORIENTATIONS = ['Portrait', 'Landscape'] as const

export type PrintPageSize = (typeof PRINT_PAGE_SIZES)[number]
export type PrintOrientation = (typeof PRINT_ORIENTATIONS)[number]

/** Page layout for printer-friendly PDF (Print settings → Export DeviceInfo). */
export type PrintPdfSettings = {
  pageSize: PrintPageSize
  orientation: PrintOrientation
}

export const DEFAULT_PRINT_SETTINGS: PrintPdfSettings = {
  pageSize: 'A4',
  orientation: 'Portrait',
}
