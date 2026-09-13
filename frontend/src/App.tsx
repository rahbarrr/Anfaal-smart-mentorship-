import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import { AdminLayout } from './layouts/AdminLayout';
import { MentorLayout } from './layouts/MentorLayout';
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

function getStoredUser() {
  const rawUser = localStorage.getItem('anfaal-user');
  try {
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
}

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: 'ADMIN' | 'MENTOR' }) {
  const user = getStoredUser();
  const token = localStorage.getItem('anfaal-token');

  if (!token || !user) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/mentor'} replace />;
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
