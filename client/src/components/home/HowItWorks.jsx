import { Link } from 'react-router-dom'

const STEPS = [
  {
    number: 1,
    title: 'Discover',
    description: 'Explore destinations and find travel inspiration.',
  },
  {
    number: 2,
    title: 'Connect',
    description: 'Find fellow travellers and engage with the community.',
  },
  {
    number: 3,
    title: 'Create or Join',
    description: 'Create your own trip or request to join an existing one.',
  },
  {
    number: 4,
    title: 'Travel',
    description: 'Experience new places and share your memories.',
  },
]

export default function HowItWorks() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
          How it works
        </h2>
        <div className="flex flex-col lg:flex-row gap-12 items-start lg:items-center justify-between">
          {STEPS.map((step) => (
            <div key={step.number} className="flex flex-col items-center text-center lg:text-left lg:max-w-[220px]">
              <span className="w-10 h-10 rounded-full bg-tafera-primary text-white flex items-center justify-center font-heading font-bold text-lg mb-4">
                {step.number}
              </span>
              <h3 className="text-lg font-heading font-bold text-tafera-text mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-tafera-text-muted leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <p className="text-tafera-text-muted mb-4">
            Ready to start? Create your account and begin your journey.
          </p>
          <Link to="/register">
            <span className="inline-block font-medium text-tafera-primary hover:underline">
              Sign up →
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
