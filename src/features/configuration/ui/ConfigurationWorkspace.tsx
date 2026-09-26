import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CustomSelect } from '../../../app/components/CustomSelect'
import { InfoButton } from '../../../app/components/InfoButton'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { Icon } from '../../../app/components/icons'
import { isSessionBoolean, isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { createWholesaleRequestId } from '../../wholesale/ui/wholesaleUiUtils'
import type { SaleReceipt, SaleReceiptLine } from '../../sales/api/sales'
import { PosTicketPreview } from '../../sales/ui/PosTicketPreview'
import {
  DEFAULT_EVENT_CART_CAPACITY,
  DEFAULT_POS_USD_MXN_RATE,
  DEFAULT_POS_WHOLESALE_THRESHOLD,
  getReportTimezoneConfiguration,
  getOperationalConfiguration,
  isConfigurationUnauthorizedError,
  OPERATIONAL_CONFIGURATION_BOUNDS,
  REPORT_TIMEZONES,
  setReportTimezoneConfiguration,
  setOperationalConfiguration,
  validateReportTimezone,
  validateOperationalConfigurationValue,
  type EffectiveSetting,
  type OperationalConfiguration,
  type OperationalConfigurationKey,
  type ReportTimezone,
  type ReportTimezoneConfiguration,
} from '../api/configuration'
import { getSalesReceiptConfiguration, removeSalesReceiptLogo, SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH, SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH, SALES_RECEIPT_LOGO_MAX_BYTES, SALES_RECEIPT_LOGO_MIME_TYPES, setSalesReceiptConfiguration, uploadSalesReceiptLogo, type SalesReceiptConfiguration, type SalesReceiptConfigurationDraft } from '../api/salesReceipt'

type SettingDefinition = { key: OperationalConfigurationKey; title: string; label: string; description: string; unit: string; defaultValue: number }
const definitions: readonly SettingDefinition[] = [
  { key: 'event_daily_capacity', title: 'Capacidad diaria de Eventos', label: 'Carritos disponibles por día', description: 'Límite comercial de carritos reservados por fecha. No representa existencias físicas.', unit: 'carritos/día', defaultValue: DEFAULT_EVENT_CART_CAPACITY },
  { key: 'pos_usd_mxn_rate', title: 'Tipo de cambio POS', label: 'Tipo de cambio USD/MXN', description: 'Se usa como respaldo cuando la venta POS no tiene un tipo de cambio explícito.', unit: 'MXN por USD', defaultValue: DEFAULT_POS_USD_MXN_RATE },
  { key: 'pos_wholesale_threshold', title: 'Umbral de mayoreo POS', label: 'Cantidad para precio mayorista', description: 'Cantidad acumulada por categoría a partir de la cual aplica el precio mayorista.', unit: 'unidades', defaultValue: DEFAULT_POS_WHOLESALE_THRESHOLD },
]
const reportTimezoneLabels: Record<ReportTimezone, string> = {
  'America/Cancun': 'Cancún (America/Cancun)',
  'America/Mexico_City': 'Ciudad de México (America/Mexico_City)',
}
const reportTimezoneOptions = REPORT_TIMEZONES.map((value) => ({ value, label: reportTimezoneLabels[value] }))
const receiptLogoInputId = 'sales-receipt-logo-input'
const receiptLogoHelpId = 'configuration-help-sales-receipt-logo'
const receiptLogoErrorId = 'configuration-error-sales-receipt-logo'
const receiptContactHelpId = 'configuration-help-sales-receipt-contact'
const receiptPreviewLines: SaleReceiptLine[] = [
  { lineKind: 'product', productId: 'preview-product-1', categoryId: null, categoryName: null, name: 'Paleta de mango', quantity: 1, unitPriceMxn: 35, lineTotalMxn: 35 },
  { lineKind: 'product', productId: 'preview-product-2', categoryId: null, categoryName: null, name: 'Nieve de fresa', quantity: 2, unitPriceMxn: 28, lineTotalMxn: 56 },
]
const receiptPreviewReceipt: SaleReceipt = {
  id: 'receipt-preview',
  channel: 'pos',
  totalMxn: 91,
  createdAt: '2026-08-30T12:00:00.000Z',
  replayed: false,
  branchName: 'Sucursal Centro',
  cashierName: 'Ana López',
  customerName: 'Cliente mostrador',
  paymentMethod: 'cash',
  paymentCurrency: 'mxn',
  receivedMxn: 100,
  changeMxn: 9,
  items: receiptPreviewLines,
}
type Drafts = Record<OperationalConfigurationKey, string>
const initialDrafts = (): Drafts => Object.fromEntries(definitions.map(({ key, defaultValue }) => [key, String(defaultValue)])) as Drafts
const initialReceiptDraft = (configuration?: SalesReceiptConfiguration): SalesReceiptConfigurationDraft => ({
  logoKey: configuration?.logoKey ?? null,
  companyPhone: configuration?.companyPhone ?? null,
  companyEmail: configuration?.companyEmail ?? null,
  showLogo: configuration?.showLogo ?? true,
  showBranch: configuration?.showBranch ?? true,
  showCashier: configuration?.showCashier ?? true,
  showCustomer: configuration?.showCustomer ?? true,
  showPaymentMethod: configuration?.showPaymentMethod ?? true,
  showCompanyPhone: configuration?.showCompanyPhone ?? true,
  showCompanyEmail: configuration?.showCompanyEmail ?? true,
  showCustomerUrl: configuration?.showCustomerUrl ?? true,
})
type ConfigurationSessionState = {
  drafts: Drafts
  reportTimezoneDraft: ReportTimezone
  receiptDraft: Omit<SalesReceiptConfigurationDraft, 'logoKey'>
  infoOpen: boolean
}

function isConfigurationSessionState(value: unknown): value is ConfigurationSessionState {
  if (!isSessionRecord(value)) return false
  const drafts = value.drafts
  if (!isSessionRecord(drafts) || !isSessionString(value.reportTimezoneDraft) || !REPORT_TIMEZONES.includes(value.reportTimezoneDraft as ReportTimezone) || !isSessionRecord(value.receiptDraft) || !isSessionBoolean(value.infoOpen)) return false
  if (!definitions.every(({ key }) => isSessionString(drafts[key]))) return false
  const receiptDraft = value.receiptDraft
  return ['showLogo', 'showBranch', 'showCashier', 'showCustomer', 'showPaymentMethod'].every((key) => isSessionBoolean(receiptDraft[key]))
    && ['showCompanyPhone', 'showCompanyEmail', 'showCustomerUrl'].every((key) => receiptDraft[key] === undefined || isSessionBoolean(receiptDraft[key]))
    && ['companyPhone', 'companyEmail'].every((key) => receiptDraft[key] === undefined || isSessionString(receiptDraft[key]))
}

function restoredReceiptDraft(value: ConfigurationSessionState['receiptDraft'] | undefined): Partial<SalesReceiptConfigurationDraft> {
  if (!value) return {}
  return {
    ...(value.companyPhone === undefined ? {} : { companyPhone: value.companyPhone }),
    ...(value.companyEmail === undefined ? {} : { companyEmail: value.companyEmail }),
    ...(value.showLogo === undefined ? {} : { showLogo: value.showLogo }),
    ...(value.showBranch === undefined ? {} : { showBranch: value.showBranch }),
    ...(value.showCashier === undefined ? {} : { showCashier: value.showCashier }),
    ...(value.showCustomer === undefined ? {} : { showCustomer: value.showCustomer }),
    ...(value.showPaymentMethod === undefined ? {} : { showPaymentMethod: value.showPaymentMethod }),
    ...(value.showCompanyPhone === undefined ? {} : { showCompanyPhone: value.showCompanyPhone }),
    ...(value.showCompanyEmail === undefined ? {} : { showCompanyEmail: value.showCompanyEmail }),
    ...(value.showCustomerUrl === undefined ? {} : { showCustomerUrl: value.showCustomerUrl }),
  }
}

function errorText(error: unknown, key?: OperationalConfigurationKey) {
  const message = error instanceof Error ? error.message : ''
  if (/between (?:0\.01|1) and 10000|out-of-bounds|positive integer/i.test(message)) return key === 'pos_usd_mxn_rate' ? 'El tipo de cambio debe estar entre 0.01 y 10,000.' : 'El valor debe ser un entero entre 1 y 10,000.'
  if (/four decimal|decimal places/i.test(message)) return 'El tipo de cambio puede tener hasta cuatro decimales.'
  if (/must be an integer|JSON number/i.test(message)) return 'Captura un número entero válido.'
  return message || 'No se pudo guardar la configuración.'
}

function formatConfigurationTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function validateReceiptLogoFile(file: File) {
  if (!file || typeof file.type !== 'string' || !Number.isFinite(file.size) || file.size <= 0) return 'Selecciona un archivo de imagen válido.'
  if (!SALES_RECEIPT_LOGO_MIME_TYPES.includes(file.type as typeof SALES_RECEIPT_LOGO_MIME_TYPES[number])) return 'Selecciona una imagen JPEG, PNG o WebP.'
  if (file.size > SALES_RECEIPT_LOGO_MAX_BYTES) return 'El logo no puede superar 2 MB.'
  return ''
}

function effectiveTiming(setting: { effectiveAt: string | null }) {
  return setting.effectiveAt ? <time dateTime={setting.effectiveAt}>{formatConfigurationTimestamp(setting.effectiveAt)}</time> : 'Valor de compatibilidad; aún no se ha configurado.'
}

function ConfigurationLoadingState() {
  return <div data-testid="configuration-loading-state" role="status" aria-label="Cargando Configuración" className="ops-state ops-state-loading mt-4 border-0 bg-transparent p-0">
    <span className="sr-only">Cargando Configuración…</span>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: definitions.length + 2 }, (_, index) => <div key={index} data-testid="configuration-loading-card" className="ops-panel-frame animate-pulse rounded-3xl p-4 shadow-xl sm:p-5">
        <div className="h-4 w-2/3 rounded bg-slate-800" />
        <div className="mt-3 h-3 w-full rounded bg-slate-800" />
        <div className="mt-2 h-3 w-4/5 rounded bg-slate-800" />
        <div className="mt-5 h-11 rounded-xl bg-slate-800" />
      </div>)}
    </div>
  </div>
}

