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

  constructor(private route: ActivatedRoute) {}

  async ngOnInit() {
    const withUser = this.route.snapshot.queryParamMap.get('with');
    if (withUser) {
      await this.ensureConversation(withUser);
    }
    await this.loadConversations();
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
    if (!this.activeConversationId && this.conversations[0]?.id) {
      await this.openConversation(this.conversations[0].id);
    }
  }

  async openConversation(id: string) {
    this.activeConversationId = id;
    const res = await fetch(apiUrl(`/api/messages/${id}`), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as MessagesThreadDto;
    this.messages = data.messages || [];
  }

  async sendMessage() {
    if (!this.activeConversationId || !this.draft.trim()) return;
    const res = await fetch(apiUrl(`/api/messages/${this.activeConversationId}`), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({ text: this.draft }),
    });
    if (!res.ok) return;
    this.draft = '';
    await this.openConversation(this.activeConversationId);
  }

  get activeConversation() {
    return this.conversations.find(conv => conv.id === this.activeConversationId) || null;
  }

  conversationLabel(conversation: ConversationDto) {
    return `Job ID ${conversation.id.slice(-4).toUpperCase()}`;
  }

  conversationSubtitle(conversation: ConversationDto) {
    const preview = (conversation.last_message || '').trim();
    return preview || 'Open the thread to continue the discussion.';
  }

  isMine(message: MessageDto) {
    return message.sender_id === getStoredUserId();
  }
}
