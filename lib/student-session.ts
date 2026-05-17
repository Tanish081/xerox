export const STUDENT_SESSION_KEY = 'printq_student_session';
export const SELECTED_SHOP_KEY = 'printq_selected_shop';
export const USER_TYPE_KEY = 'printq_user_type';

export type UserType = 'student' | 'staff';

export type StudentSession = {
  studentId: string;
  studentName: string;
  shopId: string;
  shopName: string;
  shopUpiId: string;
  userType: UserType;
};

export type SelectedShop = {
  id: string;
  name: string;
  upi_id: string;
  avg_time_per_10_pages: number;
};

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getStudentSession(): StudentSession | null {
  const parsed = readJson<StudentSession>(STUDENT_SESSION_KEY);
  if (!parsed?.studentId || !parsed.shopId || !parsed.studentName || !parsed.shopName || !parsed.shopUpiId) {
    return null;
  }

  return parsed;
}

export function setStudentSession(session: StudentSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(session));
}

export function clearStudentSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STUDENT_SESSION_KEY);
}

export function getSelectedShop(): SelectedShop | null {
  const parsed = readJson<SelectedShop>(SELECTED_SHOP_KEY);
  if (!parsed?.id || !parsed.name || !parsed.upi_id) {
    return null;
  }

  return parsed;
}

export function setSelectedShop(shop: SelectedShop) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SELECTED_SHOP_KEY, JSON.stringify(shop));
}

export function clearSelectedShop() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(SELECTED_SHOP_KEY);
}

export function getUserType(): UserType | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USER_TYPE_KEY) as UserType | null;
}

export function setUserType(type: UserType) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_TYPE_KEY, type);
}

export function clearUserType() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(USER_TYPE_KEY);
}
