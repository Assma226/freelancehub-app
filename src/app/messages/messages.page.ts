import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { apiAuthHeaders, apiUrl, getStoredUserId, getSessionUser } from '../shared/api-url';
import { ConversationsListDto, ConversationDto, MessageDto, MessagesThreadDto } from '../shared/api.dto';
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
  callFeedback = '';
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
    this.callFeedback = '';
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
    this.sending = true;
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

  startCall() {
    const phone = (this.activeConversation?.other_user_phone || '').trim();
    if (!phone) {
      this.callFeedback = "Aucun numero de telephone n'est disponible pour ce contact.";
      return;
    }

    this.callFeedback = '';
    window.location.href = `tel:${phone}`;
  }

  backToList() {
    this.viewMode = 'list';
    this.callFeedback = '';
  }
}
