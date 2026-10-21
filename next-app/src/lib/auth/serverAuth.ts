import 'server-only';
import bcrypt from 'bcryptjs';
import { getFirebaseAdmin } from '../firebase/admin';

export interface AuthUserData {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MENTOR' | 'MENTEE';
  makid?: string;
  menteeId?: string;
  mentorApprovalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  status: 'active' | 'inactive';
}

export async function findUserByIdentifier(identifier: string): Promise<{ userDoc: AuthUserData & { passwordHash: string; uid: string } } | null> {
  const { adminDb } = getFirebaseAdmin();
  const input = identifier.trim();

  // 1. Email check
  if (input.includes('@')) {
    const emailSnap = await adminDb.collection('users').where('email', '==', input.toLowerCase()).limit(1).get();
    if (!emailSnap.empty) {
      const doc = emailSnap.docs[0];
      const data = doc.data();
      return {
        userDoc: {
          id: doc.id,
          uid: doc.id,
          name: data.name,
          email: data.email,
          role: data.role,
          makid: data.makid,
          menteeId: data.menteeId,
          mentorApprovalStatus: data.mentorApprovalStatus,
          status: data.status,
          passwordHash: data.passwordHash,
        },
      };
    }
    return null;
  }

  const rawUpper = input.toUpperCase();
  const rawDigits = input.replace(/\D/g, '');
  const last10 = rawDigits.length >= 10 ? rawDigits.slice(-10) : rawDigits;

  // 2. Try finding by MAKID directly on users
  const makidSnap = await adminDb.collection('users').where('makid', '==', rawUpper).limit(1).get();
  if (!makidSnap.empty) {
    const doc = makidSnap.docs[0];
    const data = doc.data();
    return {
      userDoc: {
        id: doc.id,
        uid: doc.id,
        name: data.name,
        email: data.email,
        role: data.role,
        makid: data.makid,
        menteeId: data.menteeId,
        mentorApprovalStatus: data.mentorApprovalStatus,
        status: data.status,
        passwordHash: data.passwordHash,
      },
    };
  }

  // 3. Try finding in mentees collection by MAKID
  const menteeMakidSnap = await adminDb.collection('mentees').where('makid', '==', rawUpper).limit(1).get();
  if (!menteeMakidSnap.empty) {
    const menteeData = menteeMakidSnap.docs[0].data();
    const userId = menteeData.userId || menteeMakidSnap.docs[0].id;
    const userDocRef = await adminDb.collection('users').doc(userId).get();
    if (userDocRef.exists) {
      const data = userDocRef.data()!;
      return {
        userDoc: {
          id: userDocRef.id,
          uid: userDocRef.id,
          name: data.name,
          email: data.email,
          role: data.role,
          makid: data.makid || rawUpper,
          menteeId: menteeMakidSnap.docs[0].id,
          mentorApprovalStatus: data.mentorApprovalStatus,
          status: data.status,
          passwordHash: data.passwordHash,
        },
      };
    }
  }

  // 4. Try finding mentor by phone
  const mentorPhoneQueries = [
    adminDb.collection('mentors').where('phone', '==', input).limit(1).get(),
    adminDb.collection('mentors').where('phone', '==', rawDigits).limit(1).get(),
    adminDb.collection('mentors').where('phone', '==', `+91${last10}`).limit(1).get(),
  ];

  const mentorResults = await Promise.all(mentorPhoneQueries);
  for (const snap of mentorResults) {
    if (!snap.empty) {
      const mentorDoc = snap.docs[0];
      const mentorData = mentorDoc.data();
      const userId = mentorData.userId || mentorDoc.id;
      const userDocRef = await adminDb.collection('users').doc(userId).get();
      if (userDocRef.exists) {
        const data = userDocRef.data()!;
        return {
          userDoc: {
            id: userDocRef.id,
            uid: userDocRef.id,
            name: data.name,
            email: data.email,
            role: data.role,
            makid: data.makid,
            menteeId: data.menteeId,
            mentorApprovalStatus: mentorData.mentorApprovalStatus ?? data.mentorApprovalStatus ?? 'APPROVED',
            status: data.status,
            passwordHash: data.passwordHash,
          },
        };
      }
    }
  }

  // 5. Try finding mentee by phone
  const menteePhoneQueries = [
    adminDb.collection('mentees').where('phone', '==', input).limit(1).get(),
    adminDb.collection('mentees').where('phone', '==', rawDigits).limit(1).get(),
    adminDb.collection('mentees').where('phone', '==', `+91${last10}`).limit(1).get(),
  ];

  const menteeResults = await Promise.all(menteePhoneQueries);
  for (const snap of menteeResults) {
    if (!snap.empty) {
      const menteeDoc = snap.docs[0];
      const menteeData = menteeDoc.data();
      const userId = menteeData.userId || menteeDoc.id;
      const userDocRef = await adminDb.collection('users').doc(userId).get();
      if (userDocRef.exists) {
        const data = userDocRef.data()!;
        return {
          userDoc: {
            id: userDocRef.id,
            uid: userDocRef.id,
            name: data.name,
            email: data.email,
            role: data.role,
            makid: data.makid || menteeData.makid,
            menteeId: menteeDoc.id,
            mentorApprovalStatus: data.mentorApprovalStatus,
            status: data.status,
            passwordHash: data.passwordHash,
          },
        };
      }
    }
  }

  return null;
}

