import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { briefcase, card, grid, people, refresh, settings } from 'ionicons/icons';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';

addIcons({ briefcase, card, grid, people, refresh, settings });

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active?: boolean;
  created_at?: string;
  applications_count?: number;
  projects_count?: number;
  profile_exists?: boolean;
}

interface AdminProject {
  _id?: string;
  id?: string;
  title?: string;
  status?: string;
  client_name?: string;
  applicants_count?: number;
  agreed_amount?: number;
}

interface AdminTransaction {
  _id?: string;
  type?: string;
  status?: string;
  amount?: number;
  gross_amount?: number;
  client_pays?: number;
  platform_revenue?: number;
  created_at?: string;
}

interface AdminPayout {
  _id: string;
  freelancer_id?: string;
  amount?: number;
  method?: string;
  status?: string;
  created_at?: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, AccountMenuComponent],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage implements OnInit {
  user = getSessionUser();
  activeTab: 'overview' | 'users' | 'projects' | 'payments' | 'settings' = 'overview';
  loading = true;
  search = '';
  roleFilter = '';
  statusFilter = '';
  error = '';
  stats: Record<string, number> = {};
  latestUsers: AdminUser[] = [];
  users: AdminUser[] = [];
  projects: AdminProject[] = [];
  transactions: AdminTransaction[] = [];
  payouts: AdminPayout[] = [];

  constructor(private router: Router) {}

  async ngOnInit() {
    if (this.user?.role !== 'admin') {
      void this.router.navigate(['/home']);
      return;
    }
    await this.loadAll();
  }

  async loadAll() {
    this.loading = true;
    this.error = '';
    try {
      await Promise.all([
        this.loadOverview(),
        this.loadUsers(),
        this.loadProjects(),
        this.loadPayments(),
      ]);
    } catch {
      this.error = 'Impossible de charger le tableau de bord admin.';
    } finally {
      this.loading = false;
    }
  }

  async loadOverview() {
    const res = await fetch(apiUrl('/api/admin/overview'), { headers: apiAuthHeaders(false) });
    if (!res.ok) throw new Error('overview');
    const data = await res.json() as { stats?: Record<string, number>; latest_users?: AdminUser[] };
    this.stats = data.stats || {};
    this.latestUsers = data.latest_users || [];
  }

  async loadUsers() {
    const params = new URLSearchParams();
    if (this.search.trim()) params.set('q', this.search.trim());
    if (this.roleFilter) params.set('role', this.roleFilter);
    if (this.statusFilter) params.set('status', this.statusFilter);
    const res = await fetch(apiUrl(`/api/admin/users?${params.toString()}`), { headers: apiAuthHeaders(false) });
    if (!res.ok) throw new Error('users');
    const data = await res.json() as { users?: AdminUser[] };
    this.users = data.users || [];
  }

  async loadProjects() {
    const res = await fetch(apiUrl('/api/admin/projects'), { headers: apiAuthHeaders(false) });
    if (!res.ok) throw new Error('projects');
    const data = await res.json() as { projects?: AdminProject[] };
    this.projects = data.projects || [];
  }

  async loadPayments() {
    const [txRes, payoutRes] = await Promise.all([
      fetch(apiUrl('/api/admin/transactions'), { headers: apiAuthHeaders(false) }),
      fetch(apiUrl('/api/admin/payouts'), { headers: apiAuthHeaders(false) }),
    ]);
    if (!txRes.ok || !payoutRes.ok) throw new Error('payments');
    const txData = await txRes.json() as { transactions?: AdminTransaction[] };
    const payoutData = await payoutRes.json() as { payouts?: AdminPayout[] };
    this.transactions = txData.transactions || [];
    this.payouts = payoutData.payouts || [];
  }

  async updateUser(user: AdminUser, action: 'activate' | 'block') {
    const res = await fetch(apiUrl(`/api/admin/users/${user.id}/status`), {
      method: 'PUT',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ action }),
    });
    if (res.ok) await this.loadUsers();
  }

  async updatePayout(payout: AdminPayout, status: 'approved' | 'paid' | 'rejected') {
    const res = await fetch(apiUrl(`/api/admin/payouts/${payout._id}/status`), {
      method: 'PUT',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    if (res.ok) await this.loadPayments();
  }

  goPayments() {
    void this.router.navigate(['/payments']);
  }

  initials(name?: string) {
    const clean = (name || 'A').trim();
    return clean.charAt(0).toUpperCase();
  }

  money(value?: number) {
    return `$${Math.round(Number(value || 0))}`;
  }

  txAmount(tx: AdminTransaction) {
    return tx.client_pays || tx.platform_revenue || tx.amount || tx.gross_amount || 0;
  }

  paymentTypeLabel(value?: string) {
    if (value === 'project_payment') return 'Paiement projet';
    if (value === 'subscription') return 'Abonnement';
    return value || 'Transaction';
  }

  paymentStatusLabel(value?: string) {
    if (value === 'held') return 'Escrow bloque';
    if (value === 'completed') return 'Libere';
    if (value === 'disputed') return 'Litige';
    if (value === 'refunded') return 'Rembourse';
    return value || 'Statut';
  }

  payoutStatusLabel(value?: string) {
    if (value === 'pending') return 'En attente';
    if (value === 'approved') return 'Approuve';
    if (value === 'paid') return 'Paye';
    if (value === 'rejected') return 'Rejete';
    return value || 'Statut';
  }

  formatDate(value?: string) {
    if (!value) return 'Date non renseignee';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  }
}
