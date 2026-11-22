export type BuiltInRole =
  | 'admin'
  | 'deputy_director'
  | 'moderator'
  | 'chat_moderator'
  | 'vip_barber'
  | 'master_barber'
  | 'barber_verified'
  | 'vip_member'
  | 'customer';

export type UserRole = BuiltInRole | (string & {});

export type RoleColorKey =
  | 'gold'
  | 'crimson'
  | 'indigo'
  | 'teal'
  | 'silver'
  | 'amber'
  | 'emerald'
  | 'violet'
  | 'slate';

export interface RolePermissions {
  accessStaffRoom?: boolean;
  viewAllChats?: boolean;
  deleteMessages?: boolean;
  muteUsers?: boolean;
  kickUsers?: boolean;
  banUsers?: boolean;
  manageTickets?: boolean;
  publishGallery?: boolean;
  publishStories?: boolean;
  receiveBookings?: boolean;
}

export interface RoleDefinition {
  id: string;
  nameAr: string;
  shortLabelAr: string;
  descriptionAr: string;
  colorKey: RoleColorKey;
  hierarchyOrder: number;
  isSystem?: boolean;
  permissions: RolePermissions;
  createdById: string;
  createdAt: any;
  updatedAt: any;
}

export type StoreFeatureKey =
  | 'special_id'
  | 'name_color'
  | 'avatar_frame'
  | 'chat_title'
  | 'credit_pass';

export type NameColorKey =
  | 'gold_royal'
  | 'emerald_neon'
  | 'crimson_ruby'
  | 'sapphire_sky'
  | 'violet_amethyst';

export type StoreAvatarFrameKey =
  | 'obsidian_bronze'
  | 'emerald_royal'
  | 'gold_crown'
  | 'ruby_flame'
  | 'sapphire_neon'
  | 'platinum_diamond';

export type RankAvatarFrameKey =
  | 'rank_deputy'
  | 'rank_moderator'
  | 'rank_chat_mod'
  | 'rank_vip_barber'
  | 'rank_master_barber'
  | 'rank_verified_barber'
  | 'rank_vip_member';

export type FounderAvatarFrameKey = 'founder_sovereign';

export type AvatarFrameKey =
  | StoreAvatarFrameKey
  | RankAvatarFrameKey
  | FounderAvatarFrameKey;

export type ChatTitleKey =
  | 'community_star'
  | 'refined_taste'
  | 'guest_of_honor'
  | 'elite_supporter'
  | 'style_icon'
  | 'founder_dean';

export interface StoreItemConfig {
  enabled: boolean;
  price: number;
  durationDays: number;
  labelAr?: string;
}

export interface StoreConfig {
  id: 'current';
  dailyRewardCoins: number;
  reservedSpecialIds: string[];
  items: {
    special_id: StoreItemConfig;
    name_color: StoreItemConfig;
    avatar_frame: StoreItemConfig;
    chat_title?: StoreItemConfig;
    credit_pass: StoreItemConfig;
  };
  updatedById: string;
  createdAt: any;
  updatedAt: any;
}

export type BarberAvailability = 'available' | 'busy';
export type MemberLiveStatus = 'online' | 'cutting' | 'offline';

export interface BarberService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  description?: string;
}

export interface GeoLocation {
  lat: number;
  lng: number;
}

export type FriendRequestPolicy = 'everyone' | 'barbers_only' | 'nobody';
export type FriendshipStatus = 'pending' | 'accepted';

export interface UserProfile {
  uid: string;
  displayName: string;
  username?: string;
  baseUsername?: string;
  isSpecialId?: boolean;
  specialIdLabel?: string;
  specialIdExpiresAt?: any;
  specialIdGrantedBy?: string;
  nameColor?: NameColorKey | string;
  nameColorExpiresAt?: any;
  avatarFrame?: AvatarFrameKey | string;
  avatarFrameExpiresAt?: any;
  chatTitle?: ChatTitleKey | string;
  chatTitleExpiresAt?: any;
  creditPassTier?: string;
  creditPassExpiresAt?: any;
  lastDailyClaimDate?: string;
  photoURL?: string;
  coverURL?: string;
  bio?: string;
  role: UserRole;
  roles?: UserRole[];
  availability: BarberAvailability;
  liveStatus?: MemberLiveStatus;
  points?: number;
  completedBookingsCount?: number;
  salonName?: string;
  addressLabel?: string;
  location?: GeoLocation;
  services?: BarberService[];
  canPostStory?: boolean;
  countryCode?: string;
  friendRequestPolicy?: FriendRequestPolicy;
  hideOnlineStatus?: boolean;
  isOnline?: boolean;
  lastActiveAt?: any;
  isMuted: boolean;
  muteReason?: string;
  isKicked: boolean;
  kickReason?: string;
  isBanned: boolean;
  banReason?: string;
  isPublicProfile: boolean;
  createdAt: any;
  updatedAt: any;
}

