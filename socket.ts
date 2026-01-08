// notification-socket.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';

@Injectable()
export class NotificationSocketService implements OnModuleInit, OnModuleDestroy {
  private socket: Socket;

  onModuleInit() {
    // Connexion au serveur Socket.IO Express
    console.log("hello");
    this.socket = io('http://localhost:3000/serviceflotte', {
      path: '/serviceflotte/socket.io',
      query: { uuid: '550e8400-e29b-41d4-a716-446655440003' }, // UUID du backend NestJS
     // transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('✅ Connecté au serveur Socket.IO Express avec id:', this.socket.id);
    });

    this.socket.on('notifRecetteLocaleReceived', (data) => {
      console.log('🔔 Notification reçue côté NestJS:', data);
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ Erreur de connexion Socket.IO:', err);
    });
  }

  // Méthode pour envoyer une notification
  sendNotification(data: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('notifRecetteLocale', data);
      console.log('📤 Notification envoyée depuis NestJS:', data);
    }
  }

  onModuleDestroy() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('🔌 Socket.IO NestJS déconnecté');
    }
  }
}
