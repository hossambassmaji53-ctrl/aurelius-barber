import {
  BuiltInRole,
  RoleColorKey,
  RoleDefinition,
  RolePermissions,
  UserProfile,
  UserRole,
} from '../types';

export interface ResolvedRoleMeta {
  id: string;
  nameAr: string;
  shortLabelAr: string;
  descriptionAr: string;
  colorKey: RoleColorKey;
  hierarchyOrder: number;
  isSystem: boolean;
  permissions: RolePermissions;
}

export const FULL_FOUNDER_PERMISSIONS: Required<RolePermissions> = {
  accessStaffRoom: true,
  viewAllChats: true,
  deleteMessages: true,
  muteUsers: true,
  kickUsers: true,
  banUsers: true,
  manageTickets: true,
  publishGallery: true,
  publishStories: true,
  receiveBookings: true,
};

export const BUILT_IN_ROLE_META: Record<BuiltInRole, ResolvedRoleMeta> = {
  admin: {
    id: 'admin',
    nameAr: 'المؤسس',
    shortLabelAr: 'المؤسس',
    descriptionAr:
      'أعلى رتبة في المنصة وصاحب الأساس، يمتلك صلاحيات مطلقة ودائمة على كافة أقسام التطبيق، إدارة الطاقم، الرتب، الكريدت، والمعرّفات (ID).',
    colorKey: 'gold',
    hierarchyOrder: 0,
    isSystem: true,
    permissions: FULL_FOUNDER_PERMISSIONS,
  },
  deputy_director: {
    id: 'deputy_director',
    nameAr: 'نائب المدير / مدير العمليات',
    shortLabelAr: 'نائب المدير',
    descriptionAr:
      'الذراع التنفيذي للإدارة، يشرف على سير العمل، يراجع طلبات التوثيق، ويدير شؤون الأعضاء والطاقم وفق الصلاحيات الممنوحة له.',
    colorKey: 'crimson',
    hierarchyOrder: 1,
    isSystem: true,
    permissions: {
      accessStaffRoom: true,
      viewAllChats: true,
      deleteMessages: true,
      muteUsers: true,
      kickUsers: true,
      banUsers: true,
      manageTickets: true,
      publishGallery: true,
      publishStories: true,
      receiveBookings: false,
    },
  },
  moderator: {
    id: 'moderator',
    nameAr: 'مشرف عام',
    shortLabelAr: 'مشرف عام',
    descriptionAr:
      'مسؤول عن حفظ النظام في الدردشات والمعرض، متابعة المخالفات، وتنفيذ إجراءات الكتم والطرد والتنسيق الإداري.',
    colorKey: 'indigo',
    hierarchyOrder: 2,
    isSystem: true,
    permissions: {
      accessStaffRoom: true,
      viewAllChats: true,
      deleteMessages: true,
      muteUsers: true,
      kickUsers: true,
      banUsers: true,
      manageTickets: true,
      publishGallery: false,
      publishStories: false,
      receiveBookings: false,
    },
  },
  chat_moderator: {
    id: 'chat_moderator',
    nameAr: 'مشرف دردشة / مراقب',
    shortLabelAr: 'مشرف دردشة',
    descriptionAr:
      'رتبة إشرافية مخصصة لمراقبة الدردشات العامة والمحلية، حذف الرسائل المخالفة، وتوجيه التنبيهات أو الكتم المؤقت للحفاظ على هدوء المجتمع.',
    colorKey: 'teal',
    hierarchyOrder: 3,
    isSystem: true,
    permissions: {
      accessStaffRoom: true,
      viewAllChats: true,
      deleteMessages: true,
      muteUsers: true,
      kickUsers: true,
      banUsers: false,
      manageTickets: true,
      publishGallery: false,
      publishStories: false,
      receiveBookings: false,
    },
  },
  vip_barber: {
    id: 'vip_barber',
    nameAr: 'حلاق VIP / خبير',
    shortLabelAr: 'حلاق VIP',
    descriptionAr:
      'نخبة الحلاقين في المنصة، يتمتع بأولوية الظهور، النشر المميز في المعرض، وشارات التقدير الاحترافية.',
    colorKey: 'silver',
    hierarchyOrder: 4,
    isSystem: true,
    permissions: {
      publishGallery: true,
      receiveBookings: true,
    },
  },
  master_barber: {
    id: 'master_barber',
    nameAr: 'أستاذ حلاقة',
    shortLabelAr: 'أستاذ حلاقة',
    descriptionAr:
      'رتبة حلاقة متقدمة تجمع بين الخبرة الميدانية والشارة الذهبية الدافئة مع أولوية الظهور واستقبال الحجوزات.',
    colorKey: 'amber',
    hierarchyOrder: 5,
    isSystem: true,
    permissions: {
      receiveBookings: true,
    },
  },
  barber_verified: {
    id: 'barber_verified',
    nameAr: 'حلاق موثّق',
    shortLabelAr: 'حلاق موثّق',
    descriptionAr:
      'حلاق معتمد بملف أعمال موثّق، يظهر على الخريطة ويمكن للزبائن حجز المواعيد لديه مباشرة.',
    colorKey: 'emerald',
    hierarchyOrder: 6,
    isSystem: true,
    permissions: {
      receiveBookings: true,
    },
  },
  vip_member: {
    id: 'vip_member',
    nameAr: 'عضو مميز (VIP)',
    shortLabelAr: 'عضو VIP',
    descriptionAr:
      'عضو نشط أو حاصل على امتيازات الكريدت، يتمتع بشارة خاصة ومزايا إضافية داخل الدردشة.',
    colorKey: 'violet',
    hierarchyOrder: 7,
    isSystem: true,
    permissions: {},
  },
  customer: {
    id: 'customer',
    nameAr: 'زبون / عضو',
    shortLabelAr: 'زبون / عضو',
    descriptionAr:
      'العضو الأساسي في المجتمع، يمكنه التصفح، المشاركة في الدردشات، حجز المواعيد، وجمع نقاط الكريدت.',
    colorKey: 'slate',
    hierarchyOrder: 8,
    isSystem: true,
    permissions: {},
  },
};

