type RouterReplace = { replace: (href: string) => void };

async function clearStaleLocalSessionIfMismatch(
  router: RouterReplace,
  authUserId: string,
): Promise<boolean> {
  const { getStudentSession, clearStudentSession, clearSelectedShop } = await import('@/lib/student-session');
  const sess = getStudentSession();
  // authUserId missing means an old session created before this fix — treat as stale
  if (sess && (!sess.authUserId || sess.authUserId !== authUserId)) {
    clearStudentSession();
    clearSelectedShop();
    router.replace('/student');
    return true;
  }
  return false;
}

/** Requires Supabase auth + selected shop + completed student profile (local session). */
export async function ensureStudentFlowReady(router: RouterReplace): Promise<boolean> {
  const { supabaseBrowser } = await import('@/lib/supabase');
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();

  if (!session?.user?.id) {
    router.replace('/student/login');
    return false;
  }

  if (await clearStaleLocalSessionIfMismatch(router, session.user.id)) {
    return false;
  }

  const { getSelectedShop, getStudentSession } = await import('@/lib/student-session');

  if (!getSelectedShop()) {
    router.replace('/student');
    return false;
  }

  if (!getStudentSession()) {
    router.replace('/student/identify');
    return false;
  }

  return true;
}

/** Used on shop detail / identify: auth + shop picked from list. */
export async function ensureShopSelectedForStudent(router: RouterReplace): Promise<boolean> {
  const { supabaseBrowser } = await import('@/lib/supabase');
  const {
    data: { session },
  } = await supabaseBrowser.auth.getSession();

  if (!session?.user?.id) {
    router.replace('/student/login');
    return false;
  }

  if (await clearStaleLocalSessionIfMismatch(router, session.user.id)) {
    return false;
  }

  const { getSelectedShop } = await import('@/lib/student-session');

  if (!getSelectedShop()) {
    router.replace('/student');
    return false;
  }

  return true;
}
