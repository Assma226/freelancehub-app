export interface ApiErrorBody {
  error: string;
  count?: number;
}

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'freelancer';
  avatar?: string;
  trial_used?: boolean;
}

export interface AuthLoginResponse {
  access_token: string;
  token: string;
  refresh_token: string;
  user: AuthUserDto;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  projects_count?: number;
  freelancers_count?: number;
}

export interface CategoriesListDto {
  categories: CategoryDto[];
  total: number;
}

export interface PortfolioItemDto {
  title?: string;
  category?: string;
  summary?: string;
  metrics?: string;
  accent?: string;
  link?: string;
  cover_image?: string;
  project_id?: string;
  source?: 'project' | 'manual' | string;
}

export interface FreelancerProfileDto {
  id?: string;
  user_id?: string;
  name?: string;
  avatar?: string;
  title?: string;
  bio?: string;
  skills?: string[];
  hourly_rate?: number;
  hourlyRate?: string;
  hourlyRateNum?: number;
  location?: string;
  is_available?: boolean;
  rating?: number;
  reviews?: number;
  completedJobs?: number;
  completed_jobs?: number;
  response_time?: string;
  languages?: string[];
  portfolio?: PortfolioItemDto[];
  review_items?: Array<{
    name: string;
    project: string;
    avatar: string;
    rating: number;
    comment: string;
  }>;
  contact_email?: string;
  contact_phone?: string;
}

export interface FreelancersListDto {
  freelancers: FreelancerProfileDto[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface UserMeDto {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'freelancer';
  avatar?: string;
  trial_used?: boolean;
  freelancer?: FreelancerProfileDto | null;
}

export interface ProjectDocumentDto {
  id: string;
  client_id?: string;
  title?: string;
  description?: string;
  budget_min?: number;
  budget_max?: number;
  budgetMin?: number;
  budgetMax?: number;
  category?: string;
  category_name?: string;
  category_slug?: string;
  duration?: string;
  location?: string;
  status?: string;
  applicants?: number;
  applicants_count?: number;
  company?: string;
  client_name?: string;
  companyLogo?: string;
  company_logo?: string;
  client_logo?: string;
  companyBio?: string;
  company_bio?: string;
  client_bio?: string;
  created_at?: string;
  postedAt?: string;
  tags?: string[];
  is_trial?: boolean;
  is_trial_project?: boolean;
  agreed_amount?: number;
  progress_entries?: Array<{
    work_date?: string;
    title?: string;
    summary?: string;
    achievements?: string[];
    hours_spent?: number;
    completion_percent?: number;
    next_step?: string;
    blockers?: string;
    actor_id?: string;
    actor_role?: string;
    actor_name?: string;
    created_at?: string;
  }>;
  progress_percent?: number;
  total_hours_logged?: number;
  total_tasks_completed?: number;
  days_reported?: number;
  progress_last_updated_at?: string;
  progress_last_note?: string;
  progress_health?: 'on-track' | 'at-risk' | 'blocked' | string;
  contract?: {
    status?: 'draft' | 'pending-signature' | 'signed' | string;
    amount?: number;
    start_date?: string;
    due_date?: string;
    terms?: string;
    deliverables?: string[];
    client_signed_at?: string | null;
    freelancer_signed_at?: string | null;
  };
  status_history?: Array<{
    status?: string;
    note?: string;
    actor_id?: string;
    created_at?: string;
  }>;
  completed_at?: string;
  cancelled_at?: string;
}

export interface ProjectsListDto {
  projects: ProjectDocumentDto[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface MyProjectsDto {
  projects: ProjectDocumentDto[];
}

export interface ApplicationDto {
  id: string;
  project_id: string;
  client_id: string;
  freelancer_id: string;
  project_title?: string;
  freelancer_name?: string;
  freelancer_avatar?: string;
  bid_amount?: number;
  commission_rate?: number;
  net_amount?: number;
  is_trial?: boolean;
  cover_letter?: string;
  status?: string;
}

export interface ApplicationsListDto {
  applications: ApplicationDto[];
  total: number;
}

export interface ConversationDto {
  id: string;
  participants: string[];
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  other_user_id?: string;
  other_user_name?: string;
  other_user_role?: 'client' | 'freelancer' | string;
  other_user_avatar?: string;
  other_user_phone?: string;
  other_user_email?: string;
}

export interface ConversationsListDto {
  conversations: ConversationDto[];
}

export interface MessageDto {
  id: string;
  conversation_id: string;
  sender_id: string;
  text?: string;
  created_at?: string;
}

export interface MessagesThreadDto {
  conversation?: ConversationDto;
  messages: MessageDto[];
  total: number;
}

export interface NotificationDto {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at?: string;
  updated_at?: string;
  entity_id?: string;
  entity_type?: string;
  actor_id?: string;
  actor_name?: string;
  actor_avatar?: string;
  meta?: Record<string, unknown>;
}

export interface NotificationsListDto {
  notifications: NotificationDto[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  unread_count: number;
}

export interface FavoriteItemDto {
  id: string;
  entity_type: 'project' | 'freelancer';
  entity_id: string;
  created_at?: string;
  project?: ProjectDocumentDto;
  freelancer?: FreelancerProfileDto;
}

export interface FavoritesListDto {
  favorites: FavoriteItemDto[];
  total: number;
}
