export default function ComingSoon() {
  return (
    <section className="px-0 md:px-15 py-12 bg-tafera-surface border-t border-tafera-border">
      <div className="px-[15px]">
        <h2 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl text-center mb-12">
          Coming soon
        </h2>
        <p className="text-xs text-tafera-text-muted text-center max-w-xl mx-auto mb-10 leading-relaxed">
          These features are planned for Tafera. They are not yet available.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <li className="p-4 rounded-md border border-tafera-border/50 bg-tafera-bg/50">
            <h3 className="font-heading font-bold text-sm text-tafera-text mb-2">
              Travel savings
            </h3>
            <p className="text-[11px] text-tafera-text-muted leading-relaxed">
              Set aside money for your next trip directly in Tafera.
            </p>
          </li>
          <li className="p-4 rounded-md border border-tafera-border/50 bg-tafera-bg/50">
            <h3 className="font-heading font-bold text-sm text-tafera-text mb-2">
              Local guides
            </h3>
            <p className="text-[11px] text-tafera-text-muted leading-relaxed">
              Connect with local guides who know their destination inside out.
            </p>
          </li>
          <li className="p-4 rounded-md border border-tafera-border/50 bg-tafera-bg/50">
            <h3 className="font-heading font-bold text-sm text-tafera-text mb-2">
              Experiences
            </h3>
            <p className="text-[11px] text-tafera-text-muted leading-relaxed">
              Book experiences and activities curated by locals.
            </p>
          </li>
        </ul>
        <p className="mt-8 text-[10px] text-tafera-text-muted text-center max-w-xl mx-auto leading-relaxed">
          These are planned capabilities. No waitlist or registration is
          available yet. Check back for updates.
        </p>
      </div>
    </section>
  )
}
