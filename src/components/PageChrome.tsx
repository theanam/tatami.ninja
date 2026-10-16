import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ISSUES_URL, REPO_URL } from '../links';
import { GithubMark, Icon, Logo } from './Icon';

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="brand" aria-label="tatami.ninja home">
      <Logo size={28} />
      <span className="brand-name">tatami.ninja</span>
    </Link>
  );
}

export function PageHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="page-header">
      <div className="brand-row">
        <Brand />
        <span className="oss-pill">Open source</span>
      </div>
      <div className="spacer" />
      {children}
      <nav aria-label="Project links" className="page-links">
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="page-link">
          <GithubMark size={15} />
          Source code
        </a>
        <Link to="/help" className="page-link">
          <Icon name="help" small />
          Help
        </Link>
        <Link to="/about" className="page-link">
          <Icon name="info" small />
          About
        </Link>
      </nav>
    </header>
  );
}

export function PageFooter() {
  return (
    <footer className="page-footer">
      <span>tatami.ninja is free and open source.</span>
      <a href={REPO_URL} target="_blank" rel="noreferrer">
        Contribute
      </a>
      <a href={ISSUES_URL} target="_blank" rel="noreferrer">
        Report a bug
      </a>
      <div className="spacer" />
      <span>Your designs live in this browser. Export a .json backup from any project.</span>
    </footer>
  );
}
