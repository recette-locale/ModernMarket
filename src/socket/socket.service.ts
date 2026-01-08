// notification-socket.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SocketService implements OnModuleInit, OnModuleDestroy {
  private socket: Socket;
  private gatewayBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Charger la variable d'environnement
    this.gatewayBaseUrl = this.configService.get<string>('GATEWAY_BASE_URL')!;
  }

  onModuleInit() {
    console.log("hello - initialisation SocketService");

    // Connexion au serveur Socket.IO
    this.socket = io(`${this.gatewayBaseUrl}/serviceflotte`, {
      path: '/serviceflotte/socket.io',
      query: { uuid: '550e8400-e29b-41d4-a716-446655440003' },
    });

    this.socket.on('connect', () => {
      console.log('✅ Connecté au serveur Socket.IO Express avec id:', this.socket.id);
    });

    this.socket.on('notifRecetteLocaleReceived', (data) => {
      console.log('🔔 Notification reçue côté NestJS:', data);
    });

    this.socket.on('connect_error', (err) => {
      console.error('❌ Erreur de connexion Socket.IO:', err.message);
    });
  }

  sendNotification(payload: any) {
    if (this.socket?.connected) {
      this.socket.emit('notifRecetteLocale', payload);
      console.log('📤 Notification envoyée depuis NestJS:', payload);
    }
  }

  onModuleDestroy() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('🔌 Socket.IO NestJS déconnecté');
    }
  }
}