export const ROLE_PERMISSION_LABELS: Record<keyof RolePermissions, string> = {
  accessStaffRoom: 'دخول مركز تنسيق الطاقم',
  viewAllChats: 'مراقبة الدردشات العامة والمحلية',
  deleteMessages: 'حذف الرسائل والمنشورات المخالفة',
  muteUsers: 'كتم الأعضاء',
  kickUsers: 'طرد من الغرف',
  banUsers: 'حظر نهائي وفك الحظر',
  manageTickets: 'إدارة التكتات والشكاوى',
  publishGallery: 'النشر في المعرض العام',
  publishStories: 'نشر الستوريات اليومية',
  receiveBookings: 'استقبال الحجوزات والظهور بالخريطة',
};

export function getRolePermissionArabicLabels(permissions?: RolePermissions): string[] {
  if (!permissions) return [];
  return (Object.keys(ROLE_PERMISSION_LABELS) as Array<keyof RolePermissions>)
    .filter((key) => Boolean(permissions[key]))
    .map((key) => ROLE_PERMISSION_LABELS[key]);
}

export const BUILT_IN_ASSIGNABLE_ROLES: BuiltInRole[] = [
  'deputy_director',
  'moderator',
  'chat_moderator',
  'vip_barber',
  'master_barber',
  'barber_verified',
  'vip_member',
];

export const ASSIGNABLE_ELEVATED_ROLES: BuiltInRole[] = BUILT_IN_ASSIGNABLE_ROLES;

export const ROLE_HIERARCHY: Record<BuiltInRole, number> = {
  admin: 0,
  deputy_director: 1,
  moderator: 2,
  chat_moderator: 3,
  vip_barber: 4,
  master_barber: 5,
  barber_verified: 6,
  vip_member: 7,
  customer: 8,
};

// Live runtime registry hydrated from Firestore `roleDefinitions`
let dynamicRoleDefinitionsMap = new Map<string, RoleDefinition>();

export function setDynamicRoleDefinitions(defs: RoleDefinition[]): void {
  const next = new Map<string, RoleDefinition>();
  for (const def of defs) {
    if (def && def.id && def.id !== 'admin') {
      next.set(def.id, def);
    }
  }
  dynamicRoleDefinitionsMap = next;
}

