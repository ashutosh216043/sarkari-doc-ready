import { AlertCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { COMMON_REJECTION_REASONS, FAQ_ITEMS } from '../data/examPresets';

export function SeoHelpSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-12">
      {/* Common Rejection Reasons Checklist */}
      <section
        id="rejection-guide"
        aria-labelledby="rejection-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8"
      >
        <div className="max-w-2xl">
          <h2
            id="rejection-heading"
            className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900"
            style={{ textWrap: 'balance' }}
          >
            Common Photo &amp; Signature Rejection Reasons
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600">
            Avoid form cancellation in SSC, IBPS, UPSC, and RRB recruitment portals by checking these six common pitfalls before submitting.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {COMMON_REJECTION_REASONS.map((item, idx) => (
            <div
              key={item.title}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-blue-700"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900">
                    0{idx + 1}. {item.title}
                  </h3>
                  <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-600">
                    {item.detail}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Accordion FAQ Section */}
      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8"
      >
        <div className="max-w-2xl">
          <h2
            id="faq-heading"
            className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900"
            style={{ textWrap: 'balance' }}
          >
            Frequently Asked Questions
          </h2>
          <p className="mt-2 text-sm sm:text-base text-slate-600">
            Step-by-step guidance for resizing photographs, signatures, thumb impressions, and declarations for Indian competitive exams.
          </p>
        </div>

        <div className="mt-6 divide-y divide-slate-200 border-t border-b border-slate-200">
          {FAQ_ITEMS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.question}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex min-h-[52px] w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-blue-800 cursor-pointer"
                >
                  <span className="font-display text-sm sm:text-base font-semibold text-slate-900">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-150 ${
                      isOpen ? 'rotate-180 text-blue-700' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="pb-4 pr-8 text-sm leading-relaxed text-slate-600">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
