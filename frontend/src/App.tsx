import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AdminLayout } from './layouts/AdminLayout';
import { MentorLayout } from './layouts/MentorLayout';
import { MenteeLayout } from './layouts/MenteeLayout';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { MentorDashboardPage } from './pages/MentorDashboardPage';
import { MenteeManagementPage } from './pages/MenteeManagementPage';
import { MentorManagementPage } from './pages/MentorManagementPage';
import { UploadCallPage } from './pages/UploadCallPage';
import { MyCallsPage } from './pages/MyCallsPage';
import { LoginPage } from './pages/LoginPage';
import { AdminReviewPage } from './pages/AdminReviewPage';
import { AdminAnalyticsPage } from './pages/AdminAnalyticsPage';
import { AdminMentorshipPage } from './pages/AdminMentorshipPage';
import { AdminAssignmentsPage } from './pages/AdminAssignmentsPage';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { MyMenteesPage } from './pages/MyMenteesPage';
import { MenteeProfilePage } from './pages/MenteeProfilePage';
import { MentorProfilePage } from './pages/MentorProfilePage';
import { MenteeDashboardPage } from './pages/MenteeDashboardPage';
import { DailyPerformanceFormPage } from './pages/DailyPerformanceFormPage';
import { MenteePerformanceHistoryPage } from './pages/MenteePerformanceHistoryPage';
import { AdminPerformanceAnalyticsPage } from './pages/AdminPerformanceAnalyticsPage';

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

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
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
          <Route path="analytics" element={<AdminAnalyticsPage />} />
          <Route path="reviews" element={<AdminReviewPage />} />
          <Route path="mentors" element={<MentorManagementPage />} />
          <Route path="mentees" element={<MenteeManagementPage />} />
          <Route path="performance" element={<AdminPerformanceAnalyticsPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
        </Route>
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
    </BrowserRouter>
  );
}

export default App;