export function getDynamicRoleDefinitions(): RoleDefinition[] {
  return Array.from(dynamicRoleDefinitionsMap.values()).sort(
    (a, b) => a.hierarchyOrder - b.hierarchyOrder
  );
}

export function getRoleDefinitionById(roleId: string): ResolvedRoleMeta {
  if (roleId === 'admin') {
    return BUILT_IN_ROLE_META.admin;
  }

  const customDef = dynamicRoleDefinitionsMap.get(roleId);
  const builtIn = (BUILT_IN_ROLE_META as Record<string, ResolvedRoleMeta | undefined>)[roleId];

  if (customDef) {
    return {
      id: customDef.id,
      nameAr: customDef.nameAr || builtIn?.nameAr || roleId,
      shortLabelAr: customDef.shortLabelAr || builtIn?.shortLabelAr || customDef.nameAr || roleId,
      descriptionAr: customDef.descriptionAr || builtIn?.descriptionAr || '',
      colorKey: customDef.colorKey || builtIn?.colorKey || 'slate',
      hierarchyOrder:
        typeof customDef.hierarchyOrder === 'number'
          ? customDef.hierarchyOrder
          : builtIn?.hierarchyOrder ?? 20,
      isSystem: Boolean(builtIn || customDef.isSystem),
      permissions: {
        ...(builtIn?.permissions || {}),
        ...(customDef.permissions || {}),
      },
    };
  }

  if (builtIn) {
    return builtIn;
  }

  return {
    id: roleId,
    nameAr: roleId,
    shortLabelAr: roleId,
    descriptionAr: 'رتبة مخصصة',
    colorKey: 'slate',
    hierarchyOrder: 50,
    isSystem: false,
    permissions: {},
  };
}

export function getAllRoleDefinitions(): ResolvedRoleMeta[] {
  const seen = new Set<string>();
  const list: ResolvedRoleMeta[] = [];

  (Object.keys(BUILT_IN_ROLE_META) as BuiltInRole[]).forEach((id) => {
    seen.add(id);
    list.push(getRoleDefinitionById(id));
  });

  dynamicRoleDefinitionsMap.forEach((def) => {
    if (!seen.has(def.id)) {
      seen.add(def.id);
      list.push(getRoleDefinitionById(def.id));
    }
  });

  return list.sort((a, b) => a.hierarchyOrder - b.hierarchyOrder);
}

export function getAssignableRoles(): ResolvedRoleMeta[] {
  return getAllRoleDefinitions().filter((r) => r.id !== 'admin' && r.id !== 'customer');
}

export function getRoleHierarchyOrder(role: UserRole): number {
  return getRoleDefinitionById(String(role)).hierarchyOrder;
}

export function isValidRoleFormat(role: unknown): role is string {
  return typeof role === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(role);
}

export function normalizeUserRoles(
  rolesInput?: UserRole[] | null,
  fallbackRole: UserRole = 'customer'
): UserRole[] {
  const raw =
    rolesInput && rolesInput.length > 0
      ? rolesInput
      : [isValidRoleFormat(fallbackRole) ? fallbackRole : 'customer'];

  const filtered = Array.from(new Set(raw.filter((r) => isValidRoleFormat(r))));

  if (filtered.includes('admin') || fallbackRole === 'admin') {
    return ['admin'];
  }

  const elevated = filtered
    .filter((r) => r !== 'customer')
    .sort((a, b) => getRoleHierarchyOrder(a) - getRoleHierarchyOrder(b));

  if (elevated.length > 0) {
    return elevated.slice(0, 6);
  }

  return ['customer'];
}

export function getUserRoles(
  user?: Pick<UserProfile, 'role' | 'roles'> | null,
  fallbackRole: UserRole = 'customer'
): UserRole[] {
  if (!user) return [fallbackRole];
  if (Array.isArray(user.roles) && user.roles.length > 0) {
    const onlyCustomer =
      user.roles.length === 1 && user.roles[0] === 'customer';
    if (onlyCustomer && user.role && user.role !== 'customer') {
      return normalizeUserRoles([user.role], user.role);
    }
    return normalizeUserRoles(user.roles, user.role || fallbackRole);
  }
  return normalizeUserRoles([user.role], fallbackRole);
}

