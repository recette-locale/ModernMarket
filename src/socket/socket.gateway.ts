// import {
//   WebSocketGateway,
//   WebSocketServer,
//   SubscribeMessage,
//   MessageBody,
//   ConnectedSocket,
//   OnGatewayConnection,
//   OnGatewayDisconnect,
// } from '@nestjs/websockets';
// import { Server, Socket } from 'socket.io';
// import { Logger } from '@nestjs/common';

// @WebSocketGateway({
//   namespace: '/socket',
//   cors: { origin: true, credentials: true },
// })
// export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   @WebSocketServer()
//   server!: Server;

//   private readonly logger = new Logger(ChatGateway.name);

//  handleConnection(client: Socket): void {
//     const userId = client.handshake.auth.userId;

//     if (!userId) {
//       this.logger.warn(
//         `Client ${client.id} connecté sans userId`,
//       );

//       client.disconnect();
//       return;
//     }

//     client.data.userId = userId;

//     // Chaque utilisateur rejoint sa propre room
//     client.join(`user:${userId}`);

//     this.logger.log(
//       `Utilisateur ${userId} connecté : ${client.id}`,
//     );
//   }

//   handleDisconnect(client: Socket): void {
//     this.logger.log(`Client déconnecté : ${client.id}`);
//   }

// //   @SubscribeMessage('message:send')
// //   handleMessage(
// //     @MessageBody() payload: { roomId: string; text: string },
// //     @ConnectedSocket() client: Socket,
// //   ): void {
// //     this.server.to(payload.roomId).emit('message:new', {
// //       id: crypto.randomUUID(),
// //       text: payload.text,
// //       from: client.data.userId,
// //       sentAt: new Date().toISOString(),
// //     });
// //   }
// }


