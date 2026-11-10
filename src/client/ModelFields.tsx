import type { Selection } from '../catalog.ts'
import { choiceFor, effortOf, projectModels, selectChoice, sourceName } from '../catalog.ts'
import type { ProviderRow } from '../wire.ts'
export function ModelFields({
  providers,
  value,
  onChange,
  disabled = false,
}: {
  providers: ProviderRow[]
  value: Selection
  onChange: (next: Selection) => void
  disabled?: boolean
}) {
  const provider = providers.find((p) => p.id === value.provider),
    rows = provider ? projectModels(provider) : [],
    row = provider ? choiceFor(provider, value) : undefined
  return (
    <fieldset className="dmc-fields" disabled={disabled}>
      <label className="dmc-field">
        Source
        <select
          aria-label="Source"
          value={value.provider}
          onChange={(e) => {
            const p = providers.find((p) => p.id === e.target.value)!
            const match = projectModels(p).find((r) => r.id === row?.id) ?? projectModels(p)[0]
            if (match) onChange(selectChoice(p.id, match, row ? effortOf(row, value) : undefined))
          }}
        >
          {!provider ? <option value={value.provider}>{value.provider} (Saved)</option> : null}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {sourceName(p)}
            </option>
          ))}
        </select>
      </label>
      <label className="dmc-field">
        Model
        <select
          aria-label="Model"
          value={row?.id ?? value.model}
          onChange={(e) => {
            const r = rows.find((r) => r.id === e.target.value)!
            onChange(selectChoice(value.provider, r))
          }}
        >
          {!row ? <option value={value.model}>{value.model} (Not in catalog)</option> : null}
          {rows.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.core ? '' : ' · More'}
            </option>
          ))}
        </select>
      </label>
      <label className="dmc-field">
        Reasoning effort
        <select
          aria-label="Reasoning effort"
          disabled={!row?.efforts.length}
          value={row ? effortOf(row, value) : (value.reasoningEffort ?? '')}
          onChange={(e) => {
            if (row) onChange(selectChoice(value.provider, row, e.target.value))
          }}
        >
          {!row?.efforts.length ? (
            <option value={value.reasoningEffort ?? ''}>Model default</option>
          ) : (
            <>
              {!row.suffixEfforts ? <option value="">Model default</option> : null}
              {row.efforts.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
    </fieldset>
  )
}
