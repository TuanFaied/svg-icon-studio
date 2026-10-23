'use client';

import dynamic from 'next/dynamic';

// The editor is canvas/IndexedDB driven, so it renders client-side only.
const App = dynamic(() => import('@/components/App'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-[13px] text-muted" role="status">
      Loading SVG Icon Studio…
    </div>
  ),
});

export default function Page() {
  return <App />;
}
