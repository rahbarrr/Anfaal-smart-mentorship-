import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AUTH_EXPIRED_EVENT, clearStoredAuth } from './lib/api';
import { lazy, Suspense } from 'react';
import './App.css';
import { AdminLayout } from './layouts/AdminLayout';
import { MentorLayout } from './layouts/MentorLayout';
import { MenteeLayout } from './layouts/MenteeLayout';
import { PwaPrompts } from './pwa/PwaPrompts';
import { OfflineBanner } from './components/OfflineBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const MentorDashboardPage = lazy(() => import('./pages/MentorDashboardPage').then((m) => ({ default: m.MentorDashboardPage })));
const MenteeManagementPage = lazy(() => import('./pages/MenteeManagementPage').then((m) => ({ default: m.MenteeManagementPage })));
const MentorManagementPage = lazy(() => import('./pages/MentorManagementPage').then((m) => ({ default: m.MentorManagementPage })));
const UploadCallPage = lazy(() => import('./pages/UploadCallPage').then((m) => ({ default: m.UploadCallPage })));
const MyCallsPage = lazy(() => import('./pages/MyCallsPage').then((m) => ({ default: m.MyCallsPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const AdminReviewPage = lazy(() => import('./pages/AdminReviewPage').then((m) => ({ default: m.AdminReviewPage })));
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminMentorshipPage = lazy(() => import('./pages/AdminMentorshipPage').then((m) => ({ default: m.AdminMentorshipPage })));
const AdminAssignmentsPage = lazy(() => import('./pages/AdminAssignmentsPage').then((m) => ({ default: m.AdminAssignmentsPage })));
const AdminReportsPage = lazy(() => import('./pages/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })));
const MyMenteesPage = lazy(() => import('./pages/MyMenteesPage').then((m) => ({ default: m.MyMenteesPage })));
const MenteeProfilePage = lazy(() => import('./pages/MenteeProfilePage').then((m) => ({ default: m.MenteeProfilePage })));
const MentorProfilePage = lazy(() => import('./pages/MentorProfilePage').then((m) => ({ default: m.MentorProfilePage })));
const MenteeDashboardPage = lazy(() => import('./pages/MenteeDashboardPage').then((m) => ({ default: m.MenteeDashboardPage })));
const DailyPerformanceFormPage = lazy(() => import('./pages/DailyPerformanceFormPage').then((m) => ({ default: m.DailyPerformanceFormPage })));
const MenteePerformanceHistoryPage = lazy(() => import('./pages/MenteePerformanceHistoryPage').then((m) => ({ default: m.MenteePerformanceHistoryPage })));
const AdminPerformanceAnalyticsPage = lazy(() => import('./pages/AdminPerformanceAnalyticsPage').then((m) => ({ default: m.AdminPerformanceAnalyticsPage })));
const BulkImportPage = lazy(() => import('./pages/BulkImportPage').then((m) => ({ default: m.BulkImportPage })));
const CallIntelligencePage = lazy(() => import('./pages/CallIntelligencePage').then((m) => ({ default: m.CallIntelligencePage })));
const AdminCallsPage = lazy(() => import('./pages/AdminCallsPage').then((m) => ({ default: m.AdminCallsPage })));
const MentorRegistrationPage = lazy(() => import('./pages/MentorRegistrationPage').then((m) => ({ default: m.MentorRegistrationPage })));
const MentorPendingApprovalPage = lazy(() => import('./pages/MentorPendingApprovalPage').then((m) => ({ default: m.MentorPendingApprovalPage })));
const MentorRejectedPage = lazy(() => import('./pages/MentorRejectedPage').then((m) => ({ default: m.MentorRejectedPage })));

function getStoredUser() {
  const rawUser = localStorage.getItem('anfaal-user');
  try {
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
}

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: 'ADMIN' | 'MENTOR' | 'MENTEE' }) {
  const user = getStoredUser();
  const token = localStorage.getItem('anfaal-token');

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    const target = user.role === 'ADMIN' ? '/admin' : user.role === 'MENTEE' ? '/mentee' : '/mentor';
    return <Navigate to={target} replace />;
  }

  if (requiredRole === 'MENTOR' && user.role === 'MENTOR') {
    if (user.mentorApprovalStatus === 'PENDING') {
      return <Navigate to="/mentor/pending" replace />;
    }
    if (user.mentorApprovalStatus === 'REJECTED') {
      return <Navigate to="/mentor/rejected" replace />;
    }
  }

  return <>{children}</>;
}

function AuthSessionBoundary() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleExpiredSession = () => {
      clearStoredAuth();
      navigate('/', { replace: true, state: { sessionExpired: true } });
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleExpiredSession);
  }, [navigate]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AuthSessionBoundary />
      <ErrorBoundary>
        <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/mentor/register" element={<MentorRegistrationPage />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="ADMIN">
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              <Route path="mentorships" element={<AdminMentorshipPage />} />
              <Route path="assignments" element={<AdminAssignmentsPage />} />
              <Route path="bulk-import" element={<BulkImportPage />} />
              <Route path="analytics" element={<AdminAnalyticsPage />} />
              <Route path="reviews" element={<AdminReviewPage />} />
              <Route path="mentors" element={<MentorManagementPage />} />
              <Route path="mentees" element={<MenteeManagementPage />} />
              <Route path="mentees/:menteeId" element={<MenteeProfilePage />} />
              <Route path="performance" element={<AdminPerformanceAnalyticsPage />} />
              <Route path="reports" element={<AdminReportsPage />} />
              <Route path="calls" element={<AdminCallsPage />} />
              <Route path="calls/:callId" element={<CallIntelligencePage />} />
            </Route>
            <Route path="/mentor/pending" element={<ProtectedRoute requiredRole="MENTOR"><MentorPendingApprovalPage /></ProtectedRoute>} />
            <Route path="/mentor/rejected" element={<ProtectedRoute requiredRole="MENTOR"><MentorRejectedPage /></ProtectedRoute>} />
            <Route
              path="/mentor"
              element={
                <ProtectedRoute requiredRole="MENTOR">
                  <MentorLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<MentorDashboardPage />} />
              <Route path="upload" element={<UploadCallPage />} />
              <Route path="calls" element={<MyCallsPage />} />
              <Route path="calls/:callId" element={<CallIntelligencePage />} />
              <Route path="mentees" element={<MyMenteesPage />} />
              <Route path="mentees/:menteeId" element={<MenteeProfilePage />} />
              <Route path="profile" element={<MentorProfilePage />} />
            </Route>
            <Route
              path="/mentee"
              element={
                <ProtectedRoute requiredRole="MENTEE">
                  <MenteeLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<MenteeDashboardPage />} />
              <Route path="daily" element={<DailyPerformanceFormPage />} />
              <Route path="history" element={<MenteePerformanceHistoryPage />} />
            </Route>
            <Route
              path="/daily-performance"
              element={
                <ProtectedRoute requiredRole="MENTEE">
                  <MenteeLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DailyPerformanceFormPage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <OfflineBanner />
      <PwaPrompts />
    </BrowserRouter>
  );
}

export default App;