function ConfigurationField({ definition, setting, draft, error, busy, disabled, infoOpen, onInfoToggle, onChange, onSave }: { definition: SettingDefinition; setting: EffectiveSetting; draft: string; error?: string; busy: boolean; disabled: boolean; infoOpen: boolean; onInfoToggle: () => void; onChange: (value: string) => void; onSave: () => void }) {
  const bounds = OPERATIONAL_CONFIGURATION_BOUNDS[definition.key]
  const errorId = `configuration-error-${definition.key}`
  const metaId = `configuration-meta-${definition.key}`
  return <form noValidate data-testid={`configuration-setting-${definition.key}`} aria-labelledby={`${definition.key}-title`} onSubmit={(event) => { event.preventDefault(); onSave() }} className="ops-panel-frame grid gap-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <h2 id={`${definition.key}-title`} className="min-w-0 text-lg font-black text-white">{definition.title}</h2>
          <InfoButton id={`configuration-info-${definition.key}`} label={`Información sobre ${definition.title}`} open={infoOpen} onToggle={onInfoToggle}>{definition.description}</InfoButton>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{setting.type}</span>
      </div>
      <dl id={metaId} className="mt-4 grid gap-2 border-t border-slate-800 pt-3 text-xs sm:grid-cols-2">
        <div><dt className="text-slate-500">Valor efectivo</dt><dd className="mt-1 font-bold text-slate-200">{setting.value} {definition.unit}</dd></div>
        <div><dt className="text-slate-500">Estado</dt><dd className="mt-1 font-bold text-slate-200">{setting.state === 'configured' ? 'Configurado' : 'Valor predeterminado'}</dd></div>
        <div><dt className="text-slate-500">Alcance</dt><dd className="mt-1 font-bold text-slate-200">Global</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">Vigencia</dt><dd className="mt-1 font-bold text-slate-200">{effectiveTiming(setting)}</dd></div>
      </dl>
    </div>
    <div className="flex min-w-0 items-start gap-3">
      <label htmlFor={`${definition.key}-input`} className="ops-field-label grid min-w-0 flex-1 gap-2 text-sm font-semibold text-slate-200">
        {definition.label}
        <input id={`${definition.key}-input`} data-testid={`configuration-input-${definition.key}`} type="number" min={bounds.min} max={bounds.max} step={bounds.type === 'rate' ? 0.0001 : 1} inputMode={bounds.type === 'rate' ? 'decimal' : 'numeric'} value={draft} disabled={disabled} aria-describedby={error ? `${metaId} ${errorId}` : metaId} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className="ops-control min-h-11 px-3" />
        {error && <span id={errorId} role="alert" className="ops-field-error">{error}</span>}
      </label>
      <ResponsiveActionButton type="submit" label="Guardar configuración" icon="save" loading={busy} loadingLabel="Guardando…" disabled={disabled} className="mt-7 shrink-0" />
    </div>
  </form>
}

