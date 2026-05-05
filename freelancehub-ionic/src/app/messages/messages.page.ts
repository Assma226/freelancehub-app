import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { apiAuthHeaders, apiUrl, getStoredUserId, getSessionUser } from '../shared/api-url';
import { ApiErrorBody, ConversationsListDto, ConversationDto, MessageDto, MessagesThreadDto } from '../shared/api.dto';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, UserBottomNavComponent, AccountMenuComponent],
  templateUrl: './messages.page.html',
  styleUrl: './messages.page.scss',
})
export class MessagesPage implements OnInit {
  user = getSessionUser();
  conversations: ConversationDto[] = [];
  activeConversationId = '';
  messages: MessageDto[] = [];
  draft = '';
  search = '';
  sending = false;
  composerError = '';
  piiTypes: string[] = [];
  viewMode: 'list' | 'thread' = 'list';

  constructor(private route: ActivatedRoute) {}

  async ngOnInit() {
    const withUser = this.route.snapshot.queryParamMap.get('with');
    if (withUser) {
      await this.ensureConversation(withUser);
    }
    await this.loadConversations();
    if (withUser && this.conversations[0]?.id) {
      await this.openConversation(this.conversations[0].id);
    }
  }

  async ensureConversation(recipientId: string) {
    await fetch(apiUrl('/api/messages/new'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ recipient_id: recipientId, message: '' }),
    });
  }

  async loadConversations() {
    const res = await fetch(apiUrl('/api/messages'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as ConversationsListDto;
    this.conversations = data.conversations || [];
  }

  async openConversation(id: string) {
    this.activeConversationId = id;
    this.viewMode = 'thread';
    this.composerError = '';
    this.piiTypes = [];
    const res = await fetch(apiUrl(`/api/messages/${id}`), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as MessagesThreadDto;
    if (data.conversation) {
      this.conversations = this.conversations.map(conv => conv.id === data.conversation?.id ? data.conversation : conv);
    }
    this.messages = data.messages || [];
  }

  async sendMessage() {
    if (!this.activeConversationId || !this.draft.trim()) return;
    const localPii = this.detectLocalPii(this.draft);
    if (localPii.length) {
      this.piiTypes = localPii;
      this.composerError = `Message bloque: ${this.piiLabel(localPii)}. Gardez les echanges sur FreelanceHub.`;
      return;
    }
    this.sending = true;
    this.composerError = '';
    this.piiTypes = [];
    try {
      const res = await fetch(apiUrl(`/api/messages/${this.activeConversationId}`), {
        method: 'POST',
        headers: apiAuthHeaders(),
        body: JSON.stringify({ text: this.draft }),
      });
      if (res.ok) {
        this.draft = '';
        await this.openConversation(this.activeConversationId);
        await this.loadConversations();
      } else {
        const data = await res.json().catch(() => null) as ApiErrorBody | null;
        this.composerError = data?.error || 'Impossible d envoyer ce message.';
        this.piiTypes = data?.pii?.pii_types || [];
      }
    } finally {
      this.sending = false;
    }
  }

  get activeConversation() {
    return this.conversations.find(conv => conv.id === this.activeConversationId) || null;
  }

  get filteredConversations() {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.conversations;

    return this.conversations.filter(conversation => {
      return [
        conversation.other_user_name || '',
        conversation.other_user_role || '',
        conversation.last_message || '',
        this.conversationLabel(conversation),
      ].join(' ').toLowerCase().includes(query);
    });
  }

  conversationLabel(conversation: ConversationDto) {
    return conversation.other_user_name || `Job ID ${conversation.id.slice(-4).toUpperCase()}`;
  }

  conversationSubtitle(conversation: ConversationDto) {
    const preview = (conversation.last_message || '').trim();
    return preview || 'Open the thread to continue the discussion.';
  }

  conversationMeta(conversation: ConversationDto) {
    const role = conversation.other_user_role === 'client' ? 'Client' : conversation.other_user_role === 'freelancer' ? 'Freelancer' : 'Contact';
    return `${role} • ${conversation.id.slice(-4).toUpperCase()}`;
  }

  detectLocalPii(text: string) {
    const found = new Set<string>();
    if (/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(text)) found.add('email');
    if (/\b[\w.+-]+\s*(?:point|dot|\.)\s*[\w.+-]+\s*(?:arobase|at|@)\s*[\w.-]+\b/i.test(text)) found.add('email');
    if (/\b[\w.+-]+\s*(?:arobase|at)\s*[\w.-]+\s*(?:point|dot)\s*[a-z]{2,}\b/i.test(text)) found.add('email');
    if (/(?<!\w)(?:\+?\d[\d\s().-]{7,}\d|0[567]\s*(?:[\s.-]?\d{2}){4})(?!\w)/.test(text)) found.add('phone');
    if (/\b(?:https?:\/\/|www\.)?\S*(?:wa\.me|whatsapp|telegram|t\.me|linkedin|instagram|insta|facebook|fb\.com|snapchat)\S*\b/i.test(text)) found.add('link');
    if (/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/i.test(text)) found.add('iban');
    return Array.from(found);
  }

  piiLabel(types: string[]) {
    const labels: Record<string, string> = {
      email: 'email',
      phone: 'telephone',
      link: 'lien externe',
      iban: 'IBAN',
      card: 'carte bancaire',
    };
    return types.map(type => labels[type] || type).join(', ');
  }

  securityRoleLabel() {
    return this.user?.role === 'freelancer'
      ? 'Filtre securite actif cote freelancer'
      : 'Filtre securite actif';
  }

  conversationInitials(conversation: ConversationDto) {
    const name = (conversation.other_user_name || '').trim();
    if (!name) return conversation.id.slice(-2).toUpperCase();
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  isMine(message: MessageDto) {
    return message.sender_id === getStoredUserId();
  }

  backToList() {
    this.viewMode = 'list';
    this.composerError = '';
    this.piiTypes = [];
  }
}
