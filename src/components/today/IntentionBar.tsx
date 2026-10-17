import { Sun } from 'lucide-react'

export function IntentionBar({
  value,
  onChange,
  onBlur,
}: {
  value: string
  onChange: (value: string) => void
  onBlur: () => void
}) {
  return (
    <section
      aria-label="Daily intention"
      className="mb-7 flex items-center gap-5 rounded-[14px] bg-nav px-7 py-6"
    >
      <Sun className="size-8 shrink-0 text-[#7c7c7c]" strokeWidth={1.3} />
      <div className="min-w-0 flex-1">
        <label htmlFor="intention" className="mb-2 block text-xs text-[#6a6a6a]">
          What matters today?
        </label>
        <input
          id="intention"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          placeholder="What matters today?"
          className="w-full border-0 bg-transparent p-0 text-lg font-medium tracking-[-0.4px] text-[#434343] outline-offset-[6px]"
        />
      </div>
      <span className="text-xs text-[#6e6e6e]">Click to edit</span>
    </section>
  )
}