function ReportTimezoneField({ configuration, draft, error, busy, disabled, infoOpen, onInfoToggle, onChange, onSave }: { configuration: ReportTimezoneConfiguration; draft: ReportTimezone; error?: string; busy: boolean; disabled: boolean; infoOpen: boolean; onInfoToggle: () => void; onChange: (value: string) => void; onSave: () => void }) {
  const errorId = 'configuration-error-report-timezone'
  const metaId = 'configuration-meta-report-timezone'
  return <form noValidate aria-label="Zona horaria de reportes" data-testid="configuration-report-timezone" onSubmit={(event) => { event.preventDefault(); onSave() }} className="ops-panel-frame grid gap-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <h2 className="min-w-0 text-lg font-black text-white">Zona horaria de reportes</h2>
          <InfoButton id="configuration-info-report-timezone" label="Información sobre Zona horaria de reportes" open={infoOpen} onToggle={onInfoToggle}>Define la zona horaria que determina los límites del periodo y la agrupación diaria de ventas.</InfoButton>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Global</span>
      </div>
      <dl id={metaId} className="mt-4 grid gap-2 border-t border-slate-800 pt-3 text-xs sm:grid-cols-2">
        <div><dt className="text-slate-500">Valor efectivo</dt><dd className="mt-1 font-bold text-slate-200">{reportTimezoneLabels[configuration.timezone]}</dd></div>
        <div><dt className="text-slate-500">Estado</dt><dd className="mt-1 font-bold text-slate-200">{configuration.state === 'configured' ? 'Configurado' : 'Valor predeterminado'}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">Vigencia</dt><dd className="mt-1 font-bold text-slate-200">{effectiveTiming(configuration)}</dd></div>
      </dl>
    </div>
    <div className="flex min-w-0 items-start gap-3">
      <label className="ops-field-label grid min-w-0 flex-1 gap-2 text-sm font-semibold text-slate-200">
        Zona horaria aplicada
        <CustomSelect value={draft} onChange={onChange} options={reportTimezoneOptions} label="Zona horaria aplicada" disabled={disabled} ariaInvalid={Boolean(error)} ariaDescribedBy={error ? `${metaId} ${errorId}` : metaId} />
        {error && <span id={errorId} role="alert" className="ops-field-error">{error}</span>}
      </label>
      <ResponsiveActionButton type="submit" label="Guardar zona horaria" icon="save" loading={busy} loadingLabel="Guardando zona horaria…" disabled={disabled} className="mt-7 shrink-0" />
    </div>
  </form>
}

