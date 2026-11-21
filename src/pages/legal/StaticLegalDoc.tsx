/**
 * Server-rendered copy of a company/legal page so search engines and first paint
 * get the full text. Same layout and classes as LegalDocPage, but plain links
 * (no app router) — the full app takes over once it has loaded.
 */
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { LEGAL_DOCS, type LegalSlug } from "./documents";
import "@/styles/ceyo.css";
import "@/styles/company-pages.css";

export function StaticLegalDoc({ slug }: { slug: LegalSlug }) {
  const doc = LEGAL_DOCS[slug];
  return (
    <div className="agent-hub ceyo-page ceyo-company" data-no-translate>
      <header className="ceyo-top">
        <a className="gx-round" aria-label="Ceyo home" href="/">‹</a>
        <h1>Ceyo · Megsy LLC</h1>
        <span className="ceyo-top-action" />
      </header>
      <div className="ceyo-scroll company-scroll">
        <div className="company-layout">
          <nav className="company-nav" aria-label="Company & legal">
            <p className="company-label">COMPANY & LEGAL</p>
            {(Object.keys(LEGAL_DOCS) as LegalSlug[]).map((key) => (
              <a key={key} className="company-link" href={`/${key}`} aria-current={key === slug ? "page" : undefined}>{LEGAL_DOCS[key].title}</a>
            ))}
          </nav>
          <main>
            <article className="cx-md" data-no-translate>
              <Markdown remarkPlugins={[remarkGfm]}>{doc.source}</Markdown>
            </article>
            <footer className="company-footer"><span>© 2026 Megsy LLC</span><a href="mailto:CEO@megsyai.com">CEO@megsyai.com</a></footer>
          </main>
        </div>
      </div>
    </div>
  );
}

export default StaticLegalDoc;
