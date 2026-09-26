import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { getSession } from './lib/session';
import type { Role } from './lib/types';
import { Landing } from './pages/Landing';
import { Activity } from './pages/student/Activity';
import { Explore } from './pages/student/Explore';
import { FundDetail } from './pages/student/FundDetail';
import { StudentEntry } from './pages/student/StudentEntry';
import { StudentHome } from './pages/student/StudentHome';
import { ClassDashboard } from './pages/teacher/ClassDashboard';
import { TeacherAuth } from './pages/teacher/TeacherAuth';
import { TeacherHome } from './pages/teacher/TeacherHome';
import { TeacherStudent } from './pages/teacher/TeacherStudent';

/** UI-level routing only. Real access control is enforced by the API on every request. */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = getSession();
  if (!session || session.role !== role) return <Navigate to={role === 'TEACHER' ? '/teacher/login' : '/join'} replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/join" element={<StudentEntry />} />
      <Route path="/teacher/login" element={<TeacherAuth />} />
      <Route path="/teacher" element={<RequireRole role="TEACHER"><TeacherHome /></RequireRole>} />
      <Route path="/teacher/classes/:id" element={<RequireRole role="TEACHER"><ClassDashboard /></RequireRole>} />
      <Route path="/teacher/classes/:id/students/:studentId" element={<RequireRole role="TEACHER"><TeacherStudent /></RequireRole>} />
      <Route path="/student" element={<RequireRole role="STUDENT"><StudentHome /></RequireRole>} />
      <Route path="/student/funds" element={<RequireRole role="STUDENT"><Explore /></RequireRole>} />
      <Route path="/student/funds/:code" element={<RequireRole role="STUDENT"><FundDetail /></RequireRole>} />
      <Route path="/student/activity" element={<RequireRole role="STUDENT"><Activity /></RequireRole>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
