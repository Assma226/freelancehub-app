import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refresh } from 'ionicons/icons';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { ApiErrorBody } from '../shared/api.dto';

addIcons({ refresh });

interface PaymentTx {
  _id?: string;
  invoice_number?: string;
  type?: string;
  status?: string;
  escrow_status?: string;
  amount?: number;
  gross_amount?: number;
  client_pays?: number;
  client_commission?: number;
  freelancer_receives?: number;
  freelancer_commission?: number;
  platform_revenue?: number;
  refund_amount?: number;
  created_at?: string;
}

interface Payout {
  _id?: string;
  amount?: number;
  method?: string;
  status?: string;
  created_at?: string;
}

interface Dispute {
  _id?: string;
  transaction_id?: string;
  status?: string;
  reason?: string;
  resolution?: string;
  opened_by_role?: string;
  created_at?: string;
}

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, AccountMenuComponent],
  templateUrl: './payments.page.html',
  styleUrl: './payments.page.scss',
})
export class PaymentsPage implements OnInit {
  user = getSessionUser();
  loading = true;
  error = '';
  success = '';
  stats: Record<string, number> = {};
  transactions: PaymentTx[] = [];
  payouts: Payout[] = [];
  disputes: Dispute[] = [];
  txFilters = {
    status: '',
    type: '',
    q: '',
  };
  disputeForm: Record<string, string> = {};
  payoutForm = {
    amount: 0,
    method: 'bank',
    destination: '',
  };

