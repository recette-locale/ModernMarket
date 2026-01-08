import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configuration WebSocket améliorée

  app.setGlobalPrefix('servicemodernmarket');

  // CORS étendu
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false,
  });


  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Modern Market')
    .setDescription('Documentation microservice du Modern Market')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('servicemodernmarket/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Documentation API - Service Modern Market',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');


}

bootstrap();