export function ConfigurationWorkspace() {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'configuration'
  const [restoredSession] = useState<ConfigurationSessionState | null>(() => persistence?.read(sessionModule, isConfigurationSessionState) ?? null)
  const [configuration, setConfiguration] = useState<OperationalConfiguration | null>(null)
  const [reportTimezoneConfiguration, setReportTimezoneConfig] = useState<ReportTimezoneConfiguration | null>(null)
  const [reportTimezoneDraft, setReportTimezoneDraft] = useState<ReportTimezone>(restoredSession?.reportTimezoneDraft ?? 'America/Cancun')
  const [receiptConfiguration, setReceiptConfiguration] = useState<SalesReceiptConfiguration | null>(null)
  const [drafts, setDrafts] = useState<Drafts>(restoredSession?.drafts ?? initialDrafts())
  const [receiptDraft, setReceiptDraft] = useState<SalesReceiptConfigurationDraft>(() => ({ ...initialReceiptDraft(), ...restoredReceiptDraft(restoredSession?.receiptDraft) }))
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptLogoPreviewUrl, setReceiptLogoPreviewUrl] = useState<string | null>(null)
  const [removeReceiptLogo, setRemoveReceiptLogo] = useState(false)
  const receiptLogoPreviewRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unauthorized, setUnauthorized] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<OperationalConfigurationKey, string>>>({})
  const [saving, setSaving] = useState<OperationalConfigurationKey | null>(null)
  const [savingReportTimezone, setSavingReportTimezone] = useState(false)
  const [reportTimezoneError, setReportTimezoneError] = useState('')
  const [savingReceipt, setSavingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [notice, setNotice] = useState('')
  const [infoOpen, setInfoOpen] = useState(restoredSession?.infoOpen ?? false)
  const [cardInfoOpen, setCardInfoOpen] = useState<string | null>(null)

  const clearReceiptLogoPreview = useCallback(() => {
    if (receiptLogoPreviewRef.current && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(receiptLogoPreviewRef.current)
    receiptLogoPreviewRef.current = null
    setReceiptLogoPreviewUrl(null)
    setReceiptFile(null)
  }, [])

  useEffect(() => () => {
    if (receiptLogoPreviewRef.current && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(receiptLogoPreviewRef.current)
  }, [])

  useEffect(() => {
    const safeReceiptDraft: ConfigurationSessionState['receiptDraft'] = { companyPhone: receiptDraft.companyPhone ?? '', companyEmail: receiptDraft.companyEmail ?? '', showLogo: receiptDraft.showLogo, showBranch: receiptDraft.showBranch, showCashier: receiptDraft.showCashier, showCustomer: receiptDraft.showCustomer, showPaymentMethod: receiptDraft.showPaymentMethod, showCompanyPhone: receiptDraft.showCompanyPhone ?? true, showCompanyEmail: receiptDraft.showCompanyEmail ?? true, showCustomerUrl: receiptDraft.showCustomerUrl ?? true }
    persistence?.write(sessionModule, { drafts, reportTimezoneDraft, receiptDraft: safeReceiptDraft, infoOpen })
  }, [drafts, infoOpen, persistence, receiptDraft, reportTimezoneDraft, sessionModule])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setUnauthorized(false)
    clearReceiptLogoPreview()
    setRemoveReceiptLogo(false)
    try {
      const [next, nextTimezone, nextReceipt] = await Promise.all([getOperationalConfiguration(), getReportTimezoneConfiguration(), getSalesReceiptConfiguration()])
      setConfiguration(next)
      const serverDrafts = Object.fromEntries(next.map((setting) => [setting.key, String(setting.value)])) as Drafts
      setDrafts(restoredSession?.drafts ?? serverDrafts)
      setReportTimezoneConfig(nextTimezone)
      setReportTimezoneDraft(restoredSession?.reportTimezoneDraft ?? nextTimezone.timezone)
      setReceiptConfiguration(nextReceipt)
      setReceiptDraft({ ...initialReceiptDraft(nextReceipt), ...restoredReceiptDraft(restoredSession?.receiptDraft) })
    } catch (loadCause) {
      const denied = isConfigurationUnauthorizedError(loadCause)
      setUnauthorized(denied)
      if (denied) {
        setConfiguration(null)
        setReportTimezoneConfig(null)
        setReportTimezoneDraft('America/Cancun')
        setReceiptConfiguration(null)
        setDrafts(initialDrafts())
        setReceiptDraft(initialReceiptDraft())
        setRemoveReceiptLogo(false)
      }
      setLoadError(denied ? 'No tienes permisos para consultar la configuración.' : 'No se pudo cargar la configuración. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }, [clearReceiptLogoPreview, restoredSession])

  useEffect(() => { void load() }, [load])

  async function save(key: OperationalConfigurationKey) {
    const value = Number(drafts[key])
    try {
      validateOperationalConfigurationValue(key, value)
    } catch (cause) {
      setFieldErrors((current) => ({ ...current, [key]: errorText(cause, key) }))
      setNotice('')
      return
    }
    setSaving(key)
    setFieldErrors((current) => ({ ...current, [key]: undefined }))
    setLoadError('')
    setNotice('')
    try {
      const result = await setOperationalConfiguration({ requestId: createWholesaleRequestId(), key, value })
      setConfiguration((current) => current?.map((setting) => setting.key === key ? result : setting) ?? [result])
      setDrafts((current) => ({ ...current, [key]: String(result.value) }))
      setNotice(result.resultStatus === 'replayed' ? 'La configuración ya estaba guardada.' : 'Configuración actualizada correctamente.')
    } catch (cause) {
      setFieldErrors((current) => ({ ...current, [key]: errorText(cause, key) }))
    } finally {
      setSaving(null)
    }
  }

  async function saveReportTimezone() {
    if (!reportTimezoneConfiguration) return
    let timezone: ReportTimezone
    try {
      timezone = validateReportTimezone(reportTimezoneDraft)
    } catch (cause) {
      setReportTimezoneError(cause instanceof Error ? cause.message : 'Selecciona una zona horaria válida.')
      setNotice('')
      return
    }
    setSavingReportTimezone(true)
    setReportTimezoneError('')
    setLoadError('')
    setNotice('')
    try {
      const result = await setReportTimezoneConfiguration({ requestId: createWholesaleRequestId(), timezone })
      setReportTimezoneConfig(result)
      setReportTimezoneDraft(result.timezone)
      setNotice(result.resultStatus === 'replayed' ? 'La zona horaria ya estaba guardada.' : 'Zona horaria actualizada correctamente.')
    } catch (cause) {
      setReportTimezoneError(isConfigurationUnauthorizedError(cause) ? 'No tienes permisos para actualizar la zona horaria de reportes.' : cause instanceof Error ? cause.message : 'No se pudo guardar la zona horaria de reportes.')
    } finally {
      setSavingReportTimezone(false)
    }
  }

  async function saveReceipt() {
    const previousKey = receiptConfiguration?.logoKey ?? null
    let uploadedKey: string | null = null
    setSavingReceipt(true)
    setReceiptError('')
    setNotice('')
    try {
      if (receiptFile) {
        const uploaded = await uploadSalesReceiptLogo(receiptFile)
        uploadedKey = uploaded.key
      }
      const next = await setSalesReceiptConfiguration({
        requestId: createWholesaleRequestId(),
        configuration: { ...receiptDraft, logoKey: uploadedKey ?? (removeReceiptLogo ? null : receiptDraft.logoKey) },
      })
      setReceiptConfiguration(next)
      setReceiptDraft(initialReceiptDraft(next))
      clearReceiptLogoPreview()
      setRemoveReceiptLogo(false)
      if (previousKey && previousKey !== next.logoKey) void removeSalesReceiptLogo(previousKey).catch(() => undefined)
      setNotice('Configuración del comprobante actualizada correctamente.')
    } catch (cause) {
      if (uploadedKey && uploadedKey !== previousKey) void removeSalesReceiptLogo(uploadedKey).catch(() => undefined)
      setReceiptError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración del comprobante.')
    } finally {
      setSavingReceipt(false)
    }
  }

  function selectReceiptLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const validationError = validateReceiptLogoFile(file)
    if (validationError) {
      setReceiptError(validationError)
      return
    }
    clearReceiptLogoPreview()
    const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
    receiptLogoPreviewRef.current = previewUrl
    setReceiptLogoPreviewUrl(previewUrl)
    setReceiptFile(file)
    setRemoveReceiptLogo(false)
    setReceiptError('')
  }

  function clearReceiptLogo() {
    const hasCurrentLogo = Boolean(receiptConfiguration?.logoUrl || receiptConfiguration?.logoKey)
    clearReceiptLogoPreview()
    setReceiptDraft((current) => ({ ...current, logoKey: hasCurrentLogo ? null : current.logoKey }))
    setRemoveReceiptLogo(hasCurrentLogo)
    setReceiptError('')
  }

  function restoreReceiptLogo() {
    setReceiptDraft((current) => ({ ...current, logoKey: receiptConfiguration?.logoKey ?? current.logoKey }))
    setRemoveReceiptLogo(false)
    setReceiptError('')
  }

  const displayedReceiptLogoUrl = receiptLogoPreviewUrl ?? (removeReceiptLogo ? null : receiptConfiguration?.logoUrl ?? null)
  const hasCurrentReceiptLogo = Boolean(receiptConfiguration?.logoUrl || receiptConfiguration?.logoKey)
  const receiptPreviewConfiguration = receiptConfiguration ? { ...receiptConfiguration, ...receiptDraft, logoUrl: displayedReceiptLogoUrl } : undefined

  return <section aria-label="Módulo Configuración" className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6">
    <header className="ops-module-header flex shrink-0 flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Configuración</p>
        <h1 className="mt-1 text-xl font-black tracking-tight text-white">Reglas operativas</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Administra reglas globales de operación y el contenido visible del comprobante de venta.</p>
      </div>
      <InfoButton id="configuration-info" label="Información de Configuración" open={infoOpen} onToggle={() => setInfoOpen((current) => !current)} className="self-end sm:self-auto">Los valores son globales, tienen propietario y muestran cuándo comenzaron a surtir efecto. Las ventas y reservas siguen siendo validadas por el servidor.</InfoButton>
    </header>

    <div className="ops-scroll-region min-h-0 min-w-0 pr-1" aria-busy={loading || undefined}>
      {loading && !configuration && <ConfigurationLoadingState />}
      {!loading && !configuration && loadError && <div role="alert" className="ops-state ops-state-error mt-4 w-full max-w-xl"><p className="font-semibold">{loadError}</p>{!unauthorized && <ResponsiveActionButton type="button" label="Reintentar" icon="refresh" onClick={() => void load()} className="mt-4" />}</div>}
      {configuration && <>
        {loading && <p role="status" className="ops-state ops-state-loading mt-4">Actualizando configuración…</p>}
        {loadError && <div role="alert" className="ops-state ops-state-error mt-4"><p className="font-semibold">{loadError}</p><ResponsiveActionButton type="button" label="Reintentar" icon="refresh" onClick={() => void load()} className="mt-4" /></div>}
        {notice && <div role="status" className="ops-state ops-state-notice mt-4"><p>{notice}</p></div>}
        <div data-testid="configuration-settings-grid" className="mt-5 grid w-full max-w-6xl grid-cols-1 gap-4 pb-6 md:grid-cols-2 xl:grid-cols-3">
          {definitions.map((definition) => {
            const setting = configuration.find((candidate) => candidate.key === definition.key)
            return setting ? <ConfigurationField key={definition.key} definition={definition} setting={setting} draft={drafts[definition.key]} error={fieldErrors[definition.key]} busy={saving === definition.key} disabled={loading || saving !== null || savingReportTimezone || savingReceipt} infoOpen={cardInfoOpen === definition.key} onInfoToggle={() => setCardInfoOpen((current) => current === definition.key ? null : definition.key)} onChange={(value) => { setDrafts((current) => ({ ...current, [definition.key]: value })); setFieldErrors((current) => ({ ...current, [definition.key]: undefined })); setNotice('') }} onSave={() => void save(definition.key)} /> : null
          })}
          {reportTimezoneConfiguration && <ReportTimezoneField configuration={reportTimezoneConfiguration} draft={reportTimezoneDraft} error={reportTimezoneError} busy={savingReportTimezone} disabled={loading || saving !== null || savingReportTimezone || savingReceipt} infoOpen={cardInfoOpen === 'report-timezone'} onInfoToggle={() => setCardInfoOpen((current) => current === 'report-timezone' ? null : 'report-timezone')} onChange={(value) => { setReportTimezoneDraft(value as ReportTimezone); setReportTimezoneError(''); setNotice('') }} onSave={() => void saveReportTimezone()} />}
        </div>
        {receiptConfiguration && <form noValidate aria-label="Configuración del comprobante de venta" data-testid="sales-receipt-configuration" onSubmit={(event) => { event.preventDefault(); void saveReceipt() }} className="ops-panel-frame mt-2 grid gap-5 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-1">
                <h2 className="min-w-0 text-lg font-black text-white">Comprobante de venta</h2>
                <InfoButton id="configuration-info-sales-receipt" label="Información sobre Comprobante de venta" open={cardInfoOpen === 'sales-receipt'} onToggle={() => setCardInfoOpen((current) => current === 'sales-receipt' ? null : 'sales-receipt')}>Define el logo y los datos que aparecerán en los tickets del Punto de venta.</InfoButton>
              </div>
              <span className="shrink-0 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Global</span>
            </div>
            <dl className="mt-4 grid gap-2 border-t border-slate-800 pt-3 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-500">Última actualización</dt><dd className="mt-1 font-bold text-slate-200"><time dateTime={receiptConfiguration.updatedAt}>{formatConfigurationTimestamp(receiptConfiguration.updatedAt)}</time></dd></div>
            </dl>
          </div>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.85fr)]">
            <div className="grid gap-4">
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-slate-200">Logo del comprobante</legend>
                <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                  <div className="flex h-28 w-32 items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-900 sm:h-40 sm:w-40">
                    {displayedReceiptLogoUrl ? <img src={displayedReceiptLogoUrl} alt="Vista previa del logo del comprobante" className="h-full w-full object-contain p-3" /> : <div role="img" aria-label="Sin logo configurado" className="flex h-full w-full items-center justify-center border border-dashed border-slate-700 text-xs font-semibold text-slate-500">Sin logo configurado</div>}
                  </div>
                  <div className="grid min-w-0 content-start gap-3">
                    <p className="text-sm leading-relaxed text-slate-400">{receiptFile ? `Lista para guardar: ${receiptFile.name}` : receiptConfiguration.logoUrl && !removeReceiptLogo ? 'Se muestra el logo actual del comprobante.' : 'Agrega un logo para identificar tus comprobantes de venta.'}</p>
                    <div data-testid="sales-receipt-logo-actions" className="flex flex-row flex-nowrap items-center gap-2">
                      <input id={receiptLogoInputId} data-testid={receiptLogoInputId} type="file" accept={SALES_RECEIPT_LOGO_MIME_TYPES.join(',')} disabled={loading || savingReceipt || saving !== null} aria-invalid={Boolean(receiptError)} aria-describedby={`${receiptLogoHelpId}${receiptError ? ` ${receiptLogoErrorId}` : ''}`} onChange={selectReceiptLogo} className="sr-only" />
                      <label htmlFor={receiptLogoInputId} title={receiptFile || (hasCurrentReceiptLogo && !removeReceiptLogo) ? 'Reemplazar logo' : 'Seleccionar logo'} className="ops-icon-button ops-focus shrink-0"><Icon name={receiptFile || (hasCurrentReceiptLogo && !removeReceiptLogo) ? 'refresh' : 'plus'} className="h-4 w-4 shrink-0" /><span className="sr-only">{receiptFile || (hasCurrentReceiptLogo && !removeReceiptLogo) ? 'Reemplazar logo' : 'Seleccionar logo'}</span></label>
                      {(receiptFile || (hasCurrentReceiptLogo && !removeReceiptLogo)) && <ResponsiveActionButton type="button" label="Quitar logo" icon="trash" onClick={clearReceiptLogo} disabled={loading || savingReceipt || saving !== null} className="shrink-0" />}
                      {receiptConfiguration.logoKey && removeReceiptLogo && !receiptFile && <ResponsiveActionButton type="button" label="Restaurar logo actual" icon="refresh" onClick={restoreReceiptLogo} disabled={loading || savingReceipt || saving !== null} className="shrink-0" />}
                    </div>
                  </div>
                </div>
                {removeReceiptLogo && !receiptFile && <p className="text-xs font-semibold text-amber-300">El logo actual se quitará al guardar.</p>}
                {receiptError && <span id={receiptLogoErrorId} role="alert" className="ops-field-error">{receiptError}</span>}
                <span id={receiptLogoHelpId} className="text-xs leading-relaxed text-slate-500">JPG, PNG o WebP · máximo 2 MB · se almacena en un bucket privado.</span>
              </fieldset>
              <fieldset className="grid gap-3">
                <legend className="text-sm font-semibold text-slate-200">Datos de la empresa</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label htmlFor="sales-receipt-company-phone" className="ops-field-label grid gap-2 text-sm font-semibold text-slate-200">
                    Móvil de la empresa
                    <input id="sales-receipt-company-phone" data-testid="sales-receipt-company-phone" type="tel" maxLength={SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH} value={receiptDraft.companyPhone ?? ''} disabled={loading || savingReceipt || saving !== null} aria-invalid={Boolean(receiptError)} aria-describedby={`${receiptContactHelpId}${receiptError ? ` ${receiptLogoErrorId}` : ''}`} onChange={(event) => { setReceiptDraft((current) => ({ ...current, companyPhone: event.target.value })); setReceiptError(''); setNotice('') }} className="ops-control min-h-11 px-3" />
                  </label>
                  <label htmlFor="sales-receipt-company-email" className="ops-field-label grid gap-2 text-sm font-semibold text-slate-200">
                    Correo de la empresa
                    <input id="sales-receipt-company-email" data-testid="sales-receipt-company-email" type="email" maxLength={SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH} value={receiptDraft.companyEmail ?? ''} disabled={loading || savingReceipt || saving !== null} aria-invalid={Boolean(receiptError)} aria-describedby={`${receiptContactHelpId}${receiptError ? ` ${receiptLogoErrorId}` : ''}`} onChange={(event) => { setReceiptDraft((current) => ({ ...current, companyEmail: event.target.value })); setReceiptError(''); setNotice('') }} className="ops-control min-h-11 px-3" />
                  </label>
                   <p id={receiptContactHelpId} className="text-xs font-normal leading-relaxed text-slate-500 sm:col-span-2">Campos opcionales · móvil máximo {SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH} caracteres · correo máximo {SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH}.</p>
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold text-slate-200">Elementos visibles en el ticket</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                   {([{ key: 'showLogo', label: 'Mostrar logo' }, { key: 'showBranch', label: 'Mostrar sucursal' }, { key: 'showCashier', label: 'Mostrar cajero' }, { key: 'showCustomer', label: 'Mostrar cliente' }, { key: 'showPaymentMethod', label: 'Mostrar forma de pago' }, { key: 'showCompanyPhone', label: 'Mostrar móvil de la empresa' }, { key: 'showCompanyEmail', label: 'Mostrar correo de la empresa' }, { key: 'showCustomerUrl', label: 'Mostrar URL para clientes' }] as const).map(({ key, label }) => <label key={key} className="ops-choice min-h-11"><input type="checkbox" checked={receiptDraft[key] ?? true} disabled={loading || savingReceipt || saving !== null} onChange={(event) => { setReceiptDraft((current) => ({ ...current, [key]: event.target.checked })); setReceiptError(''); setNotice('') }} />{label}</label>)}
                   <p className="text-xs font-normal leading-relaxed text-slate-500 sm:col-span-2">La URL para clientes se toma automáticamente del host actual de la aplicación; no es editable.</p>
                </div>
              </fieldset>
            </div>
            <div data-testid="sales-receipt-live-preview" className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Vista previa en vivo</p><p className="mt-1 text-sm leading-relaxed text-slate-400">Se actualiza con los elementos visibles seleccionados.</p></div>
                <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200">Editable</span>
              </div>
              <PosTicketPreview receipt={receiptPreviewReceipt} fallbackLines={receiptPreviewLines} ticketImageUrl={displayedReceiptLogoUrl} receiptConfiguration={receiptPreviewConfiguration} allowBlobImageUrl />
            </div>
          </div>
          <ResponsiveActionButton type="submit" label="Guardar comprobante" icon="save" loading={savingReceipt} loadingLabel="Guardando comprobante…" disabled={loading || savingReceipt || saving !== null || savingReportTimezone} className="w-full sm:w-fit" />
        </form>}
      </>}
    </div>
  </section>
}
