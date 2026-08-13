import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { ORGANIZATION_HEADER } from './tenancy/tenant-context.guard.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // CORS مقيّد بأصل التطبيق فقط (§9.3) — لا wildcard.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', ORGANIZATION_HEADER, 'x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // يمنع Mass Assignment: أي حقل غير معرّف في الـDTO يرفض الطلب.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Nomiqa API')
      .setDescription('Digital Business Card SaaS Platform')
      .setVersion('1.0')
      .addBearerAuth()
      .addGlobalParameters({
        name: ORGANIZATION_HEADER,
        in: 'header',
        required: false,
        description: 'معرّف المؤسسة النشطة',
      })
      .build();

    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);

  new Logger('Bootstrap').log(`API يعمل على http://localhost:${port}/api`);
}

void bootstrap();