export interface Friendship {
  id: string;
  user1Id: string;
  user2Id: string;
  requesterId: string;
  recipientId: string;
  requesterName: string;
  requesterPhoto?: string;
  recipientName: string;
  recipientPhoto?: string;
  status: FriendshipStatus;
  createdAt: any;
  updatedAt: any;
}

export interface TypingStatus {
  id: string;
  scope: 'global' | 'local';
  roomKey: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  updatedAt: any;
}

export interface ConversationTyping {
  id: string;
  conversationId: string;
  participant1Id: string;
  participant2Id: string;
  userId: string;
  userName: string;
  isTyping: boolean;
  updatedAt: any;
}

export type VerificationRequestStatus = 'pending' | 'approved' | 'rejected';

export interface VerificationRequest {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  salonName: string;
  countryCode?: string;
  city?: string;
  experience: string;
  phoneOrSocial?: string;
  status: VerificationRequestStatus;
  adminNote?: string;
  createdAt: any;
  updatedAt: any;
}

export type GalleryCategory = 'fade' | 'beard' | 'classic' | 'styling' | 'vip';

export interface GalleryItem {
  id: string;
  barberId: string;
  barberName: string;
  barberPhoto?: string;
  title: string;
  description?: string;
  category: GalleryCategory;
  imageUrl: string;
  isBeforeAfter?: boolean;
  beforeImageUrl?: string;
  countryCode?: string;
  visibility: 'public';
  createdAt: any;
  updatedAt: any;
}

export type LikeTargetType = 'profile' | 'gallery';

export interface LikeRecord {
  id: string;
  targetType: LikeTargetType;
  targetId: string;
  userId: string;
  createdAt: any;
}

export type StoryMediaType = 'image' | 'before_after' | 'video';

export interface BarberStory {
  id: string;
  barberId: string;
  barberName: string;
  barberPhoto?: string;
  salonName?: string;
  mediaType: StoryMediaType;
  mediaUrl: string;
  beforeMediaUrl?: string;
  caption?: string;
  countryCode?: string;
  visibility: 'public';
  expiresAt: any;
  createdAt: any;
}

export type StoryReactionKey = string;

export interface StoryReaction {
  id: string;
  storyId: string;
  storyAuthorId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  reaction: StoryReactionKey;
  emojiKey?: string;
  createdAt: any;
  updatedAt: any;
}

export type TicketStatus = 'open' | 'in_progress' | 'closed';
export type TicketCategory = 'complaint' | 'report_user' | 'technical' | 'inquiry';

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  userRole: UserRole;
  subject: string;
  category: TicketCategory;
  description: string;
  status: TicketStatus;
  assignedModeratorId?: string;
  assignedModeratorName?: string;
  resolutionNote?: string;
  lastMessage: string;
  lastMessageAt: any;
  createdAt: any;
  updatedAt: any;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  ticketOwnerId: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  senderRole: UserRole;
  text: string;
  createdAt: any;
}

export interface CommunityMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  senderPhoto?: string;
  senderRole: UserRole;
  text: string;
  replyToId?: string;
  replyToSenderId?: string;
  replyToSenderName?: string;
  replyToSenderUsername?: string;
  replyToText?: string;
  mentions?: string[];
  edited: boolean;
  roomType?: 'global' | 'local';
  countryCode?: string;
  visibility: 'public';
  createdAt: any;
  updatedAt: any;
}

export interface ProfilePost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  authorRole: UserRole;
  text: string;
  imageUrl?: string;
  visibility: 'public';
  createdAt: any;
  updatedAt: any;
}

export interface Conversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  participant1Name: string;
  participant2Name: string;
  participant1Photo?: string;
  participant2Photo?: string;
  lastMessage: string;
  lastMessageAt: any;
  createdAt: any;
  updatedAt: any;
}

export interface PrivateMessage {
  id: string;
  conversationId: string;
  participant1Id: string;
  participant2Id: string;
  senderId: string;
  senderName: string;
  text: string;
  bookingId?: string;
  createdAt: any;
}

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'rescheduled'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export interface Booking {
  id: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  customerPhoto?: string;
  barberId
  
