/**
 * The college's department list for the operator's Statistics dropdown. This is
 * a static roster, independent of which departments actually exist in the
 * `departments` table yet — an operator should be able to see "no data" for a
 * department that hasn't been set up, rather than not see it at all.
 */
export const COLLEGE_DEPARTMENTS = [
  'CSE',
  'IT',
  'ENTC',
  'Robotics and Automation',
  'Instrumentation and Control',
  'AIDS',
  'Mechanical Engineering',
  'Civil Engineering',
] as const;
