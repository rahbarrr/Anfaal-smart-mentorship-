import { Suspense } from 'react';
import LoginPage from './login/page';

export default function RootPage() {
  return (
    <Suspense fallback={<div className="page-loading" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading Anfaal...</div>}>
      <LoginPage />
    </Suspense>
  );
}