export async function verifyUserCredentials(identifier: string, plainTextPass: string) {
  const result = await findUserByIdentifier(identifier);
  if (!result || !result.userDoc) {
    throw new Error('Invalid MAKID, email, phone number, or password');
  }

  const { userDoc } = result;
  if (userDoc.status !== 'active') {
    throw new Error('This account is currently inactive.');
  }

  const passwordMatches = await bcrypt.compare(plainTextPass, userDoc.passwordHash);
  if (!passwordMatches) {
    throw new Error('Invalid MAKID, email, phone number, or password');
  }

  const { adminAuth } = getFirebaseAdmin();

  // Ensure Firebase Auth account exists with matching UID
  try {
    await adminAuth.getUser(userDoc.uid);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      await adminAuth.createUser({
        uid: userDoc.uid,
        email: userDoc.email || `${userDoc.uid}@anfaal.internal`,
        displayName: userDoc.name,
      });
    } else {
      throw err;
    }
  }

  const customClaims = {
    role: userDoc.role,
    menteeId: userDoc.menteeId || null,
    mentorApprovalStatus: userDoc.mentorApprovalStatus || null,
  };

  await adminAuth.setCustomUserClaims(userDoc.uid, customClaims);

  const customToken = await adminAuth.createCustomToken(userDoc.uid, customClaims);

  const safeUser: AuthUserData = {
    id: userDoc.id,
    name: userDoc.name,
    email: userDoc.email,
    role: userDoc.role,
    makid: userDoc.makid,
    menteeId: userDoc.menteeId,
    mentorApprovalStatus: userDoc.mentorApprovalStatus,
    status: userDoc.status,
  };

  return { customToken, user: safeUser };
}

export async function verifyAuthUser(req: Request): Promise<{
  uid: string;
  role: 'ADMIN' | 'MENTOR' | 'MENTEE';
  email?: string;
  menteeId?: string;
} | null> {
  const { adminAuth } = getFirebaseAdmin();
  const authHeader = req.headers.get('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7);
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        role: (decoded.role as any) || 'MENTEE',
        email: decoded.email,
        menteeId: decoded.menteeId as string | undefined,
      };
    } catch {
      // Token verification failed
    }
  }

  // Cookie check
  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/__session=([^;]+)/);
  if (match) {
    const sessionCookie = match[1];
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
      return {
        uid: decoded.uid,
        role: (decoded.role as any) || 'MENTEE',
        email: decoded.email,
        menteeId: decoded.menteeId as string | undefined,
      };
    } catch {
      // Cookie verification failed
    }
  }

  return null;
}