export function getPrimaryRole(
  user?: Pick<UserProfile, 'role' | 'roles'> | null,
  fallbackRole: UserRole = 'customer'
): UserRole {
  return getUserRoles(user, fallbackRole)[0];
}

export function hasRole(
  user: Pick<UserProfile, 'role' | 'roles'> | null | undefined,
  targetRole: UserRole
): boolean {
  return getUserRoles(user).includes(targetRole);
}

export function isFounderUser(
  user?: Pick<UserProfile, 'role' | 'roles'> | null
): boolean {
  return hasRole(user, 'admin');
}

export function getUserEffectivePermissions(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin = false
): Required<RolePermissions> {
  if (isSuperAdmin || isFounderUser(user)) {
    return FULL_FOUNDER_PERMISSIONS;
  }

  const roles = getUserRoles(user);
  const merged: Required<RolePermissions> = {
    accessStaffRoom: false,
    viewAllChats: false,
    deleteMessages: false,
    muteUsers: false,
    kickUsers: false,
    banUsers: false,
    manageTickets: false,
    publishGallery: false,
    publishStories: Boolean(user?.canPostStory),
    receiveBookings: false,
  };

  for (const r of roles) {
    const def = getRoleDefinitionById(String(r));
    const p = def.permissions || {};
    if (p.accessStaffRoom) merged.accessStaffRoom = true;
    if (p.viewAllChats) merged.viewAllChats = true;
    if (p.deleteMessages) merged.deleteMessages = true;
    if (p.muteUsers) merged.muteUsers = true;
    if (p.kickUsers) merged.kickUsers = true;
    if (p.banUsers) merged.banUsers = true;
    if (p.manageTickets) merged.manageTickets = true;
    if (p.publishGallery) merged.publishGallery = true;
    if (p.publishStories) merged.publishStories = true;
    if (p.receiveBookings) merged.receiveBookings = true;
  }

  return merged;
}

const NON_BARBER_BUILTIN_ROLES = new Set<string>([
  'admin',
  'deputy_director',
  'moderator',
  'chat_moderator',
  'vip_member',
  'customer',
]);

export function isAnyBarberRole(role: UserRole): boolean {
  const key = String(role || '').trim();
  if (!key) return false;
  if (key === 'vip_barber' || key === 'master_barber' || key === 'barber_verified') {
    return true;
  }
  if (NON_BARBER_BUILTIN_ROLES.has(key)) {
    return false;
  }
  const def = getRoleDefinitionById(key);
  if (def.permissions.receiveBookings) {
    return true;
  }
  if (def.permissions.publishGallery && !def.permissions.accessStaffRoom) {
    return true;
  }
  if (key.toLowerCase().includes('barber') || def.nameAr.includes('حلاق')) {
    return true;
  }
  return false;
}

export function isBarberMember(
  user?: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null
): boolean {
  const roles = getUserRoles(user);
  return roles.some((r) => isAnyBarberRole(r));
}

export function getScopedUserPermissionLabels(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin = false
): string[] {
  if (!user) return [];
  if (isSuperAdmin || isFounderUser(user)) {
    const labels = [
      'إدارة المنصة الكاملة وتعيين الرتب',
      'التحكم بالكريدت والمتجر والمعرّفات',
      'إدارة الطاقم والتكتات والشكاوى',
      'مراقبة جميع الدردشات وتطبيق الإجراءات',
    ];
    if (isBarberMember(user)) {
      labels.push('نشر الأعمال بالمعرض واستقبال الحجوزات');
    } else {
      labels.push('إدارة المعرض والستوريات والإعلانات');
    }
    return labels;
  }

  const perms = getUserEffectivePermissions(user, false);
  const userIsBarber = isBarberMember(user);
  const labels = (Object.keys(ROLE_PERMISSION_LABELS) as Array<keyof RolePermissions>)
    .filter((key) => {
      if (!perms[key]) return false;
      if ((key === 'receiveBookings' || key === 'publishGallery') && !userIsBarber) {
        return key === 'publishGallery' && hasRole(user, 'deputy_director')
          ? false
          : Boolean(perms[key]);
      }
      return true;
    })
    .map((key) => ROLE_PERMISSION_LABELS[key]);

  if (labels.length === 0) {
    if (hasRole(user, 'vip_member')) {
      return [
        'المشاركة في الدردشة العامة وغرف الدول',
        'حجز المواعيد والتقييم مع الحلاقين',
        'شارة عضو VIP وأولوية إبراز الحضور',
      ];
    }
    return [
      'المشاركة في الدردشة العامة وغرف الدول',
      'حجز المواعيد وتقييم الحلاقين',
      'جمع الكريدت واقتناء مزايا المتجر',
    ];
  }

  return labels;
}

