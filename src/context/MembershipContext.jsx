import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { getStudentMembership, getCollegeByAdmin } from '../lib/firebase.js';

const MembershipContext = createContext(null);

export function MembershipProvider({ children }) {
  const { user } = useAuth();
  const [membership, setMembership] = useState(null); // { collegeId, status, rollNumber, ... }
  const [adminCollege, setAdminCollege] = useState(null); // college object if user is admin
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!user) {
      setMembership(null);
      setAdminCollege(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Check if user is a college admin
      const college = await getCollegeByAdmin(user.uid);
      setAdminCollege(college || null);

      // Check student membership
      const memberships = await getStudentMembership(user.uid);
      const accepted = memberships.find(m => m.status === 'accepted');
      const pending = memberships.find(m => m.status === 'pending');
      setMembership(accepted || pending || null);
    } catch (err) {
      console.error('Membership check error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [user]);

  return <MembershipContext.Provider value={{ membership, adminCollege, loading, refresh }}>
    {children}
  </MembershipContext.Provider>;
}

export function useMembership() {
  const ctx = useContext(MembershipContext);
  if (!ctx) throw new Error('useMembership must be used within MembershipProvider');
  return ctx;
}
