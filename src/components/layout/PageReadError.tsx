import ResourceError from '../ui/ResourceError';
import Layout from './Layout';

export default function PageReadError({ title, onRetry }: { title: string; onRetry: () => unknown }) {
  return <Layout title={title}><ResourceError onRetry={onRetry} /></Layout>;
}