export function isStaffMember(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  return getUserEffectivePermissions(user, isSuperAdmin).accessStaffRoom;
}

export function canUserBan(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  return getUserEffectivePermissions(user, isSuperAdmin).banUsers;
}

export function canUserMuteKick(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  const perms = getUserEffectivePermissions(user, isSuperAdmin);
  return perms.muteUsers || perms.kickUsers;
}

export function canUserDeleteContent(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  return getUserEffectivePermissions(user, isSuperAdmin).deleteMessages;
}

export function canPublishToGallery(
  user: Pick<UserProfile, 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  return getUserEffectivePermissions(user, isSuperAdmin).publishGallery;
}

export function canPublishStories(
  user: Pick<UserProfile, 'canPostStory' | 'role' | 'roles'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  return isSuperAdmin || Boolean(user?.canPostStory) || getUserEffectivePermissions(user, isSuperAdmin).publishStories;
}

export function toggleElevatedRoleSelection(
  currentRoles: UserRole[],
  toggledRole: UserRole
): UserRole[] {
  if (toggledRole === 'admin') return currentRoles;
  if (toggledRole === 'customer') return ['customer'];

  const currentElevated = normalizeUserRoles(currentRoles).filter(
    (r) => r !== 'customer' && r !== 'admin'
  );

  const exists = currentElevated.includes(toggledRole);
  const next = exists
    ? currentElevated.filter((r) => r !== toggledRole)
    : [...currentElevated, toggledRole];

  return normalizeUserRoles(next);
}

export function getRoleShortArabicLabel(role: UserRole): string {
  return getRoleDefinitionById(String(role)).nameAr;
}

export function formatRolesArabicSummary(roles: UserRole[]): string {
  return normalizeUserRoles(roles).map(getRoleShortArabicLabel).join(' + ');
}

/**
 * Centralized authorization assertion for Founder-only mutations.
 * Checks both client Super Admin email state and explicit 'admin' role.
 */
export function assertFounderActor(
  actor: Pick<UserProfile, 'uid' | 'role' | 'roles'> | null | undefined,
  isSuperAdmin: boolean
): void {
  if (!actor || !isSuperAdmin || !isFounderUser(actor)) {
    throw new Error('صلاحية مرفوضة: هذا الإجراء محصور بالمؤسس فقط.');
  }
}

/**
 * Centralized authorization assertion for staff/moderator actions.
 */
export function assertStaffPermission(
  actor: Pick<UserProfile, 'uid' | 'role' | 'roles' | 'canPostStory'> | null | undefined,
  isSuperAdmin: boolean,
  permKey: keyof RolePermissions
): void {
  if (!actor) {
    throw new Error('صلاحية مرفوضة: يجب تسجيل الدخول أولاً.');
  }
  const perms = getUserEffectivePermissions(actor, isSuperAdmin);
  if (!perms[permKey]) {
    throw new Error('صلاحية مرفوضة: لا تمتلك الصلاحية المطلوبة لتنفيذ هذا الإجراء.');
  }
}

/**
 * Validates hierarchical moderation order so staff cannot discipline higher/equal ranks or Founder.
 */
export function canActorModerateTarget(
  actor: Pick<UserProfile, 'uid' | 'role' | 'roles' | 'canPostStory'> | null | undefined,
  target: Pick<UserProfile, 'uid' | 'role' | 'roles'> | null | undefined,
  isSuperAdmin: boolean
): boolean {
  if (!actor || !target) return false;
  if (actor.uid === target.uid || isFounderUser(target)) return false;
  if (isSuperAdmin && isFounderUser(actor)) return true;
  if (!isStaffMember(actor, false)) return false;
      return getRole(actor) !== getRole(target);
  }

