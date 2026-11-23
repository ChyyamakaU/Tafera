import { useTheme } from '../../contexts/ThemeContext'

const PILLARS = [
  {
    label: '01',
    title: 'Real places, real context',
    copy: 'Every destination is shaped by people who have actually been there—no recycled brochure copy.',
  },
  {
    label: '02',
    title: 'Built for shared journeys',
    copy: 'From casual weekend escapes to multi-stop adventures, planning is calmer when everyone sees the same map.',
  },
  {
    label: '03',
    title: 'Memories that stay with you',
    copy: 'Capture your routes, photos, and notes in scrapbooks you can revisit or share with fellow travellers.',
  },
]

export default function WhyWeExist() {
  const { isDark } = useTheme()

  return (
    <section
      className="border-t border-tafera-border bg-tafera-bg py-16 sm:py-24 transition-colors"
      aria-labelledby="why-we-exist-heading"
    >
      <div className="app-container">
        <div
          className={`rounded-2xl border border-tafera-border p-8 sm:p-12 lg:p-14 transition-colors ${
            isDark
              ? 'bg-[#1C2424] text-[#F7F5EF]'
              : 'bg-[#F7F5EF] text-[#171B20]'
          }`}
        >
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full bg-[#DDFC84] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#171B20]">
              Why we exist
            </span>
            <h2
              id="why-we-exist-heading"
              className={`mt-5 font-heading text-3xl font-bold tracking-tight sm:text-4xl leading-tight ${
                isDark ? 'text-[#F7F5EF]' : 'text-[#171B20]'
              }`}
            >
              Because great trips shouldn’t stay trapped in saved folders and
              unfinished group chats.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-tafera-text-muted sm:text-lg">
              Tafera brings discovery, honest traveller stories, group trip
              coordination, and personal scrapbooks into one calm place—so
              exploring closer to home or farther afield actually happens.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 border-t border-tafera-border pt-8 md:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.label}>
                <span
                  className={`font-heading text-xs font-bold tracking-[0.18em] ${
                    isDark ? 'text-[#28E1AD]' : 'text-tafera-primary'
                  }`}
                >
                  {pillar.label}
                </span>
                <h3
                  className={`mt-2 font-heading text-lg font-bold ${
                    isDark ? 'text-[#F7F5EF]' : 'text-[#171B20]'
                  }`}
                >
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-tafera-text-muted">
                  {pillar.copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
