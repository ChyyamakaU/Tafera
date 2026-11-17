import { Link } from 'react-router-dom'

export default function TrustAndSafety() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-10">
          Trust and safety
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Concept 1 */}
          <div className="p-6 rounded-md border border-tafera-border bg-tafera-surface">
            <h3 className="font-heading font-bold text-lg text-tafera-text mb-3">
              Identity Verified
            </h3>
            <p className="text-sm text-tafera-text-muted leading-relaxed">
              Travellers can verify their identity to build trust with the
              community. This feature is being rolled out progressively.
            </p>
          </div>
          {/* Concept 2 */}
          <div className="p-6 rounded-md border border-tafera-border bg-tafera-surface">
            <h3 className="font-heading font-bold text-lg text-tafera-text mb-3">
              Verified Organiser
            </h3>
            <p className="text-sm text-tafera-text-muted leading-relaxed">
              Trip organisers who complete verification receive a badge so
              participants know who they're travelling with. Coming soon.
            </p>
          </div>
          {/* Concept 3 */}
          <div className="p-6 rounded-md border border-tafera-border bg-tafera-surface">
            <h3 className="font-heading font-bold text-lg text-tafera-text mb-3">
              SOS support
            </h3>
            <p className="text-sm text-tafera-text-muted leading-relaxed">
              Emergency support for travellers on the ground is planned as part
              of our safety roadmap. Not yet available.
            </p>
          </div>
        </div>
        <div className="mt-12 text-center">
          <p className="text-tafera-text-muted mb-4">
            Learn more about our approach to safety and the safeguards we're
            building.
          </p>
          <Link to="/trust-and-safety">
            <span className="inline-block font-medium text-tafera-primary hover:underline">
              Read about Trust and Safety →
            </span>
          </Link>
        </div>
        <p className="mt-8 text-[10px] text-tafera-text-muted text-center max-w-xl mx-auto leading-relaxed">
          Some safeguards described here are planned features. Not all are
          currently operational. We'll update this page as each is implemented.
        </p>
      </div>
    </section>
  )
}
