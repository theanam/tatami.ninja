import { Link } from 'react-router-dom';
import { PageFooter, PageHeader } from '../components/PageChrome';

export function NotFound({ message = 'This page does not exist.' }: { message?: string }) {
  return (
    <div className="page-shell">
      <PageHeader />
      <main className="page-main info">
        <h1>Not found</h1>
        <p className="lead">{message}</p>
        <p>
          <Link to="/" className="btn page">
            Back to your designs
          </Link>
        </p>
      </main>
      <PageFooter />
    </div>
  );
}