  paymentMethods = [
    { value: 'bank', label: 'Compte bancaire' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'payoneer', label: 'Payoneer' },
    { value: 'mobile_money', label: 'Mobile money' },
  ];

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.loadSummary();
  }

  async loadSummary() {
    this.loading = true;
    this.error = '';
    try {
      const endpoint = this.user?.role === 'freelancer' ? '/api/payments/wallet' : '/api/payments/summary';
      const res = await fetch(apiUrl(endpoint), { headers: apiAuthHeaders(false) });
      if (!res.ok) throw new Error('summary');
      const data = await res.json() as { stats?: Record<string, number>; balance?: Record<string, number>; transactions?: PaymentTx[]; payouts?: Payout[]; disputes?: Dispute[] };
      this.stats = data.balance || data.stats || {};
      this.transactions = data.transactions || [];
      this.payouts = data.payouts || [];
      this.disputes = data.disputes || [];
      if (this.user?.role === 'freelancer' && !this.payoutForm.amount) {
        this.payoutForm.amount = Math.round(Number(this.stats['available'] || this.stats['available_balance'] || 0));
      }
    } catch {
      this.error = 'Impossible de charger les paiements.';
    } finally {
      this.loading = false;
    }
  }

  async loadHistory() {
    this.error = '';
    const params = new URLSearchParams();
    if (this.txFilters.status) params.set('status', this.txFilters.status);
    if (this.txFilters.type) params.set('type', this.txFilters.type);
    if (this.txFilters.q.trim()) params.set('q', this.txFilters.q.trim());
    const res = await fetch(apiUrl(`/api/payments/history?${params.toString()}`), { headers: apiAuthHeaders(false) });
    if (!res.ok) {
      this.error = 'Impossible de filtrer les transactions.';
      return;
    }
    const data = await res.json() as { transactions?: PaymentTx[] };
    this.transactions = data.transactions || [];
  }

  async requestPayout() {
    this.error = '';
    this.success = '';
    const res = await fetch(apiUrl('/api/payments/payouts/request'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify(this.payoutForm),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as ApiErrorBody | null;
      this.error = data?.error || 'Impossible de creer la demande de retrait.';
      return;
    }
    this.success = 'Demande de retrait envoyee a l admin.';
    this.payoutForm.amount = 0;
    this.payoutForm.destination = '';
    await this.loadSummary();
  }

  async updatePayout(payout: Payout, status: 'approved' | 'paid' | 'rejected') {
    if (!payout._id) return;
    this.error = '';
    this.success = '';
    const res = await fetch(apiUrl(`/api/admin/payouts/${payout._id}/status`), {
      method: 'PUT',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as ApiErrorBody | null;
      this.error = data?.error || 'Impossible de mettre a jour le retrait.';
      return;
    }
    this.success = 'Retrait mis a jour.';
    await this.loadSummary();
  }

  async releaseEscrow(tx: PaymentTx) {
    if (!tx._id) return;
    this.error = '';
    this.success = '';
    const res = await fetch(apiUrl(`/api/payments/transactions/${tx._id}/release`), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as ApiErrorBody | null;
      this.error = data?.error || 'Impossible de liberer l escrow.';
      return;
    }
    this.success = 'Escrow libere.';
    await this.loadSummary();
  }

  async refundEscrow(tx: PaymentTx) {
    if (!tx._id) return;
    this.error = '';
    this.success = '';
    const res = await fetch(apiUrl(`/api/payments/transactions/${tx._id}/refund`), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ reason: 'Remboursement admin' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as ApiErrorBody | null;
      this.error = data?.error || 'Impossible de rembourser l escrow.';
      return;
    }
    this.success = 'Escrow rembourse.';
    await this.loadSummary();
  }

  async openDispute(tx: PaymentTx) {
    if (!tx._id) return;
    this.error = '';
    this.success = '';
    const reason = (this.disputeForm[tx._id] || '').trim();
    const res = await fetch(apiUrl(`/api/payments/transactions/${tx._id}/disputes`), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as ApiErrorBody | null;
      this.error = data?.error || 'Impossible d ouvrir le litige.';
      return;
    }
    this.disputeForm[tx._id] = '';
    this.success = 'Litige ouvert.';
    await this.loadSummary();
  }

  async resolveDispute(dispute: Dispute, resolution: 'release' | 'refund' | 'close') {
    if (!dispute._id) return;
    this.error = '';
    this.success = '';
    const res = await fetch(apiUrl(`/api/payments/disputes/${dispute._id}/resolve`), {
      method: 'PUT',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ resolution }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null) as ApiErrorBody | null;
      this.error = data?.error || 'Impossible de resoudre le litige.';
      return;
    }
    this.success = 'Litige resolu.';
    await this.loadSummary();
  }

  async downloadInvoice(tx: PaymentTx) {
    if (!tx._id) return;
    this.error = '';
    const res = await fetch(apiUrl(`/api/payments/transactions/${tx._id}/invoice.pdf`), {
      headers: apiAuthHeaders(false),
    });
    if (!res.ok) {
      this.error = 'Impossible de telecharger la facture.';
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tx.invoice_number || tx._id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  back() {
    void this.router.navigate([this.user?.role === 'admin' ? '/admin' : '/home']);
  }

  money(value?: number) {
    return `$${Math.round(Number(value || 0))}`;
  }

  methodLabel(value?: string) {
    return this.paymentMethods.find(method => method.value === value)?.label || value || 'Mode de paiement';
  }

  paymentTypeLabel(value?: string) {
    if (value === 'project_payment') return 'Paiement projet';
    if (value === 'subscription') return 'Abonnement';
    return value || 'Transaction';
  }

  txAmount(tx: PaymentTx) {
    return tx.client_pays || tx.freelancer_receives || tx.platform_revenue || tx.refund_amount || tx.amount || tx.gross_amount || 0;
  }

  canRelease(tx: PaymentTx) {
    return tx.status === 'held' && this.user?.role === 'admin';
  }

  canRefund(tx: PaymentTx) {
    return this.user?.role === 'admin' && (tx.status === 'held' || tx.status === 'disputed');
  }

  canDispute(tx: PaymentTx) {
    return tx.status === 'held' && this.user?.role !== 'admin';
  }

  statusLabel(tx: PaymentTx) {
    if (tx.status === 'held') return 'Escrow bloque';
    if (tx.status === 'completed') return 'Libere';
    if (tx.status === 'refunded') return 'Rembourse';
    if (tx.status === 'disputed') return 'Litige';
    return tx.status || 'completed';
  }

  payoutStatusLabel(status?: string) {
    if (status === 'pending') return 'En attente';
    if (status === 'approved') return 'Approuve';
    if (status === 'paid') return 'Paye';
    if (status === 'rejected') return 'Rejete';
    return status || 'Statut';
  }

  disputeStatusLabel(status?: string) {
    if (status === 'open') return 'Ouvert';
    if (status === 'resolved') return 'Resolu';
    return status || 'Statut';
  }

  initials(name?: string) {
    const clean = (name || 'A').trim();
    return clean.charAt(0).toUpperCase();
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
